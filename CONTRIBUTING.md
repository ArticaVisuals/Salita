# Contributing to Salita

Thanks for helping make Salita clearer, safer, and more useful. Small, focused pull requests are easiest to review.

## Development setup

Use Node.js 22.13 or newer.

```bash
git clone https://github.com/ArticaVisuals/Salita.git
cd Salita
npm ci
cp .env.example .env.local
npm run dev
```

Azure credentials are optional for most interface and curriculum work. Leave the values blank when you do not need cloud speech features.

## Before opening a pull request

Run all checks from the repository root:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

Keep generated directories such as `dist`, `.next`, `.vinext`, and `.wrangler` out of commits.

## Content changes

Language-learning content needs the same care as application code.

- Prefer sentences a learner could realistically use, with an explicit situation and register.
- Explain Tagalog structures on their own terms rather than forcing a word-for-word English mapping.
- Distinguish standard spelling from accepted casual variants.
- Avoid absolute claims about pronunciation or usage when region, generation, or context creates variation.
- Add or update tests when changing curriculum IDs, progress behavior, accepted speech variants, or scoring rules.
- Cite a reliable source in the pull-request description for a substantive linguistic correction. Do not copy textbook exercises or copyrighted passages into the app.

## Speech changes

- Keep `AZURE_SPEECH_KEY` server-only.
- Treat Speech-service language and feature support as versioned external behavior; verify it against current official Microsoft documentation.
- Keep learner-facing labels honest about what is measured. A recognized transcript is not automatically proof of native-like pronunciation.
- Never add recorded learner audio, real transcripts, resource keys, authorization tokens, or account identifiers to fixtures.

## Pull-request scope

Describe the learner problem, the change, and how you verified it. Include screenshots for visual changes and note keyboard, screen-reader, narrow-screen, loading, and error-state behavior when applicable.

By contributing, you confirm that you have the right to submit the material. This repository currently has no open-source license; contribution does not change that status.
