import { kv } from "@vercel/kv";
import type { Submission, Task } from "./types";

// ── Submissions ───────────────────────────────────────────────────────────────

export async function saveSubmission(sub: Submission): Promise<void> {
  await kv.set(`sub:${sub.id}`, sub);
  await kv.lpush("sub_ids", sub.id);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  return kv.get<Submission>(`sub:${id}`);
}

export async function getAllSubmissions(): Promise<Submission[]> {
  const ids = await kv.lrange<string>("sub_ids", 0, -1);
  if (!ids?.length) return [];
  const items = await Promise.all(ids.map((id) => kv.get<Submission>(`sub:${id}`)));
  return (items.filter(Boolean) as Submission[]).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

export async function updateSubmission(
  id: string,
  patch: Partial<Submission>
): Promise<Submission | null> {
  const sub = await getSubmission(id);
  if (!sub) return null;
  const updated = { ...sub, ...patch };
  await kv.set(`sub:${id}`, updated);
  return updated;
}

export async function deleteSubmission(id: string): Promise<boolean> {
  const sub = await getSubmission(id);
  if (!sub) return false;
  await kv.del(`sub:${id}`);
  await kv.lrem("sub_ids", 1, id);
  return true;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function saveTask(task: Task): Promise<void> {
  await kv.set(`task:${task.id}`, task);
  await kv.lpush("task_ids", task.id);
}

export async function getTask(id: string): Promise<Task | null> {
  return kv.get<Task>(`task:${id}`);
}

export async function getAllTasks(): Promise<Task[]> {
  const ids = await kv.lrange<string>("task_ids", 0, -1);
  if (!ids?.length) return [];
  const items = await Promise.all(ids.map((id) => kv.get<Task>(`task:${id}`)));
  return (items.filter(Boolean) as Task[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateTask(
  id: string,
  patch: Partial<Task>
): Promise<Task | null> {
  const task = await getTask(id);
  if (!task) return null;
  const updated = { ...task, ...patch, updatedAt: new Date().toISOString() };
  await kv.set(`task:${id}`, updated);
  return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
  const task = await getTask(id);
  if (!task) return false;
  await kv.del(`task:${id}`);
  await kv.lrem("task_ids", 1, id);
  return true;
}

export async function linkSubmissionToTask(
  taskId: string,
  submissionId: string
): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  const submissionIds = [...(task.submissionIds ?? [])];
  if (!submissionIds.includes(submissionId)) {
    submissionIds.push(submissionId);
  }
  await updateTask(taskId, { submissionIds, status: "under_review" });
}
