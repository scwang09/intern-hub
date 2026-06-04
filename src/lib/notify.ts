import nodemailer from "nodemailer";
import type { Submission } from "./types";
import type { Task } from "./types";

const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN  = process.env.SLACK_BOT_TOKEN;
const APP_URL          = process.env.NEXT_PUBLIC_APP_URL ?? "";
const MANAGER_EMAIL    = "stanley.wang@twinhealth.com";

// ── Intern identity maps ─────────────────────────────────────────────────────
const INTERN_SLACK_IDS: Record<string, string> = {
  Natalie: process.env.SLACK_USER_NATALIE ?? "",
  Sam:     process.env.SLACK_USER_SAM     ?? "",
};

const INTERN_EMAILS: Record<string, string> = {
  Natalie: process.env.INTERN_EMAIL_NATALIE ?? "",
  Sam:     process.env.INTERN_EMAIL_SAM     ?? "",
};

// ── Transport helpers ────────────────────────────────────────────────────────
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

/** Post to the manager Slack channel via incoming webhook */
async function postSlack(text: string) {
  if (!SLACK_WEBHOOK) return;
  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

/** DM a specific Slack user via the bot token */
async function postSlackDM(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN || !userId) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel: userId, text }),
  }).catch(() => {});
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !to) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Intern Hub" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  }).catch(() => {});
}

// ── Manager notifications ────────────────────────────────────────────────────
export async function notifyManagerNewSubmission(sub: Submission) {
  const { intern, internEmail, task, fileName, review, taskType } = sub;
  const dashboardUrl = `${APP_URL}/manager`;
  const isOp = taskType === "operational";
  const aiLine = isOp
    ? `Error scan: ${review.flags.length} issue${review.flags.length !== 1 ? "s" : ""} found — needs your manual review`
    : `AI Verdict: ${review.verdict} (${review.grade})`;
  const typeLabel = isOp ? "Operational" : "Project / Analysis";

  await postSlack(
    `📥 *New submission from ${intern}*\nTask: ${task}  |  Type: ${typeLabel}  |  File: ${fileName}\n${aiLine}\n<${dashboardUrl}|Review in dashboard>`
  );

  await sendEmail(
    MANAGER_EMAIL,
    `New submission: ${intern} — ${task}`,
    `<h2 style="font-family:sans-serif">New Intern Submission</h2>
     <p style="font-family:sans-serif"><strong>${intern}</strong> (${internEmail}) submitted their work.</p>
     <table style="font-family:sans-serif">
       <tr><td style="padding:4px 12px 4px 0;color:#666">Task</td><td>${task}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Type</td><td>${typeLabel}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">File</td><td>${fileName}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">${isOp ? "Error scan" : "AI Verdict"}</td><td>${isOp ? `${review.flags.length} issue${review.flags.length !== 1 ? "s" : ""} found` : `${review.verdict} (${review.grade})`}</td></tr>
     </table>
     <p style="font-family:sans-serif;color:#444">${review.summary}</p>
     <p><a href="${dashboardUrl}" style="background:#0070f3;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-family:sans-serif;display:inline-block;margin-top:8px">Review in dashboard →</a></p>`
  );
}

// ── Intern notifications ─────────────────────────────────────────────────────

/** Fired when the manager approves or rejects a submission */
export async function notifyInternReviewReady(sub: Submission) {
  const { intern, task, review, managerNotes, status } = sub;

  const internSlackId = INTERN_SLACK_IDS[intern] ?? "";
  const internEmail   = INTERN_EMAILS[intern] || sub.internEmail;

  const emoji   = status === "approved" ? "✅" : "🔄";
  const verdict = review.verdict ? `${review.verdict}${review.grade ? ` (${review.grade})` : ""}` : status;

  // Slack DM to the intern
  await postSlackDM(
    internSlackId,
    `${emoji} *Your submission for "${task}" has been reviewed!*\nVerdict: ${verdict}\n${review.summary}${managerNotes ? `\nManager notes: ${managerNotes}` : ""}\n<${APP_URL}/intern|View feedback in Intern Hub>`
  );

  // Email to the intern
  const strengthsHtml = review.strengths?.length
    ? `<h3 style="font-family:sans-serif">Strengths</h3><ul style="font-family:sans-serif">${review.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>`
    : "";
  const actionHtml = review.action_items?.length
    ? `<h3 style="font-family:sans-serif">Action Items</h3><ol style="font-family:sans-serif">${review.action_items.map((a) => `<li>${a}</li>`).join("")}</ol>`
    : "";
  const notesHtml = managerNotes
    ? `<h3 style="font-family:sans-serif">Notes from your manager</h3><p style="font-family:sans-serif">${managerNotes}</p>`
    : "";

  await sendEmail(
    internEmail,
    `Your deliverable review is ready — ${task}`,
    `<h2 style="font-family:sans-serif">Your Deliverable Review</h2>
     <p style="font-family:sans-serif">Hi ${intern},</p>
     <p style="font-family:sans-serif">Your submission for <strong>${task}</strong> has been reviewed.</p>
     <h3 style="font-family:sans-serif">Verdict: ${verdict}</h3>
     <p style="font-family:sans-serif;color:#444">${review.summary}</p>
     ${strengthsHtml}
     ${actionHtml}
     ${notesHtml}
     <p><a href="${APP_URL}/intern" style="background:#0070f3;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-family:sans-serif;display:inline-block;margin-top:8px">View in Intern Hub →</a></p>
     <p style="font-family:sans-serif;color:#888;font-size:13px;margin-top:32px">Sent via Intern Hub · Strategic Finance Summer 2026</p>`
  );
}

/** Fired when a task is assigned (new task created, or recurring instance spawned) */
export async function notifyInternNewTask(task: Task) {
  const internName    = task.assignedTo;
  const internSlackId = INTERN_SLACK_IDS[internName] ?? "";
  const internEmail   = INTERN_EMAILS[internName] ?? "";
  const typeLabel     = task.taskType === "operational" ? "Operational" : "Project / Analysis";
  const dueLine       = task.dueDate
    ? `Due: ${new Date(task.dueDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
    : "No due date set";
  const descLine      = task.description ? `\n${task.description}` : "";
  const internHubUrl  = `${APP_URL}/intern`;

  // Slack DM
  await postSlackDM(
    internSlackId,
    `📋 *New task assigned to you: "${task.title}"*\nType: ${typeLabel}  |  ${dueLine}${descLine}\n<${internHubUrl}|View in Intern Hub>`
  );

  // Email
  await sendEmail(
    internEmail,
    `New task assigned: ${task.title}`,
    `<h2 style="font-family:sans-serif">New Task Assigned</h2>
     <p style="font-family:sans-serif">Hi ${internName},</p>
     <p style="font-family:sans-serif">A new task has been assigned to you.</p>
     <table style="font-family:sans-serif">
       <tr><td style="padding:4px 12px 4px 0;color:#666">Task</td><td><strong>${task.title}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Type</td><td>${typeLabel}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Due</td><td>${dueLine}</td></tr>
       ${task.description ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Details</td><td>${task.description}</td></tr>` : ""}
     </table>
     <p><a href="${internHubUrl}" style="background:#0070f3;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-family:sans-serif;display:inline-block;margin-top:16px">View in Intern Hub →</a></p>
     <p style="font-family:sans-serif;color:#888;font-size:13px;margin-top:32px">Sent via Intern Hub · Strategic Finance Summer 2026</p>`
  );
}
