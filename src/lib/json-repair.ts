/**
 * Attempts to extract a JSON object from model output that may include markdown fences or prose.
 */
export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

export function parseJsonWithRepair(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractJsonObject(raw);
    if (!extracted) {
      throw new Error("Geen geldig JSON-object gevonden in modelantwoord.");
    }
    return JSON.parse(extracted);
  }
}
