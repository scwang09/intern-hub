import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, saveTask } from "@/lib/db";
import type { Task, TaskStatus } from "@/lib/types";

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
  const { title, description, assignedTo, dueDate } = body;

  if (!title || !assignedTo) {
    return NextResponse.json(
      { error: "title and assignedTo are required" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    title,
    description: description ?? "",
    assignedTo,
    status: "todo" as TaskStatus,
    dueDate: dueDate ?? undefined,
    createdBy: "manager",
    createdAt: now,
    updatedAt: now,
    submissionIds: [],
  };

  await saveTask(task);
  return NextResponse.json({ task }, { status: 201 });
}
