# BriefChecker Backend

Simple Node.js API for Dutch document analysis (Expo / React Native).

## Setup

```bash
npm install
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm run dev
```

Server runs at `http://localhost:3000` by default.

## Endpoints

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

## Expo development

Point the app to your machine IP, e.g. `http://192.168.1.x:3000/api/analyze-document`. CORS allows Expo dev clients.

## Scripts

- `npm run dev` — watch mode with tsx
- `npm run build` — compile to `dist/`
- `npm start` — run compiled output
