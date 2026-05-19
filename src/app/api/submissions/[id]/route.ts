import { NextRequest, NextResponse } from "next/server";
import { getSubmission, updateSubmission } from "@/lib/db";
import { notifyInternReviewReady } from "@/lib/notify";

function verifyAuth(req: NextRequest): boolean {
  const pwd = req.headers.get("x-manager-password");
  return !!pwd && pwd === process.env.MANAGER_PASSWORD;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const sub = await getSubmission(id);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ submission: sub });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await req.json();
  const { status, managerNotes, review } = body;

  const updated = await updateSubmission(id, {
    status,
    managerNotes: managerNotes ?? "",
    ...(review ? { review } : {}),
    reviewedAt: new Date().toISOString(),
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (status === "approved") {
    await notifyInternReviewReady(updated);
  }

  return NextResponse.json({ submission: updated });
}
