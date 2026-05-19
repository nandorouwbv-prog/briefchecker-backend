import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";
import {
  ANALYZE_IMAGE_RESPONSE_JSON_SCHEMA,
  ANALYZE_RESPONSE_JSON_SCHEMA,
  analyzeDocumentResponseSchema,
  type AnalyzeDocumentResponse,
  type DocumentCategory,
  type ScanQuality,
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

const IMAGE_SCAN_QUALITY_RULES = `
Scan-kwaliteit (verplicht bij afbeeldingen):
- scanQuality: beoordeel hoe goed de tekst op de foto leesbaar is.
- Als het document grotendeels leesbaar is: geef altijd de best mogelijke gestructureerde analyse. Wijs de scan niet af alleen omdat een klein deel onduidelijk is.
- scanQuality = "good": tekst is duidelijk genoeg voor een betrouwbare analyse.
- scanQuality = "unclear": een deel is lastig te lezen, maar er is genoeg zichtbare tekst voor een nuttige analyse.
  - Vul summary en simpleExplanation wél in met wat je wél ziet.
  - Voeg een korte noot toe dat de scan gecontroleerd moet worden (bijv. in summary of simpleExplanation).
  - Haal zichtbare datums, bedragen, aanbieder, deadlines en acties waar mogelijk alsnog uit.
  - Laat deadlineISO, monthlyCost en vergelijkbare velden weg als je het niet zeker weet; leg dat kort uit in scanQualityReason.
  - Gebruik géén tekst als "maak een duidelijkere foto" bij scanQuality "unclear".
- scanQuality = "failed": alleen als de tekst echt onleesbaar is, extreem wazig, sterk afgesneden, geen document toont, of vrijwel geen tekst te herkennen is.
  - Alleen dan mag je in scanQualityReason adviseren een duidelijkere foto te maken.
  - Geef dan minimale analyse; recommendedResponseType "none", shouldGenerateLetter false, en actie type "check".

Algemeen voor afbeeldingen:
- Lees eerst alle zichtbare tekst en analyseer daarna.
- Verzin geen exacte datums, prijzen of aanbieders als die niet zichtbaar zijn.
- Bij twijfel over inhoud: riskLevel "medium" of "high", laat onzekere exacte velden weg.
- Betaaltermijn zichtbaar: recommendedResponseType "pay", shouldGenerateLetter false.
- Vraag om documenten of schriftelijke reactie: recommendedResponseType "email", shouldGenerateLetter true indien nuttig.
- Puur informatief: recommendedResponseType "save_only", shouldGenerateLetter false.`;

const UNCLEAR_PHOTO_PHRASES = [
  /maak een duidelijkere foto/i,
  /neem een (nieuwe )?duidelijkere foto/i,
  /foto is niet duidelijk genoeg/i,
  /afbeelding is (te )?onduidelijk/i,
  /scan is niet leesbaar/i,
  /probeer opnieuw te scannen/i,
];

function stripPrematureFailureMessaging(
  data: AnalyzeDocumentResponse,
): AnalyzeDocumentResponse {
  if (data.scanQuality === "failed") {
    return data;
  }

  const scrub = (text: string): string => {
    let result = text;
    for (const pattern of UNCLEAR_PHOTO_PHRASES) {
      result = result.replace(pattern, "").trim();
    }
    return result.replace(/\s{2,}/g, " ").trim();
  };

  const summary = scrub(data.summary);
  const simpleExplanation = scrub(data.simpleExplanation);

  return {
    ...data,
    summary: summary || data.summary,
    simpleExplanation: simpleExplanation || data.simpleExplanation,
  };
}

export function normalizeImageScanFields(data: AnalyzeDocumentResponse): AnalyzeDocumentResponse {
  let scanQuality: ScanQuality | undefined = data.scanQuality;

  if (!scanQuality) {
    const hasSubstance =
      data.summary.trim().length > 40 &&
      data.recommendedActions.length > 0 &&
      data.title.trim().length > 0;
    scanQuality = hasSubstance ? "good" : "unclear";
  }

  const normalized: AnalyzeDocumentResponse = {
    ...stripPrematureFailureMessaging(data),
    scanQuality,
  };

  if (scanQuality === "unclear" && !normalized.scanQualityReason?.trim()) {
    normalized.scanQualityReason =
      "Een deel van de scan was lastig te lezen. Controleer datums en bedragen op het origineel.";
  }

  if (scanQuality === "failed" && !normalized.scanQualityReason?.trim()) {
    normalized.scanQualityReason =
      "De tekst op de foto was niet goed genoeg te lezen. Maak een scherpere foto met het hele document in beeld.";
  }

  return normalized;
}

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
${IMAGE_SCAN_QUALITY_RULES}

Geef een JSON-object met exact deze velden en types:
${ANALYZE_IMAGE_RESPONSE_JSON_SCHEMA}

Belangrijk:
- Vul scanQuality altijd in ("good", "unclear" of "failed").
- Bij "good" of "unclear": lever altijd een volledige analyse op basis van zichtbare tekst.
- Zorg dat recommendedActions minimaal één item bevat en aansluit bij recommendedResponseType.
- Zet shouldGenerateLetter op false tenzij een brief of mail echt helpt; laat generatedLetter dan weg.`;
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
  options?: { temperature?: number; normalizeImageScan?: boolean },
): Promise<AnalyzeDocumentResponse> {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: options?.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Leeg antwoord van OpenAI.");
  }

  const parsed = parseJsonWithRepair(content);
  const validated = analyzeDocumentResponseSchema.parse(parsed);
  return options?.normalizeImageScan ? normalizeImageScanFields(validated) : validated;
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

  return completeAndParse(
    client,
    [
      { role: "system", content: `${SYSTEM_PROMPT}\n${IMAGE_SCAN_QUALITY_RULES}` },
      {
        role: "user",
        content: [
          { type: "text", text: buildImageUserPrompt(category, todayISO) },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ],
      },
    ],
    { temperature: 0.1, normalizeImageScan: true },
  );
}
