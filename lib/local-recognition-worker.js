const SDK_URL =
  'https://cdn.jsdelivr.net/npm/@moonshine-ai/moonshine-wasm@0.1.6/dist/index.js';
const TAGALOG_MODEL_URL =
  'https://download.moonshine.ai/model/tiny-streaming-tl/quantized_26_08_24';
const TAGALOG_COMPONENTS = [
  'adapter.ort',
  'cross_kv.ort',
  'decoder_kv.ort',
  'encoder.ort',
  'streaming_config.json',
  'tokenizer.bin',
];

let currentLanguage;
let recognizer;

async function loadRecognizer(language) {
  const { Transcriber, ModelArch } = await import(SDK_URL);
  if (language === 'en') {
    return Transcriber.load({ language, modelArch: ModelArch.TinyStreaming });
  }

  const files = Object.fromEntries(
    TAGALOG_COMPONENTS.map((file) => [file, `${TAGALOG_MODEL_URL}/${file}`]),
  );
  files['frontend.ort'] = new URL(
    '/speech-model/frontend.ort',
    self.location.origin,
  ).href;
  return Transcriber.loadFromUrls(files, {
    modelArch: ModelArch.TinyStreaming,
  });
}

self.onmessage = async ({ data }) => {
  try {
    if (currentLanguage !== data.language) {
      recognizer?.close();
      recognizer = undefined;
      currentLanguage = data.language;
    }
    recognizer ??= await loadRecognizer(data.language);
    const result = recognizer.transcribe(data.pcm, { sampleRate: 16_000 });
    self.postMessage({
      transcript: result.lines
        .map((line) => line.text.trim())
        .filter(Boolean)
        .join(' '),
    });
  } catch (error) {
    console.warn('On-device speech failed.', error);
    self.postMessage({ error: true });
  }
};
