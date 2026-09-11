import { getUnitVocabulary, units } from '../app/curriculum.ts';
import { foundations } from '../app/foundations.ts';

export type SpeechSegment = {
  display: string;
  speech: string | null;
};

const WORD_OR_PLACEHOLDER =
  /(\[[^\]]+\]|(?:['’ʼ]|[-\u2010\u2011])?[\p{L}\p{M}\p{N}]+(?:(?:['’ʼ]|[-\u2010\u2011])[\p{L}\p{M}\p{N}]+)*(?:[-\u2010\u2011](?=\s|$))?)/gu;

export function normalizeSpeechText(value: string) {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function segmentTagalogText(value: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(WORD_OR_PLACEHOLDER)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ display: value.slice(cursor, index), speech: null });
    }

    const display = match[0];
    const isPlaceholder = display.startsWith('[');
    const isAffixLabel = /^[-\u2010\u2011]|[-\u2010\u2011]$/u.test(display);
    const normalizedDisplay = display.replace(/[’ʼ]/g, "'");
    const speech = /^ng$/iu.test(normalizedDisplay)
      ? 'nang'
      : normalizedDisplay;
    segments.push({
      display,
      speech:
        isPlaceholder || isAffixLabel ? null : normalizeSpeechText(speech),
    });
    cursor = index + display.length;
  }

  if (cursor < value.length) {
    segments.push({ display: value.slice(cursor), speech: null });
  }

  return segments;
}

function curriculumSpeechSources() {
  return units.flatMap((unit) => {
    const foundation = foundations[unit.id];
    return [
      unit.titleFil,
      unit.pattern.frame,
      unit.pattern.transform,
      ...unit.phrases.flatMap((phrase) => [
        phrase.fil,
        ...(phrase.accepted ?? []),
      ]),
      ...getUnitVocabulary(unit.id).map((word) => word.fil),
      unit.dialogue.line,
      unit.dialogue.reply,
      ...unit.dialogue.alternatives,
      foundation?.pronunciation.model,
      ...(foundation?.grammar.examples.map((example) => example.fil) ?? []),
      foundation?.reading.passage,
    ].filter((source): source is string => Boolean(source));
  });
}

const ALLOWED_SPEECH_TEXT = (() => {
  const allowed = new Set<string>();

  for (const source of curriculumSpeechSources()) {
    const normalized = normalizeSpeechText(source);
    if (normalized) allowed.add(normalized);

    for (const segment of segmentTagalogText(source)) {
      if (segment.speech) allowed.add(segment.speech);
    }
  }

  return allowed;
})();

export function isAllowedSpeechText(value: string) {
  const normalized = normalizeSpeechText(value);
  return (
    normalized.length > 0 &&
    normalized.length <= 180 &&
    ALLOWED_SPEECH_TEXT.has(normalized)
  );
}
