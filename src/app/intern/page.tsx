"use client";

import { useState, useEffect } from "react";
import type { Task, TaskStatus, Submission } from "@/lib/types";
import styles from "./Intern.module.css";

const INTERNS = ["Natalie", "Sam"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  under_review: "Under Review",
  needs_revision: "Needs Revision",
  complete: "Complete",
};

const STATUS_ORDER: TaskStatus[] = [
  "needs_revision", "in_progress", "under_review", "todo", "complete",
];

function statusClass(s: TaskStatus) {
  return {
    todo: styles.statusTodo,
    in_progress: styles.statusInProgress,
    under_review: styles.statusUnderReview,
    needs_revision: styles.statusNeedsRevision,
    complete: styles.statusComplete,
  }[s] ?? "";
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return d >= weekAgo && d <= now;
}

function isDueThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(now.getDate() + 7);
  return d >= now && d <= weekAhead;
}

type AuthState = { name: string; pin: string } | null;

export default function InternPage() {
  const [step, setStep] = useState<"pick" | "pin" | "dashboard">("pick");
  const [selectedName, setSelectedName] = useState("");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"tasks" | "weekly">("tasks");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Restore session on load
  useEffect(() => {
    const stored = sessionStorage.getItem("intern_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AuthState;
        if (parsed) {
          setAuth(parsed);
          setStep("dashboard");
        }
      } catch (_) {}
    }
  }, []);

  // Fetch data when authed
  useEffect(() => {
    if (!auth) return;
    setDataLoading(true);
    Promise.all([
      fetch("/api/tasks").then(r => r.json()),
      fetch("/api/intern/submissions", {
        headers: {
          "x-intern-name": auth.name,
          "x-intern-pin": auth.pin,
        },
      }).then(r => r.json()),
    ])
      .then(([taskData, subData]) => {
        const allTasks: Task[] = taskData.tasks ?? [];
        setTasks(allTasks.filter(t => t.assignedTo === auth.name));
        setSubmissions(subData.submissions ?? []);
      })
      .finally(() => setDataLoading(false));
  }, [auth]);

  const handlePickName = (name: string) => {
    setSelectedName(name);
    setPin("");
    setPinError("");
    setStep("pin");
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/intern-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedName, pin }),
      });
      if (res.ok) {
        const a: AuthState = { name: selectedName, pin };
        sessionStorage.setItem("intern_auth", JSON.stringify(a));
        setAuth(a);
        setStep("dashboard");
      } else {
        setPinError("Incorrect PIN. Try again.");
        setPin("");
      }
    } finally {
      setPinLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem("intern_auth");
    setAuth(null);
    setStep("pick");
    setPin("");
    setTasks([]);
    setSubmissions([]);
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const sortedTasks = [...tasks].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );
  const doneTasks = tasks.filter(t => t.status === "complete");
  const activeTasks = tasks.filter(t => ["in_progress", "under_review", "needs_revision"].includes(t.status));
  const overdueTasks = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "complete");
  const pct = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  const dueSoonTasks = tasks.filter(t => t.dueDate && isDueThisWeek(t.dueDate) && t.status !== "complete");
  const recentSubs = submissions.filter(s => isThisWeek(s.submittedAt));
  const feedbackReceived = submissions.filter(s => s.status !== "pending" && isThisWeek(s.reviewedAt ?? ""));
  const needsRevisionTasks = tasks.filter(t => t.status === "needs_revision");

  // Submissions that don't belong to any known task (Other/unlisted or intern-created)
  const knownTaskIds = new Set(tasks.map(t => t.id));
  // Each orphaned submission gets its own card — no grouping
  const orphanedSubs = submissions
    .filter(s => !s.taskId || !knownTaskIds.has(s.taskId))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // ── Pick name ──────────────────────────────────────────────────────────────
  if (step === "pick") {
    return (
      <div className={styles.pickWrap}>
        <div className={styles.pickCard}>
          <h1 className={styles.pickTitle}>Intern Hub</h1>
          <p className={styles.pickSub}>Strategic Finance · Summer 2026</p>
          <p className={styles.pickPrompt}>Who are you?</p>
          <div className={styles.pickBtns}>
            {INTERNS.map(name => (
              <button key={name} className={styles.pickBtn} onClick={() => handlePickName(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── PIN entry ──────────────────────────────────────────────────────────────
  if (step === "pin") {
    return (
      <div className={styles.pickWrap}>
        <div className={styles.pickCard}>
          <h1 className={styles.pickTitle}>{selectedName}</h1>
          <p className={styles.pickSub}>Enter your PIN to continue</p>
          <form onSubmit={handlePinSubmit} className={styles.pinForm}>
            <input
              type="password"
              inputMode="numeric"
              placeholder="PIN"
              value={pin}
              onChange={e => setPin(e.target.value)}
              className={styles.pinInput}
              maxLength={10}
              autoFocus
            />
            <button type="submit" className={styles.pinBtn} disabled={pinLoading || !pin}>
              {pinLoading ? "Checking…" : "Continue →"}
            </button>
          </form>
          {pinError && <p className={styles.pinError}>{pinError}</p>}
          <button className={styles.backLink} onClick={() => setStep("pick")}>
            ← Not {selectedName}?
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Hey, {auth?.name}</h1>
          <p className={styles.sub}>Strategic Finance · Summer 2026</p>
        </div>
        <div className={styles.topbarRight}>
          <a href="/" target="_blank" rel="noopener noreferrer" className={styles.submitLink}>Submit deliverable →</a>
          <button className={styles.switchBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </div>

      {/* Tab bar */}
      <nav className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === "tasks" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("tasks")}
        >
          My Tasks {tasks.length > 0 ? `(${tasks.length})` : ""}
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "weekly" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("weekly")}
        >
          This Week
          {(needsRevisionTasks.length > 0 || dueSoonTasks.length > 0) && (
            <span className={styles.tabAlert}>!</span>
          )}
        </button>
      </nav>

      <div className={styles.body}>
        {dataLoading ? (
          <p className={styles.loadingMsg}>Loading…</p>
        ) : (
          <>
            {/* ── TASKS TAB ── */}
            {activeTab === "tasks" && (
              <>
                {tasks.length === 0 && orphanedSubs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No tasks or submissions yet.</p>
                    <p className={styles.emptySub}>Check back once your manager adds your tasks.</p>
                  </div>
                ) : (
                  <>
                    {/* Summary + progress — only shown when there are tracked tasks */}
                    {tasks.length > 0 && (
                      <>
                        <div className={styles.summaryRow}>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryNum}>{tasks.length}</span>
                            <span className={styles.summaryLabel}>Total</span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryNum}>{activeTasks.length}</span>
                            <span className={styles.summaryLabel}>Active</span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryNum}>{doneTasks.length}</span>
                            <span className={styles.summaryLabel}>Done</span>
                          </div>
                          {overdueTasks.length > 0 && (
                            <div className={styles.summaryCard}>
                              <span className={`${styles.summaryNum} ${styles.summaryAlert}`}>{overdueTasks.length}</span>
                              <span className={styles.summaryLabel}>Overdue</span>
                            </div>
                          )}
                        </div>
                        <div className={styles.progressWrap}>
                          <div className={styles.progressBar}>
                            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={styles.progressPct}>{pct}% complete</span>
                        </div>
                      </>
                    )}

                    {/* Task list */}
                    <div className={styles.taskList}>
                      {sortedTasks.map(task => {
                        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "complete";
                        const isExpanded = expandedTaskId === task.id;

                        // All reviewed submissions for this task, newest first
                        const taskSubs = submissions
                          .filter(s => s.taskId === task.id || s.task === task.title)
                          .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
                        const reviewedSubs = taskSubs.filter(s => s.status !== "pending");
                        const hasFeedback = reviewedSubs.length > 0;

                        return (
                          <div
                            key={task.id}
                            className={`${styles.taskCard} ${task.status === "complete" ? styles.taskDone : ""} ${isExpanded ? styles.taskCardExpanded : ""}`}
                          >
                            {/* Card header row — always visible */}
                            <div className={styles.taskCardTop}>
                              <span className={`${styles.statusBadge} ${statusClass(task.status)}`}>
                                {STATUS_LABELS[task.status]}
                              </span>
                              {isOverdue && <span className={styles.overdueBadge}>Overdue</span>}
                              {hasFeedback && (
                                <button
                                  className={styles.expandBtn}
                                  onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                  aria-label={isExpanded ? "Collapse feedback" : "View feedback"}
                                >
                                  {isExpanded ? "Hide feedback ▲" : "View feedback ▼"}
                                </button>
                              )}
                            </div>

                            <div className={styles.taskTitle}>{task.title}</div>
                            {task.description && (
                              <div className={styles.taskDesc}>{task.description}</div>
                            )}
                            <div className={styles.taskMeta}>
                              {task.dueDate && (
                                <span className={`${styles.taskDue} ${isOverdue ? styles.taskDueOverdue : ""}`}>
                                  Due {new Date(task.dueDate + "T00:00:00").toLocaleDateString()}
                                </span>
                              )}
                              {taskSubs.length > 0 && (
                                <span className={styles.taskSubs}>
                                  {taskSubs.length} submission{taskSubs.length !== 1 ? "s" : ""}
                                  {reviewedSubs.length > 0 && ` · ${reviewedSubs.length} reviewed`}
                                </span>
                              )}
                            </div>

                            {(task.status === "needs_revision" || task.status === "todo" || task.status === "in_progress") && (
                              <a href="/" target="_blank" rel="noopener noreferrer" className={styles.submitTaskLink}>
                                Submit deliverable →
                              </a>
                            )}

                            {/* ── Expanded feedback panel ── */}
                            {isExpanded && reviewedSubs.length > 0 && (
                              <div className={styles.feedbackPanel}>
                                <div className={styles.feedbackPanelDivider} />
                                {reviewedSubs.map((rev, idx) => (
                                  <div key={rev.id}>
                                    {idx > 0 && <div className={styles.feedbackSubDivider} />}

                                    {/* Header: grade + verdict + date */}
                                    <div className={styles.feedbackPanelHeader}>
                                      <div className={styles.feedbackPanelGradeWrap}>
                                        <span className={`${styles.feedbackPanelGrade} ${rev.status === "approved" ? styles.gradeApproved : styles.gradeRejected}`}>
                                          {rev.review.grade}
                                        </span>
                                        <div>
                                          {rev.submissionName && (
                                            <div className={styles.feedbackPanelSubName}>{rev.submissionName}</div>
                                          )}
                                          <div className={styles.feedbackPanelVerdict}>{rev.review.verdict}</div>
                                          <div className={styles.feedbackPanelDate}>
                                            Reviewed {new Date(rev.reviewedAt ?? rev.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                            {reviewedSubs.length > 1 && ` · submission ${reviewedSubs.length - idx} of ${taskSubs.length}`}
                                          </div>
                                        </div>
                                      </div>
                                      <span className={`${styles.pill} ${rev.status === "approved" ? styles.pillApproved : styles.pillRejected}`}>
                                        {rev.status}
                                      </span>
                                    </div>

                                    {/* Summary */}
                                    {rev.review.summary && (
                                      <p className={styles.feedbackPanelSummary}>{rev.review.summary}</p>
                                    )}

                                    {/* Flags */}
                                    {rev.review.flags.length > 0 && (
                                      <div className={styles.feedbackPanelSection}>
                                        <div className={styles.feedbackPanelSectionTitle}>Issues flagged</div>
                                        {rev.review.flags.map((flag, i) => (
                                          <div key={i} className={`${styles.flagRow} ${styles[`flag_${flag.severity}`]}`}>
                                            <span className={styles.flagSev}>{flag.severity}</span>
                                            <span className={styles.flagText}>{flag.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Strengths */}
                                    {rev.review.strengths.length > 0 && (
                                      <div className={styles.feedbackPanelSection}>
                                        <div className={styles.feedbackPanelSectionTitle}>Strengths</div>
                                        {rev.review.strengths.map((s, i) => (
                                          <div key={i} className={styles.strengthRow}>✓ {s}</div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Action items */}
                                    {rev.review.action_items.length > 0 && (
                                      <div className={styles.feedbackPanelSection}>
                                        <div className={styles.feedbackPanelSectionTitle}>
                                          {rev.status === "approved" ? "Suggestions" : "To fix before resubmitting"}
                                        </div>
                                        {rev.review.action_items.map((a, i) => (
                                          <div key={i} className={styles.actionRow}>→ {a}</div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Manager notes */}
                                    {rev.managerNotes && (
                                      <div className={styles.managerNote}>
                                        <span className={styles.managerNoteLabel}>From your manager:</span> {rev.managerNotes}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Orphaned submissions — each is its own card */}
                      {orphanedSubs.map(sub => {
                        const expandKey = `orphan:${sub.id}`;
                        const isExpanded = expandedTaskId === expandKey;
                        const hasFeedback = sub.status !== "pending";
                        return (
                          <div key={sub.id} className={`${styles.taskCard} ${isExpanded ? styles.taskCardExpanded : ""}`}>
                            <div className={styles.taskCardTop}>
                              <span className={`${styles.statusBadge} ${sub.status === "approved" ? styles.statusComplete : sub.status === "rejected" ? styles.statusNeedsRevision : styles.statusUnderReview}`}>
                                {sub.status === "approved" ? "Approved" : sub.status === "rejected" ? "Needs revision" : "Under review"}
                              </span>
                              <span className={styles.orphanLabel}>unlisted</span>
                              {hasFeedback && (
                                <button
                                  className={styles.expandBtn}
                                  onClick={() => setExpandedTaskId(isExpanded ? null : expandKey)}
                                >
                                  {isExpanded ? "Hide feedback ▲" : "View feedback ▼"}
                                </button>
                              )}
                            </div>

                            {/* Submission name (if set) or task title */}
                            <div className={styles.taskTitle}>
                              {sub.submissionName || sub.task || "Unlisted submission"}
                            </div>
                            {sub.submissionName && sub.task && (
                              <div className={styles.taskDesc}>{sub.task}</div>
                            )}
                            <div className={styles.taskMeta}>
                              <span className={styles.taskDue}>
                                Submitted {new Date(sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </div>

                            {/* Expanded feedback panel */}
                            {isExpanded && hasFeedback && (
                              <div className={styles.feedbackPanel}>
                                <div className={styles.feedbackPanelDivider} />
                                <div className={styles.feedbackPanelHeader}>
                                  <div className={styles.feedbackPanelGradeWrap}>
                                    <span className={`${styles.feedbackPanelGrade} ${sub.status === "approved" ? styles.gradeApproved : styles.gradeRejected}`}>
                                      {sub.review.grade}
                                    </span>
                                    <div>
                                      <div className={styles.feedbackPanelVerdict}>{sub.review.verdict}</div>
                                      <div className={styles.feedbackPanelDate}>
                                        Reviewed {new Date(sub.reviewedAt ?? sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                      </div>
                                    </div>
                                  </div>
                                  <span className={`${styles.pill} ${sub.status === "approved" ? styles.pillApproved : styles.pillRejected}`}>
                                    {sub.status}
                                  </span>
                                </div>
                                {sub.review.summary && (
                                  <p className={styles.feedbackPanelSummary}>{sub.review.summary}</p>
                                )}
                                {sub.review.flags.length > 0 && (
                                  <div className={styles.feedbackPanelSection}>
                                    <div className={styles.feedbackPanelSectionTitle}>Issues flagged</div>
                                    {sub.review.flags.map((flag, i) => (
                                      <div key={i} className={`${styles.flagRow} ${styles[`flag_${flag.severity}`]}`}>
                                        <span className={styles.flagSev}>{flag.severity}</span>
                                        <span className={styles.flagText}>{flag.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {sub.review.strengths.length > 0 && (
                                  <div className={styles.feedbackPanelSection}>
                                    <div className={styles.feedbackPanelSectionTitle}>Strengths</div>
                                    {sub.review.strengths.map((s, i) => (
                                      <div key={i} className={styles.strengthRow}>✓ {s}</div>
                                    ))}
                                  </div>
                                )}
                                {sub.review.action_items.length > 0 && (
                                  <div className={styles.feedbackPanelSection}>
                                    <div className={styles.feedbackPanelSectionTitle}>
                                      {sub.status === "approved" ? "Suggestions" : "To fix before resubmitting"}
                                    </div>
                                    {sub.review.action_items.map((a, i) => (
                                      <div key={i} className={styles.actionRow}>→ {a}</div>
                                    ))}
                                  </div>
                                )}
                                {sub.managerNotes && (
                                  <div className={styles.managerNote}>
                                    <span className={styles.managerNoteLabel}>From your manager:</span> {sub.managerNotes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── WEEKLY TAB ── */}
            {activeTab === "weekly" && (
              <div className={styles.weeklyPane}>

                {/* Needs revision — highest priority */}
                {needsRevisionTasks.length > 0 && (
                  <div className={styles.weeklySection}>
                    <div className={styles.weeklySectionHeader}>
                      <span className={styles.weeklySectionTitle}>Action Required</span>
                      <span className={styles.weeklyBadgeRed}>{needsRevisionTasks.length}</span>
                    </div>
                    {needsRevisionTasks.map(task => {
                      // Find the most recent submission for this task
                      const taskSubs = submissions
                        .filter(s => s.taskId === task.id || s.task === task.title)
                        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
                      const latestSub = taskSubs[0];
                      return (
                        <div key={task.id} className={styles.revisionCard}>
                          <div className={styles.revisionTitle}>{task.title}</div>
                          {latestSub && latestSub.status === "rejected" && (
                            <>
                              {latestSub.review.summary && (
                                <p className={styles.revisionSummary}>{latestSub.review.summary}</p>
                              )}
                              {latestSub.review.action_items.length > 0 && (
                                <div className={styles.revisionItems}>
                                  <span className={styles.revisionItemsLabel}>To fix:</span>
                                  {latestSub.review.action_items.map((item, i) => (
                                    <div key={i} className={styles.revisionItem}>· {item}</div>
                                  ))}
                                </div>
                              )}
                              {latestSub.managerNotes && (
                                <div className={styles.managerNote}>
                                  <span className={styles.managerNoteLabel}>Manager note:</span> {latestSub.managerNotes}
                                </div>
                              )}
                            </>
                          )}
                          <a href="/" target="_blank" rel="noopener noreferrer" className={styles.submitTaskLink}>Resubmit →</a>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Due this week */}
                {dueSoonTasks.length > 0 && (
                  <div className={styles.weeklySection}>
                    <div className={styles.weeklySectionHeader}>
                      <span className={styles.weeklySectionTitle}>Due This Week</span>
                      <span className={styles.weeklyBadge}>{dueSoonTasks.length}</span>
                    </div>
                    {dueSoonTasks.map(task => (
                      <div key={task.id} className={styles.dueCard}>
                        <div className={styles.dueCardLeft}>
                          <span className={`${styles.statusBadge} ${statusClass(task.status)}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          <span className={styles.dueTitle}>{task.title}</span>
                        </div>
                        <span className={styles.dueDate}>
                          {new Date(task.dueDate! + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feedback received this week */}
                {feedbackReceived.length > 0 && (
                  <div className={styles.weeklySection}>
                    <div className={styles.weeklySectionHeader}>
                      <span className={styles.weeklySectionTitle}>Feedback Received</span>
                      <span className={styles.weeklyBadge}>{feedbackReceived.length}</span>
                    </div>
                    {feedbackReceived.map(sub => (
                      <div key={sub.id} className={styles.feedbackCard}>
                        <div className={styles.feedbackTop}>
                          <span className={styles.feedbackTask}>{sub.submissionName || sub.task}</span>
                          <span className={`${styles.feedbackGrade} ${sub.status === "approved" ? styles.gradeApproved : styles.gradeRejected}`}>
                            {sub.review.grade}
                          </span>
                          <span className={`${styles.pill} ${sub.status === "approved" ? styles.pillApproved : styles.pillRejected}`}>
                            {sub.status}
                          </span>
                        </div>
                        {sub.review.summary && (
                          <p className={styles.feedbackSummary}>{sub.review.summary}</p>
                        )}
                        {sub.review.strengths.length > 0 && (
                          <div className={styles.feedbackStrengths}>
                            {sub.review.strengths.slice(0, 2).map((s, i) => (
                              <div key={i} className={styles.strengthItem}>✓ {s}</div>
                            ))}
                          </div>
                        )}
                        {sub.managerNotes && (
                          <div className={styles.managerNote}>
                            <span className={styles.managerNoteLabel}>From your manager:</span> {sub.managerNotes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Submissions this week */}
                {recentSubs.length > 0 && (
                  <div className={styles.weeklySection}>
                    <div className={styles.weeklySectionHeader}>
                      <span className={styles.weeklySectionTitle}>Submitted This Week</span>
                      <span className={styles.weeklyBadge}>{recentSubs.length}</span>
                    </div>
                    {recentSubs.map(sub => (
                      <div key={sub.id} className={styles.subRow}>
                        <span className={styles.subTask}>{sub.submissionName || sub.task}</span>
                        <span className={styles.subDate}>
                          {new Date(sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span className={`${styles.pill} ${sub.status === "approved" ? styles.pillApproved : sub.status === "rejected" ? styles.pillRejected : styles.pillPending}`}>
                          {sub.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* All quiet */}
                {needsRevisionTasks.length === 0 && dueSoonTasks.length === 0 && feedbackReceived.length === 0 && recentSubs.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>All caught up!</p>
                    <p className={styles.emptySub}>Nothing due or pending this week.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
