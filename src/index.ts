import "dotenv/config";
import cors from "cors";
import express from "express";
import { analyzeDocumentRouter } from "./routes/analyze-document.js";
import { healthRouter } from "./routes/health.js";

const PORT = Number(process.env.PORT) || 3000;
const BODY_LIMIT = "512kb";

const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: BODY_LIMIT }));

app.use("/api/health", healthRouter);
app.use("/api/analyze-document", analyzeDocumentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Niet gevonden" });
});

app.listen(PORT, () => {
  console.log(`BriefChecker API listening on http://localhost:${PORT}`);
});
