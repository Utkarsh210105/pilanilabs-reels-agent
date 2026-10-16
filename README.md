# PilaniLabs Reels Agent

Writes short-form avatar reel scripts for PilaniLabs, for two audiences on the same accounts and the same HeyGen avatar:

| Audience | Language | Series | Call to action |
|---|---|---|---|
| **B2B**: CXOs and senior leaders | English | *CXO AI Brief*, *PilaniLabs Workshops* | Free consultation |
| **B2C**: everyday people | Hinglish | *AI in 60 Sec*, *PilaniLabs AI Course* | Follow / course link in bio |

Built on the same pattern as the Namhya Marketing Engine: an Express API with an in-process cron, Postgres, and a React/Vite dashboard.

## How it works

```
06:00 IST  RSS feeds ──▶ news_items ──▶ Claude scores each story 0-10 for B2B and B2C
                                             │
                    top unused stories ──────┘
                             ▼
             Claude writes the script as segments ──▶ code checks + fact check
                  (hook, beats, CTA; each segment           │  errors? one automatic
                   is avatar or B-roll + stock query)        │  rewrite with the problems listed
                             ▼                               ▼
                    Review queue: edit, rewrite with feedback, re-check facts, approve
                             ▼
                    Copy for HeyGen (B2C: Hindi words in Devanagari) ──▶ render in HeyGen by hand
```

**Phase 1 (done):** news ingest and scoring, script writing, checks, fact check, review dashboard, HeyGen copy, "Sync news" button.
**Phase 2a (done): B-roll picking.** On approve (or "Find B-roll"), each `broll` segment searches Pexels for vertical clips, Claude looks at the thumbnails next to the spoken line and picks one (or none: no second faces, logos or off-topic shots), falling back to its own better search and then landscape clips. A clip is never reused within 30 days across reels. Reviewers can swap any clip from the dashboard (`api/pipeline/matchBroll.js`).
**Phase 2b (done): assembly.** Upload the HeyGen MP4 on an approved script. Whisper (Groq, with the script as a vocabulary hint) times every spoken word, `align.js` lines the script's words up with it, and FFmpeg overlays the picked B-roll per segment, burns in word-by-word captions (spoken word in gold) and on-screen-text banners, adds the logo badge, optional music from `api/assets/music/`, and a 1.5s logo outro. Output: 1080×1920 H.264 MP4 in `api/media/` (local disk for now); the script moves to "rendered".

Requires `ffmpeg`/`ffprobe` on PATH, built with libass.

**Creator reels.** Add an Instagram handle on the Creator reels page. Apify (`apify~instagram-reel-scraper`, as in the Namhya engine) fetches their last 30 reels with real view counts; each reel's `outperform` is views ÷ that creator's median. The top 6 are transcribed from their actual audio (Whisper) and Claude explains the hook device, beats and why it worked. "B2C/B2B reel" writes an original Pilani script with the same technique. Unlike the Namhya engine, it never reuses the creator's wording: any 5-word run shared with their transcript is an error (`copiedPhrases` in `checks.js`), and scripts never mention the creator. Scraped weekly (Mondays 05:30 IST).
**Phase 3:** HeyGen API rendering, auto-posting, UTM tracking.

### Quality gates
- **Code checks** (`api/pipeline/checks.js`) cover em dashes, emojis, stage directions, clichés ("game changer", "unleash"...), length, hook on camera, B-roll search queries, spoken URLs, and the Hinglish ratio for B2C. Errors trigger one automatic rewrite, and approving past an error needs an explicit override.
- **Fact check** (`api/pipeline/factCheck.js`): every factual claim is checked against the source article (news) or the offering facts (promo). Unsupported claims are errors. Custom topics have no source, so every claim is marked "verify".
- **Offerings** can only be described with the facts in `api/config/brand.js`.

## Comment "AI" → DM → WhatsApp community (ManyChat)

Every script ends with the comment call to action from `api/config/brand.js` (`engagement`: keyword "AI"). ManyChat handles the Instagram side (comment trigger on any post with "AI" → public reply → follow check → DM with the community link) and then calls **External Request** `POST /api/leads/manychat` with header `X-Webhook-Secret: <LEADS_WEBHOOK_SECRET>`. The exact URL, header and JSON body are on the **Leads** page under "ManyChat setup". Leads are matched to a reel by the post link if ManyChat sends one, otherwise to the latest reel marked published (shown as "assumed"); paste the Instagram link when you click **Mark published**.

### Public address for ManyChat
ManyChat runs on the internet and cannot reach `localhost`. Until the app is deployed, expose this laptop with a tunnel that keeps a fixed address, e.g. ngrok's free static domain:

1. Sign up at ngrok.com, install it, and claim your free static domain (Dashboard → Domains).
2. Run `ngrok http --url=<your-domain>.ngrok-free.app 4100` while the agent runs.
3. Set `PUBLIC_URL=https://<your-domain>.ngrok-free.app` in `api/.env` and restart, so the Leads page shows the full webhook URL.

Requests arriving through the tunnel can only reach `POST /api/leads/manychat` (and the secret is required); the dashboard and all other APIs answer only on this computer (see the guard in `server.js`). Leads only arrive while the laptop, the agent and the tunnel are running; deploying removes that.

## Posting to Instagram

Rendered reels can be posted (or scheduled) from the script page through Instagram's official Content Publishing API ("Instagram API with Instagram Login"). The video is uploaded straight from this server, so no public URL is needed. On success the script is marked published and the reel's link is saved (used to match "AI"/"JOB" leads to the reel). Scheduled posts go out within a minute of their time while the agent is running; the token is refreshed every Sunday.

One-time setup (your own account needs no Meta App Review):
1. Instagram must be a **professional** account (Creator or Business).
2. developers.facebook.com → **My Apps → Create app** → use case **"Manage messaging & content on Instagram"** (Instagram API).
3. **App roles → Roles → Add people → Instagram Tester** → `pilanilabs`. Accept the invite in the Instagram app (Settings → Website permissions / Apps and websites → Tester invites).
4. In the app: **Instagram → API setup with Instagram login → Generate access tokens → Add account** → log in as @pilanilabs and allow `instagram_business_basic` and `instagram_business_content_publish`. Copy the token.
5. Put it in `api/.env` as `IG_ACCESS_TOKEN=...` and restart. Settings shows "Connected as @pilanilabs".

Limits: 50 API posts per 24 hours; captions up to 2,200 characters and 5 hashtags. The "AI info" label is set in the Instagram app after posting.

## Deploying to Cloud Run

Runs in **PilaniLabs' own Google Cloud project** (never another company's account). One always-on instance (1 vCPU, 2 GiB, CPU always allocated, max 1 instance) keeps the in-app schedules running; videos live in a Cloud Storage bucket mounted at `/mnt/media`; the dashboard requires **Google sign-in** for emails in `ALLOWED_EMAILS`.

One-time setup:
1. Pilani Google account → console.cloud.google.com → new project (e.g. `pilanilabs-reels`) with Pilani's billing.
2. On this laptop, a separate gcloud profile (does not touch the default one):
   ```
   gcloud config configurations create pilanilabs --no-activate
   $env:CLOUDSDK_ACTIVE_CONFIG_NAME="pilanilabs"; gcloud auth login; gcloud config set project <project-id>
   ```
   Enable APIs: `gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com`
3. Google sign-in: console → **Google Auth Platform** → Branding (app name, support email) → Audience → **Clients → Create client → Web application**; authorised JavaScript origin = the Cloud Run URL (add after the first deploy) and `http://localhost:4100`. Copy the client ID.
4. `deploy/cloudrun.env.yaml` from `deploy/cloudrun.env.example.yaml` (git-ignored): the `api/.env` values + `PUBLIC_URL`, `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, `SESSION_SECRET`.
5. `bash deploy/deploy-cloudrun.sh` (builds with Cloud Build, creates the bucket, deploys).
6. Point ManyChat's External Request to `<PUBLIC_URL>/api/leads/manychat`.

Run database migrations from the laptop (`npm --prefix api run migrate`) before deploying a version that adds one.

## Running it

Double-click **Start Reels Agent.bat** (or the "PilaniLabs Reels Agent" desktop shortcut). It builds the dashboard, starts one server for the API and dashboard, and opens **http://localhost:4100**. Keep the window open while using it; close it to stop. From a terminal: `npm start` in this folder.

For development with hot reload, run `npm run dev` in `api/` and in `dashboard/` (dashboard on http://localhost:5174).

## Setup

Requirements: Node 20+, and Docker (for local Postgres) or a Supabase project.

```bash
docker compose up -d                 # local Postgres on port 5433
cd api
cp .env.example .env                 # then set OPENROUTER_API_KEY
npm install
npm run migrate
npm run dev                          # http://localhost:4100
```

```bash
cd dashboard
npm install
npm run dev                          # http://localhost:5174
```

For Supabase, set `DATABASE_URL` to the session pooler connection string and run `npm run migrate`.

### Useful commands
- `npm run daily` (in `api/`): runs the full daily pipeline once from the terminal.
- `npm test` (in `api/`): unit tests for the code checks.

## Configuration

Everything lives in `api/config/`, versioned with the code:

| File | What |
|---|---|
| `brand.js` | Company facts, offerings (B2B workshops, **B2C course: fill in real details**), proof points, presenter name |
| `audiences.js` | Audience profiles: voice, language, length, hooks, series names, default CTA, hashtags |
| `sources.js` | RSS news sources |

Environment (`api/.env`): `DAILY_B2B_DRAFTS` (default 1), `DAILY_B2C_DRAFTS` (default 2), `MIN_NEWS_SCORE` (default 7), `SCRIPT_MODEL` / `FAST_MODEL` (OpenRouter model ids), `DISABLE_SCHEDULER`.
