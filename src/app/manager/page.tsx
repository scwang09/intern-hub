"use client";

import { useState, useEffect, useCallback } from "react";
import type { Submission, ReviewResult } from "@/lib/types";
import styles from "./Manager.module.css";

const VERDICTS = ["Approve", "Approve with minor fixes", "Needs revision", "Reject"];
const GRADES = ["A", "B+", "B", "C+", "C", "D"];

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
    setSelected({ ...sub });
    setManagerNotes(sub.managerNotes ?? "");
  };

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

  const updateReviewField = <K extends keyof ReviewResult>(field: K, value: ReviewResult[K]) => {
    if (!selected) return;
    setSelected({ ...selected, review: { ...selected.review, [field]: value } });
  };

  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");

  // ── Auth gate ─────────────────────────────────────────────────────────────
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
            <button type="submit" className={styles.authBtn}>
              Sign in
            </button>
          </form>
          {authError && <p className={styles.authError}>{authError}</p>}
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
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
                  <span className={styles.subDate}>
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </span>
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
                    <span
                      className={`${styles.pill} ${
                        sub.status === "approved" ? styles.pillApproved : styles.pillRejected
                      }`}
                    >
                      {sub.status}
                    </span>
                  </div>
                  <span className={styles.subTask}>{sub.task}</span>
                  <span className={styles.subDate}>
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </section>
          )}
        </aside>

        {/* Detail panel */}
        <main className={styles.detail}>
          {!selected ? (
            <div className={styles.emptyDetail}>
              <p>Select a submission to review</p>
            </div>
          ) : (
            <div className={styles.detailInner}>
              <div className={styles.detailHeader}>
                <div>
                  <p className={styles.detailMeta}>
                    {selected.intern} · {selected.internEmail} · {selected.fileName}
                  </p>
                  <h2 className={styles.detailTitle}>
                    {selected.review.title || selected.task}
                  </h2>
                </div>
              </div>

              {/* Editable verdict + grade */}
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Verdict</label>
                  <select
                    className={styles.fieldSelect}
                    value={selected.review.verdict}
                    onChange={(e) => updateReviewField("verdict", e.target.value)}
                    disabled={selected.status !== "pending"}
                  >
                    {VERDICTS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Grade</label>
                  <select
                    className={styles.fieldSelect}
                    value={selected.review.grade}
                    onChange={(e) => updateReviewField("grade", e.target.value)}
                    disabled={selected.status !== "pending"}
                  >
                    {GRADES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Summary (editable)</label>
                <textarea
                  className={styles.fieldTextarea}
                  value={selected.review.summary}
                  rows={4}
                  onChange={(e) => updateReviewField("summary", e.target.value)}
                  disabled={selected.status !== "pending"}
                />
              </div>

              {selected.review.flags?.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Issues flagged</label>
                  <div className={styles.flagList}>
                    {selected.review.flags.map((f, i) => (
                      <div key={i} className={`${styles.flagItem} ${styles[`flag_${f.severity}`]}`}>
                        <span className={styles.flagSev}>{f.severity}</span>
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.review.strengths?.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Strengths</label>
                  <ul className={styles.reviewList}>
                    {selected.review.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.review.action_items?.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Action items</label>
                  <ol className={styles.reviewList}>
                    {selected.review.action_items.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Your notes to the intern (optional, sent with review)
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  placeholder="Add any personal context or encouragement for the intern…"
                  value={managerNotes}
                  rows={3}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  disabled={selected.status !== "pending"}
                />
              </div>

              {selected.status === "pending" ? (
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
                <div
                  className={`${styles.reviewedBanner} ${
                    selected.status === "approved" ? styles.bannerApproved : styles.bannerRejected
                  }`}
                >
                  {selected.status === "approved" ? "✓ Approved" : "✗ Rejected"}
                  {selected.reviewedAt &&
                    ` · ${new Date(selected.reviewedAt).toLocaleString()}`}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
