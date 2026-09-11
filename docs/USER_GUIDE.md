# Salita learner guide

Salita is a gradual Tagalog (Filipino) course for English-speaking learners. The interface stays in English while the course steadily asks you to understand and produce more Filipino. It combines short lessons, cumulative recall, pronunciation coaching, spaced review, mistake repair, vocabulary games, streaks, and progress that follows your signed-in account.

## Sign in and keep one learning record

The hosted Salita site uses ChatGPT sign-in. Select **Continue with ChatGPT** if the access screen appears, then use the same ChatGPT account on desktop and iPhone.

- Salita does not create a separate password.
- Hosted progress is keyed to the authenticated account, not to the email text shown in the interface.
- The app saves checked answers locally first, then synchronizes them. A brief connection loss does not discard an open lesson.
- Local development at `localhost` uses device-only storage because it does not receive the hosted identity headers.
- If a browser already contains older device-only progress, Salita imports it automatically only when the signed-in cloud record is empty. If two nonempty histories could conflict, it asks you to **Keep account copy**, **Merge both**, or **Use device copy** and keeps a local backup first.

If another account says it has no access, the Site owner must include that account in the Site's access policy. Account sync cannot bypass the host's sign-in gate.

## Install Salita on iPhone

1. Open the published Salita link in **Safari** and sign in.
2. Tap Safari's **Share** button.
3. Choose **Add to Home Screen**. If it is not visible, scroll the action list or choose **Edit Actions**.
4. Keep the name **Salita**, then tap **Add**.
5. Launch Salita from its Home Screen icon. It opens in a standalone app window.
6. When a speaking exercise first asks, allow microphone access.

Use the same signed-in account on desktop and iPhone. Completed answers, lessons, XP, review schedules, mistakes, streak days, and minutes synchronize in both directions. Keep the app open until the Progress screen says **saved** when you are about to switch devices.

On Android or desktop Chrome/Edge, use the browser's **Install app** or **Add to Home screen** command. Salita also includes install icons, safe-area spacing, and an offline fallback page.

## Find your way around

The important navigation stays in English. On a phone it appears along the bottom.

| Area         | What it is for                                                                        |
| ------------ | ------------------------------------------------------------------------------------- |
| **Today**    | Your next six-minute lesson, daily goal, streak, and speech-service status            |
| **Learn**    | The complete 43-unit path and progress through each unit's six lessons                |
| **Review**   | Due spaced repetition, **Practice mistakes**, and **Quick Match**                     |
| **Progress** | Streaks, XP, calendar, skill strength, sync state, backups, import, and data controls |

## Follow the gradual course

Salita contains 43 units, 258 core lessons, 301 reusable expressions, and 344 core vocabulary entries. All eight units from the original version keep their identifiers and are woven into the slower prerequisite order, so earlier work remains intact. The expanded path then builds through:

1. Sounds, greetings, politeness, introductions, needs, food, directions, routines, plans, and urgent help.
2. Predicate-first sentences, `si/sina`, `ang/ang mga`, pronouns, demonstratives, linkers, possession, questions, particles, existence, quantity, numbers, and comparison.
3. Completed, ongoing, and contemplated aspect; actor focus; patient/object focus; wants, needs, permission, ability, states, and change.
4. Location, movement, recipients, clock/calendar time, when-clauses, roots, person nouns, transferred-object focus, locative focus, requests, thoughts, feelings, and relative descriptions.
5. Adverbs, connectors, causatives, agreement, doubt, derived nouns, `naka-` states, group/reciprocal actions, everyday contractions, shopping, cooking, family, school, work, travel, health, and connected stories.

The course uses aspect terminology instead of forcing Tagalog verbs into English past/present/future labels. It treats focus as a system for highlighting participants, not as a simple copy of English active/passive voice.

### The six lessons in every unit

| Lesson                   | Purpose                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **First words & sounds** | Meet four anchor words and two expressions before the first scored recall           |
| **Retrieve first words** | Meet four more useful words, then retrieve the four anchors from lesson one         |
| **Build the frame**      | Meet three more expressions, notice one grammar contrast, and transform a model     |
| **Listen and read**      | Retrieve newer words and recognize the pattern in speech and a graded passage       |
| **Take your turn**       | Meet the final expressions, retrieve the remaining words, and produce a spoken turn |
| **Unit checkpoint**      | Recall the unit in a changed order without relying on the introduction sequence     |

A miss returns later in the same lesson after unrelated prompts. Later lessons deliberately recycle earlier material before adding complexity. Completing one lesson advances to the next lesson—not straight to the next unit.

## Complete today's lesson

1. Open **Today** and select **Start lesson** or **Continue lesson**.
2. Read the English objective, then work through each short prompt.
3. Use **Hint** if needed. A supported answer still earns learning credit but is not counted as a clean first try.
4. Select **Check answer**, read the correction, and continue.
5. Finish the completion screen so the session, minutes, and streak day are logged.

Leaving before the end preserves answers already checked and their review records. It does not count the unfinished session as a completed streak day.

The six small bars on each **Learn** card show lesson-level completion. Salita unlocks them in order so each new lesson can retrieve material introduced earlier. Completed lessons remain available for replay, and the unit marked **Up next** is your current path.

## Hear every word

Underlined Tagalog words are audio controls. Tap one to hear just that word. Use **Hear model**, **Slow**, or **Hear slowly** for a complete line. Quick Match includes a speaker on every vocabulary card.

Salita requests the configured Azure Filipino neural voice directly from the tap, which is important for iPhone playback rules. If Azure is unavailable, it tries a Filipino system voice when the device has one. It never substitutes an English voice for Filipino.

If you hear nothing:

1. Check the device and browser-tab volume.
2. Tap the same audio control once more; iOS may pause a newly loaded audio request.
3. Check the **Azure speech** card on **Today**.
4. Use **Transcript** or **Hint** so the lesson remains usable.

## Use Filipino and English microphone coaching

Speaking and Sound Lab exercises can run an Azure voice check. The app asks the browser for a microphone stream, requests a short-lived Speech token, and sends live audio directly to Azure. It does not store voice-check audio or transcripts in Salita progress.

### Filipino

1. Play the model.
2. Select **Check Tagalog** or **Check my Tagalog**.
3. Begin after the panel says **Listening…** and say the complete line.
4. Review what Azure heard, word match, supported pronunciation metrics, and the one word that most needs another try.

An exact transcript plus strong acoustic evidence can be **verified**. Recognizable words with weaker acoustic evidence are **understood** and receive supported-practice credit. A meaning-changing contrast such as `tayo/kami`, `kaliwa/kanan`, or `hindi/wala` cannot receive verified credit simply because the rest was close.

The scores are coaching signals, not proof of a native accent. Stress, glottal stops, vowel clarity, and the tapped `r` should also be compared with the Filipino model and written sound guide.

### English

**Check English** is optional pronunciation practice for the English meaning. Azure may return Overall, Accuracy, Fluency, and Complete values. English practice never substitutes for the required Tagalog turn.

### Record and compare privately

**Record myself** or **Record only** makes a temporary local clip. It remains only in the current tab and is discarded when replaced, when the activity changes, or when the tab closes. Recordings stop automatically after 30 seconds.

### If the microphone is unavailable

- Allow Microphone in the browser's site settings and in iOS/macOS privacy settings.
- Use the published HTTPS site; nonsecure remote pages cannot use microphone APIs.
- Close another app that may own the microphone.
- A permission request times out after 15 seconds instead of leaving the lesson stuck.
- Use **Accessible typed fallback** or **I practiced aloud—mark this complete**. Your lesson and streak remain finishable.

## Quick Match vocabulary practice

Open **Review** and select **Match vocabulary**, or use **Match** on any unit card.

1. Tap one Tagalog card and one English meaning.
2. Use the speaker beside a Tagalog word whenever you want audio.
3. Correct pairs remain visibly completed.
4. A wrong pair remains available and is immediately added to **Practice mistakes**.
5. Finishing the last pair automatically records minutes, XP, and a practice day.

Quick Match is tap-select rather than drag-only, so it works with touch, keyboard, and assistive technology.

## Practice mistakes until they stay learned

Every first wrong answer creates or updates a durable mistake record. Open **Review** > **Practice mistakes** to work the oldest unresolved items first.

- A same-session correction teaches the answer but does not erase the mistake.
- The next clean first try moves it to **recovering**.
- A second clean first try on a later due day marks it **recovered**.
- Another miss reactivates it and increases its lapse count.

This prevents the common pattern where a learner recognizes a correction once, leaves the lesson, and immediately forgets it.

## Spaced review, XP, and streaks

Each phrase, vocabulary item, grammar pattern, reading, sound model, listening prompt, and speaking prompt has a stable review key.

- Clean first try when due: 10 XP and the review interval advances.
- Correct with a hint, retry, typed fallback, or supported voice result: 5 XP and the stage holds.
- Wrong: 0 XP, the stage falls, the item stays due, and it enters Practice mistakes.
- Early practice does not advance a future due date or award duplicate XP.

Intervals expand through approximately 1, 3, 7, 14, 30, and 60 days. Completing any lesson, review, mistake session, or saved Quick Match round records that calendar day. Multiple sessions on one day count as one streak day. A current streak can end today or yesterday; missing a full day resets the current streak but not the best streak.

## Sync, backups, and deletion

Open **Progress** > **Your data**.

- **Export progress** downloads a portable JSON snapshot without account IDs, device IDs, raw events, audio, or transcripts.
- **Import backup** validates a JSON file, then offers **Merge** or **Replace**. Replace starts a new sync generation so delayed events from an old device cannot resurrect deleted history.
- **Clear this device** removes local cached/outbox data but leaves the signed-in cloud copy intact; Salita reloads that canonical copy when reachable.
- **Delete everywhere** appears only while signed in, requires two confirmations, and advances a server-side reset generation. It deletes synced learning history from prior generations across devices while retaining the minimal reset marker needed to reject stale offline writes.

Never share a progress export casually; it contains learning history and review performance even though it contains no sign-in identifier.

The sync indicator can report:

- **saved** — the account copy includes all acknowledged events.
- **saving** — events are being uploaded.
- **offline** — events remain queued on this device.
- **attention** — another device reset or replaced the account generation; reload before adding more changes.
- **device-only** — hosted identity/database is not available, as expected in ordinary localhost development.

## Privacy and cost boundaries

Salita stores only learning progress needed for the course: XP, sessions, practice dates/minutes, completed unit and lesson IDs, review records, mistake states, and recent history. It does not place email addresses in the learning tables or exports; the displayed email comes from the current hosted request.

Azure handles synthesized curriculum text and live microphone audio. The long-lived Azure key stays server-side; the browser receives only a short-lived authorization token. Salita does not intentionally retain speech audio or recognition transcripts.

The project is designed to remain on Azure's Free F0 tier unless the owner explicitly approves a change. A budget alert is useful but is not a hard spending cap. When the quota is exhausted, use text and record-only fallbacks rather than changing to a paid tier automatically.

## Troubleshooting

### A different account cannot open Salita

Sign in to the intended ChatGPT account in a normal browser window. If the host still says you do not have access, the Site owner must update the Site access policy; the app cannot grant itself access.

### The microphone stays on permission or connection

Open the browser's site controls, set Microphone to Allow, reload, and try one current prompt. A permission wait stops after 15 seconds, Azure connection after 15 seconds, and an incomplete spoken phrase after 20 seconds. Nothing is scored on a timeout.

### Azure hears the wrong Filipino word

Move closer, reduce background sound, wait for **Listening…**, and say one complete line. Replay the model slowly. Salita asks Azure for detailed Filipino alternatives and protects meaning-bearing contrasts; try again rather than accepting a visibly wrong transcript.

### Progress seems missing

Confirm that the same ChatGPT account is signed in and that you are on the same published Salita hostname. Check for a yellow conflict card, then choose the correct copy. On localhost, progress is intentionally device-only. Use Export before clearing browser data.

### The app is offline

If a lesson was already open, continue—the event queue will retry when the connection returns. A cold offline launch shows Salita's offline page because authenticated HTML is deliberately not cached. Reconnect and tap **Try again**.

## Learning expectations

The referenced textbook estimates roughly 250 hours for simple everyday conversational ability. Salita's 258 core lessons are a structured foundation, not a truthful guarantee of full fluency by themselves. For durable B1+ ability, pair the course with regular Filipino listening, extensive reading, live conversation, corrective feedback, and later open-ended Fluency Lab work.
