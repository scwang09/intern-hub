"use client";

import { useState, useEffect } from "react";
import type { Task, TaskStatus } from "@/lib/types";
import styles from "./Intern.module.css";

const INTERNS = ["Alex", "Jordan", "Sam"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  under_review: "Under Review",
  needs_revision: "Needs Revision",
  complete: "Complete",
};

const STATUS_ORDER: TaskStatus[] = [
  "in_progress", "under_review", "needs_revision", "todo", "complete"
];

function statusClass(s: TaskStatus, styles: Record<string, string>) {
  return {
    todo: styles.statusTodo,
    in_progress: styles.statusInProgress,
    under_review: styles.statusUnderReview,
    needs_revision: styles.statusNeedsRevision,
    complete: styles.statusComplete,
  }[s] ?? "";
}

export default function InternPage() {
  const [intern, setIntern] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!intern) return;
    setLoading(true);
    fetch("/api/tasks")
      .then(r => r.json())
      .then(data => {
        const all: Task[] = data.tasks ?? [];
        setTasks(all.filter(t => t.assignedTo === intern));
      })
      .finally(() => setLoading(false));
  }, [intern]);

  const todo = tasks.filter(t => t.status === "todo");
  const active = tasks.filter(t => t.status === "in_progress" || t.status === "under_review" || t.status === "needs_revision");
  const done = tasks.filter(t => t.status === "complete");
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "complete");
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  const sortedTasks = [...tasks].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  // ── Intern picker ──────────────────────────────────────────────────────────
  if (!intern) {
    return (
      <div className={styles.pickWrap}>
        <div className={styles.pickCard}>
          <h1 className={styles.pickTitle}>Intern Hub</h1>
          <p className={styles.pickSub}>Strategic Finance · Summer 2026</p>
          <p className={styles.pickPrompt}>Who are you?</p>
          <div className={styles.pickBtns}>
            {INTERNS.map(name => (
              <button key={name} className={styles.pickBtn} onClick={() => setIntern(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>My Tasks</h1>
          <p className={styles.sub}>Welcome back, {intern} · Strategic Finance</p>
        </div>
        <div className={styles.topbarRight}>
          <a href="/" className={styles.submitLink}>Submit deliverable →</a>
          <button className={styles.switchBtn} onClick={() => setIntern(null)}>
            Switch intern
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {loading ? (
          <p className={styles.loadingMsg}>Loading…</p>
        ) : tasks.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No tasks assigned yet.</p>
            <p className={styles.emptySub}>Check back once your manager adds your tasks.</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className={styles.summaryRow}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryNum}>{tasks.length}</span>
                <span className={styles.summaryLabel}>Total</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryNum}>{active.length}</span>
                <span className={styles.summaryLabel}>Active</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryNum}>{done.length}</span>
                <span className={styles.summaryLabel}>Done</span>
              </div>
              {overdue.length > 0 && (
                <div className={styles.summaryCard}>
                  <span className={`${styles.summaryNum} ${styles.summaryAlert}`}>{overdue.length}</span>
                  <span className={styles.summaryLabel}>Overdue</span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className={styles.progressWrap}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.progressPct}>{pct}% complete</span>
            </div>

            {/* Task list */}
            <div className={styles.taskList}>
              {sortedTasks.map(task => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "complete";
                return (
                  <div key={task.id} className={`${styles.taskCard} ${task.status === "complete" ? styles.taskDone : ""}`}>
                    <div className={styles.taskCardTop}>
                      <span className={`${styles.statusBadge} ${statusClass(task.status, styles)}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      {isOverdue && <span className={styles.overdueBadge}>Overdue</span>}
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
                      {task.submissionIds.length > 0 && (
                        <span className={styles.taskSubs}>
                          {task.submissionIds.length} submission{task.submissionIds.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {(task.status === "needs_revision" || task.status === "todo" || task.status === "in_progress") && (
                      <a href="/" className={styles.submitTaskLink}>Submit deliverable →</a>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
