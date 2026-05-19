/**
 * Validates example analysis shapes against the response schema (no OpenAI calls).
 * Run: npx tsx src/lib/analysis-examples.test.ts
 */
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
  console.log(`OK ${name}`);
}

if (failed > 0) {
  process.exit(1);
}

console.log("All example validations passed.");
