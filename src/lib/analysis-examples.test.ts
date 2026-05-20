/**
 * Validates example analysis shapes against the response schema (no OpenAI calls).
 * Run: npx tsx src/lib/analysis-examples.test.ts
 */
import { enrichDeadlineFields, normalizeImageScanFields } from "./openai-analyze.js";
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
    financialImpactType: "payment",
    amountDue: 1240,
    dueDateISO: "2026-08-31",
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
    financialImpactType: "none",
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
  overduePayment: {
    title: "Aanmaning energierekening",
    category: "energy",
    summary:
      "De betaaltermijn was 24 maart 2026. Deze deadline is verlopen; onderneem zo snel mogelijk actie.",
    simpleExplanation:
      "Je moest betalen vóór 24 maart 2026. Die datum is inmiddels verstreken. Controleer of je al betaald hebt.",
    actionNeeded: true,
    deadlineISO: "2026-03-24",
    deadlineStatus: "overdue",
    daysOverdue: 57,
    riskLevel: "high",
    urgentWarning:
      "Deze betaaldeadline is verlopen. Controleer of je al betaald hebt of onderneem zo snel mogelijk actie.",
    recommendedActions: [
      {
        type: "check",
        label: "Controleer of je al betaald hebt",
        description: "Kijk of de betaling al is gedaan.",
      },
      {
        type: "pay",
        label: "Betaal zo snel mogelijk als dit nog openstaat",
        description: "Betaal het openstaande bedrag zo snel mogelijk.",
      },
      {
        type: "call",
        label: "Neem contact op als je niet kunt betalen of twijfelt",
        description: "Bel bij twijfel of betalingsproblemen.",
      },
    ],
    recommendedResponseType: "pay",
    shouldGenerateLetter: false,
    responseReason: "Dit is een verlopen betaalverzoek; een brief is meestal niet nodig.",
  },
  energyUsageReport: {
    title: "Energierapport april 2026",
    category: "energy",
    provider: "Eneco",
    summary: "Overzicht van stroom- en gasverbruik en kosten in april 2026.",
    simpleExplanation:
      "Je hebt in april 1067 kWh stroom verbruikt (veel meer dan vorige maand). Je leverde 29 kWh terug. Gasverbruik was 2 m³. De stroomkosten waren ongeveer € 265.",
    actionNeeded: false,
    deadlineStatus: "none",
    riskLevel: "low",
    monthlyCost: 270.58,
    recommendedActions: [
      {
        type: "check",
        label: "Controleer je stroomverbruik",
        description: "Je verbruik was veel hoger dan vorige maand; controleer of dat klopt.",
      },
      {
        type: "save",
        label: "Bewaar dit rapport",
        description: "Bewaar het overzicht voor je eigen administratie.",
      },
      {
        type: "compare",
        label: "Vergelijk je energiecontract",
        description: "Bekijk of een ander contract past bij je verbruik en kosten.",
      },
    ],
    recommendedResponseType: "save_only",
    shouldGenerateLetter: false,
    responseReason: "Dit is vooral een verbruiksoverzicht. Een brief of mail is meestal niet nodig.",
    financialImpactType: "monthly_cost",
    monthlyAmount: 270.58,
    financialImpactMonth: "april 2026",
    documentKind: "usage_report",
    usageReport: {
      period: "april 2026",
      electricityKwh: 1067,
      electricityCost: 264.92,
      electricityPreviousMonthKwh: 182,
      electricityPreviousYearKwh: 56,
      returnedElectricityKwh: 29,
      returnedElectricityAmount: 3.14,
      gasM3: 2,
      gasCost: 2.52,
      totalCost: 270.58,
      notableChange: "Stroomverbruik is veel hoger dan vorige maand (1067 vs 182 kWh) en dan april vorig jaar (56 kWh).",
    },
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
    documentKind: "price_increase",
    financialImpactType: "price_increase",
    monthlyAmount: 34.99,
    financialImpactMonth: "2026-07",
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
    if (
      !data.actionNeeded ||
      data.recommendedResponseType !== "pay" ||
      data.shouldGenerateLetter ||
      data.financialImpactType !== "payment" ||
      data.amountDue !== 1240 ||
      data.dueDateISO !== "2026-08-31"
    ) {
      console.error(`FAIL ${name}: expected pay flow without letter and payment financial impact`);
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
  if (name === "energyUsageReport") {
    if (
      data.documentKind !== "usage_report" ||
      data.shouldGenerateLetter ||
      data.recommendedResponseType === "email" ||
      !data.usageReport?.electricityKwh ||
      data.usageReport.returnedElectricityKwh === data.usageReport.electricityKwh ||
      data.financialImpactType !== "monthly_cost" ||
      data.monthlyAmount !== 270.58
    ) {
      console.error(`FAIL ${name}: expected usage_report without letter, with separate usage fields`);
      failed++;
      continue;
    }
  }
  if (name === "priceIncrease") {
    if (
      !data.shouldGenerateLetter ||
      data.financialImpactType !== "price_increase" ||
      data.monthlyAmount !== 34.99
    ) {
      console.error(`FAIL ${name}: expected letter and price_increase financial impact`);
      failed++;
      continue;
    }
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

const overdueEnriched = enrichDeadlineFields(
  analyzeDocumentResponseSchema.parse({
    ...examples.taxPaymentBill,
    deadlineISO: "2026-03-24",
    summary: "Betaal vóór 24 maart 2026.",
    riskLevel: "medium",
  }),
  "2026-05-20",
);

if (
  overdueEnriched.deadlineStatus !== "overdue" ||
  !overdueEnriched.daysOverdue ||
  !overdueEnriched.urgentWarning?.includes("verlopen") ||
  !overdueEnriched.actionNeeded ||
  overdueEnriched.shouldGenerateLetter ||
  overdueEnriched.recommendedResponseType !== "pay" ||
  !overdueEnriched.recommendedActions.some((a) => a.label.includes("Controleer of je al betaald hebt"))
) {
  console.error("FAIL enrichDeadlineFields overdue payment");
  failed++;
} else {
  console.log("OK enrichDeadlineFields overdue payment");
}

const noDeadline = enrichDeadlineFields(
  analyzeDocumentResponseSchema.parse(examples.energyContractEnding),
  "2026-05-20",
);

if (noDeadline.deadlineStatus !== "none") {
  console.error("FAIL enrichDeadlineFields no deadline");
  failed++;
} else {
  console.log("OK enrichDeadlineFields no deadline");
}

const upcomingSoon = enrichDeadlineFields(
  analyzeDocumentResponseSchema.parse({
    ...examples.taxPaymentBill,
    deadlineISO: "2026-05-25",
    riskLevel: "low",
  }),
  "2026-05-20",
);

if (
  upcomingSoon.deadlineStatus !== "upcoming" ||
  upcomingSoon.daysUntilDeadline !== 5 ||
  !upcomingSoon.urgentWarning?.includes("nadert")
) {
  console.error("FAIL enrichDeadlineFields upcoming within 7 days");
  failed++;
} else {
  console.log("OK enrichDeadlineFields upcoming within 7 days");
}

if (failed > 0) {
  process.exit(1);
}

console.log("All example validations passed.");
