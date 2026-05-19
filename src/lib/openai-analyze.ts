import OpenAI from "openai";
import {
  ANALYZE_RESPONSE_JSON_SCHEMA,
  analyzeDocumentResponseSchema,
  type AnalyzeDocumentResponse,
  type DocumentCategory,
} from "../schemas.js";
import { parseJsonWithRepair } from "./json-repair.js";

const SYSTEM_PROMPT = `Je bent BriefChecker, een AI-assistent die Nederlandse brieven, contracten en abonnementen in eenvoudig Nederlands uitlegt. Je geeft samenvattingen, actiepunten en voorbeeldteksten. Je geeft geen juridisch, financieel of fiscaal advies.

Regels:
- Schrijf alles in het Nederlands, in eenvoudige taal.
- Geef geen garanties over uitkomsten.
- Als de tekst onduidelijk of onvolledig is, zeg dat duidelijk in summary en simpleExplanation.
- Haal belangrijke data, deadlines, kosten, aanbieder en actiepunten eruit.
- Gebruik ISO-datums (YYYY-MM-DD of volledige ISO 8601) alleen als er een exacte datum in de tekst staat; anders laat deadlineISO en endDateISO weg.
- Voor category energy, telecom of insurance: schat possibleSavingMonthly alleen in als er genoeg kostinformatie in het document staat; anders laat het veld weg.
- category in de JSON moet overeenkomen met de door de gebruiker gekozen categorie, tenzij het document duidelijk een andere categorie aangeeft.
- Antwoord uitsluitend met geldig JSON, zonder markdown of extra tekst.`;

function buildUserPrompt(category: DocumentCategory, text: string, todayISO: string): string {
  return `Analyseer het volgende Nederlandse document.

Gekozen categorie door gebruiker: ${category}
Huidige datum: ${todayISO}

Documenttekst:
---
${text}
---

Geef een JSON-object met exact deze velden en types:
${ANALYZE_RESPONSE_JSON_SCHEMA}

Zorg dat recommendedActions minimaal één item bevat.`;
}

export async function analyzeDocumentText(
  client: OpenAI,
  category: DocumentCategory,
  text: string,
): Promise<AnalyzeDocumentResponse> {
  const todayISO = new Date().toISOString().slice(0, 10);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(category, text, todayISO) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Leeg antwoord van OpenAI.");
  }

  const parsed = parseJsonWithRepair(content);
  return analyzeDocumentResponseSchema.parse(parsed);
}
