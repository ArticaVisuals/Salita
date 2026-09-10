# Salita

Salita is a daily Tagalog (Filipino) learning app built with the Flamingo design language. Its foundation lessons combine pronunciation, explicit grammar, controlled sentence transformations, graded readings, listening, and speaking practice. Progress, streaks, and spaced reviews are stored in the learner's browser.

## Local development

```bash
npm install
npm run dev
```

Use `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before publishing.

## Azure Filipino speech

Copy `.env.example` to `.env.local` for local development and set:

- `AZURE_SPEECH_KEY`: an Azure AI Speech resource key. Keep it server-only.
- `AZURE_SPEECH_REGION`: the region of that same Speech resource, such as `westus2`.
- `AZURE_SPEECH_VOICE`: optional; `fil-PH-BlessicaNeural` is the default and `fil-PH-AngeloNeural` is also supported.

The browser calls Salita's server route; it never receives the Azure key. Only bundled curriculum phrases and words can be synthesized. Fixed results are cached to reduce latency and Speech usage.

Do not rename the key to a `NEXT_PUBLIC_` variable or commit a real credential.
