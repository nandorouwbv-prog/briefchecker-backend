import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";
import {
  ANALYZE_RESPONSE_JSON_SCHEMA,
  analyzeDocumentResponseSchema,
  type AnalyzeDocumentResponse,
  type DocumentCategory,
} from "../schemas.js";
import { parseJsonWithRepair } from "./json-repair.js";

const SYSTEM_PROMPT = `Je bent BriefChecker, een AI-assistent die Nederlandse brieven, contracten, abonnementen en officiële documenten in eenvoudig Nederlands uitlegt. Je geeft samenvattingen, actiepunten, deadlines en soms een voorbeeldbrief of -mail. Je geeft geen juridisch, financieel of fiscaal advies.

Regels:
- Schrijf alles in het Nederlands, in eenvoudige taal.
- Geef geen garanties over uitkomsten.
- Als de tekst onduidelijk of onvolledig is, zeg dat duidelijk in summary en simpleExplanation.
- Haal belangrijke data, deadlines, kosten, aanbieder en actiepunten eruit.
- Gebruik ISO-datums (YYYY-MM-DD of volledige ISO 8601) alleen als er een exacte datum in de tekst staat; anders laat deadlineISO en endDateISO weg.
- Voor category energy, telecom of insurance: schat possibleSavingMonthly alleen in als er genoeg kostinformatie in het document staat; anders laat het veld weg.
- category in de JSON moet overeenkomen met de door de gebruiker gekozen categorie, tenzij het document duidelijk een andere categorie aangeeft.
- Antwoord uitsluitend met geldig JSON, zonder markdown of extra tekst.

Aanbevolen reactie en brief/mail:
- recommendedResponseType: het beste type vervolgstap voor de gebruiker.
- shouldGenerateLetter: alleen true als een geschreven brief of e-mail echt nuttig is.
- responseReason: korte uitleg in eenvoudig Nederlands waarom wel of geen brief/mail nodig is.
- generatedLetter: alleen invullen als shouldGenerateLetter true is; dan een bruikbare Nederlandse concepttekst (brief of mail).

Zet shouldGenerateLetter alleen op true wanneer een schriftelijke reactie echt zinvol is.

Voorbeelden:
- Betaalbrief, factuur of belastingaanslag:
  recommendedResponseType = "pay", shouldGenerateLetter = false,
  responseReason bijv. "Dit lijkt vooral een betaalverzoek. Een brief of mail is meestal niet nodig zolang de gegevens kloppen."
  recommendedActions: minstens pay en eventueel save (reminder) — geen automatische brief.

- Puur informatieve brief zonder actie:
  recommendedResponseType = "save_only", shouldGenerateLetter = false.

- Contract loopt binnenkort af (energie/telecom/verzekering):
  recommendedResponseType = "compare", shouldGenerateLetter = false,
  tenzij opzeggen of vragen stellen nodig is — dan "cancel" of "ask_explanation" en shouldGenerateLetter alleen true als een schriftelijke reactie nodig is.

- Prijsverhoging of ongewenste wijziging:
  recommendedResponseType = "ask_explanation" of "cancel",
  shouldGenerateLetter = true als bezwaar, opzegging of uitleg per brief/mail kan.

- Gemeente vraagt extra documenten of schriftelijke reactie:
  recommendedResponseType = "email", shouldGenerateLetter = true.

- Bezwaar of formele tegenreactie mogelijk:
  recommendedResponseType = "objection", shouldGenerateLetter = true.

- Bellen is logischer dan schrijven:
  recommendedResponseType = "call", shouldGenerateLetter = false.

- Alleen herinnering zetten (deadline, betaling):
  recommendedResponseType = "reminder", shouldGenerateLetter = false.

- Geen duidelijke actie nodig:
  recommendedResponseType = "none", shouldGenerateLetter = false.

- Onduidelijk document:
  recommendedResponseType = "none", shouldGenerateLetter = false,
  voeg recommendedActions met type "check" of "call" toe.

Koppel recommendedActions aan recommendedResponseType (bijv. pay bij betaalbrief, compare bij contractvergelijking).`;

const IMAGE_ANALYSIS_RULES = `
Extra regels voor afbeeldingen:
- Lees eerst de zichtbare tekst uit de afbeelding en analyseer die daarna.
- Als de afbeelding wazig, afgesneden, onleesbaar is of geen document toont, vermeld dit duidelijk in summary en simpleExplanation.
- Verzin geen exacte datums, prijzen of aanbieders als die niet zichtbaar zijn.
- Bij twijfel: gebruik riskLevel "medium" of "high", recommendedResponseType "none", shouldGenerateLetter false, en een recommended action met type "check".`;

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

Zorg dat recommendedActions minimaal één item bevat en aansluit bij recommendedResponseType.
Zet shouldGenerateLetter op false tenzij een brief of mail echt helpt; laat generatedLetter dan weg.`;
}

function buildImageUserPrompt(category: DocumentCategory, todayISO: string): string {
  return `Analyseer het Nederlandse document op de bijgevoegde afbeelding (brief, contract, abonnement of officieel document).

Gekozen categorie door gebruiker: ${category}
Huidige datum: ${todayISO}
${IMAGE_ANALYSIS_RULES}

Geef een JSON-object met exact deze velden en types:
${ANALYZE_RESPONSE_JSON_SCHEMA}

Zorg dat recommendedActions minimaal één item bevat en aansluit bij recommendedResponseType.
Zet shouldGenerateLetter op false tenzij een brief of mail echt helpt; laat generatedLetter dan weg.`;
}

export function normalizeImageDataUrl(imageBase64: string): string {
  const trimmed = imageBase64.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

async function completeAndParse(
  client: OpenAI,
  messages: ChatCompletionMessageParam[],
): Promise<AnalyzeDocumentResponse> {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Leeg antwoord van OpenAI.");
  }

  const parsed = parseJsonWithRepair(content);
  return analyzeDocumentResponseSchema.parse(parsed);
}

export async function analyzeDocumentText(
  client: OpenAI,
  category: DocumentCategory,
  text: string,
): Promise<AnalyzeDocumentResponse> {
  const todayISO = new Date().toISOString().slice(0, 10);

  return completeAndParse(client, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(category, text, todayISO) },
  ]);
}

export async function analyzeDocumentImage(
  client: OpenAI,
  category: DocumentCategory,
  imageBase64: string,
): Promise<AnalyzeDocumentResponse> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const imageUrl = normalizeImageDataUrl(imageBase64);

  return completeAndParse(client, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: buildImageUserPrompt(category, todayISO) },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ]);
}
