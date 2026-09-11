# Salita learner guide

Salita is a daily Tagalog (Filipino) course built around useful conversations. Each unit combines sound practice, listening, reading, grammar, sentence building, and speaking. This guide explains how to use the course, what its voice tools can and cannot evaluate, and how your progress is handled.

## Get access

When you open the hosted Salita site, you may first see **Sign in required** and **You’re almost in**. Select **Continue with ChatGPT**, then complete the ChatGPT sign-in flow.

- Salita does not have a separate username, password, or account page.
- ChatGPT sign-in controls access to the hosted site. It does not sync Salita progress between browsers or devices.
- The round profile button in Salita opens **Progress**; it is not an account-management menu.
- If the sign-in page keeps returning, open the Salita link directly in a normal browser window, confirm that you are signed in to the intended ChatGPT account, and allow the browser cookies needed for sign-in. If access is still denied, contact the person who shared the site.

The access screen links to [OpenAI’s Privacy Policy](https://openai.com/policies/privacy-policy).

## Find your way around

On a wide screen, the main navigation is in the header. On a phone, it is at the bottom.

| Area         | What it is for                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------- |
| **Today**    | Your **Daily path**, active unit, 10-minute goal, current streak, and Azure speech status       |
| **Learn**    | All eight units; you may choose any unit, including one you have already practiced              |
| **Review**   | Skills that are due for spaced review                                                           |
| **Progress** | Streaks, sessions, XP, practice calendar, skill strength, first-try accuracy, export, and reset |

The flame count and the round profile button in the header also open **Progress**. The Salita logo returns to **Today**.

## Complete the daily path

1. Open **Today**.
2. In the large **Everyday conversation** card, select **Start lesson**. After you have finished any session, this button reads **Continue lesson**. Despite that label, it starts the active unit again at **Sound lab**; Salita does not save your place inside an unfinished lesson.
3. Work through each activity. Select an answer, then select **Check answer**.
4. Read the feedback and select **Continue**.
5. Continue until you reach **Lesson complete**. From there, select **Back home** or **Next unit** when another unit remains.

The **Makinig**, **Magsalita**, and **Magbasa** cards on **Today** all start the same active unit. To choose a different unit, open **Learn** and select **Start unit** or **Practice again**. Choosing a unit makes it the active unit immediately, even if you exit before finishing it.

To log a finished session, a practice day, and a unit completion, continue through the **Lesson complete** screen. If you select **Exit lesson** before the end, answers you already checked may still have updated XP and review records, but Salita does not log the session or streak day as complete. Starting again creates a new activity queue; your unchecked position and any local recording are lost.

The **Day N · Daily path** number counts distinct dates on which you completed practice. It is not your unit number or current streak.

## What is inside a lesson

A standard unit contains 11 core activities. A missed item returns later in the same session as **Try again** and may be marked **Worth another look**, so the final activity count can grow.

| Lesson label         | What you do                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **Sound lab**        | Study a sound model, syllables, and stress; listen, record, or run an optional Tagalog voice check |
| **Listen**           | Play a phrase and choose its meaning                                                               |
| **Read**             | Read a Tagalog phrase and choose its meaning                                                       |
| **Grammar workshop** | Learn a working sentence frame and answer a form check                                             |
| **Pattern swap**     | Change one meaningful part of a sentence frame                                                     |
| **Build it**         | Select word tiles in a natural order                                                               |
| **Listen closely**   | Listen to another phrase and choose its meaning                                                    |
| **In context**       | Choose what fits a situation and social register                                                   |
| **Speak**            | Practice the Tagalog phrase, with optional Tagalog and English voice coaching                      |
| **Conversation**     | Choose the reply that keeps a short exchange going                                                 |
| **Mini reading**     | Read a short passage and answer for meaning                                                        |

Labels such as **neutral**, **polite**, **casual**, **formal**, and **Taglish** show where an expression fits. Select **Hint** when you need the model, a note, a transcript, or English support. A hint, retry, typed fallback, or self-assessed completion is recorded as supported practice rather than a first-try answer.

## Hear Tagalog words and phrases

Underlined Tagalog words are audio buttons. Select any underlined word to hear it; in **Build it**, selecting a word tile also plays that word. For a complete model, use the speaker button or **Hear model**. Use **Hear slowly** or **Slow** when you want more separation between sounds.

Salita first requests its configured Filipino neural voice. If that service is unavailable, it tries a Filipino voice installed in your browser or operating system. If neither can play:

- In a listening activity, select **Transcript** or **Hint** to reveal the text. Salita may reveal the transcript automatically after an audio failure.
- In other activities, use the visible Tagalog text and **Hint**.
- If the status says **Audio is ready. Tap the word or phrase once more to play it.**, select the same control again. Browsers sometimes require a second user action before allowing sound.

Check the tab and device volume if the play status changes but you hear nothing. Headphones can make the sound contrasts easier to compare.

## Use the Sound Lab

**Sound lab** is the first activity in each standard lesson. It combines a short explanation with a model phrase and a **Syllable + stress guide**.

1. Select an underlined word, **Hear model**, or **Hear slowly**.
2. Say the model aloud several times.
3. Choose one of the optional practice tools:
   - **Record myself** records only in the current browser tab. Select **Stop recording**, then **Compare my recording** to play your clip. Select **Hear model** separately to compare the two.
   - **Check my Tagalog** sends a live microphone attempt to Azure Speech and reports what words were understood.
4. Choose the activity’s answer and select **Check answer**. The Sound Lab voice check is coaching; it does not replace the answer choice.

The Filipino result is labeled **Filipino speech match**. It may report **Words understood clearly**, **Understood—refine one part**, **Try one part again**, or **Nothing was scored**, along with what Azure heard and, when available, a word-match percentage.

This is not an accent score. Salita’s Filipino check compares recognized words and meaning-bearing contrasts. It does not grade a native accent, stress, glottal stops, a tapped _r_, or fine vowel quality. Use the model, your local recording, and the written sound guide for those details.

## Practice the Speak activity

The **Speak** activity offers several tools in one place:

- **Hear model** and **Hear slowly** play the Tagalog target.
- **Check Tagalog** runs the Filipino speech match.
- **Check English** gives optional English pronunciation coaching for the English meaning shown on the card.
- **Record only** makes a private clip for your own comparison.

### Tagalog microphone check

Select **Check Tagalog**, allow microphone access, and say the complete Tagalog phrase naturally. Begin speaking when the panel says **Listening…**. Salita stops after the phrase and shows the best scored result from your attempts; if a later attempt is weaker, the stronger earlier result can still count. Starting any voice check stops model playback and discards a current **Record myself** or **Record only** clip, so replay it first if you still want to hear it.

When the result is understood, **Check answer** becomes available. A result of **Try one part again** does not count against you; listen to the model and try again, or use an accessible fallback.

### English pronunciation coaching

Select **Check English** and say the English line displayed under the Tagalog phrase. When Azure returns enough acoustic information, Salita may show **Overall**, **Accuracy**, **Fluency**, and **Complete** scores plus one word to retry with its accuracy score. The flagged word is not an audio button.

These numbers are coaching signals for that attempt, not a certification or a judgment of your accent. If Azure recognizes words but does not return enough acoustic evidence, Salita shows **Nothing was scored**. English coaching is optional and does not complete the Tagalog speaking step; use **Check Tagalog** or a Tagalog fallback before selecting **Check answer**.

## Continue without a microphone

A microphone or Azure connection is never required to finish a lesson.

- Select **I can’t use a microphone—show the accessible fallback** to reveal **Accessible typed fallback** immediately.
- The typed fallback also appears after a microphone or service error, or after two Tagalog voice-check attempts.
- Type the displayed Tagalog phrase, then select **Check answer**.
- You may instead practice aloud and select **I practiced aloud—mark this complete** when that option appears.

Fallback completion earns practice credit, not a verified speaking result. It can still complete the lesson and protect your streak.

If audio is unavailable, every essential activity still has text support through the visible prompt, **Transcript**, or **Hint**. Keyboard users can move through controls with Tab and Shift+Tab and activate focused buttons with Enter or Space.

## Understand streaks, XP, and progress

### Streaks and the daily goal

- Finishing either a lesson or a due-review session records one practice day.
- Multiple completed sessions on the same date still count as one streak day.
- A current streak can end today or yesterday, so it remains visible before you practice today. Missing a full calendar day resets the current streak but not the best streak.
- The **Daily goal** is 10 minutes. Salita adds the elapsed time of completed sessions to today’s total; the goal estimate shown on a unit card may be different.

### XP and first tries

A correct first try on a skill that is currently due earns 10 XP. A correct answer with a hint, retry, typed fallback, or self-assessment earns 5 XP. A first-attempt **Words understood clearly** Tagalog result can receive first-try credit; **Understood—refine one part** and a clear result first reached on a later voice attempt count as supported practice. A wrong answer earns no XP. Practicing a review before its due date does not move its schedule forward or add XP for that item. If an audio failure automatically opens a listening transcript, that response is also treated as hint-supported.

The **First tries, last 30 sessions** percentage counts only unsupported first-try answers. It does not rise because you eventually corrected an answer after a retry.

### Spaced Review

Open **Review** to see what is **due now**. Pronunciation, grammar, reading, listening, and speaking have separate schedules, so recognizing a phrase in one mode does not mark every ability strong.

Each review card shows its skill and a stage from 0 to 6. A clean first try advances the stage; a supported or retry-correct answer holds it; a miss lowers it by one stage and keeps it due. As a stage rises, successful reviews are scheduled farther apart. Review shows up to eight due cards at a time; selecting one starts up to ten due activities from that card’s unit, not only the selected card. A review ends at **Review complete** with **Back home**.

When nothing is due, Review shows **You’re caught up** or **Your review deck is ready to grow**. You can return to **Today** without advancing future reviews early.

### Progress screen

Open **Progress** to find:

- **Current streak**, **Best streak**, **Sessions**, and **Total XP**
- A **Practice calendar** for the last five weeks
- Separate strength bars for **Listening**, **Reading**, **Speaking**, **Grammar**, and **Sound & stress**
- **First tries, last 30 sessions**
- **Export progress** and **Reset** under **Stored on this device**

**Sound & stress** strength comes from the spaced-review records created by Sound Lab pronunciation activities. It is not an automated accent or native-pronunciation rating.

## Your data and privacy

### Learning progress

Salita stores progress in this browser’s local site storage. It is not attached to your ChatGPT account and does not automatically follow you to another browser, browser profile, device, or private/incognito session.

- Select **Progress** > **Export progress** to download a JSON copy of the progress currently stored here. The app does not currently provide an **Import** command.
- **Reset** clears Salita progress in this browser after you confirm **Reset all Salita progress on this device? This cannot be undone.**
- Clearing this site’s browser data can also remove progress. Do not rely on a private/incognito window for lasting progress.
- An exported progress file contains learning history and review data. Store or share it as you would other personal records.

If Salita reports **Progress is available for this visit, but this browser is currently blocking local storage.**, you may continue, but the current progress may not survive a reload or closed tab. Use a normal browser window and allow site storage before continuing.

### Voice and audio

The three voice paths handle data differently:

| Tool                                                         | What happens                                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hear model**, **Hear slowly**, and underlined words        | Salita requests audio for fixed curriculum text from Azure Speech; it may fall back to a Filipino device voice                                      |
| **Record myself** / **Record only**                          | The recording stays in the current tab for playback and is discarded when it is replaced, the activity changes, or the tab closes                   |
| **Check my Tagalog** / **Check Tagalog** / **Check English** | The browser streams live microphone audio to Azure Speech for transcription or coaching; Salita does not retain the voice-check audio or transcript |

Salita’s server keeps the Azure resource key server-side and gives the browser a short-lived authorization token for a voice check. This guide describes Salita’s app-level storage behavior; the hosting, sign-in, browser, and Azure services remain subject to their own privacy terms, including the [Microsoft Privacy Statement](https://privacy.microsoft.com/en-us/privacystatement).

## Troubleshoot access, audio, microphone, and progress

### The hosted site will not open

1. Open the Salita link directly, rather than inside an embedded preview.
2. On the **You’re almost in** page, select **Continue with ChatGPT**.
3. Confirm that the intended ChatGPT account is signed in, then reload the site.
4. If the sign-in loop continues, allow cookies for the site or try a normal browser window. Contact the site owner if your account still cannot access it.

### Tagalog audio does not play

1. Confirm that the browser tab and device are not muted.
2. Select the speaker, word, or phrase again; the browser may have blocked the first automatic play attempt.
3. Open **Today** and check the **Azure speech** card:
   - **Checking** means the setup check has not finished.
   - **Configured** means the key and region are present; it does not guarantee that Azure is currently reachable or within quota.
   - **Setup needed** means Azure-backed audio and microphone coaching are not configured for this deployment.
4. Use **Transcript** or **Hint**. If your device has a Filipino system voice, Salita tries it automatically when cloud playback fails.
5. If rapid playback requests fail, wait a minute and try one model phrase again.

### The microphone is blocked or never starts

1. Select the site-controls or lock icon beside the browser address bar.
2. Open **Site settings** or **Permissions**, set **Microphone** to **Allow**, and reload Salita.
3. Also check the operating system’s privacy settings and allow your browser to use the microphone.
4. Make sure the intended input device is connected and selected.
5. Close meeting, recording, or dictation apps that may already be using the microphone.
6. Try the voice check again in a current browser. If the browser cannot open a microphone here, use the accessible fallback.

### Azure connects but does not score the phrase

- Begin speaking promptly after **Listening…** appears and say one complete phrase.
- Move closer to the microphone, reduce background noise, and avoid playing the model through speakers while recording.
- If you see a connection or no-complete-phrase timeout, try once more.
- If you see **Please wait a moment before starting another voice check.**, stop restarting the check and wait before trying again.
- **Nothing was scored** and service failures do not count as a failed voice result. Use **Record only**, **Record myself**, the typed fallback, or **I practiced aloud—mark this complete**.

### Progress is missing

- Return to the same browser, browser profile, and device where you practiced.
- Leave private/incognito mode and allow local site storage.
- Check whether browser cleanup, a privacy extension, or a cleared site-data setting removed Salita storage.
- ChatGPT sign-in does not restore local Salita progress, and an exported JSON file cannot currently be imported in the app.

## Azure Free (F0) quota behavior

The **Azure speech** card reports whether speech credentials are configured; it does not show the Azure pricing tier, remaining allowance, or live service health. Some Salita deployments may use Azure’s Free (F0) tier, which is a shared resource controlled by the site owner.

As of September 2026, Microsoft documents these relevant F0 limits:

- F0 monthly speech-to-text and text-to-speech allowances are fixed and are not adjustable.
- Real-time speech recognition allows one concurrent request per F0 resource.
- Standard text-to-speech voices allow 20 transactions per 60 seconds on F0.

See Microsoft’s current [Azure Speech quotas and limits](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) and linked pricing page for the source of truth; Microsoft can change these limits.

When the shared allowance is exhausted, several learners use voice checks at once, Azure throttles a voice, or the service has a temporary capacity problem, Salita may show only a general audio or speech-service failure. It does not reliably distinguish F0 exhaustion from every other Azure failure and has no learner-visible quota meter.

If that happens:

1. Wait and try a single request later. Repeatedly selecting the control can trigger another short rate limit.
2. For playback, use the automatic device voice when available, or open **Transcript** or **Hint**.
3. For speaking, use **Record only** or **Record myself** for local comparison, or use the typed/self-assessed fallback.
4. Continue the non-voice parts of the lesson. An Azure or microphone failure does not prevent you from completing the lesson and maintaining your streak through a fallback.
5. If Azure-backed features remain unavailable, notify the site owner. Only the owner can inspect the shared Azure usage, wait for an allowance renewal, or change the service tier.
