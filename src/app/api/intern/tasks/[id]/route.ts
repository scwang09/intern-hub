import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/db";
import type { TaskStatus } from "@/lib/types";

const PIN_MAP: Record<string, string | undefined> = {
  natalie: process.env.INTERN_PIN_NATALIE,
  sam: process.env.INTERN_PIN_SAM,
};

function verifyInternAuth(req: NextRequest): string | null {
  const name = req.headers.get("x-intern-name")?.toLowerCase();
  const pin = req.headers.get("x-intern-pin");
  if (!name || !pin) return null;
  const expected = PIN_MAP[name];
  if (!expected || pin !== expected) return null;
  return name;
}

// Only allow interns to move tasks forward (not backwards, and not to reviewed states)
const ALLOWED_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  todo: ["in_progress"],
  needs_revision: ["in_progress"],
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const internName = verifyInternAuth(req);
  if (!internName) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (task.assignedTo.toLowerCase() !== internName) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status } = await req.json() as { status: TaskStatus };
  const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Transition not allowed" }, { status: 400 });
  }

  const updated = await updateTask(id, { status });
  return NextResponse.json({ task: updated });
}
