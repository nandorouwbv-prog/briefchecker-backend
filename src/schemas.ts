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

export const deadlineStatusSchema = z.enum(["none", "upcoming", "today", "overdue"]);

export type DeadlineStatus = z.infer<typeof deadlineStatusSchema>;

export const documentKinds = [
  "letter",
  "contract",
  "invoice",
  "payment_request",
  "usage_report",
  "price_increase",
  "reminder",
  "information",
  "unknown",
] as const;

export type DocumentKind = (typeof documentKinds)[number];

export const documentKindSchema = z.enum(documentKinds);

export const usageReportSchema = z.object({
  period: z.string().optional(),
  electricityKwh: z.number().optional(),
  electricityCost: z.number().optional(),
  electricityPreviousMonthKwh: z.number().optional(),
  electricityPreviousYearKwh: z.number().optional(),
  returnedElectricityKwh: z.number().optional(),
  returnedElectricityAmount: z.number().optional(),
  gasM3: z.number().optional(),
  gasCost: z.number().optional(),
  totalCost: z.number().optional(),
  notableChange: z.string().optional(),
});

export type UsageReport = z.infer<typeof usageReportSchema>;

export const financialImpactTypes = [
  "none",
  "payment",
  "refund",
  "monthly_cost",
  "price_increase",
  "possible_saving",
  "unknown",
] as const;

export type FinancialImpactType = (typeof financialImpactTypes)[number];

export const financialImpactTypeSchema = z.enum(financialImpactTypes);

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
    deadlineStatus: deadlineStatusSchema.optional(),
    daysUntilDeadline: z.number().int().nonnegative().optional(),
    daysOverdue: z.number().int().positive().optional(),
    urgentWarning: z.string().optional(),
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
    documentKind: documentKindSchema.optional(),
    usageReport: usageReportSchema.optional(),
    financialImpactType: financialImpactTypeSchema.optional(),
    amountDue: z.number().optional(),
    dueDateISO: z.string().optional(),
    monthlyAmount: z.number().optional(),
    priceIncreaseAmount: z.number().optional(),
    financialImpactMonth: z.string().optional(),
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
  "deadlineStatus": "none" | "upcoming" | "today" | "overdue",
  "daysUntilDeadline": number (optioneel, alleen bij upcoming: dagen tot deadline)",
  "daysOverdue": number (optioneel, alleen bij overdue: dagen te laat)",
  "urgentWarning": "string (optioneel, korte Nederlandse waarschuwing bij urgente of verlopen deadline)",
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
  "generatedLetter": "string (alleen invullen als shouldGenerateLetter true is; anders weglaten)",
  "documentKind": "letter" | "contract" | "invoice" | "payment_request" | "usage_report" | "price_increase" | "reminder" | "information" | "unknown" (optioneel maar altijd invullen),
  "usageReport": {
    "period": "string (optioneel, bijv. april 2026)",
    "electricityKwh": number (optioneel, verbruik stroom in kWh — niet teruglevering),
    "electricityCost": number (optioneel, kosten stroom in euro),
    "electricityPreviousMonthKwh": number (optioneel, verbruik vorige maand indien zichtbaar),
    "electricityPreviousYearKwh": number (optioneel, verbruikzelfde maand vorig jaar indien zichtbaar),
    "returnedElectricityKwh": number (optioneel, teruglevering in kWh),
    "returnedElectricityAmount": number (optioneel, vergoeding teruglevering in euro),
    "gasM3": number (optioneel, gasverbruik in m³),
    "gasCost": number (optioneel, gaskosten in euro),
    "totalCost": number (optioneel, totaalbedrag in euro indien zichtbaar),
    "notableChange": "string (optioneel, korte Nederlandse opmerking over opvallend verschil t.o.v. vorige maand/jaar)"
  } (optioneel; alleen invullen bij documentKind usage_report),
  "financialImpactType": "none" | "payment" | "refund" | "monthly_cost" | "price_increase" | "possible_saving" | "unknown" (altijd invullen),
  "amountDue": number (optioneel, alleen bij financialImpactType payment: te betalen bedrag in euro),
  "dueDateISO": "string ISO 8601 YYYY-MM-DD (optioneel, alleen bij payment: betaaldatum indien zichtbaar)",
  "monthlyAmount": number (optioneel, alleen bij monthly_cost: maandelijks bedrag in euro),
  "priceIncreaseAmount": number (optioneel, alleen bij price_increase: verhoging in euro indien zichtbaar),
  "financialImpactMonth": "string (optioneel, bijv. 2026-04 of april 2026: maand waarop de financiële impact betrekking heeft)"
}`;

export const IMAGE_SCAN_JSON_FIELDS = `
  "scanQuality": "good" | "unclear" | "failed" (verplicht bij afbeeldingen),
  "scanQualityReason": "string (optioneel, korte uitleg over leesbaarheid scan; verplicht bij unclear of failed)"`;

export const ANALYZE_IMAGE_RESPONSE_JSON_SCHEMA = `${ANALYZE_RESPONSE_JSON_SCHEMA.slice(0, -2)},
${IMAGE_SCAN_JSON_FIELDS}
}`;
