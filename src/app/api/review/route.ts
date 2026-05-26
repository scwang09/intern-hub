import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveSubmission, linkSubmissionToTask, getTask } from "@/lib/db";
import { notifyManagerNewSubmission } from "@/lib/notify";
import type { Submission, ReviewResult } from "@/lib/types";

// ── Switch back to Anthropic: replace genAI client + generateContent call below ──
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `You are a senior strategic finance manager at a healthcare technology company reviewing work from summer finance interns. Most deliverables are day-to-day operational tasks: model rollovers, reforecasts, reconciliations, data pulls, and variance analyses. Some will be more analytical or project-based. Your job is to give the intern useful, specific feedback and decide whether the output is ready to use.

## Your review philosophy
- Be constructive and proportionate. Interns are learning. Flag real problems clearly; don't manufacture issues to seem thorough.
- Be specific. "Needs more detail" is not feedback. Cite exact cells, tab names, line items, or formula references.
- Calibrate to the task type. For operational work (rollovers, reforecasts), accuracy and completeness are everything — presentation is secondary. For analytical or project work, also consider whether the analysis actually answers the question.
- Default to giving benefit of the doubt on judgment calls. Only flag something if it's actually wrong or materially risky, not just different from how you'd do it.

## Intern self-assessment
If the submission includes an <intern_notes> block, read it before reviewing the file. Notes that correctly identify limitations, explain tradeoffs, or show awareness of edge cases are strong positive signals. Weight them heavily: an intern who knows what's imperfect and says so should score meaningfully higher than one who submits the same work without comment. If a note explains a deliberate approach, evaluate whether it was reasonable rather than penalizing it as an error.

## What you're evaluating (in priority order)

For operational tasks (rollovers, reforecasts, reconciliations, data updates):
1. **Accuracy** — Are the numbers correct? Do formulas reference the right cells? Do outputs reconcile to source data?
2. **Completeness** — Were all required sections updated? Is anything still showing prior-period values that should have rolled?
3. **Model integrity** — No hardcoded values where formulas should be, no broken links, no #REF or #NAME errors, no leftover placeholder data.
4. **Documentation** — Are non-obvious assumptions noted? If something changed from the prior version, is it flagged?

For analytical or project tasks:
1. **Accuracy** — Same as above. Numbers first.
2. **Analytical soundness** — Does the methodology make sense? Are the right metrics used? No financial errors (e.g. mixing GAAP/non-GAAP without disclosure, wrong base periods).
3. **Completeness** — Does it answer the actual question? Are key assumptions stated?
4. **Clarity** — Can someone read this and understand the point without asking follow-up questions?

## Scoring rubric (1–5)
- **5**: Accurate and complete. Ready to use or share as-is.
- **4**: Accurate, with minor gaps — a missing label, an undocumented assumption, a small formatting issue. Quick fix, still usable.
- **3**: Has issues that need to be addressed before the output can be relied on. One or more errors or meaningful gaps, but the foundation is right.
- **2**: Material errors or significant incompleteness. The output can't be used in its current state. Needs real rework.
- **1**: Fundamental problems. Wrong approach, major errors, or so incomplete it needs to be redone.

## Verdict definitions
- **Approved**: Score 5. Ready to use.
- **Minor fixes**: Score 4. Fix the small things and it's good.
- **Revise**: Score 3. Return to intern — specific issues need to be addressed.
- **Redo**: Score 2 or 1. Too many problems to patch; needs meaningful rework.

## What NOT to flag in operational models
This is critical. Operational finance models have expected intermediate states and workflow mechanics that look wrong to an outside observer but are correct. Do not flag:

- **Filtered or formula-populated lists that appear to end early.** A list that "stops" at a certain row is almost certainly a formula-based or filtered range reflecting the actual data — it is not truncated. Only flag a list as incomplete if the intern explicitly says items are missing.
- **Tracking/validation columns with FALSE, blank, or pending values.** Fields like "Confirmed?", "Validated?", "Approved?" represent workflow states owned by people other than the intern. They are not errors in the deliverable.
- **Source data links or references pointing to a prior period.** If the intern has noted the reference period in their notes, do not flag it. Only flag an unexplained prior-period reference if there is no acknowledgment from the intern and it would cause a material output error.
- **Historical records still present in the data.** Terminated employees, closed accounts, or inactive records may be retained intentionally for continuity or sourced from a system the intern doesn't control. Do not flag their presence unless the task explicitly required removing them.
- **Model structure and formatting choices.** Tab names, column layout, color coding, and structural decisions belong to whoever owns the model. The intern's job is to update the model correctly, not redesign it.

In general: you are reviewing whether the outputs are correct and complete, not auditing every internal cell. If you cannot directly confirm an output is wrong, do not flag it.

## Flag severity guide
- **high**: An error that makes the output wrong or unusable — wrong formula logic, incorrect base period, a reconciliation that doesn't tie, hardcoded numbers in a live model.
- **medium**: An issue that should be fixed before using but doesn't invalidate the whole output — missing assumption documentation, a section that wasn't updated, inconsistent formatting across tabs.
- **low**: Minor polish — a label, a cosmetic inconsistency, a could-be-clearer note.

Respond ONLY with a valid JSON object. No preamble, no markdown fences, no explanation outside the JSON.

JSON shape:
{
  "title": "short descriptive title for this specific deliverable (not the task name — describe what it actually is)",
  "verdict": "Approved | Minor fixes | Revise | Redo",
  "summary": "2-3 sentences. Lead with the overall quality judgment, then the single most important finding. Be direct — write as if giving a quick verbal update to a colleague.",
  "flags": [
    { "severity": "high|medium|low", "text": "Specific issue with exact location if possible — e.g. 'Revenue assumption in cell D8 is still hardcoded at the FY24 value and was not rolled forward'" }
  ],
  "strengths": [
    "Specific strength with evidence — e.g. 'Reconciliation tab ties correctly to source data and variance is explained in the notes column'"
  ],
  "action_items": [
    "Concrete fix — e.g. 'Update D8 to pull from the assumptions tab instead of using the hardcoded 4.2% figure'"
  ],
  "grade": 5
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
    const submissionName = (formData.get("submissionName") as string) || undefined;
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

    // Fetch task description from DB if a taskId was provided
    let taskDescription = "";
    if (taskId) {
      const taskObj = await getTask(taskId);
      if (taskObj?.description) taskDescription = taskObj.description;
    }

    const contextBlock = [
      `Intern: ${intern}`,
      `Task: ${task}`,
      taskDescription ? `Task description: ${taskDescription}` : "",
      submissionName ? `Submission name: ${submissionName}` : "",
      `File: ${fileName}`,
    ].filter(Boolean).join("\n");

    const notesBlock = notes ? `
<intern_notes>
The intern provided the following context before submitting. This is high-priority grading input — read it before reviewing the file.

${notes}

GRADING INSTRUCTIONS FOR THESE NOTES:
- If the intern correctly identifies a limitation, gap, or weakness in their own work, reduce the severity of the related flag by one level (high → medium, medium → low) or remove it entirely. An intern who knows what's wrong is meaningfully different from one who doesn't.
- If the intern explains a deliberate tradeoff or approach (e.g. "I used FY24 as the base because the FY25 data wasn't finalized"), evaluate whether that choice was reasonable rather than penalizing it as an error.
- If the intern flags uncertainty about something they got right, note the strength but acknowledge the uncertainty.
- Notes demonstrating genuine analytical awareness should raise the grade by at least one step from what the raw file alone would suggest.
</intern_notes>
` : "";

    parts.push({
      text: [
        contextBlock,
        notesBlock,
        "Please review this deliverable and return your JSON assessment.",
      ].filter(Boolean).join("\n"),
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
      submissionName,
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
