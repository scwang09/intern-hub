import nodemailer from "nodemailer";
import type { Submission } from "./types";

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const MANAGER_EMAIL = "stanley.wang@twinhealth.com";

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

async function postSlack(text: string) {
  if (!SLACK_WEBHOOK) return;
  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Intern Hub" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  }).catch(() => {});
}

export async function notifyManagerNewSubmission(sub: Submission) {
  const { intern, internEmail, task, fileName, review } = sub;
  const dashboardUrl = `${APP_URL}/manager`;

  await postSlack(
    `📥 *New submission from ${intern}*\nTask: ${task}  |  File: ${fileName}\nAI Verdict: ${review.verdict} (${review.grade})\n<${dashboardUrl}|Review in dashboard>`
  );

  await sendEmail(
    MANAGER_EMAIL,
    `New submission: ${intern} — ${task}`,
    `<h2 style="font-family:sans-serif">New Intern Submission</h2>
     <p style="font-family:sans-serif"><strong>${intern}</strong> (${internEmail}) submitted their work.</p>
     <table style="font-family:sans-serif">
       <tr><td style="padding:4px 12px 4px 0;color:#666">Task</td><td>${task}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">File</td><td>${fileName}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">AI Verdict</td><td>${review.verdict} (${review.grade})</td></tr>
     </table>
     <p style="font-family:sans-serif;color:#444">${review.summary}</p>
     <p><a href="${dashboardUrl}" style="background:#0070f3;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-family:sans-serif;display:inline-block;margin-top:8px">Review in dashboard →</a></p>`
  );
}

export async function notifyInternReviewReady(sub: Submission) {
  const { intern, internEmail, task, review, managerNotes } = sub;

  const strengthsHtml = review.strengths?.length
    ? `<h3 style="font-family:sans-serif">Strengths</h3><ul style="font-family:sans-serif">${review.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>`
    : "";

  const actionHtml = review.action_items?.length
    ? `<h3 style="font-family:sans-serif">Action Items</h3><ol style="font-family:sans-serif">${review.action_items.map((a) => `<li>${a}</li>`).join("")}</ol>`
    : "";

  const notesHtml = managerNotes
    ? `<h3 style="font-family:sans-serif">Notes from your manager</h3><p style="font-family:sans-serif">${managerNotes}</p>`
    : "";

  await postSlack(
    `✅ *${intern}* — your deliverable for "${task}" has been reviewed!\nVerdict: ${review.verdict} (${review.grade})\n${review.summary}${managerNotes ? `\nManager notes: ${managerNotes}` : ""}`
  );

  await sendEmail(
    internEmail,
    `Your deliverable review is ready — ${task}`,
    `<h2 style="font-family:sans-serif">Your Deliverable Review</h2>
     <p style="font-family:sans-serif">Hi ${intern},</p>
     <p style="font-family:sans-serif">Your submission for <strong>${task}</strong> has been reviewed.</p>
     <h3 style="font-family:sans-serif">Verdict: ${review.verdict} (${review.grade})</h3>
     <p style="font-family:sans-serif;color:#444">${review.summary}</p>
     ${strengthsHtml}
     ${actionHtml}
     ${notesHtml}
     <p style="font-family:sans-serif;color:#888;font-size:13px;margin-top:32px">Sent via Intern Hub · Strategic Finance Summer 2026</p>`
  );
}
