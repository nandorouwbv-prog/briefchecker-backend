# BriefChecker Backend

Simple Node.js API for Dutch document analysis (Expo / React Native). Runs locally with Express and deploys to Vercel as a serverless API.

## Requirements

- Node.js 18+
- [OpenAI API key](https://platform.openai.com/api-keys)

## Environment variables

| Variable | Required | Where |
|----------|----------|--------|
| `OPENAI_API_KEY` | yes | `.env` locally, Vercel project settings in production |
| `PORT` | no | Local only (default `3000`) |
| `NODE_ENV` | no | Set to `production` on Vercel automatically |

**Never commit `.env`.** Copy `.env.example` for local setup only.

---

## Local development

```bash
npm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
npm run dev
```

Server: `http://localhost:3000`

- Health: `GET http://localhost:3000/api/health`
- Analyze: `POST http://localhost:3000/api/analyze-document`

### Expo on a physical device

Use your machine’s LAN IP instead of `localhost`, for example:

`http://192.168.1.10:3000/api/analyze-document`

CORS is enabled for Expo dev clients (`origin: true`).

### Other scripts

```bash
npm run build   # compile TypeScript to dist/
npm start       # run compiled app locally (node dist/index.js)
```

---

## Deploy to Vercel

### 1. Push the project

Connect this folder to a [Vercel](https://vercel.com) project (Git import or CLI).

### 2. Set environment variables

In the Vercel dashboard → **Project → Settings → Environment Variables**:

| Name | Value |
|------|--------|
| `OPENAI_API_KEY` | your OpenAI secret key |

Apply to **Production** (and Preview if you want preview deploys to work).

Do **not** upload `.env` to the repo.

### 3. Deploy

Vercel will run `npm run build` and expose the API under `/api/*`.

**Production URLs** (replace with your project name):

- Health: `https://your-vercel-project.vercel.app/api/health`
- Analyze: `https://your-vercel-project.vercel.app/api/analyze-document`

### Deploy with Vercel CLI (optional)

```bash
npm i -g vercel
vercel
vercel env add OPENAI_API_KEY
vercel --prod
```

### How it works on Vercel

- `api/index.ts` is the serverless entry and exports the Express app from `src/app.ts`.
- `vercel.json` rewrites `/`, `/api`, and `/api/*` to that function.
- Routes are mounted on both `/api/health` and `/health` so paths work whether or not Vercel strips the `/api` prefix.
- `src/index.ts` exports the app for tooling and only calls `app.listen()` when `VERCEL` is not set (local dev).
- `OPENAI_API_KEY` is read from Vercel env (not from `.env` on the server).
- Request body limit remains **512kb** (see `src/app.ts`).

---

## API reference

### `GET /api/health`

```json
{ "ok": true }
```

### `POST /api/analyze-document`

**Request**

```json
{
  "category": "rent",
  "text": "Geachte heer/mevrouw, ...",
  "fileName": "brief.pdf"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `category` | yes | `rent`, `subscription`, `energy`, `municipality`, `tax`, `healthcare`, `insurance`, `telecom`, `other` |
| `text` | one of text/image | Preferred for MVP |
| `imageBase64` | one of text/image | Returns `501` until OCR is implemented |
| `fileName` | no | Optional metadata |

**Success:** JSON matching app `ScannedDocument` fields (Dutch copy).

**Errors**

| Status | Body |
|--------|------|
| 400 | Validation error message |
| 501 | Image not supported yet |
| 500 | `{ "error": "Analyse mislukt" }` |

---

## Project layout

```
src/
  app.ts              # Express app (named export, shared local + Vercel)
  index.ts            # Local dev: dotenv + listen; exports app when imported
  routes/             # /api/health, /api/analyze-document
  lib/                # OpenAI, JSON repair
api/
  index.ts            # Vercel serverless entry (default export)
vercel.json           # Rewrites / and /api/* → /api/index
```
