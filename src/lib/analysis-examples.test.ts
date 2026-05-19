/**
 * Validates example analysis shapes against the response schema (no OpenAI calls).
 * Run: npx tsx src/lib/analysis-examples.test.ts
 */
import { normalizeImageScanFields } from "./openai-analyze.js";
import { analyzeDocumentResponseSchema } from "../schemas.js";

const examples = {
  taxPaymentBill: {
    title: "Aanslag inkomstenbelasting",
    category: "tax",
    summary: "U moet € 1.240 betalen vóór 31 augustus 2026.",
    simpleExplanation: "Dit is een betalingsverzoek van de Belastingdienst.",
    actionNeeded: true,
    deadlineISO: "2026-08-31",
    riskLevel: "medium",
    recommendedActions: [
      {
        type: "pay",
        label: "Betaal vóór de datum",
        description: "Betaal het bedrag op tijd om rente of boete te voorkomen.",
      },
      {
        type: "save",
        label: "Zet een reminder",
        description: "Noteer de betaaldatum in je agenda.",
      },
    ],
    recommendedResponseType: "pay",
    shouldGenerateLetter: false,
    responseReason:
      "Dit lijkt vooral een betaalverzoek. Een brief of mail is meestal niet nodig zolang de gegevens kloppen.",
  },
  municipalityDocuments: {
    title: "Verzoek om aanvullende documenten",
    category: "municipality",
    summary: "De gemeente vraagt kopieën van uw huurcontract en ID.",
    simpleExplanation: "U moet documenten opsturen vóór 15 juni 2026.",
    actionNeeded: true,
    deadlineISO: "2026-06-15",
    riskLevel: "medium",
    recommendedActions: [
      {
        type: "respond",
        label: "Stuur documenten",
        description: "Reageer schriftelijk met de gevraagde bijlagen.",
      },
    ],
    recommendedResponseType: "email",
    shouldGenerateLetter: true,
    responseReason: "De gemeente vraagt een schriftelijke reactie met bijlagen.",
    generatedLetter:
      "Geachte heer/mevrouw,\n\nHierbij stuur ik de gevraagde documenten...\n\nMet vriendelijke groet,",
  },
  energyContractEnding: {
    title: "Einde energiecontract",
    category: "energy",
    summary: "Uw contract eindigt op 1 januari 2027.",
    simpleExplanation: "U kunt verlengen of overstappen.",
    actionNeeded: true,
    endDateISO: "2027-01-01",
    riskLevel: "low",
    recommendedActions: [
      {
        type: "compare",
        label: "Vergelijk aanbiedingen",
        description: "Bekijk of een ander contract goedkoper is.",
      },
    ],
    recommendedResponseType: "compare",
    shouldGenerateLetter: false,
    responseReason: "Vergelijken is meestal voldoende; een brief is nu niet nodig.",
  },
  unclearScanPartial: {
    title: "Aanslag gemeentelijke belastingen",
    category: "tax",
    summary:
      "U moet waarschijnlijk een bedrag betalen. De exacte datum is lastig te lezen — controleer het origineel.",
    simpleExplanation:
      "Dit lijkt een betaalbrief. Een deel van de scan was onduidelijk; kijk op het papier of de app van de gemeente na.",
    actionNeeded: true,
    riskLevel: "medium",
    recommendedActions: [
      {
        type: "pay",
        label: "Controleer en betaal",
        description: "Betaal als het bedrag en de datum op het origineel kloppen.",
      },
      {
        type: "check",
        label: "Controleer de scan",
        description: "Bekijk het origineel voor de exacte datum en het bedrag.",
      },
    ],
    recommendedResponseType: "pay",
    shouldGenerateLetter: false,
    responseReason: "Dit lijkt een betaalverzoek; een brief is meestal niet nodig.",
    scanQuality: "unclear",
    scanQualityReason: "De betaaldatum was niet scherp genoeg om zeker te zijn.",
  },
  failedScan: {
    title: "Scan niet leesbaar",
    category: "other",
    summary: "De tekst op de foto was niet goed genoeg te lezen voor een analyse.",
    simpleExplanation:
      "Maak een nieuwe foto met het hele document scherp en goed verlicht in beeld.",
    actionNeeded: false,
    riskLevel: "low",
    recommendedActions: [
      {
        type: "check",
        label: "Probeer opnieuw",
        description: "Fotografeer het document opnieuw, recht en zonder schaduw.",
      },
    ],
    recommendedResponseType: "none",
    shouldGenerateLetter: false,
    scanQuality: "failed",
    scanQualityReason: "De tekst op de foto was niet goed genoeg te lezen.",
  },
  priceIncrease: {
    title: "Prijsverhoging abonnement",
    category: "subscription",
    summary: "Uw maandbedrag stijgt naar € 34,99 vanaf 1 juli 2026.",
    simpleExplanation: "U mag bezwaar maken of opzeggen vóór de ingangsdatum.",
    actionNeeded: true,
    riskLevel: "medium",
    monthlyCost: 34.99,
    recommendedActions: [
      {
        type: "object",
        label: "Vraag uitleg of bezwaar",
        description: "Vraag waarom de prijs stijgt of maak bezwaar.",
      },
      {
        type: "cancel",
        label: "Overweeg opzeggen",
        description: "U kunt opzeggen als u het niet eens bent.",
      },
    ],
    recommendedResponseType: "ask_explanation",
    shouldGenerateLetter: true,
    responseReason: "Een korte mail om uitleg of bezwaar kan nuttig zijn.",
    generatedLetter:
      "Geachte heer/mevrouw,\n\nIk ontving uw bericht over een prijsverhoging. Kunt u toelichten waarom...\n\nMet vriendelijke groet,",
  },
} as const;

let failed = 0;

for (const [name, payload] of Object.entries(examples)) {
  const result = analyzeDocumentResponseSchema.safeParse(payload);
  if (!result.success) {
    console.error(`FAIL ${name}:`, result.error.flatten());
    failed++;
    continue;
  }
  const data = result.data;
  if (name === "taxPaymentBill") {
    if (!data.actionNeeded || data.recommendedResponseType !== "pay" || data.shouldGenerateLetter) {
      console.error(`FAIL ${name}: expected pay flow without letter`);
      failed++;
      continue;
    }
  }
  if (
    name === "municipalityDocuments" &&
    (!data.shouldGenerateLetter || !("generatedLetter" in data) || !data.generatedLetter)
  ) {
    console.error(`FAIL ${name}: expected letter for municipality`);
    failed++;
    continue;
  }
  if (name === "energyContractEnding" && data.recommendedResponseType !== "compare") {
    console.error(`FAIL ${name}: expected compare`);
    failed++;
    continue;
  }
  if (name === "priceIncrease" && !data.shouldGenerateLetter) {
    console.error(`FAIL ${name}: expected letter for price increase`);
    failed++;
    continue;
  }
  if (name === "unclearScanPartial") {
    if (data.scanQuality !== "unclear" || /maak een duidelijkere foto/i.test(data.summary)) {
      console.error(`FAIL ${name}: expected partial unclear analysis without hard failure message`);
      failed++;
      continue;
    }
  }
  if (name === "failedScan" && data.scanQuality !== "failed") {
    console.error(`FAIL ${name}: expected failed scan quality`);
    failed++;
    continue;
  }
  console.log(`OK ${name}`);
}

const stripped = normalizeImageScanFields(
  analyzeDocumentResponseSchema.parse({
    ...examples.taxPaymentBill,
    scanQuality: "unclear",
    summary: "Belastingaanslag. Maak een duidelijkere foto voor details.",
    simpleExplanation: "Betaal op tijd. Maak een duidelijkere foto als iets onduidelijk is.",
  }),
);

if (
  stripped.scanQuality !== "unclear" ||
  /maak een duidelijkere foto/i.test(stripped.summary) ||
  /maak een duidelijkere foto/i.test(stripped.simpleExplanation)
) {
  console.error("FAIL stripPrematureFailureMessaging");
  failed++;
} else {
  console.log("OK stripPrematureFailureMessaging");
}

if (failed > 0) {
  process.exit(1);
}

console.log("All example validations passed.");
