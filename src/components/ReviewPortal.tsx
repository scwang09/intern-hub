"use client";

import { useState, useRef, useCallback } from "react";
import type { ReviewResult } from "@/lib/types";
import styles from "./ReviewPortal.module.css";

const INTERNS = ["Alex", "Jordan", "Sam"];

const TASKS = [
  "Q2 variance analysis vs budget",
  "3-year revenue forecast model",
  "Unit economics — CAC/LTV",
  "Competitive benchmarking memo",
  "Board deck slide — Q2 metrics",
  "Headcount model update",
  "SaaS gross margin benchmarks",
  "Other / unlisted",
];

function verdictClass(v: string): string {
  const l = v.toLowerCase();
  if (l.includes("approve") && !l.includes("fix")) return styles.verdictApprove;
  if (l.includes("fix") || l.includes("minor")) return styles.verdictFix;
  if (l.includes("revision")) return styles.verdictRevision;
  if (l.includes("reject")) return styles.verdictReject;
  return styles.verdictUnclear;
}

export default function ReviewPortal() {
  const [file, setFile] = useState<File | null>(null);
  const [intern, setIntern] = useState(INTERNS[0]);
  const [task, setTask] = useState(TASKS[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setReview(null);
    setApproved(false);
    setError("");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setReview(null);
    setApproved(false);

    try {
      setStatusMsg("Uploading file…");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("intern", intern);
      formData.append("task", task);
      formData.append("notes", notes);

      setStatusMsg("Claude is reviewing…");
      const res = await fetch("/api/review", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Server error");

      setReview({ ...data.review, fileName: file.name, intern, task });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  const copyToClipboard = () => {
    if (!review) return;
    const text = [
      `Review: ${review.title}`,
      `Intern: ${review.intern} · Task: ${review.task}`,
      `Verdict: ${review.verdict}${review.grade ? ` (${review.grade})` : ""}`,
      "",
      `Summary:\n${review.summary}`,
      review.flags?.length
        ? `\nIssues flagged:\n${review.flags.map((f) => `[${f.severity.toUpperCase()}] ${f.text}`).join("\n")}`
        : "",
      review.action_items?.length
        ? `\nAction items for intern:\n${review.action_items.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const reset = () => {
    setFile(null);
    setReview(null);
    setApproved(false);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={styles.shell}>
      {/* Masthead */}
      <div className={styles.masthead}>
        <h1 className={styles.mastheadTitle}>Deliverable Review</h1>
        <span className={styles.mastheadMeta}>Strategic Finance · Summer 2026</span>
      </div>

      {/* Upload zone */}
      <div
        className={`${styles.dropZone} ${over ? styles.over : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        aria-label="Upload deliverable file"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.csv,.txt"
          className={styles.fileInput}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          onClick={(e) => e.stopPropagation()}
        />
        <svg className={styles.dropIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M12 16V8m0 0-3 3m3-3 3 3M6 20h12a2 2 0 002-2V8.828a2 2 0 00-.586-1.414l-3.828-3.828A2 2 0 0014.172 3H6a2 2 0 00-2 2v13a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className={styles.dropLabel}>Drop deliverable here</p>
        <p className={styles.dropSub}>PDF, Excel, Word, CSV — up to 25 MB</p>
      </div>

      {file && (
        <div className={styles.filePill}>
          <span>{file.name}</span>
          <span className={styles.fileSize}>({(file.size / 1024).toFixed(0)} KB)</span>
          <button className={styles.removeBtn} onClick={reset} aria-label="Remove file">×</button>
        </div>
      )}

      {/* Context fields */}
      <div className={styles.contextGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor="intern-select">Intern</label>
          <select id="intern-select" value={intern} onChange={(e) => setIntern(e.target.value)}>
            {INTERNS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="task-select">Task / deliverable</label>
          <select id="task-select" value={task} onChange={(e) => setTask(e.target.value)}>
            {TASKS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className={`${styles.fieldGroup} ${styles.fullWidth}`}>
          <label htmlFor="notes-input">Notes for the reviewer (optional)</label>
          <textarea
            id="notes-input"
            placeholder="e.g. First attempt — be constructive. Focus on formula accuracy and executive summary quality."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Submit */}
      <div className={styles.submitRow}>
        <button
          className={styles.btnReview}
          onClick={handleSubmit}
          disabled={!file || loading}
        >
          {loading ? <span className={styles.spinner} aria-hidden="true" /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {loading ? "Reviewing…" : "Review deliverable"}
        </button>
        {statusMsg && <span className={styles.statusLine} aria-live="polite">{statusMsg}</span>}
      </div>

      {error && <div className={styles.errorBox} role="alert">⚠ {error}</div>}

      {/* Review card */}
      {review && !approved && (
        <>
          <hr className={styles.divider} />
          <article className={styles.reviewCard}>
            <div className={styles.reviewHeader}>
              <div className={styles.reviewHeaderLeft}>
                <p className={styles.reviewFileName}>{review.intern} · {review.fileName}</p>
                <h2 className={styles.reviewTitle}>{review.title || review.task}</h2>
              </div>
              <div className={styles.reviewHeaderRight}>
                <span className={`${styles.verdictBadge} ${verdictClass(review.verdict)}`}>
                  {review.verdict}
                </span>
                {review.grade && <span className={styles.grade}>{review.grade}</span>}
              </div>
            </div>

            <div className={styles.reviewBody}>
              <section>
                <p className={styles.sectionLabel}>Summary</p>
                <p className={styles.summaryText}>{review.summary}</p>
              </section>

              {review.flags?.length > 0 && (
                <section>
                  <p className={styles.sectionLabel}>Issues flagged</p>
                  <div className={styles.flagsList}>
                    {review.flags.map((f, i) => (
                      <div key={i} className={`${styles.flagItem} ${styles[`flag_${f.severity}`]}`}>
                        <span className={styles.flagLabel}>{f.severity}</span>
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {review.strengths?.length > 0 && (
                <section>
                  <p className={styles.sectionLabel}>Strengths</p>
                  <ul className={styles.strengthsList}>
                    {review.strengths.map((s, i) => (
                      <li key={i} className={styles.strengthItem}>
                        <span className={styles.strengthDot} aria-hidden="true" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {review.action_items?.length > 0 && (
                <section>
                  <p className={styles.sectionLabel}>Action items for intern</p>
                  <ol className={styles.actionList}>
                    {review.action_items.map((a, i) => (
                      <li key={i} className={styles.actionItem}>
                        <span className={styles.actionNum}>{String(i + 1).padStart(2, "0")}.</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>

            <div className={styles.reviewFooter}>
              <button className={styles.btnApprove} onClick={() => setApproved(true)}>
                Approve
              </button>
              <button className={styles.btnOutline} onClick={copyToClipboard}>
                {copied ? "Copied!" : "Copy summary"}
              </button>
              <button className={styles.btnReject} onClick={reset}>
                Reject &amp; clear
              </button>
            </div>
          </article>
        </>
      )}

      {approved && (
        <>
          <hr className={styles.divider} />
          <div className={styles.approvedBanner} role="status">
            ✓ Deliverable approved — {review?.intern}&apos;s {review?.task} marked complete
          </div>
        </>
      )}
    </div>
  );
}
