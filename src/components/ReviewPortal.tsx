"use client";

import { useState, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
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

export default function ReviewPortal() {
  const [file, setFile] = useState<File | null>(null);
  const [intern, setIntern] = useState(INTERNS[0]);
  const [internEmail, setInternEmail] = useState("");
  const [task, setTask] = useState(TASKS[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setSubmitted(false);
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
    if (!internEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    setSubmitted(false);

    try {
      // Step 1: upload file directly to Blob (bypasses serverless 4.5MB limit)
      setStatusMsg("Uploading file…");
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });

      // Step 2: send blob URL + metadata to the review API
      setStatusMsg("AI is reviewing your work…");
      const formData = new FormData();
      formData.append("fileUrl", blob.url);
      formData.append("fileName", file.name);
      formData.append("intern", intern);
      formData.append("internEmail", internEmail.trim());
      formData.append("task", task);
      formData.append("notes", notes);

      const res = await fetch("/api/review", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Server error");

      setSubmittedEmail(internEmail.trim());
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  const reset = () => {
    setFile(null);
    setSubmitted(false);
    setError("");
    setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Submitted confirmation ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className={styles.shell}>
        <div className={styles.masthead}>
          <h1 className={styles.mastheadTitle}>Deliverable Review</h1>
          <span className={styles.mastheadMeta}>Strategic Finance · Summer 2026</span>
        </div>
        <div className={styles.confirmBox}>
          <div className={styles.confirmIcon}>✓</div>
          <h2 className={styles.confirmTitle}>Submitted successfully</h2>
          <p className={styles.confirmMsg}>
            Your work has been received and is being reviewed. You&apos;ll be notified
            at <strong>{submittedEmail}</strong> once the review is ready.
          </p>
          <button className={styles.btnOutline} onClick={reset}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
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
          <label htmlFor="intern-select">Your name</label>
          <select id="intern-select" value={intern} onChange={(e) => setIntern(e.target.value)}>
            {INTERNS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="email-input">Your email</label>
          <input
            id="email-input"
            type="email"
            placeholder="you@example.com"
            value={internEmail}
            onChange={(e) => setInternEmail(e.target.value)}
          />
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
            placeholder="e.g. First attempt — please focus on formula accuracy and executive summary quality."
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
          {loading ? "Submitting…" : "Submit for review"}
        </button>
        {statusMsg && <span className={styles.statusLine} aria-live="polite">{statusMsg}</span>}
      </div>

      {error && <div className={styles.errorBox} role="alert">⚠ {error}</div>}
    </div>
  );
}
