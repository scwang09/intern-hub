import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, getAllSubmissions } from "@/lib/db";
import type { Task, Submission } from "@/lib/types";
import nodemailer from "nodemailer";

const INTERN_CONFIG: Record<string, string | undefined> = {
  Natalie: process.env.INTERN_EMAIL_NATALIE,
  Sam: process.env.INTERN_EMAIL_SAM,
};

function getTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildDigestEmail(intern: string, tasks: Task[], submissions: Submission[]): string {
  const internTasks = tasks.filter(t => t.assignedTo === intern);
  const internSubs = submissions.filter(s => s.intern === intern);

  const actionRequired = internTasks.filter(t => t.status === "needs_revision");
  const dueSoon = internTasks.filter(t => t.dueDate && isDueThisWeek(t.dueDate) && t.status !== "complete");
  const feedbackReceived = internSubs.filter(s => s.status !== "pending" && isThisWeek(s.reviewedAt ?? ""));
  const submitted = internSubs.filter(s => isThisWeek(s.submittedAt));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#888;font-family:sans-serif;font-size:14px;white-space:nowrap">${label}</td><td style="font-family:sans-serif;font-size:14px;color:#222">${value}</td></tr>`;

  const sectionTitle = (t: string) =>
    `<h3 style="font-family:sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#999;margin:28px 0 10px">${t}</h3>`;

  const card = (content: string, urgent = false) =>
    `<div style="background:${urgent ? "#fff5f5" : "#fafafa"};border:1px solid ${urgent ? "#fca5a5" : "#e5e5e5"};border-radius:8px;padding:14px 16px;margin-bottom:8px">${content}</div>`;

  let body = `
    <div style="max-width:560px;margin:0 auto;padding:32px 16px">
      <h1 style="font-family:sans-serif;font-size:22px;font-weight:600;color:#111;margin:0 0 4px">Your weekly digest</h1>
      <p style="font-family:sans-serif;font-size:13px;color:#888;margin:0 0 32px">Hi ${intern} · Strategic Finance Summer 2026</p>
  `;

  // Stats strip
  body += `
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr>
        ${[
          { n: actionRequired.length, l: "Action required", alert: actionRequired.length > 0 },
          { n: dueSoon.length, l: "Due this week", alert: false },
          { n: feedbackReceived.length, l: "Feedback received", alert: false },
          { n: submitted.length, l: "Submitted", alert: false },
        ].map(s => `
          <td style="text-align:center;padding:16px 8px;background:${s.alert ? "#fff5f5" : "#f7f7f7"};border:1px solid ${s.alert ? "#fca5a5" : "#e5e5e5"};border-radius:8px">
            <div style="font-family:sans-serif;font-size:26px;font-weight:700;color:${s.alert ? "#dc2626" : "#111"}">${s.n}</div>
            <div style="font-family:sans-serif;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">${s.l}</div>
          </td>
        `).join('<td style="width:8px"></td>')}
      </tr>
    </table>
  `;

  if (actionRequired.length > 0) {
    body += sectionTitle("⚠ Action Required");
    actionRequired.forEach(task => {
      const latestSub = internSubs
        .filter(s => s.taskId === task.id || s.task === task.title)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
      body += card(`
        <div style="font-family:sans-serif;font-size:15px;font-weight:600;color:#7f1d1d;margin-bottom:6px">${task.title}</div>
        ${latestSub?.review.summary ? `<div style="font-family:sans-serif;font-size:13px;color:#555;line-height:1.5;margin-bottom:8px">${latestSub.review.summary}</div>` : ""}
        ${latestSub?.review.action_items?.length ? `<div style="font-family:sans-serif;font-size:12px;color:#888">${latestSub.review.action_items.map(a => `· ${a}`).join("<br>")}</div>` : ""}
      `, true);
    });
  }

  if (dueSoon.length > 0) {
    body += sectionTitle("Due This Week");
    dueSoon.forEach(task => {
      body += card(`
        <table style="width:100%"><tr>
          <td style="font-family:sans-serif;font-size:14px;color:#222">${task.title}</td>
          <td style="font-family:sans-serif;font-size:12px;color:#888;text-align:right;white-space:nowrap">${task.dueDate ? formatDate(task.dueDate) : ""}</td>
        </tr></table>
      `);
    });
  }

  if (feedbackReceived.length > 0) {
    body += sectionTitle("Feedback Received");
    feedbackReceived.forEach(sub => {
      body += card(`
        <table style="width:100%;margin-bottom:6px"><tr>
          <td style="font-family:sans-serif;font-size:14px;font-weight:600;color:#222">${sub.submissionName || sub.task}</td>
          <td style="text-align:right">
            <span style="font-family:monospace;font-size:14px;font-weight:700;color:${sub.status === "approved" ? "#166534" : "#7f1d1d"}">${sub.review.grade}</span>
            &nbsp;
            <span style="font-family:sans-serif;font-size:11px;background:${sub.status === "approved" ? "#dcfce7" : "#fee2e2"};color:${sub.status === "approved" ? "#166534" : "#7f1d1d"};padding:2px 8px;border-radius:999px">${sub.status}</span>
          </td>
        </tr></table>
        ${sub.review.summary ? `<div style="font-family:sans-serif;font-size:13px;color:#555;line-height:1.5">${sub.review.summary}</div>` : ""}
        ${sub.managerNotes ? `<div style="font-family:sans-serif;font-size:12px;color:#888;margin-top:6px;font-style:italic">Manager: ${sub.managerNotes}</div>` : ""}
      `);
    });
  }

  if (submitted.length > 0) {
    body += sectionTitle("Submitted This Week");
    submitted.forEach(sub => {
      body += card(`
        <table style="width:100%"><tr>
          <td style="font-family:sans-serif;font-size:14px;color:#222">${sub.submissionName || sub.task}</td>
          <td style="font-family:sans-serif;font-size:12px;color:#888;text-align:right">${formatDate(sub.submittedAt)}</td>
        </tr></table>
      `);
    });
  }

  if (actionRequired.length === 0 && dueSoon.length === 0 && feedbackReceived.length === 0 && submitted.length === 0) {
    body += `<p style="font-family:sans-serif;font-size:14px;color:#888;text-align:center;padding:32px 0">All quiet this week — nothing due or pending.</p>`;
  }

  body += `
      <div style="margin-top:32px;text-align:center">
        <a href="${appUrl}/intern" style="display:inline-block;background:#111;color:#fff;font-family:sans-serif;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">Open your dashboard →</a>
      </div>
      <p style="font-family:sans-serif;font-size:11px;color:#ccc;text-align:center;margin-top:24px">Intern Hub · Strategic Finance Summer 2026</p>
    </div>
  `;

  return body;
}

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const [tasks, submissions] = await Promise.all([getAllTasks(), getAllSubmissions()]);
  const transporter = getTransporter();
  const results: Record<string, string> = {};

  for (const [intern, email] of Object.entries(INTERN_CONFIG)) {
    if (!email) {
      results[intern] = "skipped (no email configured)";
      continue;
    }
    try {
      const html = buildDigestEmail(intern, tasks, submissions);
      await transporter.sendMail({
        from: `"Intern Hub" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: `Your weekly digest — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
        html,
      });
      results[intern] = "sent";
    } catch (err) {
      results[intern] = `error: ${String(err)}`;
    }
  }

  return NextResponse.json({ ok: true, results });
}
