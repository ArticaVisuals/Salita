# Salita

![Salita — Tagalog, one real conversation at a time](public/og.png)

Salita is a daily, mixed-method Tagalog (Filipino) learning web app for English-speaking beginners. It combines practical conversation, explicit grammar, pronunciation foundations, listening, reading, speaking, streaks, and spaced review in short daily sessions.

The interface stays in English so a new learner can navigate confidently, while lessons steadily increase the amount of Filipino they ask the learner to understand and produce.

## What is included

- 43 progressive units, 258 short lessons, 301 reusable expressions, and 344 core vocabulary entries—from first sounds to connected stories.
- A slow lesson rhythm: four anchor words and two expressions are introduced before recall; four more words arrive in the next micro-lesson, followed by one sentence pattern, listening/reading, conversation, and a cumulative checkpoint.
- High-frequency phrases presented with register, grammar, and usage notes—not as isolated translations.
- A daily path with XP, streaks, skill strength, review scheduling, and session history.
- Filipino neural text to speech for full models and tap-to-hear words.
- Guided pronunciation work on vowels, stress, `ng`, vowel boundaries and glottal stops, the tapped `r`, linkers, and repeated syllables.
- Filipino and English speech recognition with transcript-aware coaching and Azure word-level pronunciation assessment in both supported locales.
- Controlled transformations, dialogues, listening checks, readings, and recall practice.
- Quick Match vocabulary rounds and a durable Practice mistakes queue that requires clean recall on later days.
- Installable iPhone PWA support and account-backed progress sync with an offline event queue.
- Responsive, accessible interaction patterns inspired by Heetch's [Flamingo design system](https://github.com/heetch/flamingo).

On the hosted Site, Salita keys progress to the authenticated ChatGPT user ID and synchronizes an idempotent event log to managed D1 storage. The Azure key, identity header, and event rows never enter progress exports. Local development without hosted identity falls back to the original `salita-progress-v1` browser record. On first hosted use, an existing legacy record is imported only into an empty account; ambiguous copies require an explicit keep, merge, or replace choice.

## Start here

- Learner: read the [User Guide](docs/USER_GUIDE.md).
- Developer or self-hoster: follow [Setup and Deployment](docs/SETUP_AND_DEPLOYMENT.md).
- Contributor: read [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

## Quick start

Requirements: Node.js 22.13 or newer and npm.

```bash
git clone https://github.com/ArticaVisuals/Salita.git
cd Salita
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by the development server. The learning flow works without Azure credentials; cloud voices and microphone coaching require an Azure AI Speech resource configured in `.env.local`. Local development does not emulate hosted ChatGPT identity or managed D1 account sync.

Run the release checks with:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

## Speech architecture and privacy

The browser never receives the long-lived Azure resource key. Server routes use it to synthesize allow-listed curriculum audio and to exchange it for a short-lived Speech authorization token. During a microphone check, the browser sends live audio directly to Azure Speech using that temporary token.

Salita does not save voice-check audio or transcripts. Record-and-compare clips stay in the current tab. Before exposing a separately self-hosted copy publicly, add trusted authentication headers, distributed rate limiting, Azure quotas, and cost alerts; the included in-memory rate guard is only a best-effort safeguard for a restricted deployment.

Never commit a real key, place one in a `NEXT_PUBLIC_` variable, or paste one into an issue. See the [deployment tutorial](docs/SETUP_AND_DEPLOYMENT.md) for configuration and key-rotation steps.

## Teaching approach

The curriculum moves from sound and sentence pattern to controlled practice, reading/listening in context, and finally learner production. It takes methodological inspiration from _Basic Tagalog for Foreigners and Non-Tagalogs_ by Paraluman S. Aspillera—especially its attention to sound, pattern practice, grammar, and graduated dialogue—while using newly written explanations, examples, and exercises for this app.

The content favors useful contemporary conversation, including polite forms and common casual variants, while explaining where register or context changes the best choice. No finite course can guarantee fluency by itself; Salita is designed as a durable foundation and daily practice system to pair with regular listening and real conversation.

## Technology

- React 19, TypeScript, Vinext, and Vite
- Cloudflare Workers-compatible server routes
- Azure AI Speech SDK
- Tailwind CSS and reusable UI components
- Node's built-in test runner, Oxlint, and TypeScript checks

## Project status

Salita is an evolving learning release. The bundled course, spaced repetition, mistake repair, vocabulary practice, PWA installation, and account-backed cross-device profile are implemented. A future Fluency Lab should extend the fixed course with open-ended listening, reading, and conversation.

No open-source license is included at this time. Public source availability does not by itself grant permission to copy, modify, or redistribute the code.
