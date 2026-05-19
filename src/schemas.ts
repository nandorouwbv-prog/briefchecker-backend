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
    message: "Geen tekst of afbeelding ontvangen",
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

export const recommendedResponseTypeSchema = z.enum([
  "none",
  "pay",
  "save_only",
  "reminder",
  "call",
  "email",
  "objection",
  "cancel",
  "compare",
  "ask_explanation",
]);

export type RecommendedResponseType = z.infer<typeof recommendedResponseTypeSchema>;

export const scanQualitySchema = z.enum(["good", "unclear", "failed"]);

export type ScanQuality = z.infer<typeof scanQualitySchema>;

export const recommendedActionSchema = z.object({
  type: recommendedActionTypeSchema,
  label: z.string(),
  description: z.string(),
});

export const analyzeDocumentResponseSchema = z
  .object({
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
    recommendedResponseType: recommendedResponseTypeSchema,
    shouldGenerateLetter: z.boolean(),
    responseReason: z.string().optional(),
    generatedLetter: z.string().optional(),
    scanQuality: scanQualitySchema.optional(),
    scanQualityReason: z.string().optional(),
  })
  .transform((data) => {
    if (!data.shouldGenerateLetter) {
      const { generatedLetter: _removed, ...rest } = data;
      return rest;
    }
    return data;
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
  "recommendedResponseType": "none" | "pay" | "save_only" | "reminder" | "call" | "email" | "objection" | "cancel" | "compare" | "ask_explanation",
  "shouldGenerateLetter": boolean,
  "responseReason": "string (optioneel, korte uitleg in het Nederlands waarom wel/geen brief)",
  "generatedLetter": "string (alleen invullen als shouldGenerateLetter true is; anders weglaten)"
}`;

export const IMAGE_SCAN_JSON_FIELDS = `
  "scanQuality": "good" | "unclear" | "failed" (verplicht bij afbeeldingen),
  "scanQualityReason": "string (optioneel, korte uitleg over leesbaarheid scan; verplicht bij unclear of failed)"`;

export const ANALYZE_IMAGE_RESPONSE_JSON_SCHEMA = `${ANALYZE_RESPONSE_JSON_SCHEMA.slice(0, -2)},
${IMAGE_SCAN_JSON_FIELDS}
}`;
