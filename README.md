# Intern Hub — Deliverable Review Portal

A Next.js app for reviewing strategic finance intern deliverables using Claude AI.

## What it does

- Interns (or you) upload a deliverable: PDF, Excel, Word, CSV
- The app parses the file server-side and sends it to Claude for review
- Claude returns a structured assessment: verdict, grade, flagged issues, strengths, action items
- You approve, copy the summary to send as feedback, or reject and ask for a redo

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add your Anthropic API key

```bash
cp .env.local.example .env.local
```

Open `.env.local` and replace `your_api_key_here` with your key from
[console.anthropic.com](https://console.anthropic.com).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel (recommended, free)

### One-time setup

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. In the Vercel dashboard under **Settings → Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
4. Click Deploy — you'll get a URL like `intern-hub.vercel.app`

### Future updates

```bash
git add . && git commit -m "update" && git push
```

Vercel auto-deploys on every push.

---

## Customizing interns and tasks

Edit the arrays at the top of `src/components/ReviewPortal.tsx`:

```ts
const INTERNS = ["Alex", "Jordan", "Sam"];

const TASKS = [
  "Q2 variance analysis vs budget",
  "3-year revenue forecast model",
  // add more here
];
```

---

## File format support

| Format | How it's reviewed |
|--------|-------------------|
| PDF | Full document text extracted and sent to Claude |
| Excel (.xlsx, .xls) | All sheets parsed to CSV, up to 200 rows each |
| Word (.docx, .doc) | Full text extracted |
| CSV / TXT | Raw content sent directly |
| PowerPoint | Metadata-only review (binary parsing not yet supported) |

---

## Tech stack

- **Next.js 15** (App Router)
- **Anthropic SDK** — Claude Sonnet 4.6 for reviews
- **mammoth** — Word document parsing
- **xlsx** — Excel parsing
- **TypeScript**, CSS Modules

---

## Next steps to build on this

- [ ] Add Slack integration to send feedback directly to intern DMs
- [ ] Weekly task tracker with assignment and status tracking
- [ ] Weekly digest composer and sender
- [ ] Submission history / log per intern
- [ ] Swap in `claude-opus-4-7` for the review call if you want higher quality on complex models
