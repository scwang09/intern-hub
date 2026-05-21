import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/db";
import type { TaskStatus } from "@/lib/types";

function verifyAuth(req: NextRequest): boolean {
  const pwd = req.headers.get("x-manager-password");
  return !!pwd && pwd === process.env.MANAGER_PASSWORD;
}

// GET /api/tasks/[id] — public
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

// PATCH /api/tasks/[id] — manager only
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();
  const { title, description, assignedTo, status, dueDate } = body;

  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (assignedTo !== undefined) patch.assignedTo = assignedTo;
  if (status !== undefined) patch.status = status as TaskStatus;
  if (dueDate !== undefined) patch.dueDate = dueDate;

  const updated = await updateTask(id, patch);
  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ task: updated });
}

// DELETE /api/tasks/[id] — manager only
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const ok = await deleteTask(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
