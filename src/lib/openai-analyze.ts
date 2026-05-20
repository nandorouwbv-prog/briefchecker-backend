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

/** Low temperature for reproducible document analysis (text and image). */
const ANALYSIS_TEMPERATURE = 0;

const DEADLINE_AWARENESS_RULES = `
Deadline-bewustzijn (verplicht bij elke analyse):
- De huidige datum staat in de gebruikersprompt (YYYY-MM-DD). Vergelijk alle geëxtraheerde deadlines daarmee.
- Zet deadlineStatus altijd: "none" | "upcoming" | "today" | "overdue".
- Vul deadlineISO alleen in bij een duidelijke, exacte datum in het document. Bij twijfel of een vage datum: laat deadlineISO weg en leg onzekerheid uit in summary of scanQualityReason.
- Verzin geen datums.

Status en velden:
- Geen duidelijke deadline: deadlineStatus = "none" (laat daysUntilDeadline en daysOverdue weg).
- Deadline vóór de huidige datum: deadlineStatus = "overdue", daysOverdue = aantal kalenderdagen te laat, actionNeeded = true, riskLevel meestal "high", urgentWarning in het Nederlands dat de deadline is verlopen (niet alleen de datum herhalen).
- Deadline is vandaag: deadlineStatus = "today", actionNeeded = true, riskLevel meestal "high", urgentWarning dat actie vandaag nodig is.
- Deadline in de toekomst: deadlineStatus = "upcoming", daysUntilDeadline = aantal kalenderdagen tot de deadline.
  - Binnen 7 dagen: riskLevel meestal "medium" of "high", urgentWarning dat de deadline nadert.
  - Meer dan 7 dagen: urgentWarning meestal weglaten.

In summary en simpleExplanation bij verlopen deadlines:
- Benoem expliciet dat de deadline is verlopen en dat snelle actie nodig is.
- Herhaal niet alleen "betaal vóór [datum]" zonder te vermelden dat die datum al voorbij is.

Betaalbrief met verlopen betaaldeadline:
- recommendedResponseType = "pay" of "call"
- shouldGenerateLetter = false, tenzij het document duidelijk een schriftelijke reactie vereist
- recommendedActions moet minstens bevatten:
  - "Controleer of je al betaald hebt"
  - "Betaal zo snel mogelijk als dit nog openstaat"
  - "Neem contact op als je niet kunt betalen of twijfelt"
- urgentWarning bijvoorbeeld: "Deze betaaldeadline is verlopen. Controleer of je al betaald hebt of onderneem zo snel mogelijk actie."
- Voor andere verlopen deadlines, urgentWarning bijvoorbeeld: "Deze deadline is verlopen. Onderneem zo snel mogelijk actie."`;

const DOCUMENT_KIND_RULES = `
Documenttype (verplicht):
- Bepaal eerst documentKind en vul het altijd in.
- Mogelijke waarden: "letter", "contract", "invoice", "payment_request", "usage_report", "price_increase", "reminder", "information", "unknown".
- Kies het type dat het document het best beschrijft; bij twijfel "unknown".

Soorten documenten:
- letter: algemene brief die reactie of actie kan vereisen
- contract: contract, voorwaarden, looptijd, opzegging
- invoice: factuur of rekening met te betalen bedrag
- payment_request: betaalverzoek, aanmaning, incasso
- usage_report: energierapport, maandoverzicht verbruik, verbruiks- en kostenoverzicht met tabellen (stroom/gas, kWh, m³)
- price_increase: prijsverhoging of tariefwijziging
- reminder: herinnering zonder nieuwe inhoud
- information: puur informatief zonder duidelijke actie
- unknown: onduidelijk type`;

const USAGE_REPORT_RULES = `
Energierapport / verbruiksoverzicht (documentKind = "usage_report"):
- Herken energierapporten, maandoverzichten van verbruik, verbruiksrapporten en kostenoverzichten met tabellen (bijv. Eneco, Vattenfall, Essent).
- Dit is géén gewone brief die een reactie vereist.
- Verzin geen deadlines; laat deadlineISO weg tenzij er expliciet een betaaltermijn of verplichte actie in staat.
- actionNeeded: meestal false, tenzij het document duidelijk een betaaldeadline of verplichte actie bevat.
- recommendedResponseType: meestal "save_only" of "compare" (bij hoge maandkosten); niet "email" of "objection".
- shouldGenerateLetter: false.
- responseReason bijv.: "Dit is vooral een verbruiksoverzicht. Een brief of mail is meestal niet nodig."
- Vul usageReport in met zichtbare waarden uit tabellen (zie tabelregels bij afbeeldingen).
- title bijv.: "Energierapport april 2026" (periode + jaar indien zichtbaar).
- summary bijv.: "Overzicht van stroom- en gasverbruik en kosten in april 2026."
- simpleExplanation: leg in gewoon Nederlands uit wat het rapport laat zien (verbruik, kosten, vergelijking vorige maand/jaar).
- notableChange in usageReport: benoem opvallende verschillen (bijv. stroomverbruik veel hoger dan vorige maand of vorig jaar).
- recommendedActions: nuttige acties, bijvoorbeeld:
  - type "check", label "Controleer je stroomverbruik", description over verbruik controleren
  - type "save", label "Bewaar dit rapport", description over bewaren voor eigen administratie
  - type "compare", label "Vergelijk je energiecontract", description alleen als maandkosten hoog lijken of notableChange dat suggereert
- monthlyCost: vul in als totale maandkosten of usageReport.totalCost duidelijk zichtbaar zijn.
- Scheid teruglevering (returnedElectricityKwh / returnedElectricityAmount) van gewoon stroomverbruik (electricityKwh).
- Bij onduidelijke of afgesneden waarden: laat exacte usageReport-velden weg en leg onzekerheid uit in scanQualityReason (bij scans) of summary.`;

const TABLE_EXTRACTION_RULES = `
Tabellen en cijfers (bij afbeeldingen en tabellen in tekst):
- Lees tabellen en kolommen zorgvuldig; haal verbruik en kosten per regel uit.
- Nederlandse notatie omzetten naar JSON-getallen: "€ 264,92" => 264.92, "1.067 kWh" => 1067, "2 m³" => 2.
- Eenheden: kWh voor stroomverbruik, m³ voor gas, euro voor bedragen.
- Rijen met vorige maand en vorig jaar (zelfde maand): vul electricityPreviousMonthKwh en electricityPreviousYearKwh in als zichtbaar.
- Teruglevering (teruglevering stroom, saldering, opwek): returnedElectricityKwh en returnedElectricityAmount — niet mengen met electricityKwh.
- Verbruik (stroom/gas) en kosten apart houden; totalCost alleen als totaal duidelijk op het document staat.
- Als waarden zijn afgesneden of onleesbaar: laat betreffende usageReport-velden weg en vermeld onzekerheid in scanQualityReason.`;

const SYSTEM_PROMPT = `Je bent BriefChecker, een AI-assistent die Nederlandse brieven, contracten, abonnementen, energierapporten en officiële documenten in eenvoudig Nederlands uitlegt. Je geeft samenvattingen, actiepunten, deadlines en soms een voorbeeldbrief of -mail. Je geeft geen juridisch, financieel of fiscaal advies.

${DOCUMENT_KIND_RULES}
${USAGE_REPORT_RULES}

Regels:
- Schrijf alles in het Nederlands, in eenvoudige taal.
- Geef geen garanties over uitkomsten.
- Als de tekst onduidelijk of onvolledig is, zeg dat duidelijk in summary en simpleExplanation.
- Haal belangrijke data, deadlines, kosten, aanbieder en actiepunten eruit.
- Gebruik ISO-datums (YYYY-MM-DD of volledige ISO 8601) alleen als er een exacte datum in de tekst staat; anders laat deadlineISO en endDateISO weg.
${DEADLINE_AWARENESS_RULES}
- Voor category energy, telecom of insurance: schat possibleSavingMonthly alleen in als er genoeg kostinformatie in het document staat; anders laat het veld weg.
- category in de JSON moet overeenkomen met de door de gebruiker gekozen categorie, tenzij het document duidelijk een andere categorie aangeeft.
- Antwoord uitsluitend met geldig JSON, zonder markdown of extra tekst.

Aanbevolen reactie en brief/mail:
- recommendedResponseType: het beste type vervolgstap voor de gebruiker.
- shouldGenerateLetter: alleen true als een geschreven brief of e-mail echt nuttig is.
- responseReason: korte uitleg in eenvoudig Nederlands waarom wel of geen brief/mail nodig is.
- generatedLetter: alleen invullen als shouldGenerateLetter true is; dan een bruikbare Nederlandse concepttekst (brief of mail).

Zet shouldGenerateLetter alleen op true wanneer een schriftelijke reactie echt zinvol is.

Voorbeelden (documentKind):
- Energierapport of maandoverzicht verbruik/kosten:
  documentKind = "usage_report", usageReport invullen, recommendedResponseType "save_only" of "compare",
  shouldGenerateLetter = false, actionNeeded meestal false,
  responseReason "Dit is vooral een verbruiksoverzicht. Een brief of mail is meestal niet nodig."

- Betaalbrief, factuur of belastingaanslag:
  documentKind = "payment_request" of "invoice",
  recommendedResponseType = "pay", shouldGenerateLetter = false,
  responseReason bijv. "Dit lijkt vooral een betaalverzoek. Een brief of mail is meestal niet nodig zolang de gegevens kloppen."
  recommendedActions: minstens pay en eventueel save (reminder) — geen automatische brief.

- Puur informatieve brief zonder actie:
  documentKind = "information", recommendedResponseType = "save_only", shouldGenerateLetter = false.

- Contract loopt binnenkort af (energie/telecom/verzekering):
  documentKind = "contract",
  recommendedResponseType = "compare", shouldGenerateLetter = false,
  tenzij opzeggen of vragen stellen nodig is — dan "cancel" of "ask_explanation" en shouldGenerateLetter alleen true als een schriftelijke reactie nodig is.

- Prijsverhoging of ongewenste wijziging:
  documentKind = "price_increase",
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
${TABLE_EXTRACTION_RULES}

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
- Betaaltermijn zichtbaar: recommendedResponseType "pay", shouldGenerateLetter false; pas deadlineStatus en urgentWarning toe zoals in de deadline-regels.
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

function parseDateOnly(iso: string): Date {
  const datePart = iso.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function calendarDaysBetween(fromISO: string, toISO: string): number {
  const from = parseDateOnly(fromISO);
  const to = parseDateOnly(toISO);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function isPaymentContext(data: AnalyzeDocumentResponse): boolean {
  return (
    data.recommendedResponseType === "pay" ||
    data.recommendedActions.some((action) => action.type === "pay")
  );
}

function mergeRecommendedActions(
  existing: AnalyzeDocumentResponse["recommendedActions"],
  required: AnalyzeDocumentResponse["recommendedActions"],
): AnalyzeDocumentResponse["recommendedActions"] {
  const labels = new Set(existing.map((action) => action.label.trim().toLowerCase()));
  const merged = [...existing];
  for (const action of required) {
    if (!labels.has(action.label.trim().toLowerCase())) {
      merged.push(action);
      labels.add(action.label.trim().toLowerCase());
    }
  }
  return merged;
}

const OVERDUE_PAYMENT_ACTIONS: AnalyzeDocumentResponse["recommendedActions"] = [
  {
    type: "check",
    label: "Controleer of je al betaald hebt",
    description: "Kijk of de betaling al is gedaan voordat je opnieuw betaalt.",
  },
  {
    type: "pay",
    label: "Betaal zo snel mogelijk als dit nog openstaat",
    description: "Betaal het openstaande bedrag zo snel mogelijk om extra kosten te beperken.",
  },
  {
    type: "call",
    label: "Neem contact op als je niet kunt betalen of twijfelt",
    description: "Bel de aanbieder als je niet kunt betalen, het bedrag onduidelijk is of je vragen hebt.",
  },
];

function defaultUrgentWarning(
  status: "today" | "overdue" | "upcoming",
  data: AnalyzeDocumentResponse,
  daysUntil?: number,
  daysOverdue?: number,
): string {
  if (status === "overdue") {
    if (isPaymentContext(data)) {
      return "Deze betaaldeadline is verlopen. Controleer of je al betaald hebt of onderneem zo snel mogelijk actie.";
    }
    const daysText = daysOverdue === 1 ? "1 dag" : `${daysOverdue} dagen`;
    return `Deze deadline is verlopen (${daysText} geleden). Onderneem zo snel mogelijk actie.`;
  }
  if (status === "today") {
    return isPaymentContext(data)
      ? "De betaaldeadline is vandaag. Regel de betaling vandaag nog."
      : "De deadline is vandaag. Onderneem vandaag actie.";
  }
  const daysText = daysUntil === 1 ? "1 dag" : `${daysUntil} dagen`;
  return isPaymentContext(data)
    ? `De betaaldeadline nadert (nog ${daysText}). Regel de betaling op tijd.`
    : `De deadline nadert (nog ${daysText}). Onderneem op tijd actie.`;
}

function elevateRiskLevel(current: AnalyzeDocumentResponse["riskLevel"]): AnalyzeDocumentResponse["riskLevel"] {
  if (current === "low") {
    return "medium";
  }
  return "high";
}

export function enrichDeadlineFields(
  data: AnalyzeDocumentResponse,
  todayISO: string,
): AnalyzeDocumentResponse {
  if (!data.deadlineISO?.trim()) {
    const { daysUntilDeadline: _d, daysOverdue: _o, ...rest } = data;
    return {
      ...rest,
      deadlineStatus: data.deadlineStatus ?? "none",
    };
  }

  const deadlineISO = data.deadlineISO.slice(0, 10);
  const daysFromToday = calendarDaysBetween(todayISO, deadlineISO);

  if (daysFromToday < 0) {
    const daysOverdue = Math.abs(daysFromToday);
    let enriched: AnalyzeDocumentResponse = {
      ...data,
      deadlineStatus: "overdue",
      daysOverdue,
      daysUntilDeadline: undefined,
      actionNeeded: true,
      riskLevel: data.riskLevel === "low" ? "high" : elevateRiskLevel(data.riskLevel),
      urgentWarning:
        data.urgentWarning?.trim() ||
        defaultUrgentWarning("overdue", data, undefined, daysOverdue),
    };

    if (isPaymentContext(enriched)) {
      enriched = {
        ...enriched,
        recommendedResponseType:
          enriched.recommendedResponseType === "none" ||
          enriched.recommendedResponseType === "save_only" ||
          enriched.recommendedResponseType === "reminder"
            ? "pay"
            : enriched.recommendedResponseType,
        shouldGenerateLetter: false,
        recommendedActions: mergeRecommendedActions(
          enriched.recommendedActions,
          OVERDUE_PAYMENT_ACTIONS,
        ),
      };
      if (!enriched.urgentWarning?.includes("verlopen")) {
        enriched.urgentWarning = defaultUrgentWarning("overdue", enriched, undefined, daysOverdue);
      }
    }

    return enriched;
  }

  if (daysFromToday === 0) {
    return {
      ...data,
      deadlineStatus: "today",
      daysUntilDeadline: undefined,
      daysOverdue: undefined,
      actionNeeded: true,
      riskLevel: data.riskLevel === "low" ? "high" : elevateRiskLevel(data.riskLevel),
      urgentWarning: data.urgentWarning?.trim() || defaultUrgentWarning("today", data),
    };
  }

  const withinSevenDays = daysFromToday <= 7;
  return {
    ...data,
    deadlineStatus: "upcoming",
    daysUntilDeadline: daysFromToday,
    daysOverdue: undefined,
    urgentWarning:
      withinSevenDays && !data.urgentWarning?.trim()
        ? defaultUrgentWarning("upcoming", data, daysFromToday)
        : data.urgentWarning,
    riskLevel: withinSevenDays ? elevateRiskLevel(data.riskLevel) : data.riskLevel,
  };
}

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

Bepaal eerst documentKind. Bij energierapport of verbruiksoverzicht: documentKind "usage_report", vul usageReport in, geen verzonnen deadlines.
Vergelijk alle deadlines met de huidige datum (${todayISO}) en vul deadlineStatus, daysUntilDeadline, daysOverdue en urgentWarning correct in.
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
- Bepaal eerst documentKind. Lees tabellen zorgvuldig; bij usage_report vul usageReport met zichtbare cijfers (Nederlandse notatie naar getallen).
- Vul scanQuality altijd in ("good", "unclear" of "failed").
- Bij "good" of "unclear": lever altijd een volledige analyse op basis van zichtbare tekst.
- Zorg dat recommendedActions minimaal één item bevat en aansluit bij recommendedResponseType.
- Vergelijk alle zichtbare deadlines met de huidige datum (${todayISO}) en vul deadlineStatus, daysUntilDeadline, daysOverdue en urgentWarning correct in — niet bij puur verbruiksoverzicht zonder betaaltermijn.
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
  options?: { temperature?: number; normalizeImageScan?: boolean; todayISO?: string },
): Promise<AnalyzeDocumentResponse> {
  const todayISO = options?.todayISO ?? new Date().toISOString().slice(0, 10);
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: options?.temperature ?? ANALYSIS_TEMPERATURE,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Leeg antwoord van OpenAI.");
  }

  const parsed = parseJsonWithRepair(content);
  const validated = analyzeDocumentResponseSchema.parse(parsed);
  const withDeadline = enrichDeadlineFields(validated, todayISO);
  return options?.normalizeImageScan
    ? normalizeImageScanFields(withDeadline)
    : withDeadline;
}

export async function analyzeDocumentText(
  client: OpenAI,
  category: DocumentCategory,
  text: string,
): Promise<AnalyzeDocumentResponse> {
  const todayISO = new Date().toISOString().slice(0, 10);

  return completeAndParse(
    client,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(category, text, todayISO) },
    ],
    { temperature: ANALYSIS_TEMPERATURE, todayISO },
  );
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
    { temperature: ANALYSIS_TEMPERATURE, normalizeImageScan: true, todayISO },
  );
}
