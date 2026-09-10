import { foundations } from '../app/foundations.ts';
import { units } from '../app/curriculum.ts';

export const SPEECH_ASSESSMENT_LANGUAGES = ['fil-PH', 'en-US'] as const;

export type SpeechAssessmentLanguage =
  (typeof SPEECH_ASSESSMENT_LANGUAGES)[number];
export type SpeechAssessmentLevel =
  | 'verified'
  | 'understood'
  | 'retry'
  | 'unscored';

export type SpeechAssessmentTarget = {
  id: string;
  language: SpeechAssessmentLanguage;
  reference: string;
  accepted: string[];
  keyTokens: string[];
  optionalTokens: string[];
  kind: 'speech-match' | 'pronunciation';
};

export type AzurePronunciationWord = {
  word: string;
  accuracy: number | null;
  errorType: string | null;
};

export type AzurePronunciationScores = {
  accuracy: number;
  fluency: number;
  completeness: number;
  pronunciation: number;
  prosody: number | null;
  words: AzurePronunciationWord[];
};

export type RawSpeechRecognition = {
  transcript: string;
  confidence: number | null;
  hypotheses?: Array<{
    transcript: string;
    confidence: number | null;
  }>;
  pronunciation: AzurePronunciationScores | null;
};

export type SpeechAssessmentResult = {
  language: SpeechAssessmentLanguage;
  level: SpeechAssessmentLevel;
  transcript: string;
  reference: string;
  matchScore: number;
  pronunciation: AzurePronunciationScores | null;
  missingWords: string[];
  extraWords: string[];
  lowAccuracyWords: AzurePronunciationWord[];
  usedAlternateHypothesis: boolean;
  reminder: string | null;
};

type TargetOverride = {
  accepted?: string[];
  keyTokens: string[];
  optionalTokens?: string[];
};

const SPEAKING_OVERRIDES: Record<string, TargetOverride> = {
  'greetings-pakiulit': {
    accepted: ['Puwede po bang paki ulit?'],
    keyTokens: ['pakiulit'],
    optionalTokens: ['po'],
  },
  'introductions-trabaho': {
    accepted: ['Ano ang trabaho mo?', 'Ano ng trabaho mo?'],
    keyTokens: ['trabaho'],
  },
  'needs-sandali-lang': {
    keyTokens: ['sandali'],
    optionalTokens: ['lang'],
  },
  'food-bayad-po': {
    accepted: ['Eto po ang bayad.', 'Ito po ang bayad.'],
    keyTokens: ['heto', 'bayad'],
    optionalTokens: ['po'],
  },
  'directions-malayo-ba': {
    accepted: ['Malayo po ba?'],
    keyTokens: ['malayo', 'ba'],
  },
  'routine-naglalakad': {
    accepted: ['Araw araw ako ng naglalakad.'],
    keyTokens: ['araw', 'naglalakad'],
  },
  'plans-kita-bukas': {
    accepted: ['Magkita tayo bukas.'],
    keyTokens: ['tayo', 'bukas'],
  },
  'help-emergency': {
    accepted: ['May emerhensiya po.'],
    keyTokens: ['emergency'],
    optionalTokens: ['po'],
  },
};

const FOUNDATION_OVERRIDES: Record<string, TargetOverride> = {
  greetings: {
    accepted: ['Kamusta? Magandang umaga.'],
    keyTokens: ['kumusta', 'magandang', 'umaga'],
  },
  introductions: {
    keyTokens: ['taga', 'saan', 'ako', 'si'],
  },
  needs: {
    keyTokens: ['kailangan', 'tubig'],
  },
  food: {
    keyTokens: ['isang', 'adobo', 'masarap', 'pagkain'],
    optionalTokens: ['po'],
  },
  directions: {
    keyTokens: ['diretso', 'kumaliwa'],
  },
  routine: {
    accepted: ['Araw araw ako ng naglalakad.'],
    keyTokens: ['araw', 'naglalakad'],
  },
  plans: {
    accepted: ['Magkita tayo bukas.'],
    keyTokens: ['tayo', 'bukas'],
  },
  help: {
    keyTokens: ['ospital', 'kailangan', 'doktor'],
    optionalTokens: ['po'],
  },
};

const SPEAKING_PHRASE_IDS: Record<string, string> = {
  greetings: 'pakiulit',
  introductions: 'trabaho',
  needs: 'sandali-lang',
  food: 'bayad-po',
  directions: 'malayo-ba',
  routine: 'naglalakad',
  plans: 'kita-bukas',
  help: 'emergency',
};

const CONTRAST_GROUPS = [
  ['hindi', 'wala', 'walang', 'ayaw', 'huwag'],
  ['ba'],
  ['tayo', 'kami'],
  ['ang', 'nang'],
  ['na', 'nang'],
  ['kaliwa', 'kanan'],
  ['kumaliwa', 'kumanan'],
  ['malayo', 'malapit'],
  ['kumain', 'kumakain', 'kakain'],
  ['naglakad', 'naglalakad'],
] as const;

function englishVariants(value: string) {
  return value
    .split(/\s+\/\s+/)
    .map((item) => item.replace(/\s+\([^)]*\)\s*$/u, '').trim())
    .filter(Boolean);
}

function uniquePhrases(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function createTargets() {
  const targets: SpeechAssessmentTarget[] = [];

  for (const unit of units) {
    const foundationId = `${unit.id}-foundation-pronunciation`;
    const foundationOverride = FOUNDATION_OVERRIDES[unit.id];
    const foundationReference = foundations[unit.id]?.pronunciation.model;
    if (foundationOverride && foundationReference) {
      const accepted = uniquePhrases([
        foundationReference,
        ...(foundationOverride.accepted ?? []),
      ]);
      targets.push({
        id: foundationId,
        language: 'fil-PH',
        reference: foundationReference,
        accepted,
        keyTokens: foundationOverride.keyTokens,
        optionalTokens: foundationOverride.optionalTokens ?? [],
        kind: 'speech-match',
      });
    }

    const phraseId = SPEAKING_PHRASE_IDS[unit.id];
    const phrase = unit.phrases.find((candidate) => candidate.id === phraseId);
    if (!phrase) continue;
    const id = `${unit.id}-${phrase.id}`;
    const override = SPEAKING_OVERRIDES[id];
    if (!override) continue;
    const filipinoAccepted = uniquePhrases([
      phrase.fil,
      ...(phrase.accepted ?? []),
      ...(override.accepted ?? []),
    ]);
    targets.push({
      id,
      language: 'fil-PH',
      reference: phrase.fil,
      accepted: filipinoAccepted,
      keyTokens: override.keyTokens,
      optionalTokens: override.optionalTokens ?? [],
      kind: 'speech-match',
    });

    const englishAccepted = englishVariants(phrase.en);
    targets.push({
      id,
      language: 'en-US',
      reference: englishAccepted[0],
      accepted: englishAccepted,
      keyTokens: [],
      optionalTokens: [],
      kind: 'pronunciation',
    });
  }

  return targets;
}

const TARGETS = createTargets();
const TARGET_LOOKUP = new Map(
  TARGETS.map((target) => [`${target.id}:${target.language}`, target]),
);

export function isSpeechAssessmentLanguage(
  value: unknown,
): value is SpeechAssessmentLanguage {
  return SPEECH_ASSESSMENT_LANGUAGES.includes(
    value as SpeechAssessmentLanguage,
  );
}

export function getSpeechAssessmentTarget(
  id: string,
  language: SpeechAssessmentLanguage,
) {
  return TARGET_LOOKUP.get(`${id}:${language}`) ?? null;
}

export function listSpeechAssessmentTargets() {
  return TARGETS;
}

const FILIPINO_ALIASES: Record<string, string> = {
  kamusta: 'kumusta',
  pwede: 'puwede',
  emerhensiya: 'emergency',
  pasensiya: 'pasensya',
  meron: 'mayroon',
  eto: 'heto',
};

const ENGLISH_ALIASES: Record<string, string[]> = {
  "can't": ['cannot'],
  "couldn't": ['could', 'not'],
  "don't": ['do', 'not'],
  "i'm": ['i', 'am'],
  "let's": ['let', 'us'],
  "there's": ['there', 'is'],
  "what's": ['what', 'is'],
};

function tokenize(value: string, language: SpeechAssessmentLanguage) {
  let normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase(language)
    .replace(/[’‘ʼ]/gu, "'")
    .replace(/[-\u2010\u2011]/gu, ' ')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!normalized) return [];
  let tokens = normalized.split(' ');

  while (['ah', 'uh', 'um'].includes(tokens[0])) tokens.shift();
  while (['ah', 'uh', 'um'].includes(tokens.at(-1) ?? '')) tokens.pop();
  if (language === 'fil-PH') {
    tokens = tokens.map((token) => FILIPINO_ALIASES[token] ?? token);
    tokens = tokens.map((token) => (token === 'ng' ? 'nang' : token));
    normalized = ` ${tokens.join(' ')} `
      .replace(/ paki ulit /gu, ' pakiulit ')
      .trim();
    return normalized ? normalized.split(' ') : [];
  }

  return tokens.flatMap((token) => ENGLISH_ALIASES[token] ?? [token]);
}

export function normalizeSpeechMatchText(
  value: string,
  language: SpeechAssessmentLanguage,
) {
  return tokenize(value, language).join(' ');
}

function editDistance<T>(left: T[], right: T[]) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function similarity<T>(left: T[], right: T[]) {
  const length = Math.max(left.length, right.length);
  return length === 0 ? 1 : Math.max(0, 1 - editDistance(left, right) / length);
}

function recall(required: string[], heard: string[]) {
  if (!required.length) return 1;
  const remaining = [...heard];
  let found = 0;
  for (const token of required) {
    const index = remaining.indexOf(token);
    if (index >= 0) {
      found += 1;
      remaining.splice(index, 1);
    }
  }
  return found / required.length;
}

function wordDelta(expected: string[], heard: string[]) {
  const heardRemaining = [...heard];
  const missingWords: string[] = [];
  for (const token of expected) {
    const index = heardRemaining.indexOf(token);
    if (index >= 0) heardRemaining.splice(index, 1);
    else missingWords.push(token);
  }
  return { missingWords, extraWords: heardRemaining };
}

function contrastViolation(expected: string[], heard: string[]) {
  for (const group of CONTRAST_GROUPS) {
    const members = group as readonly string[];
    const expectedMembers = [
      ...new Set(expected.filter((word) => members.includes(word))),
    ];
    const heardMembers = [
      ...new Set(heard.filter((word) => members.includes(word))),
    ];
    if (!expectedMembers.length && !heardMembers.length) continue;
    if (
      expectedMembers.some((word) => !heardMembers.includes(word)) ||
      heardMembers.some((word) => !expectedMembers.includes(word))
    ) {
      return { expected: expectedMembers, heard: heardMembers };
    }
  }
  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

type TranscriptMatch = {
  transcript: string;
  confidence: number | null;
  heardTokens: string[];
  accepted: string;
  expectedTokens: string[];
  score: number;
  order: number;
  keyRecall: number;
  exact: boolean;
  contrast: ReturnType<typeof contrastViolation>;
  optionalMissing: string[];
  delta: ReturnType<typeof wordDelta>;
  level: SpeechAssessmentLevel;
};

const MATCH_LEVEL_RANK: Record<SpeechAssessmentLevel, number> = {
  unscored: 0,
  retry: 1,
  understood: 2,
  verified: 3,
};

function matchTranscript(
  target: SpeechAssessmentTarget,
  transcript: string,
  confidence: number | null,
): TranscriptMatch {
  const heardTokens = tokenize(transcript, target.language);
  const normalizedKeys = target.keyTokens.flatMap((token) =>
    tokenize(token, target.language),
  );
  const normalizedOptional = target.optionalTokens.flatMap((token) =>
    tokenize(token, target.language),
  );
  let best = {
    accepted: target.reference,
    expectedTokens: tokenize(target.reference, target.language),
    score: -1,
    order: 0,
    keyRecall: 0,
    exact: false,
  };

  for (const accepted of target.accepted) {
    const expectedTokens = tokenize(accepted, target.language);
    const keyRecall = recall(normalizedKeys, heardTokens);
    const order = similarity(expectedTokens, heardTokens);
    const characterSimilarity = similarity(
      Array.from(expectedTokens.join('')),
      Array.from(heardTokens.join('')),
    );
    const score = keyRecall * 0.55 + order * 0.3 + characterSimilarity * 0.15;
    const exact = expectedTokens.join(' ') === heardTokens.join(' ');
    if (exact || score > best.score) {
      best = {
        accepted,
        expectedTokens,
        score,
        order,
        keyRecall,
        exact,
      };
    }
  }

  const contrast = contrastViolation(best.expectedTokens, heardTokens);
  const optionalMissing = normalizedOptional.filter(
    (token) =>
      best.expectedTokens.includes(token) && !heardTokens.includes(token),
  );
  let level: SpeechAssessmentLevel;
  if (best.exact) level = 'verified';
  else if (
    best.score >= 0.7 &&
    best.keyRecall >= 0.75 &&
    best.order >= 0.5 &&
    !contrast
  ) {
    level = 'understood';
  } else {
    level = 'retry';
  }

  return {
    transcript,
    confidence,
    heardTokens,
    ...best,
    contrast,
    optionalMissing,
    delta: wordDelta(best.expectedTokens, heardTokens),
    level,
  };
}

function recognitionCandidates(
  target: SpeechAssessmentTarget,
  raw: RawSpeechRecognition,
) {
  const candidates: Array<{ transcript: string; confidence: number | null }> =
    [];
  const seen = new Set<string>();
  const add = (transcript: string, confidence: number | null) => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    const normalized = normalizeSpeechMatchText(trimmed, target.language);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ transcript: trimmed, confidence });
  };

  add(raw.transcript, raw.confidence);
  if (target.language === 'fil-PH' && raw.confidence !== null) {
    for (const hypothesis of raw.hypotheses ?? []) {
      if (
        hypothesis.confidence === null ||
        hypothesis.confidence + 0.1 < raw.confidence
      ) {
        continue;
      }
      add(hypothesis.transcript, hypothesis.confidence);
    }
  }
  return candidates;
}

export function assessSpeechResult(
  target: SpeechAssessmentTarget,
  raw: RawSpeechRecognition,
): SpeechAssessmentResult {
  const candidates = recognitionCandidates(target, raw);
  if (!candidates.length) {
    return {
      language: target.language,
      level: 'unscored',
      transcript: '',
      reference: target.reference,
      matchScore: 0,
      pronunciation: null,
      missingWords: [],
      extraWords: [],
      lowAccuracyWords: [],
      usedAlternateHypothesis: false,
      reminder:
        'No clear speech was captured. This attempt does not count against you.',
    };
  }
  const matches = candidates.map((candidate) =>
    matchTranscript(target, candidate.transcript, candidate.confidence),
  );
  const best =
    matches[0].contrast || matches[0].keyRecall < 0.75
      ? matches[0]
      : matches.reduce((current, candidate) => {
          const currentRank = MATCH_LEVEL_RANK[current.level];
          const candidateRank = MATCH_LEVEL_RANK[candidate.level];
          if (candidateRank !== currentRank) {
            return candidateRank > currentRank ? candidate : current;
          }
          if (candidate.score !== current.score) {
            return candidate.score > current.score ? candidate : current;
          }
          return (candidate.confidence ?? -1) > (current.confidence ?? -1)
            ? candidate
            : current;
        });
  let level = best.level;
  const usedAlternateHypothesis = best !== matches[0];
  if (usedAlternateHypothesis && level === 'verified') {
    level = 'understood';
  }

  const pronunciation = target.language === 'en-US' ? raw.pronunciation : null;
  let insufficientAcousticEvidence = false;
  if (target.kind === 'pronunciation' && target.language === 'en-US') {
    if (!pronunciation) {
      level = 'unscored';
    } else if (
      pronunciation.pronunciation < 60 ||
      pronunciation.completeness < 70
    ) {
      if (level !== 'retry') {
        level = 'unscored';
        insufficientAcousticEvidence = true;
      }
    } else if (level === 'verified' && pronunciation.pronunciation < 80) {
      level = 'understood';
    }
  }

  const lowAccuracyWords =
    pronunciation?.words.filter(
      (word) =>
        (word.accuracy !== null && word.accuracy < 70) ||
        (word.errorType !== null && word.errorType !== 'None'),
    ) ?? [];
  const reminder =
    target.kind === 'pronunciation' &&
    target.language === 'en-US' &&
    !pronunciation
      ? 'Azure recognized words but returned no acoustic pronunciation evidence. Nothing was scored.'
      : insufficientAcousticEvidence
        ? 'The acoustic evidence was too weak for a fair pronunciation result. Listen once and try again; nothing was counted against you.'
        : best.contrast
          ? best.contrast.expected.length
            ? `Keep the meaning-bearing word${best.contrast.expected.length === 1 ? '' : 's'} “${best.contrast.expected.join(', ')}.”`
            : `Azure heard “${best.contrast.heard.join(', ')},” which changes the intended meaning. Try the model again.`
          : usedAlternateHypothesis
            ? 'Azure returned this as a close alternate match. Treat it as understood and try once more for confirmation.'
            : best.optionalMissing.includes('po')
              ? 'The words were understood. Add “po” to keep this phrase polite.'
              : best.optionalMissing.includes('lang')
                ? 'The main idea was understood. Add “lang” for the complete everyday phrase.'
                : level === 'understood' && best.delta.missingWords.length > 0
                  ? `The main idea was understood. Add “${best.delta.missingWords[0]}” for the complete model.`
                  : level === 'understood' && best.delta.extraWords.length > 0
                    ? `The main idea was understood. Compare “${best.delta.extraWords[0]}” with the model, then try once more.`
                    : target.language === 'fil-PH'
                      ? 'This checks whether the intended words were understood, not whether you have a native accent.'
                      : 'English scores are coaching signals, not a judgment of your accent.';

  return {
    language: target.language,
    level,
    transcript: best.transcript,
    reference: target.reference,
    matchScore: clampScore(best.score * 100),
    pronunciation,
    missingWords: best.delta.missingWords,
    extraWords: best.delta.extraWords,
    lowAccuracyWords,
    usedAlternateHypothesis,
    reminder,
  };
}
