# Salita

Salita is a daily Tagalog (Filipino) learning app built with the Flamingo design language. Its foundation lessons combine pronunciation, explicit grammar, controlled sentence transformations, graded readings, listening, and speaking practice. Progress, streaks, and spaced reviews are stored in the learner's browser.

## Local development

```bash
npm install
npm run dev
```

Use `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before publishing.

## Azure speech

Copy `.env.example` to `.env.local` for local development and set:

- `AZURE_SPEECH_KEY`: an Azure AI Speech resource key. Keep it server-only.
- `AZURE_SPEECH_REGION`: the region of that same Speech resource, such as `westus2`.
- `AZURE_SPEECH_VOICE`: optional; `fil-PH-BlessicaNeural` is the default and `fil-PH-AngeloNeural` is also supported.

The same Speech resource powers three features:

- Filipino neural text to speech for full phrases and tap-to-hear words.
- Filipino (`fil-PH`) speech recognition with meaning-aware transcript matching.
- English (`en-US`) scripted pronunciation assessment with accuracy, fluency, completeness, and word-level coaching.

Azure does not currently offer Pronunciation Assessment for Filipino. Salita therefore labels Filipino results as a **speech match**, never as an accent or native-pronunciation score. Stress, glottal stops, tapped `r`, and fine vowel quality remain listen-and-compare skills.

The Azure resource key stays on the server. For microphone checks, the server exchanges it for a short-lived Azure authorization token; the browser streams live microphone audio directly to Azure Speech. The token is temporary but grants general Speech-resource access during its lifetime, so keep Sites sign-in enabled and configure Azure usage quotas and cost alerts. The route's local rate guard is only best-effort across Cloudflare Worker instances.

Salita does not persist voice-check audio or transcripts. Record-and-compare clips remain only in the current tab.

Only bundled curriculum phrases and words can be synthesized, and the token endpoint accepts only known voice exercises. Fixed synthesized audio is cached to reduce latency and Speech usage.

Do not rename the key to a `NEXT_PUBLIC_` variable or commit a real credential.
