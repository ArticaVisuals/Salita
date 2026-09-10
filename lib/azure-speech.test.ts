import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAzureSpeechMarkup,
  escapeSpeechXml,
  isAzureFilipinoVoice,
  isSpeechSpeed,
} from './azure-speech.ts';

void test('Azure SSML escapes learner text and applies the requested Filipino voice', () => {
  const markup = buildAzureSpeechMarkup(
    'Ikaw & ako <3',
    'slow',
    'fil-PH-BlessicaNeural',
  );

  assert.match(markup, /xml:lang="fil-PH"/);
  assert.match(markup, /name="fil-PH-BlessicaNeural"/);
  assert.match(markup, /rate="-30%"/);
  assert.match(markup, /Ikaw &amp; ako &lt;3/);
});

void test('only supported Filipino voices and playback speeds are accepted', () => {
  assert.equal(isAzureFilipinoVoice('fil-PH-AngeloNeural'), true);
  assert.equal(isAzureFilipinoVoice('en-US-JennyNeural'), false);
  assert.equal(isSpeechSpeed('normal'), true);
  assert.equal(isSpeechSpeed('fast'), false);
  assert.equal(escapeSpeechXml(`'"&<>`), '&apos;&quot;&amp;&lt;&gt;');
});
