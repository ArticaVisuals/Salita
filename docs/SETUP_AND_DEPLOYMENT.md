# Salita setup and deployment

This guide is for developers who want to run Salita locally or deploy a private production instance. It is intentionally credential-free: never add a real Azure key, account detail, deployment identifier, or private deployment URL to this file, a commit, an issue, or a chat transcript.

## Architecture at a glance

Salita is a React 19 application built with vinext and Vite for the Cloudflare Workers runtime. The repository uses npm and pins its dependency graph in `package-lock.json`. The production build is server-backed because the speech routes need server-side runtime values and account progress uses managed D1 storage.

The speech features have three distinct paths:

| Feature                   | Locale   | What Salita does                                                                                                                                                                                                                                                      |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listen to Filipino        | `fil-PH` | `GET /api/speech` sends allowlisted curriculum text to Azure Text to Speech using a server-side key and returns cacheable MP3 audio.                                                                                                                                  |
| Check Filipino speech     | `fil-PH` | The browser obtains a short-lived token from `POST /api/speech/token`, streams microphone audio directly to Azure, then combines detailed recognition hypotheses with supported Pronunciation Assessment evidence. This is coaching, not a native-accent requirement. |
| Optional English coaching | `en-US`  | The browser uses Azure Speech to Text with Azure Pronunciation Assessment and displays acoustic accuracy, fluency, completeness, overall pronunciation, and word-level feedback when Azure returns them.                                                              |

The implementation applies `PronunciationAssessmentConfig` to both supported learning locales. Microsoft's current [language and voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) page lists `fil-PH` for Speech to Text and Pronunciation Assessment, plus the Filipino voices used here. Recheck that source before changing locales or interpreting metrics.

The Azure resource key never belongs in browser code. The token route exchanges it for a token advertised by Salita as valid for about nine minutes. That temporary token can authorize Speech-resource operations during its lifetime, so the site and the token endpoint must be protected by authentication and abuse controls.

## Prerequisites

- Git.
- Node.js **22.13.0 or newer**, matching the `engines` requirement in `package.json`.
- npm, which is included with Node.js. Use the committed npm lockfile rather than switching package managers.
- A current browser with microphone support. Microphone access requires `localhost` during development or HTTPS in production.
- An Azure subscription and permission to create or use an Azure AI Speech resource if cloud speech features are needed.
- For production, access to an authenticated hosting environment. This repository is configured for OpenAI Sites backed by Cloudflare Workers; a separately managed Cloudflare deployment is also possible.

Confirm the local toolchain:

```bash
node --version
npm --version
git --version
```

## Get the source from GitHub

### Fork-based contribution workflow

If the repository's visibility and organization policy allow forks:

1. Create a fork in GitHub.
2. Clone **your fork**, using placeholders rather than copying credentials into the URL:

   ```bash
   git clone https://github.com/<your-user-or-organization>/Salita.git
   cd Salita
   ```

3. Point an `upstream` remote at the canonical repository:

   ```bash
   git remote add upstream https://github.com/<upstream-owner>/Salita.git
   git remote -v
   ```

4. Sync before starting work and create a branch:

   ```bash
   git fetch upstream
   git switch main
   git merge --ff-only upstream/main
   git switch -c <short-feature-branch>
   ```

5. Push the branch to the fork and open a pull request:

   ```bash
   git push -u origin <short-feature-branch>
   ```

GitHub documents the same `origin`/`upstream` model in [Configuring a remote repository for a fork](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/configuring-a-remote-repository-for-a-fork). If a private organization repository cannot be forked, clone the canonical repository and use a feature branch only if you have write access.

Never copy `.env.local` into a fork, commit it, or attach it to a pull request. A fork may also inherit Sites metadata in `.openai/hosting.json`; that metadata does not grant access to the existing Site. An independent fork owner must create or rebind their own Site through the Sites workflow instead of trying to deploy to a project they do not own. Do not paste the existing metadata value into documentation or support messages.

### Direct clone for maintainers

Maintainers can clone the authorized remote directly:

```bash
git clone https://github.com/<authorized-owner>/Salita.git
cd Salita
```

Use a GitHub credential manager, GitHub CLI, or an SSH key. Do not embed a personal access token in the remote URL or save one in repository configuration.

## Local installation

From the repository root:

```bash
npm ci
cp .env.example .env.local
```

`npm ci` installs exactly what is recorded in `package-lock.json` and fails if the manifest and lockfile disagree. Use `npm install` only when intentionally changing dependencies and reviewing the resulting lockfile change.

The app can run without Azure values. Curriculum, device-only progress, and non-cloud practice paths remain available, but Azure Filipino audio and Azure microphone checks report that speech is not configured. Hosted account sync additionally requires the managed `DB` binding and trusted `oai-authenticated-user-id` request header supplied by the Site.

## Environment variables

Edit the ignored `.env.local` file locally:

```dotenv
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
AZURE_SPEECH_VOICE=fil-PH-BlessicaNeural
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

| Variable              | Required                  | Purpose                                                                                                                                                                              |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AZURE_SPEECH_KEY`    | Required for Azure speech | One key from the Azure Speech resource. It is a server-side secret. Never prefix it with `NEXT_PUBLIC_`.                                                                             |
| `AZURE_SPEECH_REGION` | Required for Azure speech | The lowercase region code for the **same resource** as the key, such as `westus2`. Use the region code, not a display name, resource name, endpoint URL, or resource identifier.     |
| `AZURE_SPEECH_VOICE`  | Optional                  | `fil-PH-BlessicaNeural` by default; `fil-PH-AngeloNeural` is also accepted. Any other value falls back to the default.                                                               |
| `NEXT_PUBLIC_APP_URL` | Recommended in production | The public canonical origin used for social metadata, for example `https://learn.example.com`. It is intentionally browser-visible and is not a secret. Do not add a trailing slash. |

The routes first read Cloudflare runtime bindings and then fall back to `process.env` for compatible local execution. Restart the development server after changing `.env.local`.

For production, configure the same names in the hosting platform's runtime settings. Store `AZURE_SPEECH_KEY` as an encrypted secret, not a plaintext build variable. Do not place values in `.openai/hosting.json`, `vite.config.ts`, a Wrangler configuration committed to Git, GitHub Actions YAML, or client-side code.

## Progress database and identity

The hosted app uses an append-only D1 event log plus a materialized learner snapshot. `.openai/hosting.json` names the logical managed binding as `DB`; never paste a physical database ID into the repository.

The checked-in source of truth is:

- `db/schema.ts` for the three Drizzle table declarations.
- `drizzle/0000_sticky_red_skull.sql` for the reviewed initial migration, constraints, partial session index, generation guards, and conflict triggers.
- `lib/progress-events.ts` for the pure event protocol and reducer.
- `lib/progress-d1.ts` for idempotent inserts, materialization, import, and reset generations.
- `app/api/progress` for bootstrap/sync, import, export, and delete routes.

When intentionally changing the schema:

```bash
npm run db:generate
```

Review the generated SQL. Drizzle does not generate Salita's hand-reviewed SQLite checks and triggers automatically, so a maintainer must preserve or add those safeguards in a new append-only migration. Never rewrite or delete a migration that has already been applied. Smoke-test a new migration against SQLite/D1 before publishing.

The Site injects `oai-authenticated-user-id`; Salita treats that opaque value as the sole ownership key and never trusts email for authorization. The displayed email is request metadata only and is not stored in learning tables or exports. A separately hosted deployment must have a trusted authentication proxy that strips any client-supplied copies of these headers and injects its own. Without that trust boundary, leave account sync unavailable rather than accepting forgeable identity headers.

The default `npm run dev` session receives no hosted identity and therefore uses `salita-progress-v1` device-only storage. The Sites Vite plugin exposes `/signin-with-chatgpt?return_to=/` to simulate a stable local identity and exercise the development D1 database. That is useful for protocol rehearsal, but test real ChatGPT identity, hosting access policy, and cross-device managed-D1 sync only on an authenticated preview or production Site.

## Create an Azure Speech Free (F0) resource

Azure's portal naming changes over time; the resource may be presented as **Azure AI Speech**, **Speech service**, or a **Foundry resource for Speech**. Microsoft's current [Speech-to-text quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text?pivots=programming-language-javascript) links to the correct portal creation flow.

1. Sign in to the Azure portal and select **Create a resource**.
2. Search for the Speech resource linked by Microsoft's quickstart and start its creation flow.
3. Select the intended subscription and a dedicated or approved resource group.
4. Choose a region that supports the required Speech-to-Text and Text-to-Speech features. Check Microsoft's [language and voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) page before choosing. The region code saved in Salita must exactly match this resource.
5. Choose the **Free F0** pricing tier. If F0 is unavailable because of subscription, policy, or free-resource limits, stop and resolve that constraint; do not silently choose the billable S0 tier.
6. Give the resource a non-sensitive, organization-compliant name, add cost/owner tags if required, review the settings, and create it.
7. Open the deployed resource's **Keys and Endpoint** page. Copy one key into an approved secret manager and into local `.env.local`; record the region code separately. Do not take screenshots containing keys or paste them into tickets or chat.
8. Create an Azure Cost Management budget and alert even when starting on F0. A budget alert is a notification, not a hard spending cap.

F0 quotas are fixed and non-adjustable. At the time this guide was written, Microsoft's [Speech quotas and limits](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) page lists one concurrent real-time Speech-to-Text request and 20 real-time standard-voice Text-to-Speech transactions per 60 seconds for F0. Monthly allowances and pricing can change, so confirm the current [Speech pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) before every production launch or tier change.

### Key handling and rotation

- Grant Azure access at the narrowest useful scope and keep portal access separate from application runtime access.
- Store production keys only in the host's encrypted secret facility. For a higher-assurance Azure-hosted architecture, Microsoft recommends managed identity; this Cloudflare-based implementation currently authenticates with a key.
- Keep development and production resources separate when the project moves beyond a single trusted maintainer.
- Rotate keys periodically and immediately after suspected exposure. Azure supplies two keys so one can be updated in the host before the old one is regenerated.
- After changing a hosted secret, deploy or restart as required by the host, then test through the app without printing the token or key.

## Development and testing

### Run the development server

```bash
npm run dev
```

Open the local URL printed by the command. When prompted for microphone access, allow it only for that local origin.

### Repository commands

| Command               | Purpose                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Run the vinext/Vite development server with the local Cloudflare runtime.                                                                         |
| `npm run db:generate` | Generate an append-only Drizzle migration after an intentional schema change; review and restore Salita's custom constraints/triggers before use. |
| `npm test`            | Run the Node test suite in `app/*.test.ts` and `lib/*.test.ts`. Tests do not need a real Azure credential.                                        |
| `npm run lint`        | Run oxlint.                                                                                                                                       |
| `npm run typecheck`   | Run TypeScript without emitting files.                                                                                                            |
| `npm run build`       | Produce the Cloudflare-compatible production build under ignored `dist/`.                                                                         |
| `npm run start`       | Run the already-built Worker locally with Wrangler. This is a local production-like check, not a deployment command. Run `npm run build` first.   |
| `npm run format`      | Apply oxfmt. It can rewrite files, so review the diff before committing.                                                                          |

Before a pull request or deployment, run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

### Manual speech smoke test

Use a test resource, an authenticated test deployment, or local development. Do not inspect or copy the response body from the token endpoint.

1. Load the app and confirm the Azure status card reports a configured provider and Filipino voice. `GET /api/speech` with no query parameters returns only configuration status; it never returns the key.
2. Play a bundled Filipino phrase at normal and slow speed.
3. Run a Filipino voice check. Confirm the UI reports the transcript, word match, and supported pronunciation evidence without presenting a native accent as the goal.
4. Run the optional English check. Confirm acoustic Pronunciation Assessment fields appear when Azure returns them; an unscored result is a valid failure mode when acoustic evidence is insufficient.
5. Deny microphone permission and confirm the accessible practice-aloud or record-and-compare fallback remains usable.
6. Repeat through the authenticated HTTPS production hostname. Microphone APIs commonly fail on insecure non-local origins.

## Production deployment

### Required access model

Salita does not implement its own user accounts or authorization middleware. Production authentication must therefore be enforced by the hosting layer **before every page and API route**, especially `POST /api/speech/token`.

The route's same-origin check is browser defense-in-depth, not authentication. Requests can omit or forge an `Origin` header outside a browser. Its in-memory rate guard is also best-effort per Worker instance and is not a durable, globally coordinated quota. Do not publish the token endpoint anonymously on the strength of those checks.

A production deployment should have all of the following:

- HTTPS and sign-in-gated access for the whole hostname.
- No alternate public hostname that bypasses the access policy.
- Encrypted runtime storage for the Azure key.
- A distributed rate limit for `POST /api/speech/token`, plus monitoring for unusual issuance volume and Azure 401, 429, and 5xx responses.
- Restricted membership, prompt removal of former users, and periodic access review.
- Logs that exclude credentials, issued tokens, microphone audio, transcripts, and request bodies.

### OpenAI Sites notes

The repository is already a Sites project and uses the `sites()` Vite plugin plus Cloudflare's Vite plugin. Preserve that architecture and `.openai/hosting.json`; do not put runtime values, URLs, user details, or credentials in the hosting manifest.

For the managed Sites path:

1. Validate the exact source revision with the four commands above.
2. Configure `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and optionally `AZURE_SPEECH_VOICE` through the Site operator's managed runtime-value controls. If encrypted secret controls are not available, stop rather than baking the key into the source or build archive.
3. Provision/apply the managed D1 binding and checked-in migration through the Sites workflow; verify `DB` is available before enabling sync.
4. Publish through the existing Sites workflow and keep the access policy owner-only or explicitly restricted to intended authenticated users.
5. Verify the resolved access policy before and after deployment. Treat missing or ambiguous access information as **not private**.
6. Test the deployed app while signed in, then confirm a signed-out/private browsing request is blocked before it reaches the app.

Do not print or document the private Site URL. Do not copy a Sites project identifier from one fork to another. A new fork owner should create a new Site or have an authorized operator rebind it through the managed workflow.

### Direct Cloudflare Workers notes

Direct Cloudflare deployment is an advanced alternative to managed Sites:

- `npm run build` creates the Worker output. `npm run start` invokes `wrangler dev` against the generated build configuration; it does **not** publish production.
- Treat `dist/` and its Wrangler file as generated artifacts. Do not hand-edit them as the source of truth because the next build can replace them.
- Store `AZURE_SPEECH_KEY` as a Cloudflare Worker secret. Cloudflare's [Secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/) explicitly distinguishes encrypted secrets from plaintext variables.
- Protect the application with Cloudflare Access or equivalent authentication. Cloudflare documents Access as an authentication layer for a [self-hosted web application](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).
- Protect every custom hostname and disable or equally protect any default or preview hostname that could bypass Access.
- Add a Cloudflare rate-limiting rule or another distributed limiter for the token route. Tune it for legitimate voice-check bursts and the active Azure tier.
- Use a controlled deployment pipeline and a durable, reviewed Worker configuration rather than running an unreviewed deploy command against generated files.

### Post-deployment checks

- Signed-out requests cannot load the app or either speech route.
- Signed-in users can synthesize one allowlisted Filipino phrase.
- Filipino and English recognition/Pronunciation Assessment use the intended locale.
- The key and issued token are absent from HTML, JavaScript bundles, analytics, application logs, error trackers, and browser-persisted storage.
- The browser talks directly to Azure only after a signed-in request obtains a temporary token.
- Azure usage metrics and budget alerts are active.
- A completed test event appears on a second signed-in device; duplicate sync does not add XP or sessions twice.
- Export contains no account key, event/device ID, email, audio, or transcript.
- A reset advances the sync generation and an old queued event receives a stale-generation conflict.

## Security, privacy, and cost safeguards

### Existing safeguards to preserve

- The key is read only by server routes.
- Text to Speech accepts only normalized text already present in the bundled curriculum; the endpoint is not an arbitrary synthesis proxy.
- Synthesized curriculum audio is cached to reduce repeat latency and Azure usage.
- The token route accepts only known exercise/language combinations, checks browser same-origin requests, sends `no-store` responses, and applies a small best-effort local rate guard.
- Salita does not intentionally persist microphone-check audio or transcripts. Record-and-compare clips remain in the current tab. Learning events are queued locally and materialized into the signed-in learner's D1 snapshot.

These controls do not eliminate third-party processing: microphone checks stream audio from the browser to Azure. Review Microsoft's current data handling, retention, residency, and compliance terms before allowing real learners to use the feature, and disclose that processing in the application's privacy notice.

### Operational safeguards

- Keep the Site authenticated. If public access becomes a requirement, perform a separate security and cost review and add real server-side authorization plus distributed abuse protection first.
- Start with F0, verify the current allowance, and require explicit owner approval before changing to S0 or another paid tier.
- Configure Azure budgets and alerts at multiple thresholds. Remember that alerts notify; they do not automatically stop service or spending.
- Monitor request counts, token issuance, synthesis traffic, Speech-to-Text duration, throttling, and authentication failures. Investigate unexplained changes.
- Keep the curriculum allowlist and cache headers when modifying the synthesis route.
- Never log `Authorization`, `Ocp-Apim-Subscription-Key`, token responses, or `.env` contents.
- Use separate resources or at least separate operational controls for development and production so local testing cannot consume production quota.
- Remove unused deployments and Azure resources. Confirm deletion through the relevant provider to end future exposure or charges.
- Review dependency updates, especially the Speech SDK, vinext, Vite, Wrangler, and Cloudflare plugins, with tests and a private staging deployment.

### If a key is exposed

Treat a committed, logged, screenshotted, or messaged key as compromised even if the disclosure was brief.

1. Regenerate the exposed key in Azure immediately.
2. Update the encrypted local/hosted secret without revealing it in terminal output or logs.
3. Redeploy or restart the Worker if the host requires it, then verify speech through the UI.
4. Review Azure metrics and cost data for misuse and preserve appropriate incident evidence without preserving the secret itself.
5. Remove the value from Git history and other systems using the organization's credential-incident process. Deleting it only from the latest file is not sufficient.

## Troubleshooting

| Symptom                                                 | Likely cause and safe fix                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci` rejects the Node version                       | Install Node 22.13.0 or newer, open a new shell, and confirm `node --version`.                                                                                                                               |
| `npm ci` reports a lockfile mismatch                    | Do not bypass it in deployment. A dependency maintainer should run `npm install`, review the manifest and lockfile together, and commit the intentional change.                                              |
| `npm run start` cannot find `dist/server/wrangler.json` | Run `npm run build` first. `start` uses generated production output.                                                                                                                                         |
| The app says Azure speech is not configured             | Confirm all required names exist in `.env.local` or the host runtime, remove accidental whitespace, and restart/redeploy. Never print the values to debug them.                                              |
| Azure authentication fails                              | The key and region probably come from different resources, the key was rotated, or the region is a display name/URL instead of a code. Re-copy them from the same resource.                                  |
| Filipino audio returns an error                         | Confirm the configured voice is one of the two supported names, verify regional voice availability, then check Azure health and quota. Keep the curriculum allowlist intact.                                 |
| HTTP 429 or intermittent voice failure                  | F0 may be at its concurrency/rate limit, or the selected voice's regional capacity may be constrained. Wait and retry with backoff; inspect Azure metrics before considering a paid tier.                    |
| The microphone button is blocked                        | Use `localhost` or HTTPS, grant permission for the exact origin, connect a microphone, and close other recording apps. The accessible fallback should remain available.                                      |
| The token route returns 403                             | The app and API request are crossing origins or a proxy is presenting the wrong public origin. Serve them from the same authenticated origin; do not weaken the check to enable cross-origin token issuance. |
| The speech route returns `UNKNOWN_TEXT`                 | The requested text is not in the bundled curriculum allowlist. Add curriculum content through the normal code and tests; do not turn the route into an open TTS proxy.                                       |
| Filipino returns words but no pronunciation scores      | Confirm the deployed Speech SDK/resource supports current `fil-PH` Pronunciation Assessment. Keep transcript coaching usable and never invent missing acoustic evidence.                                     |
| English is recognized but marked unscored               | Azure did not return sufficient acoustic Pronunciation Assessment evidence. Retry in a quieter environment; do not manufacture a score from the transcript.                                                  |
| Local speech works but hosted speech does not           | Local `.env.local` is ignored by Git and is not uploaded. Configure the hosted runtime values separately and verify private access before testing.                                                           |
| A signed-out user can reach a speech endpoint           | The hosting access policy is incomplete or an alternate hostname bypasses it. Disable the deployment or remove the Azure secret until every route is protected.                                              |
| Progress appears on one device only                     | Confirm the same authenticated account and hostname, the managed `DB` binding, and `/api/progress` response. Localhost is intentionally device-only.                                                         |
| Sync reports `STALE_GENERATION`                         | Another device reset or replaced the account copy. Preserve/export any local work, reload canonical progress, and do not remove the generation guard.                                                        |

## Release checklist

- [ ] The branch contains no `.env` file, credential, issued token, account detail, private URL, or copied deployment identifier.
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- [ ] The Azure resource remains on the intended pricing tier and current quotas were reviewed.
- [ ] The production key is stored as an encrypted runtime secret.
- [ ] Authentication covers the app, both API routes, and every reachable hostname.
- [ ] A distributed token-route rate limit and Azure budget alerts are active.
- [ ] The reviewed D1 migration applies cleanly and duplicate/concurrent event checks pass.
- [ ] Filipino and English feedback combine transcript matching with supported Pronunciation Assessment evidence without requiring a native accent.
- [ ] Cross-device sync, legacy migration, export/import, device clear, and delete-everywhere reset are tested with non-production learner data.
- [ ] Signed-in and signed-out smoke tests pass over HTTPS.
- [ ] Monitoring contains no speech payloads, keys, or temporary tokens.
