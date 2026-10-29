# PawMart QA Interview Platform

A local, self-hosted Playwright + TypeScript interview. Candidates write real tests against a real sample app
(pet store + vet POS); every run launches Chromium and executes their spec. Interviewers get a PIN-protected
dashboard with code, attempts, time per question, reference solutions, a scorecard and a markdown report.

## Quick start

```bash
npm install
npm run setup       # downloads Chromium (once)
npm run selftest    # optional: proves every solution passes and every starter fails
npm start
```

| What | URL |
| :-- | :-- |
| Candidate portal | http://localhost:4000 |
| Interviewer dashboard | http://localhost:4000/admin (PIN is printed in the terminal) |
| Sample app (also served to candidates at `/sample/`) | http://localhost:4001 (`/`, `/checkout`, `/account`, `/pos`) |
| Cross-origin PCI iframe | http://localhost:4002/card |

Settings (environment variables): `INTERVIEWER_PIN`, `INTERVIEW_MINUTES` (default 45), `SHOW_HINTS=false`
(hide fix hints from candidates), `PORTAL_PORT`, `SAMPLE_PORT`, `PCI_PORT`.

Windows (PowerShell): `$env:INTERVIEWER_PIN="123456"; npm start`

## Share with a remote candidate (free, no domain, no account)

The candidate only ever talks to port 4000 (the sample app and payment iframe are served through the portal),
so one free tunnel is enough. Cloudflare's quick tunnel is open source (`cloudflared`), needs no account and no domain.

1. Start the platform: `npm start` (or the Docker command below).
2. Install cloudflared once:
   - macOS: `brew install cloudflared`
   - Windows: `winget install --id Cloudflare.cloudflared`
   - Linux: download the binary from https://github.com/cloudflare/cloudflared/releases
3. In a second terminal: `cloudflared tunnel --url http://localhost:4000`
4. It prints a link like `https://random-words.trycloudflare.com`. Send that link to the candidate.
   The link changes every time you restart the tunnel, so share it right before the interview.
5. Review on YOUR machine at http://localhost:4000/admin. The interviewer area is refused for anything that
   arrives through a tunnel (403), so candidates can never reach it even though they share the same server.

No-install alternative: `ssh -R 80:localhost:4000 nokey@localhost.run` prints a public https link.

### Run candidate code in Docker (recommended for remote candidates)
```bash
docker build -t pawmart-qa .
docker run --rm -p 4000:4000 -p 4001-4002:4001-4002 -e INTERVIEWER_PIN=123456 -v "$PWD/data:/app/data" pawmart-qa
```
Candidate specs then execute inside the container instead of on your laptop. `data/` is mounted so
submissions survive restarts and you can open the dashboard at http://localhost:4000/admin.

Tunnel links are plain "best effort" free infrastructure: keep the terminal open for the whole interview.
Set `ALLOW_REMOTE_ADMIN=true` only if you deliberately want the dashboard reachable through the tunnel (not advised).

## How it works

- **Real execution**: a submission is saved to `runs/<id>/candidate.spec.ts` and run with `playwright test`
  against the sample app (`baseURL` is preconfigured, so candidates use `page.goto('/')`). Pass = static guards
  (anti-patterns such as `waitForTimeout`, `.first()`, required APIs) AND a green Playwright run.
- **Real bugs to find/handle**: debounced slow search (race), regenerated element ids, a cross-origin iframe,
  a silent HTTP 500 plus uncaught error on `#` in the address, an HttpOnly-cookie login, a table that re-sorts
  itself, a 3-second promo validation, and a failing cloud-receipt endpoint.
- **Server-side secrets**: solutions, rubric notes and guards never reach the candidate browser.
  The interviewer area needs the PIN (httpOnly cookie, rate limited).
- **Sessions** persist in `data/sessions.json`: refresh/restart safe. The countdown is enforced by the server
  (runs and saves are refused after the deadline). Use "Give +5 minutes" on the dashboard to extend.
- **Question bank**: `lib/questions.js` (starter, solution, guards, interviewer notes). POS-5 runs in a
  `vm` sandbox against hidden datasets.

## Security notes (read before using with strangers)

Candidate code is executed by Node/Playwright on the machine running the server. A static filter blocks
`require`, `process`, `fs`, `child_process`, `eval` etc., but it is not a security boundary. For real candidates:
run it on an interviewer-owned machine on a trusted network, or use Docker:

```bash
docker build -t pawmart-qa . && docker run --rm -p 4000-4002:4000-4002 -e INTERVIEWER_PIN=123456 pawmart-qa
```

The Monaco editor loads from the jsDelivr CDN; offline, it falls back to a plain textarea automatically.
