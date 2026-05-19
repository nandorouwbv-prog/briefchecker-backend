import cors from "cors";
import express from "express";
import { analyzeDocumentRouter } from "./routes/analyze-document.js";
import { healthRouter } from "./routes/health.js";

const BODY_LIMIT = "8mb";

export const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: BODY_LIMIT }));

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "BriefChecker Backend" });
});

// Full paths (local dev and Vercel with preserved URL)
app.use("/api/health", healthRouter);
app.use("/api/analyze-document", analyzeDocumentRouter);

// Stripped paths (Vercel serverless may forward /health instead of /api/health)
app.use("/health", healthRouter);
app.use("/analyze-document", analyzeDocumentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Niet gevonden" });
});
