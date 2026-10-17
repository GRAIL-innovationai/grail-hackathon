# Margin demo rehearsal

The demo's learning moment is simple: a student makes a sign mistake, the tutor flags it, and the student corrects the work.

Use one short, rehearsed problem. Feedback is calculated from the actual current work, not scripted green/red outcomes. Typed algebra uses local verification, so the central mistake-and-correction sequence does not depend on a live AI response.

## Before presenting

1. Start `python run.py` and leave the terminal running.
2. Connect ChatGPT from `http://127.0.0.1:8000` on the host laptop. Complete an actual board check; a sign-in indicator alone is insufficient.
3. If using a tablet, open the printed local network address on the same Wi-Fi. Test with the actual stylus or finger you will use.
4. Choose **New problem**. Type `Solve x + 2 = 5` and review it, or handwrite it and pause for two seconds. Confirm or correct the reading before starting the solution.
5. For the most reliable stage demo, use **Type a step** and press Enter after each equation. For handwriting, use **Next line** when starting another step. Allow the two-second pause plus image-reading time; **Check work** also controls presentation timing.
6. Run the complete mistake-and-correction sequence once. Confirm the incorrect highlight disappears after correction. A backup recording, if made, should show a real rehearsal and be identified as a recording.

## The 90-second story

**Opening:** “Margin is a tutor beside your scratch work. It helps when a mistake happens, while you are still thinking through the problem.”

Show the separate problem area and confirm the statement on the right. Explain: “First, we make sure the tutor understood my question. Then it only checks the work I write in the solution area.”

In the **Solution** area, type these two rows, pressing Enter after each (or handwrite them if you have rehearsed successfully on the actual device):

```text
x + 2 = 5
x = 7
```

**Explain the mistake:** “I added two instead of subtracting it.”

Wait for the second line to be flagged. Read the hint. Supported algebra uses a local mathematical check; AI handles handwriting recognition, broader reasoning, and tutor chat.

**Show the learning moment:** “The tutor points me back to my operation. I still have to fix it.”

Choose **Edit step** beside the incorrect typed reading and change it to `x = 3`. For handwriting, erase the incorrect answer and rewrite it:

```text
x + 2 = 5
x = 3
```

Pause after the correction so the audience can see the warning clear. Leave the original problem row on the board and keep only the corrected second row; do not leave the old incorrect equation elsewhere on the canvas.

Ask in chat: **“Why do I subtract two from both sides?”** This is a live AI request using the current problem and board.

**Close:** “The key is feedback during the process: identify the first mistake, help the student understand it, and let them finish the reasoning.”

## Keep the claims precise

- The browser sends one handwriting check after a writing pause; it does not stream every pen movement to the model. Enter submits a typed step immediately.
- SymPy checks supported algebra and selected calculus steps. Typed algebra avoids a model call; AI reads new handwriting, reviews broader math, and answers tutor questions.
- Unsupported math and unclear handwriting require contextual review. Neither the AI nor the prototype guarantees correctness for every problem.
- The webpage and server run locally. AI requests still require an internet connection and use the selected provider.
- Future ideas include mistake memory, personalized practice, voice, course materials, and a class dashboard. Those are discussion points, not today's features.

## Recover without losing the demo

| Situation | Action |
| --- | --- |
| The problem was misread | Correct the editable problem text in the right panel before confirming. Recognition does not start solution checking automatically. |
| Handwriting is uncertain | If the shown text matches your writing, select **Yes, that’s what I wrote** to recheck it. Otherwise use **Edit reading** to correct it. Confirming a reading does not declare the mathematics correct. |
| Old chat distracts from the demo | Refresh the page. Chat clears, while the problem and solution remain saved in this browser. |
| A response is taking time | The button shows elapsed checking time. Keep the board still, then use **Check work** after the current request finishes. Avoid repeatedly clicking. |
| The wrong line still appears on the board | Fully erase it or undo it before rewriting. Feedback evaluates all visible rows. |
| The provider connection fails | Open connection settings on the host laptop. Use the explicitly configured Gemini fallback only if needed; do not present prerecorded or typed feedback as live AI. |
| The tablet cannot reach the app | Use the laptop while checking Wi-Fi/firewall settings. Board state is browser-local and does not automatically move between devices. |

Finish the rehearsal by starting a fresh problem so the live demonstration begins with an empty board.
