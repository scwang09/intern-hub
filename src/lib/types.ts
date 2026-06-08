export interface ReviewFlag {
  severity: "high" | "medium" | "low";
  text: string;
}

export interface ReviewResult {
  title: string;
  verdict: string;
  summary: string;
  flags: ReviewFlag[];
  strengths: string[];
  action_items: string[];
  grade: string;
  fileName?: string;
  intern?: string;
  task?: string;
}

export type TaskType = "operational" | "project";
export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export interface Submission {
  id: string;
  intern: string;
  internEmail: string;
  task: string;
  taskId?: string;
  taskType?: TaskType;
  submissionName?: string;
  fileName: string;
  fileUrl?: string;
  review: ReviewResult;
  status: "pending" | "approved" | "rejected";
  managerNotes: string;
  submittedAt: string;
  reviewedAt?: string;
}

export type TaskStatus = "todo" | "in_progress" | "under_review" | "needs_revision" | "complete";

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo: string;
  taskType: TaskType;
  status: TaskStatus;
  workload?: number; // 1–5: effort/intensity level
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submissionIds: string[];
  // Recurring template fields
  isRecurring?: boolean;
  recurringFrequency?: RecurringFrequency;
  recurringNextSpawnAt?: string;
  recurringAssignees?: string[];
  // Recurring instance fields
  isRecurringInstance?: boolean;
  recurringParentId?: string;
}
