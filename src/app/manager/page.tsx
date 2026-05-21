"use client";

import { useState, useEffect, useCallback } from "react";
import type { Submission, ReviewResult, ReviewFlag, Task, TaskStatus } from "@/lib/types";
import styles from "./Manager.module.css";

const VERDICTS = ["Approve", "Approve with minor fixes", "Needs revision", "Reject"];
const GRADES = ["A", "B+", "B", "C+", "C", "D"];
const SEVERITIES = ["high", "medium", "low"];
const INTERNS = ["Natalie", "Sam"];
const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "under_review", label: "Under Review" },
  { value: "needs_revision", label: "Needs Revision" },
  { value: "complete", label: "Complete" },
];

const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
const isOffice = (name: string) => {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") ||
    n.endsWith(".docx") || n.endsWith(".doc");
};
function getViewerUrl(fileName: string, fileUrl: string): string | null {
  if (isPdf(fileName)) return fileUrl;
  if (isOffice(fileName))
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  return null;
}

function statusColor(s: TaskStatus) {
  return {
    todo: styles.statusTodo,
    in_progress: styles.statusInProgress,
    under_review: styles.statusUnderReview,
    needs_revision: styles.statusNeedsRevision,
    complete: styles.statusComplete,
  }[s];
}

type Tab = "overview" | "tasks" | "submissions" | "weekly";

export default function ManagerPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [savedPwd, setSavedPwd] = useState("");

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<Tab>("overview");

  // ── Submission detail state ────────────────────────────────────────────────
  const [selected, setSelected] = useState<Submission | null>(null);
  const [managerNotes, setManagerNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // ── New task form state ────────────────────────────────────────────────────
  const [newTask, setNewTask] = useState({ title: "", assignedTo: INTERNS[0], dueDate: "", description: "" });
  const [taskSaving, setTaskSaving] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (pwd: string) => {
    setLoading(true);
    try {
      const [subRes, taskRes] = await Promise.all([
        fetch("/api/submissions", { headers: { "x-manager-password": pwd } }),
        fetch("/api/tasks"),
      ]);
      if (subRes.status === 401) {
        sessionStorage.removeItem("mgr_pwd");
        setAuthed(false);
        setAuthError("Incorrect password.");
        return false;
      }
      const subData = await subRes.json();
      const taskData = await taskRes.json();
      setSubmissions(subData.submissions ?? []);
      setTasks(taskData.tasks ?? []);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("mgr_pwd");
    if (stored) {
      setSavedPwd(stored);
      fetchAll(stored).then((ok) => { if (ok) setAuthed(true); });
    }
  }, [fetchAll]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await fetchAll(password);
    if (ok) {
      sessionStorage.setItem("mgr_pwd", password);
      setSavedPwd(password);
      setAuthed(true);
      setAuthError("");
    } else {
      setAuthError("Incorrect password.");
    }
  };

  // ── Submission helpers ─────────────────────────────────────────────────────
  const handleSelect = (sub: Submission) => {
    setSelected({ ...sub, review: { ...sub.review } });
    setManagerNotes(sub.managerNotes ?? "");
  };

  const updateReviewField = <K extends keyof ReviewResult>(field: K, value: ReviewResult[K]) => {
    if (!selected) return;
    setSelected({ ...selected, review: { ...selected.review, [field]: value } });
  };

  const updateFlag = (i: number, key: keyof ReviewFlag, value: string) => {
    if (!selected) return;
    const flags = selected.review.flags.map((f, idx) =>
      idx === i ? { ...f, [key]: value } : f
    );
    updateReviewField("flags", flags);
  };

  const addFlag = () => {
    if (!selected) return;
    updateReviewField("flags", [...selected.review.flags, { severity: "medium", text: "" }]);
  };

  const removeFlag = (i: number) => {
    if (!selected) return;
    updateReviewField("flags", selected.review.flags.filter((_, idx) => idx !== i));
  };

  const updateListItem = (field: "strengths" | "action_items", i: number, value: string) => {
    if (!selected) return;
    const arr = [...selected.review[field]];
    arr[i] = value;
    updateReviewField(field, arr);
  };

  const addListItem = (field: "strengths" | "action_items") => {
    if (!selected) return;
    updateReviewField(field, [...selected.review[field], ""]);
  };

  const removeListItem = (field: "strengths" | "action_items", i: number) => {
    if (!selected) return;
    updateReviewField(field, selected.review[field].filter((_, idx) => idx !== i));
  };

  const handleAction = async (status: "approved" | "rejected") => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${selected.id}`, {
        method: "PATCH",
        headers: { "x-manager-password": savedPwd, "Content-Type": "application/json" },
        body: JSON.stringify({ status, managerNotes, review: selected.review }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? data.submission : s)));
        setSelected(data.submission);
        // Refresh tasks to reflect status change
        const taskRes = await fetch("/api/tasks");
        const taskData = await taskRes.json();
        setTasks(taskData.tasks ?? []);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete this submission from ${selected.intern}? This cannot be undone.`)) return;
    const res = await fetch(`/api/submissions/${selected.id}`, {
      method: "DELETE",
      headers: { "x-manager-password": savedPwd },
    });
    if (res.ok) {
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setSelected(null);
    }
  };

  // ── Task helpers ───────────────────────────────────────────────────────────
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    setTaskSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "x-manager-password": savedPwd, "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [data.task, ...prev]);
        setNewTask({ title: "", assignedTo: INTERNS[0], dueDate: "", description: "" });
        setShowNewTask(false);
      }
    } finally {
      setTaskSaving(false);
    }
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "x-manager-password": savedPwd, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: { "x-manager-password": savedPwd },
    });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");
  const approved = submissions.filter((s) => s.status === "approved");
  const editable = selected?.status === "pending";

  const tasksByIntern = INTERNS.map((intern) => ({
    intern,
    tasks: tasks.filter((t) => t.assignedTo === intern),
  }));

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className={styles.authWrap}>
        <div className={styles.authCard}>
          <h1 className={styles.authTitle}>Manager Dashboard</h1>
          <p className={styles.authSub}>Strategic Finance · Summer 2026</p>
          <form onSubmit={handleLogin} className={styles.authForm}>
            <input
              type="password"
              placeholder="Manager password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.authInput}
              autoFocus
            />
            <button type="submit" className={styles.authBtn}>Sign in</button>
          </form>
          {authError && <p className={styles.authError}>{authError}</p>}
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
          <h1 className={styles.title}>Manager Dashboard</h1>
          <p className={styles.sub}>Strategic Finance · Summer 2026</p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => fetchAll(savedPwd)}
          disabled={loading}
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Tab bar */}
      <nav className={styles.tabBar}>
        {(["overview", "tasks", "submissions", "weekly"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => { setTab(t); setSelected(null); }}
          >
            {t === "overview" && "Overview"}
            {t === "tasks" && `Tasks${tasks.length ? ` (${tasks.length})` : ""}`}
            {t === "submissions" && `Submissions${pending.length ? ` · ${pending.length} pending` : ""}`}
            {t === "weekly" && "Weekly"}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className={styles.content}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className={styles.overviewGrid}>
            {/* Stats */}
            <div className={styles.statsRow}>
              <div className={styles.statCard}>
                <span className={styles.statNum}>{tasks.length}</span>
                <span className={styles.statLabel}>Total Tasks</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNum}>{tasks.filter(t => t.status === "complete").length}</span>
                <span className={styles.statLabel}>Completed</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNum}>{submissions.length}</span>
                <span className={styles.statLabel}>Submissions</span>
              </div>
              <div className={styles.statCard}>
                <span className={`${styles.statNum} ${pending.length ? styles.statNumAlert : ""}`}>{pending.length}</span>
                <span className={styles.statLabel}>Pending Review</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNum}>{approved.length}</span>
                <span className={styles.statLabel}>Approved</span>
              </div>
            </div>

            {/* Per-intern progress */}
            <div className={styles.sectionTitle}>Intern Progress</div>
            <div className={styles.internCards}>
              {tasksByIntern.map(({ intern, tasks: internTasks }) => {
                const done = internTasks.filter(t => t.status === "complete").length;
                const total = internTasks.length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const internSubs = submissions.filter(s => s.intern === intern);
                const internApproved = internSubs.filter(s => s.status === "approved").length;
                return (
                  <div key={intern} className={styles.internCard}>
                    <div className={styles.internCardHeader}>
                      <span className={styles.internName}>{intern}</span>
                      <span className={styles.internPct}>{pct}%</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={styles.internStats}>
                      <span>{done}/{total} tasks done</span>
                      <span>{internApproved} approved</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent submissions */}
            {pending.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Needs Your Review</div>
                <div className={styles.pendingList}>
                  {pending.slice(0, 5).map(sub => (
                    <button
                      key={sub.id}
                      className={styles.pendingItem}
                      onClick={() => { setTab("submissions"); handleSelect(sub); }}
                    >
                      <span className={styles.pendingName}>{sub.intern}</span>
                      <span className={styles.pendingTask}>{sub.submissionName || sub.task}</span>
                      <span className={`${styles.pill} ${styles.pillPending}`}>pending</span>
                      <span className={styles.pendingDate}>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TASKS ── */}
        {tab === "tasks" && (
          <div className={styles.tasksPane}>
            <div className={styles.tasksPaneHeader}>
              <span className={styles.sectionTitle} style={{ margin: 0 }}>Task Board</span>
              <button className={styles.newTaskBtn} onClick={() => setShowNewTask(v => !v)}>
                {showNewTask ? "Cancel" : "+ New Task"}
              </button>
            </div>

            {showNewTask && (
              <form onSubmit={handleCreateTask} className={styles.newTaskForm}>
                <div className={styles.newTaskRow}>
                  <input
                    className={styles.fieldInput}
                    placeholder="Task title"
                    value={newTask.title}
                    onChange={e => setNewTask(v => ({ ...v, title: e.target.value }))}
                    required
                  />
                  <select
                    className={styles.fieldSelect}
                    value={newTask.assignedTo}
                    onChange={e => setNewTask(v => ({ ...v, assignedTo: e.target.value }))}
                  >
                    {INTERNS.map(i => <option key={i}>{i}</option>)}
                  </select>
                  <input
                    type="date"
                    className={styles.fieldInput}
                    value={newTask.dueDate}
                    onChange={e => setNewTask(v => ({ ...v, dueDate: e.target.value }))}
                    style={{ maxWidth: 160 }}
                  />
                </div>
                <textarea
                  className={styles.fieldTextarea}
                  placeholder="Description (optional)"
                  value={newTask.description}
                  rows={2}
                  onChange={e => setNewTask(v => ({ ...v, description: e.target.value }))}
                />
                <button type="submit" className={styles.btnApprove} disabled={taskSaving}>
                  {taskSaving ? "Creating…" : "Create Task"}
                </button>
              </form>
            )}

            {tasks.length === 0 ? (
              <p className={styles.emptyMsg}>No tasks yet. Create one above.</p>
            ) : (
              <div className={styles.taskColumns}>
                {TASK_STATUSES.map(({ value, label }) => {
                  const colTasks = tasks.filter(t => t.status === value);
                  return (
                    <div key={value} className={styles.taskCol}>
                      <div className={styles.taskColHeader}>
                        <span className={`${styles.taskColDot} ${statusColor(value)}`} />
                        <span>{label}</span>
                        <span className={styles.taskColCount}>{colTasks.length}</span>
                      </div>
                      {colTasks.map(task => (
                        <div key={task.id} className={styles.taskCard}>
                          <div className={styles.taskCardTitle}>{task.title}</div>
                          {task.description && (
                            <div className={styles.taskCardDesc}>{task.description}</div>
                          )}
                          <div className={styles.taskCardMeta}>
                            <span className={styles.taskCardIntern}>{task.assignedTo}</span>
                            {task.dueDate && (
                              <span className={styles.taskCardDue}>
                                Due {new Date(task.dueDate + "T00:00:00").toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {task.submissionIds.length > 0 && (
                            <div className={styles.taskCardSubs}>
                              {task.submissionIds.length} submission{task.submissionIds.length !== 1 ? "s" : ""}
                            </div>
                          )}
                          <div className={styles.taskCardActions}>
                            <select
                              className={`${styles.fieldSelect} ${styles.taskStatusSelect}`}
                              value={task.status}
                              onChange={e => handleTaskStatusChange(task.id, e.target.value as TaskStatus)}
                            >
                              {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <button
                              className={styles.removeBtn}
                              onClick={() => handleDeleteTask(task.id)}
                              title="Delete task"
                            >×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SUBMISSIONS ── */}
        {tab === "submissions" && (
          <div className={styles.submissionsPane}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
              {!loading && submissions.length === 0 && (
                <p className={styles.emptyMsg}>No submissions yet.</p>
              )}
              {pending.length > 0 && (
                <section>
                  <p className={styles.groupLabel}>Pending ({pending.length})</p>
                  {pending.map((sub) => (
                    <button
                      key={sub.id}
                      className={`${styles.subItem} ${selected?.id === sub.id ? styles.active : ""}`}
                      onClick={() => handleSelect(sub)}
                    >
                      <div className={styles.subRow}>
                        <span className={styles.subName}>{sub.intern}</span>
                        <span className={`${styles.pill} ${styles.pillPending}`}>pending</span>
                      </div>
                      {sub.submissionName && (
                        <span className={styles.subSubmissionName}>{sub.submissionName}</span>
                      )}
                      <span className={styles.subTask}>{sub.task}</span>
                      <span className={styles.subDate}>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </button>
                  ))}
                </section>
              )}
              {reviewed.length > 0 && (
                <section>
                  <p className={styles.groupLabel}>Reviewed ({reviewed.length})</p>
                  {reviewed.map((sub) => (
                    <button
                      key={sub.id}
                      className={`${styles.subItem} ${selected?.id === sub.id ? styles.active : ""}`}
                      onClick={() => handleSelect(sub)}
                    >
                      <div className={styles.subRow}>
                        <span className={styles.subName}>{sub.intern}</span>
                        <span className={`${styles.pill} ${sub.status === "approved" ? styles.pillApproved : styles.pillRejected}`}>
                          {sub.status}
                        </span>
                      </div>
                      {sub.submissionName && (
                        <span className={styles.subSubmissionName}>{sub.submissionName}</span>
                      )}
                      <span className={styles.subTask}>{sub.task}</span>
                      <span className={styles.subDate}>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                    </button>
                  ))}
                </section>
              )}
            </aside>

            {/* Detail */}
            {!selected ? (
              <div className={styles.emptyDetail}>
                <p>Select a submission to review</p>
              </div>
            ) : (
              <div className={styles.mainArea}>
                {/* File panel */}
                <div className={styles.filePanel}>
                  <p className={styles.filePanelLabel}>
                    <span>{selected.fileName}</span>
                    {selected.fileUrl && (
                      <a
                        href={`/api/submissions/${selected.id}/file`}
                        download={selected.fileName}
                        className={styles.downloadLink}
                        onClick={(e) => {
                          e.preventDefault();
                          fetch(`/api/submissions/${selected.id}/file`, {
                            headers: { "x-manager-password": savedPwd },
                          })
                            .then((r) => r.blob())
                            .then((blob) => {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = selected.fileName;
                              a.click();
                              URL.revokeObjectURL(url);
                            });
                        }}
                      >
                        ↓ Download
                      </a>
                    )}
                  </p>
                  {selected.fileUrl && getViewerUrl(selected.fileName, selected.fileUrl) ? (
                    <iframe
                      src={getViewerUrl(selected.fileName, selected.fileUrl)!}
                      className={styles.pdfFrame}
                      title="Submitted file"
                    />
                  ) : (
                    <div className={styles.noPreview}>
                      <p>{selected.fileUrl ? "Preview not available for this file type." : "File not available for preview."}</p>
                    </div>
                  )}
                </div>

                {/* Review panel */}
                <div className={styles.reviewPanel}>
                  <div className={styles.detailHeader}>
                    <div>
                      <p className={styles.detailMeta}>
                        {selected.intern} · {selected.internEmail} · {selected.task}
                      </p>
                      <h2 className={styles.detailTitle}>
                        {selected.submissionName || selected.review.title || selected.task}
                      </h2>
                    </div>
                    <button className={styles.btnDelete} onClick={handleDelete} title="Delete submission">
                      🗑 Delete
                    </button>
                  </div>

                  {/* Verdict + Grade */}
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Verdict</label>
                      <select
                        className={styles.fieldSelect}
                        value={selected.review.verdict}
                        onChange={(e) => updateReviewField("verdict", e.target.value)}
                        disabled={!editable}
                      >
                        {VERDICTS.map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Grade</label>
                      <select
                        className={styles.fieldSelect}
                        value={selected.review.grade}
                        onChange={(e) => updateReviewField("grade", e.target.value)}
                        disabled={!editable}
                      >
                        {GRADES.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Summary</label>
                    <textarea
                      className={styles.fieldTextarea}
                      value={selected.review.summary}
                      rows={4}
                      onChange={(e) => updateReviewField("summary", e.target.value)}
                      disabled={!editable}
                    />
                  </div>

                  {/* Flags */}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Issues flagged</label>
                    <div className={styles.editList}>
                      {selected.review.flags.map((f, i) => (
                        <div key={i} className={styles.flagRow}>
                          <select
                            className={`${styles.fieldSelect} ${styles.sevSelect}`}
                            value={f.severity}
                            onChange={(e) => updateFlag(i, "severity", e.target.value)}
                            disabled={!editable}
                          >
                            {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                          <textarea
                            className={`${styles.fieldTextarea} ${styles.inlineTextarea}`}
                            value={f.text}
                            onChange={(e) => updateFlag(i, "text", e.target.value)}
                            disabled={!editable}
                            placeholder="Describe the issue…"
                            rows={2}
                          />
                          {editable && (
                            <button className={styles.removeBtn} onClick={() => removeFlag(i)}>×</button>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <button className={styles.addBtn} onClick={addFlag}>+ Add issue</button>
                      )}
                    </div>
                  </div>

                  {/* Strengths */}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Strengths</label>
                    <div className={styles.editList}>
                      {selected.review.strengths.map((s, i) => (
                        <div key={i} className={styles.listRow}>
                          <textarea
                            className={`${styles.fieldTextarea} ${styles.inlineTextarea}`}
                            value={s}
                            onChange={(e) => updateListItem("strengths", i, e.target.value)}
                            disabled={!editable}
                            placeholder="Strength…"
                            rows={2}
                          />
                          {editable && (
                            <button className={styles.removeBtn} onClick={() => removeListItem("strengths", i)}>×</button>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <button className={styles.addBtn} onClick={() => addListItem("strengths")}>+ Add strength</button>
                      )}
                    </div>
                  </div>

                  {/* Action items */}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Action items</label>
                    <div className={styles.editList}>
                      {selected.review.action_items.map((a, i) => (
                        <div key={i} className={styles.listRow}>
                          <textarea
                            className={`${styles.fieldTextarea} ${styles.inlineTextarea}`}
                            value={a}
                            onChange={(e) => updateListItem("action_items", i, e.target.value)}
                            disabled={!editable}
                            placeholder="Action item…"
                            rows={2}
                          />
                          {editable && (
                            <button className={styles.removeBtn} onClick={() => removeListItem("action_items", i)}>×</button>
                          )}
                        </div>
                      ))}
                      {editable && (
                        <button className={styles.addBtn} onClick={() => addListItem("action_items")}>+ Add action item</button>
                      )}
                    </div>
                  </div>

                  {/* Manager notes */}
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Your notes to the intern (optional)</label>
                    <textarea
                      className={styles.fieldTextarea}
                      placeholder="Add any personal context or encouragement…"
                      value={managerNotes}
                      rows={3}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      disabled={!editable}
                    />
                  </div>

                  {/* Actions */}
                  {editable ? (
                    <div className={styles.actions}>
                      <button
                        className={styles.btnApprove}
                        onClick={() => handleAction("approved")}
                        disabled={saving}
                      >
                        {saving ? "Sending…" : "✓ Approve & notify intern"}
                      </button>
                      <button
                        className={styles.btnReject}
                        onClick={() => handleAction("rejected")}
                        disabled={saving}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className={`${styles.reviewedBanner} ${selected.status === "approved" ? styles.bannerApproved : styles.bannerRejected}`}>
                      {selected.status === "approved" ? "✓ Approved" : "✗ Rejected"}
                      {selected.reviewedAt && ` · ${new Date(selected.reviewedAt).toLocaleString()}`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── WEEKLY ── */}
        {tab === "weekly" && (
          <div className={styles.weeklyPane}>
            <div className={styles.sectionTitle}>Weekly Digest</div>
            <p className={styles.weeklySub}>Summary of intern activity this week</p>

            {INTERNS.map(intern => {
              const internTasks = tasks.filter(t => t.assignedTo === intern);
              const internSubs = submissions.filter(s => s.intern === intern);
              const thisWeek = new Date();
              thisWeek.setDate(thisWeek.getDate() - 7);
              const recentSubs = internSubs.filter(s => new Date(s.submittedAt) >= thisWeek);
              const completedTasks = internTasks.filter(t => t.status === "complete");
              const inProgressTasks = internTasks.filter(t => t.status === "in_progress" || t.status === "under_review");
              const overdueTasks = internTasks.filter(t =>
                t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "complete"
              );

              return (
                <div key={intern} className={styles.weeklyCard}>
                  <div className={styles.weeklyCardHeader}>
                    <span className={styles.weeklyInternName}>{intern}</span>
                    <span className={styles.weeklyBadge}>
                      {completedTasks.length}/{internTasks.length} tasks
                    </span>
                  </div>
                  <div className={styles.weeklyStats}>
                    <div className={styles.weeklyStat}>
                      <span className={styles.weeklyStatNum}>{recentSubs.length}</span>
                      <span className={styles.weeklyStatLabel}>submissions this week</span>
                    </div>
                    <div className={styles.weeklyStat}>
                      <span className={styles.weeklyStatNum}>{inProgressTasks.length}</span>
                      <span className={styles.weeklyStatLabel}>in progress</span>
                    </div>
                    <div className={styles.weeklyStat}>
                      <span className={`${styles.weeklyStatNum} ${overdueTasks.length ? styles.statNumAlert : ""}`}>
                        {overdueTasks.length}
                      </span>
                      <span className={styles.weeklyStatLabel}>overdue</span>
                    </div>
                  </div>

                  {inProgressTasks.length > 0 && (
                    <div className={styles.weeklySection}>
                      <span className={styles.weeklySectionLabel}>Active tasks</span>
                      {inProgressTasks.map(t => (
                        <div key={t.id} className={styles.weeklyTaskRow}>
                          <span className={`${styles.taskColDot} ${statusColor(t.status)}`} />
                          <span>{t.title}</span>
                          {t.dueDate && <span className={styles.taskCardDue}>due {new Date(t.dueDate + "T00:00:00").toLocaleDateString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {recentSubs.length > 0 && (
                    <div className={styles.weeklySection}>
                      <span className={styles.weeklySectionLabel}>Recent submissions</span>
                      {recentSubs.map(s => (
                        <div key={s.id} className={styles.weeklyTaskRow}>
                          <span className={`${styles.pill} ${s.status === "approved" ? styles.pillApproved : s.status === "rejected" ? styles.pillRejected : styles.pillPending}`}>
                            {s.status}
                          </span>
                          <span>{s.task}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {internTasks.length === 0 && internSubs.length === 0 && (
                    <p className={styles.emptyMsg} style={{ padding: "8px 0", textAlign: "left" }}>No activity yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
