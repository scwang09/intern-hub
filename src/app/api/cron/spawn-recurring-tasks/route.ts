import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, saveTask, updateTask } from "@/lib/db";
import type { Task, TaskStatus, RecurringFrequency } from "@/lib/types";

function nextSpawnDate(from: Date, frequency: RecurringFrequency): Date {
  const d = new Date(from);
  if (frequency === "weekly")   d.setDate(d.getDate() + 7);
  if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  if (frequency === "monthly")  d.setMonth(d.getMonth() + 1);
  return d;
}

function dueDateFromSpawn(spawnDate: Date, frequency: RecurringFrequency): string {
  const d = new Date(spawnDate);
  if (frequency === "weekly")   d.setDate(d.getDate() + 6);
  if (frequency === "biweekly") d.setDate(d.getDate() + 13);
  if (frequency === "monthly")  d.setDate(d.getDate() + 29);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const allTasks = await getAllTasks();
  const templates = allTasks.filter(t => t.isRecurring && t.recurringNextSpawnAt);

  const results: Record<string, string> = {};

  for (const template of templates) {
    const spawnAt = new Date(template.recurringNextSpawnAt!);
    if (spawnAt > now) {
      results[template.id] = `skipped — next spawn ${spawnAt.toDateString()}`;
      continue;
    }

    const assignees = template.recurringAssignees?.length
      ? template.recurringAssignees
      : [template.assignedTo];

    const instanceNow = new Date().toISOString();
    const spawnedIds: string[] = [];

    for (const assignee of assignees) {
      const instance: Task = {
        id: crypto.randomUUID(),
        title: template.title,
        description: template.description,
        assignedTo: assignee,
        taskType: template.taskType,
        status: "todo" as TaskStatus,
        dueDate: dueDateFromSpawn(spawnAt, template.recurringFrequency!),
        createdBy: "recurring",
        createdAt: instanceNow,
        updatedAt: instanceNow,
        submissionIds: [],
        isRecurringInstance: true,
        recurringParentId: template.id,
      };
      await saveTask(instance);
      spawnedIds.push(`${assignee}:${instance.id}`);
    }

    // Advance the template's next spawn date
    const next = nextSpawnDate(spawnAt, template.recurringFrequency!);
    await updateTask(template.id, { recurringNextSpawnAt: next.toISOString() });

    results[template.id] = `spawned ${spawnedIds.length} instance(s) → next: ${next.toDateString()}`;
  }

  return NextResponse.json({ ok: true, results });
}
