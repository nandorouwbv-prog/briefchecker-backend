import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { analyzeDocumentImage, analyzeDocumentText } from "../lib/openai-analyze.js";
import { analyzeDocumentRequestSchema } from "../schemas.js";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return null;
  }
  return new OpenAI({ apiKey });
}

export const analyzeDocumentRouter = Router();

analyzeDocumentRouter.post("/", async (req: Request, res: Response) => {
  const parsed = analyzeDocumentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.errors[0]?.message ?? "Ongeldig verzoek.",
    });
    return;
  }

  const { category, text, imageBase64 } = parsed.data;
  const documentText = text?.trim();
  const hasImage = Boolean(imageBase64?.trim());

  if (!documentText && !hasImage) {
    res.status(400).json({ error: "Geen tekst of afbeelding ontvangen" });
    return;
  }

  const client = getOpenAIClient();
  if (!client) {
    res.status(500).json({ error: "OpenAI API key ontbreekt" });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";

  try {
    const result = documentText
      ? await analyzeDocumentText(client, category, documentText)
      : await analyzeDocumentImage(client, category, imageBase64!);
    res.json(result);
  } catch (err) {
    if (!isProduction) {
      console.error("[analyze-document] failed:", err instanceof Error ? err.message : err);
    } else {
      console.error("[analyze-document] failed");
    }
    res.status(500).json({ error: "Analyse mislukt" });
  }
});
