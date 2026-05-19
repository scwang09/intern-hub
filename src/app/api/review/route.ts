import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveSubmission } from "@/lib/db";
import { notifyManagerNewSubmission } from "@/lib/notify";
import type { Submission, ReviewResult } from "@/lib/types";

// ── Switch back to Anthropic: replace genAI client + generateContent call below ──
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SYSTEM_PROMPT = `You are a senior strategic finance analyst reviewing intern deliverables.
Your job is to give the manager a structured, honest review of the intern's work.
Be specific — cite exact issues (cell references, section names, formula errors) where possible.
Respond ONLY with a valid JSON object, no preamble, no markdown fences.

JSON shape:
{
  "title": "short descriptive title for this deliverable",
  "verdict": "Approve | Approve with minor fixes | Needs revision | Reject",
  "summary": "2-3 sentence executive summary of the work quality",
  "flags": [
    { "severity": "high|medium|low", "text": "specific issue description" }
  ],
  "strengths": ["specific strength 1", "specific strength 2"],
  "action_items": ["concrete fix 1", "concrete fix 2"],
  "grade": "A | B+ | B | C+ | C | D"
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const intern = formData.get("intern") as string;
    const internEmail = formData.get("internEmail") as string;
    const task = formData.get("task") as string;
    const notes = formData.get("notes") as string;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!internEmail) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || guessMime(file.name);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [];

    if (mimeType === "application/pdf") {
      parts.push({ inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } });
    } else if (isExcel(mimeType, file.name)) {
      parts.push({ text: `Excel file contents (${file.name}):\n\n${await parseExcel(buffer)}` });
    } else if (isWord(mimeType, file.name)) {
      parts.push({ text: `Word document contents (${file.name}):\n\n${await parseWord(buffer)}` });
    } else if (mimeType.startsWith("text/") || file.name.endsWith(".csv")) {
      parts.push({ text: `File contents (${file.name}):\n\n${buffer.toString("utf-8")}` });
    } else {
      parts.push({ text: `File: "${file.name}" (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB). Direct parsing unavailable — review based on context.` });
    }

    parts.push({
      text: `Intern: ${intern}\nTask: ${task}\nFile: ${file.name}\n${notes ? `Manager notes: ${notes}` : ""}\n\nPlease review this deliverable and return your JSON assessment.`,
    });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
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
      fileName: file.name,
      review,
      status: "pending",
      managerNotes: "",
      submittedAt: new Date().toISOString(),
    };

    await saveSubmission(submission);
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
