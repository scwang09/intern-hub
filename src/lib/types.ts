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

export interface Submission {
  id: string;
  intern: string;
  internEmail: string;
  task: string;
  fileName: string;
  fileUrl?: string;
  review: ReviewResult;
  status: "pending" | "approved" | "rejected";
  managerNotes: string;
  submittedAt: string;
  reviewedAt?: string;
}
