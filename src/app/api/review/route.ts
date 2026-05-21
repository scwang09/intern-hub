import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveSubmission, linkSubmissionToTask } from "@/lib/db";
import { notifyManagerNewSubmission } from "@/lib/notify";
import type { Submission, ReviewResult } from "@/lib/types";

// ── Switch back to Anthropic: replace genAI client + generateContent call below ──
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `You are a senior strategic finance manager at a healthcare technology company reviewing deliverables from summer finance interns. Your reviews are used to give interns structured, actionable feedback and to decide whether their work is ready to present to leadership.

## Your review philosophy
- Be honest but constructive. Interns are learning — the goal is growth, not criticism.
- Be specific. Vague feedback ("needs more detail") is useless. Cite exact cells, sheet names, formulas, chart titles, or paragraph names.
- Hold the work to a real standard. A B+ means a VP could read this with minor edits. An A means it's presentation-ready as-is.
- Flag errors that would embarrass the intern if presented to leadership — even small ones like off-by-one date ranges, hardcoded numbers that should be formulas, or axis labels that say "Series 1".

## What you're evaluating (prioritized)
1. **Analytical accuracy** — Are the numbers correct? Do formulas reference the right cells? Is the math right?
2. **Structure & logic** — Is the narrative clear? Does the analysis answer the actual question? Is there a so-what?
3. **Finance craft** — Appropriate use of DCF, comps, variance analysis, unit economics, etc. No financial crimes (e.g. mixing GAAP and non-GAAP without disclosure, using revenue growth CAGR to extrapolate margin).
4. **Presentation quality** — Can a busy executive skim this and understand the key point in 30 seconds?
5. **Completeness** — Did they answer all parts of the prompt? Are assumptions documented?

## Grading rubric
- **A**: Presentation-ready. Numbers check out, narrative is crisp, no material issues.
- **B+**: Strong work with 1-2 minor fixes needed (e.g. a label, a formatting tweak, a missing assumption).
- **B**: Solid foundation but needs meaningful revision (e.g. one formula is wrong, the executive summary buries the lead).
- **C+**: Partial credit — the right structure is there but material gaps or errors exist.
- **C**: Significant rework needed. Either the analysis is incomplete or contains errors that change the conclusion.
- **D**: Needs to be substantially redone. Fundamental misunderstanding of the task or major analytical errors.

## Verdict definitions
- **Approve**: Grade A or B+ with no high-severity flags. Ready to share.
- **Approve with minor fixes**: Grade B+ or B with only low/medium flags. Share after quick edits.
- **Needs revision**: Grade B or below with medium/high flags. Return to intern for rework.
- **Reject**: Grade C or below, or any work with a high-severity error that changes the conclusion.

## Flag severity guide
- **high**: An error that would change the conclusion, embarrass the team if presented, or indicates a fundamental misunderstanding (e.g. wrong formula logic, wrong base year, inverted sign on a metric).
- **medium**: An issue that should be fixed before sharing but doesn't invalidate the analysis (e.g. missing assumption disclosure, inconsistent formatting, a chart with no axis labels).
- **low**: Polish items — minor style inconsistencies, small labeling gaps, could-be-clearer phrasing.

Respond ONLY with a valid JSON object. No preamble, no markdown fences, no explanation outside the JSON.

JSON shape:
{
  "title": "short descriptive title for this specific deliverable (not the task name — describe what it actually is)",
  "verdict": "Approve | Approve with minor fixes | Needs revision | Reject",
  "summary": "2-3 sentence executive summary. Lead with the overall quality judgment, then the single most important finding (positive or negative). Write as if briefing a busy manager.",
  "flags": [
    { "severity": "high|medium|low", "text": "Specific issue with exact location if possible — e.g. 'EBITDA margin in cell D14 uses revenue from the wrong year (FY24 instead of FY25), understating margin by ~3pp'" }
  ],
  "strengths": [
    "Specific strength with evidence — e.g. 'CAC/LTV ratio is correctly calculated and segmented by channel, which is exactly the right level of granularity for this analysis'"
  ],
  "action_items": [
    "Concrete, actionable fix — e.g. 'Replace hardcoded $4.2M in B8 with a formula referencing the assumptions tab so the model updates dynamically'"
  ],
  "grade": "A | B+ | B | C+ | C | D"
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // File is now uploaded directly to Blob from the browser —
    // we receive the URL + metadata rather than raw bytes.
    const fileUrl = formData.get("fileUrl") as string;
    const fileName = formData.get("fileName") as string;
    const intern = formData.get("intern") as string;
    const internEmail = formData.get("internEmail") as string;
    const task = formData.get("task") as string;
    const taskId = (formData.get("taskId") as string) || undefined;
    const notes = formData.get("notes") as string;

    if (!fileUrl || !fileName) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!internEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Fetch the file from Blob storage for Gemini processing
    const upstream = await fetch(fileUrl);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const mimeType = guessMime(fileName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];

    if (mimeType === "application/pdf") {
      parts.push({
        inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") },
      });
    } else if (isExcel(mimeType, fileName)) {
      parts.push({ text: `Excel file contents (${fileName}):\n\n${await parseExcel(buffer)}` });
    } else if (isWord(mimeType, fileName)) {
      parts.push({ text: `Word document contents (${fileName}):\n\n${await parseWord(buffer)}` });
    } else if (mimeType.startsWith("text/") || fileName.endsWith(".csv")) {
      parts.push({ text: `File contents (${fileName}):\n\n${buffer.toString("utf-8")}` });
    } else {
      parts.push({
        text: `File: "${fileName}" (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB). Direct parsing unavailable — review based on context.`,
      });
    }

    parts.push({
      text: `Intern: ${intern}\nTask: ${task}\nFile: ${fileName}\n${notes ? `Manager notes: ${notes}` : ""}\n\nPlease review this deliverable and return your JSON assessment.`,
    });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: {
        maxOutputTokens: 50000,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text();
    const review = parseJSON(raw) as ReviewResult | null;

    if (!review) {
      return NextResponse.json({ error: "Failed to parse AI review response" }, { status: 500 });
    }

    const submission: Submission = {
      id: crypto.randomUUID(),
      intern,
      internEmail,
      task,
      taskId,
      fileName,
      fileUrl, // already in Blob — reuse the URL
      review,
      status: "pending",
      managerNotes: "",
      submittedAt: new Date().toISOString(),
    };

    await saveSubmission(submission);

    // Link to task and flip its status to under_review
    if (taskId) {
      await linkSubmissionToTask(taskId, submission.id);
    }

    await notifyManagerNewSubmission(submission);

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    csv: "text/csv",
    txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

function isExcel(mime: string, name: string) {
  return (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  );
}

function isWord(mime: string, name: string) {
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  );
}

async function parseExcel(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim().length > 0) {
      lines.push(`=== Sheet: ${sheetName} ===`);
      const rows = csv.split("\n").slice(0, 200);
      lines.push(rows.join("\n"));
      if (csv.split("\n").length > 200)
        lines.push(`... (${csv.split("\n").length - 200} more rows truncated)`);
      lines.push("");
    }
  }
  return lines.join("\n") || "No readable data found in spreadsheet.";
}

async function parseWord(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.slice(0, 15000);
}

function parseJSON(text: string): Record<string, unknown> | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1) return JSON.parse(clean.slice(start, end + 1));
  } catch (_) {}
  return null;
}
