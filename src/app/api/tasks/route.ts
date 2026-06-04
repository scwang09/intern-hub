import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, saveTask } from "@/lib/db";
import type { Task, TaskStatus, TaskType, RecurringFrequency } from "@/lib/types";

function verifyAuth(req: NextRequest): boolean {
  const pwd = req.headers.get("x-manager-password");
  return !!pwd && pwd === process.env.MANAGER_PASSWORD;
}

// GET /api/tasks — public (interns need the list for the dropdown)
export async function GET() {
  const tasks = await getAllTasks();
  return NextResponse.json({ tasks });
}

// POST /api/tasks — manager only
export async function POST(req: NextRequest) {
  if (!verifyAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, assignedTo, dueDate, taskType,
          isRecurring, recurringFrequency, recurringNextSpawnAt, recurringAssignees } = body;

  const needsAssignee = isRecurring
    ? !recurringAssignees || recurringAssignees.length === 0
    : !assignedTo;

  if (!title || needsAssignee) {
    return NextResponse.json(
      { error: isRecurring ? "title and recurringAssignees are required" : "title and assignedTo are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    title,
    description: description ?? "",
    assignedTo: assignedTo ?? recurringAssignees?.[0] ?? "",
    taskType: (taskType ?? "operational") as TaskType,
    status: "todo" as TaskStatus,
    dueDate: dueDate ?? undefined,
    createdBy: "manager",
    createdAt: now,
    updatedAt: now,
    submissionIds: [],
    ...(isRecurring ? {
      isRecurring: true,
      recurringFrequency: recurringFrequency as RecurringFrequency,
      recurringNextSpawnAt,
      recurringAssignees: recurringAssignees ?? [],
    } : {}),
  };

  await saveTask(task);
  return NextResponse.json({ task }, { status: 201 });
}
