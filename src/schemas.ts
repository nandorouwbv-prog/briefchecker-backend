import { z } from "zod";

export const documentCategories = [
  "rent",
  "subscription",
  "energy",
  "municipality",
  "tax",
  "healthcare",
  "insurance",
  "telecom",
  "other",
] as const;

export type DocumentCategory = (typeof documentCategories)[number];

export const analyzeDocumentRequestSchema = z
  .object({
    category: z.enum(documentCategories),
    text: z.string().min(1).optional(),
    imageBase64: z.string().min(1).optional(),
    fileName: z.string().optional(),
  })
  .refine((data) => Boolean(data.text?.trim()) || Boolean(data.imageBase64?.trim()), {
    message: "Geef tekst of een afbeelding mee.",
  });

export type AnalyzeDocumentRequest = z.infer<typeof analyzeDocumentRequestSchema>;

export const recommendedActionTypeSchema = z.enum([
  "no_action",
  "pay",
  "respond",
  "cancel",
  "object",
  "compare",
  "save",
  "call",
  "check",
]);

export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const recommendedActionSchema = z.object({
  type: recommendedActionTypeSchema,
  label: z.string(),
  description: z.string(),
});

export const analyzeDocumentResponseSchema = z.object({
  title: z.string(),
  category: z.string(),
  provider: z.string().optional(),
  summary: z.string(),
  simpleExplanation: z.string(),
  actionNeeded: z.boolean(),
  deadlineISO: z.string().optional(),
  riskLevel: riskLevelSchema,
  monthlyCost: z.number().optional(),
  endDateISO: z.string().optional(),
  cancellationNoticeDays: z.number().optional(),
  possibleSavingMonthly: z.number().optional(),
  recommendedActions: z.array(recommendedActionSchema).min(1),
  generatedLetter: z.string().optional(),
});

export type AnalyzeDocumentResponse = z.infer<typeof analyzeDocumentResponseSchema>;

export const ANALYZE_RESPONSE_JSON_SCHEMA = `{
  "title": "string",
  "category": "string",
  "provider": "string (optioneel)",
  "summary": "string",
  "simpleExplanation": "string",
  "actionNeeded": boolean,
  "deadlineISO": "string ISO 8601 (optioneel, alleen bij exacte datum)",
  "riskLevel": "low" | "medium" | "high",
  "monthlyCost": number (optioneel),
  "endDateISO": "string ISO 8601 (optioneel, alleen bij exacte datum)",
  "cancellationNoticeDays": number (optioneel),
  "possibleSavingMonthly": number (optioneel, alleen bij energy/telecom/insurance met voldoende kostinfo)",
  "recommendedActions": [
    {
      "type": "no_action" | "pay" | "respond" | "cancel" | "object" | "compare" | "save" | "call" | "check",
      "label": "string",
      "description": "string"
    }
  ],
  "generatedLetter": "string (optioneel, voorbeeldtekst)"
}`;
