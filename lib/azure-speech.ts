export const AZURE_FILIPINO_VOICES = [
  'fil-PH-BlessicaNeural',
  'fil-PH-AngeloNeural',
] as const;

export type AzureFilipinoVoice = (typeof AZURE_FILIPINO_VOICES)[number];
export type SpeechSpeed = 'normal' | 'slow';

export function isAzureFilipinoVoice(
  value: string,
): value is AzureFilipinoVoice {
  return AZURE_FILIPINO_VOICES.includes(value as AzureFilipinoVoice);
}

export function isSpeechSpeed(value: unknown): value is SpeechSpeed {
  return value === 'normal' || value === 'slow';
}

export function escapeSpeechXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildAzureSpeechMarkup(
  text: string,
  speed: SpeechSpeed,
  voice: AzureFilipinoVoice,
) {
  const rate = speed === 'slow' ? '-30%' : '0%';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fil-PH"><voice name="${voice}"><prosody rate="${rate}">${escapeSpeechXml(text)}</prosody></voice></speak>`;
}
