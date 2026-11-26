# Salita learner guide

Salita is a gradual Tagalog (Filipino) course for English-speaking learners. The interface stays in English while the course steadily asks you to understand and produce more Filipino. It combines short lessons, cumulative recall, pronunciation coaching, spaced review, mistake repair, vocabulary games, streaks, and progress that follows your signed-in account.

## Sign in and keep one learning record

The hosted Salita site uses ChatGPT sign-in. Select **Continue with ChatGPT** if the access screen appears, then use the same ChatGPT account on desktop and iPhone.

- Salita does not create a separate password.
- Hosted progress is keyed to the authenticated account, not to the email text shown in the interface.
- The app saves checked answers locally first, then synchronizes them. A brief connection loss does not discard an open lesson.
- An ordinary `localhost` session uses device-only storage. Developers can deliberately enter the Sites local sign-in simulation, but only the authenticated published Site validates real account sync.
- If a browser already contains older device-only progress, Salita imports it automatically only when the signed-in cloud record is empty. If two nonempty histories could conflict, it asks you to **Keep account copy**, **Merge both**, or **Use device copy** and keeps a local backup first.

If another account says it has no access, the Site owner must include that account in the Site's access policy. Account sync cannot bypass the host's sign-in gate.

## Install Salita on iPhone

1. Open the published Salita link in **Safari** and sign in.
2. Tap Safari's **Share** button. With the Compact tab layout, tap **More (…)** and then **Share**.
3. Choose **Add to Home Screen**. If it is not visible, scroll the action list or choose **Edit Actions**.
4. Keep the name **Salita**, turn on **Open as Web App**, then tap **Add**.
5. Launch Salita from its Home Screen icon. It opens in a standalone app window.
6. When a speaking exercise first asks, allow microphone access.

These steps follow Apple's current [Add a website icon to your iPhone Home Screen](https://support.apple.com/en-nz/guide/iphone/iphea86e5236/ios) guide.

Use the same signed-in account on desktop and iPhone. Completed answers, lessons, XP, review schedules, mistakes, streak days, and minutes synchronize in both directions. Keep the first device open until the Progress screen says **saved**, then bring Salita to the foreground on the other device (or reload it) to fetch the latest account copy.

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

Salita plays bundled Tagalog audio directly from your tap. If a clip cannot play, the app can use an installed Filipino system voice.

If you hear nothing:

1. Check the device and browser-tab volume.
2. Tap the same audio control once more; iOS may pause a newly loaded audio request.
3. Use **Transcript** or **Hint** so the lesson remains usable.

## Adjust practice feedback

Short cues mark the start of practice, correct answers, successful voice checks, retries, and milestones. A softer success cue plays when you get an answer right with help or on another try. On compatible phones, these moments also have a light vibration. Go to **Progress → Practice feedback** to change these settings for this device. You can still play Tagalog examples and replay your recordings with sound effects turned off.

## Use Filipino and English microphone coaching

Speaking and Sound Lab exercises can check what your device hears. The first check downloads the Moonshine Tiny speech recognition model and its runtime, about 55 MB in total. Use Wi-Fi for the first check and wait for the result. Audio and transcripts stay in the tab.

### Filipino

1. Play the model.
2. Select **Check Tagalog** or **Check my Tagalog**.
3. Begin after the panel says **Listening…** and say the complete line.
4. Review the transcript and word match. When the complete line is heard, **Pronunciation feedback** compares the pace and sound of your recording with the lesson model. If a section stands out, play that section of both recordings. Otherwise, play the complete line side by side.

A transcript that matches the target can verify the words. Partial matches can receive supported-practice credit. A meaning-changing contrast such as `tayo/kami`, `kaliwa/kanan`, or `hindi/wala` cannot receive verified credit simply because the rest was close.

Use the written sound guide with the recordings for vowel clarity, syllable stress, glottal stops, and the tapped `r`. The comparison uses one reference voice and offers a place to practice. It cannot confirm individual speech sounds or stress placement. The comparison does not determine your lesson credit.

### Check stress on a single word

Open **Review → Syllable practice** and choose a word. The highlighted syllable is the target. Play the recorded model, tap **Check my stress**, and say the word once at your usual pace. Salita compares relative vowel timing. When another vowel clearly stands out, the drill names both the syllable it heard and the target for your next try. For **saan**, it also checks for an audible break between the two _a_ vowels. The drill may suggest another try when the timing is ambiguous. You can replay your last attempt from the card.

### English

**Check English** shows a transcript for optional practice. It does not score English pronunciation.

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

If another device still has unsynced work from before a reset or replacement, Salita keeps that work in an account-scoped local recovery record and asks whether to keep the account copy, merge both, or use the device copy. The choice survives a reload; Salita never restores stale work automatically over an intentional reset.

Never share a progress export casually; it contains learning history and review performance even though it contains no sign-in identifier.

The sync indicator can report:

- **saved** — the account copy includes all acknowledged events.
- **saving** — events are being uploaded.
- **offline** — events remain queued on this device.
- **attention** — another device reset or replaced the account generation; reload before adding more changes.
- **device-only** — hosted identity/database is not available, as expected in an ordinary localhost session outside the optional development sign-in simulation.

## Privacy and cost boundaries

Salita stores only learning progress needed for the course: XP, sessions, practice dates/minutes, completed unit and lesson IDs, review records, mistake states, and recent history. It does not place email addresses in the learning tables or exports; the displayed email comes from the current hosted request.

The microphone model is processed on the device. The hosted app serves the lesson clips and the inference runtime, and the browser downloads model files from the Moonshine model CDN. Voice-check audio and transcripts are discarded when the activity ends.

## Troubleshooting

### A different account cannot open Salita

Sign in to the intended ChatGPT account in a normal browser window. If the host still says you do not have access, the Site owner must update the Site access policy; the app cannot grant itself access.

### The microphone stays on permission or connection

Open the browser's site controls, set Microphone to Allow, reload, and try one current prompt. Allow time for the first model download. If the browser cannot finish, reload on Wi-Fi or use **Record only** to compare what you said.

### Salita hears the wrong Filipino word

Move closer, reduce background sound, wait for **Listening…**, and say one complete line. Replay the model slowly. If the transcript is incorrect, try the same line again.

### Progress seems missing

Confirm that the same ChatGPT account is signed in and that you are on the same published Salita hostname. After one device says **saved**, foreground or reload Salita on the other device. Check for a yellow conflict card, then choose the correct copy. Ordinary localhost sessions are intentionally device-only unless a developer entered the local sign-in simulation. Use Export before clearing browser data.

### The app is offline

If a lesson was already open, continue—the event queue will retry when the connection returns. A cold offline launch shows Salita's offline page because authenticated HTML is deliberately not cached. Reconnect and tap **Try again**.

## Learning expectations

The referenced textbook estimates roughly 250 hours for simple everyday conversational ability. Salita's 258 core lessons are a structured foundation, not a truthful guarantee of full fluency by themselves. For durable B1+ ability, pair the course with regular Filipino listening, extensive reading, live conversation, corrective feedback, and later open-ended Fluency Lab work.
