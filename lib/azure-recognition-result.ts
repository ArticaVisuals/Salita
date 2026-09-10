export type AzureRecognitionHypothesis = {
  transcript: string;
  confidence: number | null;
};

type DetailedResult = {
  NBest?: Array<{
    Confidence?: unknown;
    Display?: unknown;
    ITN?: unknown;
    Lexical?: unknown;
  }>;
};

function usableConfidence(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

export function parseAzureRecognitionHypotheses(
  rawJson: string,
): AzureRecognitionHypothesis[] {
  let parsed: DetailedResult;
  try {
    parsed = JSON.parse(rawJson) as DetailedResult;
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const hypotheses: AzureRecognitionHypothesis[] = [];
  for (const candidate of parsed.NBest ?? []) {
    const value = [candidate.Display, candidate.ITN, candidate.Lexical].find(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
    if (!value) continue;
    const transcript = value.trim();
    const key = transcript.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hypotheses.push({
      transcript,
      confidence: usableConfidence(candidate.Confidence),
    });
    if (hypotheses.length === 5) break;
  }
  return hypotheses;
}
