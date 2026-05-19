"use client";

import { useState, useEffect, useCallback } from "react";
import type { Submission, ReviewResult, ReviewFlag } from "@/lib/types";
import styles from "./Manager.module.css";

const VERDICTS = ["Approve", "Approve with minor fixes", "Needs revision", "Reject"];
const GRADES = ["A", "B+", "B", "C+", "C", "D"];
const SEVERITIES = ["high", "medium", "low"];

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

export default function ManagerPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [managerNotes, setManagerNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPwd, setSavedPwd] = useState("");

  const fetchSubmissions = useCallback(async (pwd: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/submissions", {
        headers: { "x-manager-password": pwd },
      });
      if (res.status === 401) {
        sessionStorage.removeItem("mgr_pwd");
        setAuthed(false);
        setAuthError("Incorrect password.");
        return false;
      }
      const data = await res.json();
      setSubmissions(data.submissions ?? []);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("mgr_pwd");
    if (stored) {
      setSavedPwd(stored);
      fetchSubmissions(stored).then((ok) => { if (ok) setAuthed(true); });
    }
  }, [fetchSubmissions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await fetchSubmissions(password);
    if (ok) {
      sessionStorage.setItem("mgr_pwd", password);
      setSavedPwd(password);
      setAuthed(true);
      setAuthError("");
    } else {
      setAuthError("Incorrect password.");
    }
  };

  const handleSelect = (sub: Submission) => {
    setSelected({ ...sub, review: { ...sub.review } });
    setManagerNotes(sub.managerNotes ?? "");
  };

  // ── Review field helpers ───────────────────────────────────────────────────
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

  // ── Approve / Reject ───────────────────────────────────────────────────────
  const handleAction = async (status: "approved" | "rejected") => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${selected.id}`, {
        method: "PATCH",
        headers: {
          "x-manager-password": savedPwd,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, managerNotes, review: selected.review }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) => prev.map((s) => (s.id === selected.id ? data.submission : s)));
        setSelected(data.submission);
      }
    } finally {
      setSaving(false);
    }
  };

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");
  const editable = selected?.status === "pending";

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
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>Manager Dashboard</h1>
          <p className={styles.sub}>Strategic Finance · Summer 2026</p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => fetchSubmissions(savedPwd)}
          disabled={loading}
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      <div className={styles.layout}>
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
                  <span className={styles.subTask}>{sub.task}</span>
                  <span className={styles.subDate}>{new Date(sub.submittedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </section>
          )}
        </aside>

        {/* Main area */}
        {!selected ? (
          <div className={styles.emptyDetail}>
            <p>Select a submission to review</p>
          </div>
        ) : (
          <div className={styles.mainArea}>
            {/* File viewer panel */}
            <div className={styles.filePanel}>
              <p className={styles.filePanelLabel}>
                <span className={styles.filePanelName}>{selected.fileName}</span>
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
                <p className={styles.detailMeta}>
                  {selected.intern} · {selected.internEmail}
                </p>
                <h2 className={styles.detailTitle}>
                  {selected.review.title || selected.task}
                </h2>
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
                      <input
                        className={styles.fieldInput}
                        value={f.text}
                        onChange={(e) => updateFlag(i, "text", e.target.value)}
                        disabled={!editable}
                        placeholder="Describe the issue…"
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
                      <input
                        className={styles.fieldInput}
                        value={s}
                        onChange={(e) => updateListItem("strengths", i, e.target.value)}
                        disabled={!editable}
                        placeholder="Strength…"
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
                      <input
                        className={styles.fieldInput}
                        value={a}
                        onChange={(e) => updateListItem("action_items", i, e.target.value)}
                        disabled={!editable}
                        placeholder="Action item…"
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
    </div>
  );
}
