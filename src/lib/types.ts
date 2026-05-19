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
  // attached by client
  fileName?: string;
  intern?: string;
  task?: string;
}
