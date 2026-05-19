import { kv } from "@vercel/kv";
import type { Submission } from "./types";

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
