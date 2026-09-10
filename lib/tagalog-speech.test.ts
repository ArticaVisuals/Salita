import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAllowedSpeechText,
  normalizeSpeechText,
  segmentTagalogText,
} from './tagalog-speech.ts';
import { foundations } from '../app/foundations.ts';

void test('speech segments preserve punctuation and expose individual Tagalog words', () => {
  const text = 'Puwede po bang pakiulit?';
  const segments = segmentTagalogText(text);

  assert.equal(segments.map((segment) => segment.display).join(''), text);
  assert.deepEqual(
    segments.flatMap((segment) => (segment.speech ? [segment.speech] : [])),
    ['Puwede', 'po', 'bang', 'pakiulit'],
  );
});

void test('sentence-frame placeholders remain visible but are not spoken', () => {
  const segments = segmentTagalogText('Kailangan ko ng [thing].');
  const placeholder = segments.find((segment) => segment.display === '[thing]');
  assert.deepEqual(placeholder, { display: '[thing]', speech: null });
});

void test('hyphenated words, contractions, and affix labels stay intact', () => {
  const text = 'Taga-saan · Araw-araw · alas-singko · n’yo · ’Di · -ng — saya';
  const segments = segmentTagalogText(text);

  assert.equal(segments.map((segment) => segment.display).join(''), text);
  assert.deepEqual(
    segments.flatMap((segment) => (segment.speech ? [segment.speech] : [])),
    ['Taga-saan', 'Araw-araw', 'alas-singko', "n'yo", "'Di", 'saya'],
  );
});

void test('standalone ng requests its spoken form while affix labels stay silent', () => {
  const standalone = segmentTagalogText('Gusto ko ng kape.');
  assert.deepEqual(
    standalone.flatMap((segment) => (segment.speech ? [segment.speech] : [])),
    ['Gusto', 'ko', 'nang', 'kape'],
  );
  assert.equal(isAllowedSpeechText('nang'), true);
  assert.equal(isAllowedSpeechText('-ng'), false);
});

void test('the speech endpoint allowlist accepts curriculum phrases and words only', () => {
  assert.equal(isAllowedSpeechText('Salamat po.'), true);
  assert.equal(isAllowedSpeechText('Salamat'), true);
  assert.equal(
    isAllowedSpeechText('Read me an arbitrary costly paragraph.'),
    false,
  );
});

void test('every clickable foundation word is accepted by the speech endpoint', () => {
  for (const foundation of Object.values(foundations)) {
    const sources = [
      foundation.pronunciation.model,
      foundation.reading.passage,
      ...foundation.grammar.examples.map((example) => example.fil),
    ];
    for (const source of sources) {
      assert.equal(isAllowedSpeechText(source), true, source);
      for (const segment of segmentTagalogText(source)) {
        if (segment.speech) {
          assert.equal(
            isAllowedSpeechText(segment.speech),
            true,
            segment.speech,
          );
        }
      }
    }
  }
});

void test('speech normalization compacts whitespace without changing Filipino text', () => {
  assert.equal(
    normalizeSpeechText('  Mabuti   naman, salamat.  '),
    'Mabuti naman, salamat.',
  );
});
