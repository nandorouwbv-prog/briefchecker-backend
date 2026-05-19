import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import { analyzeDocumentText } from "../lib/openai-analyze.js";
import { analyzeDocumentRequestSchema } from "../schemas.js";

const IMAGE_NOT_SUPPORTED = {
  error: "Afbeeldinganalyse is nog niet beschikbaar. Stuur documenttekst (text) mee.",
  code: "IMAGE_NOT_SUPPORTED",
} as const;

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

  if (imageBase64 && !text?.trim()) {
    res.status(501).json(IMAGE_NOT_SUPPORTED);
    return;
  }

  const documentText = text!.trim();

  const client = getOpenAIClient();
  if (!client) {
    res.status(500).json({ error: "Analyse mislukt" });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";

  try {
    const result = await analyzeDocumentText(client, category, documentText);
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
