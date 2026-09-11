import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessSpeechResult,
  getSpeechAssessmentTarget,
  listSpeechAssessmentTargets,
  normalizeSpeechMatchText,
  type AzurePronunciationScores,
  type SpeechAssessmentLanguage,
} from './speech-assessment.ts';
import { units } from '../app/curriculum.ts';

function assess(
  id: string,
  transcript: string,
  language: SpeechAssessmentLanguage = 'fil-PH',
) {
  const target = getSpeechAssessmentTarget(id, language);
  assert.ok(target, `${id}:${language} should be a speech target`);
  return assessSpeechResult(target, {
    transcript,
    confidence: null,
    pronunciation: null,
  });
}

void test('every lesson has a Filipino sound check and bilingual speaking check', () => {
  const targets = listSpeechAssessmentTargets();
  assert.equal(targets.length, units.length * 3);
  assert.equal(
    new Set(targets.map((target) => `${target.id}:${target.language}`)).size,
    units.length * 3,
  );
  for (const unit of units) {
    assert.ok(
      getSpeechAssessmentTarget(
        `${unit.id}-foundation-pronunciation`,
        'fil-PH',
      ),
      `${unit.id} needs a pronunciation target`,
    );
    const speakingId = `${unit.id}-${unit.phrases.at(-1)?.id}`;
    if (unit.number > 8) {
      assert.ok(getSpeechAssessmentTarget(speakingId, 'fil-PH'));
      assert.ok(getSpeechAssessmentTarget(speakingId, 'en-US'));
    }
  }
  for (const target of targets) {
    assert.ok(target.reference.length > 1);
    assert.ok(target.accepted.includes(target.reference));
    assert.ok(!target.reference.includes(' / '));
    assert.equal(new Set(target.accepted).size, target.accepted.length);
    if (target.language === 'fil-PH') {
      const acceptedTokens = target.accepted.flatMap((accepted) =>
        normalizeSpeechMatchText(accepted, 'fil-PH').split(' '),
      );
      for (const keyToken of target.keyTokens) {
        assert.ok(
          acceptedTokens.includes(normalizeSpeechMatchText(keyToken, 'fil-PH')),
          `${target.id} should contain key token ${keyToken}`,
        );
      }
    }
  }
});

void test('every curated Filipino variant verifies, while omissions do not', () => {
  for (const target of listSpeechAssessmentTargets()) {
    if (target.language !== 'fil-PH') continue;
    for (const accepted of target.accepted) {
      assert.equal(
        assessSpeechResult(target, {
          transcript: accepted,
          confidence: null,
          pronunciation: null,
        }).level,
        'verified',
        `${target.id} should accept ${accepted}`,
      );
    }

    const tokens = normalizeSpeechMatchText(target.reference, 'fil-PH').split(
      ' ',
    );
    const optional = new Set(
      target.optionalTokens.map((token) =>
        normalizeSpeechMatchText(token, 'fil-PH'),
      ),
    );
    for (let index = 0; index < tokens.length; index += 1) {
      if (optional.has(tokens[index])) continue;
      const incomplete = tokens.filter((_, tokenIndex) => tokenIndex !== index);
      assert.notEqual(
        assessSpeechResult(target, {
          transcript: incomplete.join(' '),
          confidence: null,
          pronunciation: null,
        }).level,
        'verified',
        `${target.id} should not verify without ${tokens[index]}`,
      );
    }
  }
});

void test('speech normalization handles Filipino ASR spelling and word boundaries', () => {
  assert.equal(
    normalizeSpeechMatchText('Uh, PWede po bang paki ulit?', 'fil-PH'),
    'puwede po bang pakiulit',
  );
  assert.equal(
    normalizeSpeechMatchText('Araw-araw ako ng naglalakad.', 'fil-PH'),
    'araw araw ako nang naglalakad',
  );
  assert.equal(
    normalizeSpeechMatchText('Kailangan ko ng túbig.', 'fil-PH'),
    'kailangan ko nang tubig',
  );
});

void test('curated conversational variants verify without lowering standards', () => {
  assert.equal(
    assess('greetings-foundation-pronunciation', 'Kamusta? Magandang umaga.')
      .level,
    'verified',
  );
  assert.equal(
    assess('greetings-pakiulit', 'pwede po bang paki ulit').level,
    'verified',
  );
  assert.equal(
    assess('introductions-trabaho', 'Ano ang trabaho mo?').level,
    'verified',
  );
  assert.equal(assess('food-bayad-po', 'Eto po ang bayad.').level, 'verified');
  assert.equal(assess('food-bayad-po', 'Ito po ang bayad.').level, 'verified');
  assert.equal(
    assess('directions-malayo-ba', 'Malayo po ba?').level,
    'verified',
  );
  assert.equal(
    assess('routine-naglalakad', 'araw araw ako ng naglalakad').level,
    'verified',
  );
  assert.equal(
    assess('plans-kita-bukas', 'Magkita tayo bukas.').level,
    'verified',
  );
  assert.equal(
    assess('help-emergency', 'May emerhensiya po.').level,
    'verified',
  );
});

void test('non-core omissions are understood but not first-try verified', () => {
  const polite = assess('help-emergency', 'May emergency.');
  assert.equal(polite.level, 'understood');
  assert.match(polite.reminder ?? '', /po/);

  const softened = assess('needs-sandali-lang', 'Sandali.');
  assert.equal(softened.level, 'understood');
  assert.match(softened.reminder ?? '', /lang/);
});

void test('fuzzy matches can be understood but never claim exact verification', () => {
  assert.equal(
    assess('introductions-foundation-pronunciation', 'Taga saan ako si Ana')
      .level,
    'understood',
  );
  assert.equal(
    assess(
      'introductions-foundation-pronunciation',
      'Taga saan ka ako si Ana doktor',
    ).level,
    'understood',
  );
  assert.equal(
    assess('greetings-pakiulit', 'Puwede po pakiulit?').level,
    'understood',
  );
});

void test('meaning-changing Filipino contrasts never receive credit', () => {
  assert.equal(assess('directions-malayo-ba', 'Malapit ba?').level, 'retry');
  assert.equal(assess('plans-kita-bukas', 'Kita kami bukas.').level, 'retry');
  assert.equal(
    assess('routine-naglalakad', 'Araw-araw akong naglakad.').level,
    'retry',
  );
  assert.equal(
    assess(
      'food-foundation-pronunciation',
      'Isang adobo po. Masarap ng pagkain.',
    ).level,
    'retry',
  );
  assert.equal(
    assess('help-emergency', 'May hindi emergency po.').level,
    'retry',
  );
  assert.match(
    assess('help-emergency', 'May hindi emergency po.').reminder ?? '',
    /hindi/,
  );
  assert.equal(
    assess('introductions-trabaho', 'Anong trabaho mo ba?').level,
    'retry',
  );
  assert.equal(assess('help-emergency', 'Walang emergency po.').level, 'retry');
  assert.equal(
    assess('help-emergency', 'May emergency po pero huwag tumawag.').level,
    'retry',
  );
});

void test('close Filipino N-best alternatives can support but never verify a result', () => {
  const target = getSpeechAssessmentTarget('plans-kita-bukas', 'fil-PH');
  assert.ok(target);
  const recovered = assessSpeechResult(target, {
    transcript: 'Kita tayo bukas, salamat.',
    confidence: 0.61,
    hypotheses: [
      { transcript: 'Kita tayo bukas, salamat.', confidence: 0.61 },
      { transcript: 'Kita tayo bukas.', confidence: 0.58 },
    ],
    pronunciation: null,
  });
  assert.equal(recovered.level, 'understood');
  assert.equal(recovered.transcript, 'Kita tayo bukas.');

  const guarded = assessSpeechResult(target, {
    transcript: 'Kita kami bukas.',
    confidence: 0.61,
    hypotheses: [
      { transcript: 'Kita kami bukas.', confidence: 0.61 },
      { transcript: 'Kita tayo bukas.', confidence: 0.58 },
    ],
    pronunciation: null,
  });
  assert.equal(guarded.level, 'retry');

  const wrongTime = assessSpeechResult(target, {
    transcript: 'Kita tayo ngayon.',
    confidence: 0.61,
    hypotheses: [
      { transcript: 'Kita tayo ngayon.', confidence: 0.61 },
      { transcript: 'Kita tayo bukas.', confidence: 0.58 },
    ],
    pronunciation: null,
  });
  assert.equal(wrongTime.level, 'retry');

  const distant = assessSpeechResult(target, {
    transcript: 'Kita tayo bukas, salamat.',
    confidence: 0.8,
    hypotheses: [{ transcript: 'Kita tayo bukas.', confidence: 0.5 }],
    pronunciation: null,
  });
  assert.notEqual(distant.level, 'verified');
});

void test('an English translation cannot complete a Filipino speaking target', () => {
  assert.equal(
    assess('help-emergency', "There's an emergency.").level,
    'retry',
  );
});

void test('silence is unscored and does not become a wrong answer', () => {
  const result = assess('plans-kita-bukas', '   ');
  assert.equal(result.level, 'unscored');
  assert.equal(result.matchScore, 0);
});

void test('Filipino coaching combines exact words with supported acoustic evidence', () => {
  const target = getSpeechAssessmentTarget('greetings-pakiulit', 'fil-PH');
  assert.ok(target);
  const result = (pronunciation: number) =>
    assessSpeechResult(target, {
      transcript: target.reference,
      confidence: 0.95,
      pronunciation: {
        accuracy: pronunciation,
        fluency: pronunciation,
        completeness: 100,
        pronunciation,
        prosody: null,
        words: [],
      },
    });
  assert.equal(result(90).level, 'verified');
  assert.equal(result(70).level, 'understood');
  assert.equal(result(40).level, 'retry');
});

void test('English pronunciation coaching uses acoustic scores without making accent absolute', () => {
  const target = getSpeechAssessmentTarget('greetings-pakiulit', 'en-US');
  assert.ok(target);
  const pronunciation: AzurePronunciationScores = {
    accuracy: 72,
    fluency: 76,
    completeness: 100,
    pronunciation: 78,
    prosody: null,
    words: [
      { word: 'repeat', accuracy: 58, errorType: 'Mispronunciation' },
      { word: 'that', accuracy: 91, errorType: 'None' },
    ],
  };
  const result = assessSpeechResult(target, {
    transcript: 'Could you please repeat that?',
    confidence: 0.9,
    pronunciation,
  });

  assert.equal(result.level, 'understood');
  assert.equal(result.pronunciation?.pronunciation, 78);
  assert.deepEqual(
    result.lowAccuracyWords.map((word) => word.word),
    ['repeat'],
  );
});

void test('clear English wording and strong acoustic evidence verify', () => {
  const target = getSpeechAssessmentTarget('directions-malayo-ba', 'en-US');
  assert.ok(target);
  const result = assessSpeechResult(target, {
    transcript: 'Is it far?',
    confidence: 0.95,
    pronunciation: {
      accuracy: 91,
      fluency: 88,
      completeness: 100,
      pronunciation: 90,
      prosody: null,
      words: [],
    },
  });
  assert.equal(result.level, 'verified');
});

void test('English needs acoustic evidence and severe scores cannot earn credit', () => {
  const target = getSpeechAssessmentTarget('directions-malayo-ba', 'en-US');
  assert.ok(target);
  const withoutEvidence = assessSpeechResult(target, {
    transcript: 'Is it far?',
    confidence: 0.99,
    pronunciation: null,
  });
  assert.equal(withoutEvidence.level, 'unscored');

  const severe = assessSpeechResult(target, {
    transcript: 'Is it far?',
    confidence: 0.99,
    pronunciation: {
      accuracy: 10,
      fluency: 20,
      completeness: 100,
      pronunciation: 10,
      prosody: null,
      words: [],
    },
  });
  assert.equal(severe.level, 'unscored');
});
