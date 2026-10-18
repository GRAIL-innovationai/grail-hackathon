# Margin

## Team

**Team name:** Margin
**Event:** Montana State 2026

Members are listed by their supplied GitHub usernames.

| Name | GitHub |
| --- | --- |
| Ahmadjajja | [@Ahmadjajja](https://github.com/Ahmadjajja) |
| recordship | [@recordship](https://github.com/recordship) |

## Summary

Margin is a whiteboard math tutor for students who need feedback while solving a problem, rather than only after submitting a final answer. Students type or handwrite a problem, confirm its reading, and work through their solution on a browser canvas. Margin combines AI handwriting recognition and tutoring with local SymPy checks for supported algebra and calculus, highlights the first questionable step, and offers a guiding hint. Corrected readings are checked again, and unchanged correct steps stay checked as the student continues. The prototype runs locally on a laptop and is accessible from a tablet on the same Wi-Fi.

**A tutor in your margin.** Write through a math problem on a whiteboard and receive feedback while you work. Margin looks for the first mistaken step, offers a short guiding question, and checks the corrected work without giving away the answer by default.

This is a local hackathon prototype built with **FastAPI, plain HTML/CSS/JavaScript, and SymPy**. The whiteboard runs in the browser; handwriting recognition and tutoring use a connected AI provider. Internet access is required for AI feedback.

## The experience

- Start in the separate **Problem** area. Handwriting is read automatically after a two-second pause. Review the reading in the right panel, correct it if needed, and confirm before solving. Typing and a manual retry are also available.
- Work in the plain **Solution** area below. Each writing region is one complete step, including tall fractions and division symbols. Regions grow to fit your writing; select **Next line** to start another step. Only solution work is checked against the confirmed problem.
- Type a step and press **Enter** for an immediate check. Supported typed algebra goes directly to SymPy, without waiting for an AI request.
- Draw with a stylus, finger, or mouse. Pause for two seconds to trigger a handwriting check; **Check work** is also available.
- Review what the tutor read. **Yes, that’s what I wrote** confirms a transcription and checks the mathematics again; it does not automatically mark the step correct. **Edit reading** fixes a transcription; **Edit step** changes a typed equation.
- See the first questionable line highlighted beside a Socratic hint. Ask for a stronger hint when needed.
- Correct, unchanged steps stay checked while you add work. Editing a step invalidates it and dependent later checks; changing the problem requires a fresh check.
- Erase or undo a mistake, rewrite it, and receive fresh feedback on the current board.
- Ask questions in the adjacent chat, which receives the problem and current board.
- Refresh without losing the current problem and board, when browser storage is available. Chat messages clear on refresh for a clean demo.

There is no application account system or database. Provider sign-in connects the tutor. Mistake memory, personalized practice, voice tutoring, and a class dashboard are future directions, not implemented features.

## How to run

Requirements: **Python 3.11+**, a modern browser, and internet access for the tutor. Node.js is optional and only needed for the board tests. There is no frontend build step.

From the hackathon repository root, enter the team folder and create a virtual environment:

```sh
cd submissions/montana-state-2026/margin
python -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Or on macOS/Linux:

```sh
source .venv/bin/activate
```

Install and start:

```sh
python -m pip install -r requirements.txt
python run.py
```

Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** on the computer running the server. Keep the terminal open. `run.py` prints local network addresses for a tablet and loads `.python-packages` when that optional local dependency folder exists.

On Windows, `./start.ps1` is a convenience launcher. It prefers the project's virtual environment, then an available bundled Codex Python runtime, then ordinary Python. Dependencies must already be installed.

The equivalent direct server command, after installing dependencies in the active environment, is:

```sh
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log
```

Keep port **8000** for ChatGPT sign-in: its callback is configured as `http://127.0.0.1:8000/auth/callback`. The launcher disables access logs so temporary sign-in codes do not appear in routine URL logs.

## Connect ChatGPT first

1. Open Margin on the host computer at `http://127.0.0.1:8000`.
2. Choose **Connect your tutor**, then **Continue with ChatGPT**.
3. Complete the provider's sign-in and consent flow, allowing ChatGPT plan usage if offered.
4. Return to Margin and check the connection. Write a short step to confirm a real tutor response before presenting.

The app implements OpenAI's dynamic OAuth flow for locally hosted apps: a saved host identifier, PKCE, state and nonce checks, ID-token validation, token refresh, model discovery, and streamed Responses requests. Plan access depends on the account and granted permissions; a connected identity alone is not a guarantee that inference will succeed. See the official [ChatGPT plan usage documentation](https://developers.openai.com/siwc/token-sharing-open-source).

This route requests permission to use the ChatGPT plan. It does not treat a token count displayed elsewhere as an ordinary API credit balance, and it does not request access to existing ChatGPT conversations.

Connection credentials stay on the server in `.local/chatgpt-auth.json`, which is excluded from Git. They are not sent to the browser. The app applies local folder/file permissions to that storage.

### Optional Gemini fallback

If ChatGPT plan usage is unavailable, Gemini is the implemented API-key fallback. Create a `.env` file from `.env.example` if one does not already exist, then configure:

```dotenv
LLM_API_KEY=your_gemini_api_key
LLM_MODEL=gemini-flash-latest
```

Use a Gemini model available to your key; `LLM_MODEL` can be changed accordingly. See Google's [Gemini API-key guide](https://ai.google.dev/gemini-api/docs/api-key). The `.env` file is ignored by Git and read by the server. Never put a key in a board step or tutor chat.

ChatGPT takes priority while an account is connected. **A failed ChatGPT request is not silently retried using a paid API key.** Configured Gemini credentials are used when there is no active ChatGPT connection. API usage is subject to that provider's quota and billing.

## Use a tablet

Start the server and finish ChatGPT sign-in on the laptop first. On a tablet connected to the same Wi-Fi, open one of the `Same Wi-Fi` addresses printed by `python run.py`, such as `http://192.168.1.25:8000`.

The server listens on `0.0.0.0:8000` so other devices on the local network can reach it. Use a trusted network: these devices share the host server's active tutor connection. The board itself is saved separately in each browser; the app does not synchronize strokes between devices.

If the tablet cannot connect, check that both devices are on the same network and that the host firewall permits the server on the private network. ChatGPT sign-in and connection management must be performed on the host computer, because OAuth returns to its loopback address.

## How a check works

1. **Capture:** each explicit solution row has a stable ID, content fingerprint, and normalized bounding box. All strokes in a row stay together even when numerator, denominator, or division dots are vertically separated. Export preserves the displayed aspect ratio so handwriting is not stretched before recognition.
2. **Read only when needed:** typed rows and corrected transcriptions skip image recognition. Each handwritten row is sent as its own padded image, so recognition cannot copy neighboring steps into that row. Unchanged, confidently read rows can reuse a bounded in-memory cache. A reading containing multiple equations requires correction rather than receiving an AI verdict. This cache is temporary request optimization, not student mistake memory.
3. **Verify locally:** SymPy checks supported algebraic transitions against the original problem and preceding line. A handwritten transcription must have confidence of at least **0.8** before it enters symbolic verification. Supported typed algebra needs no model call. A bounded in-memory cache reuses the already correct, unchanged prefix; edits invalidate dependent checks. Local hints point to distribution, signs, domains, or equivalent operations.
4. **Review broader math:** unsupported steps receive contextual AI review, with a **0.8** confidence minimum. Unclear work is uncertain, never automatically wrong. After the earliest error or uncertainty, dependent rows wait for clarification.
5. **Display:** the frontend uses its own row boxes to position highlights, shows the recognized text, and lets the student correct it. Verification labels identify which steps received symbolic checking or AI review, including any still awaiting verification. One board check runs at a time; older responses cannot overwrite newer work. Tutor chat uses the current problem and board.

ChatGPT defaults to `gpt-6-luna` with reasoning `none` for a faster reading pass. Optional `.env` settings `CHATGPT_MODEL` and `CHATGPT_REASONING` change that choice. Uncached handwritten rows are read in separate sequential requests; latency depends on the provider and number of changed rows. Handwriting checks also include the two-second drawing pause. Verify with your actual device and handwriting before presenting.

The three typed stages of the sample algebra demo returned from the local endpoint in **43–130 ms** in a live test, with no AI calls. End-to-end browser checks covered Enter-to-add, editing the mistaken step, clearing its underline, completing the solution, mouse-drawn recognition, and correcting the recognized text while preserving the ink.

The verifier compares real solution sets for supported single-variable equations, so a valid alternate path such as `2(x - 3) = 10` → `x - 3 = 5` is accepted. It also checks rational domain restrictions, basic simplification, and selected derivatives. Input goes through a bounded arithmetic grammar, not Python evaluation.

**Verification is deliberately limited.** Inequalities, geometry, many domain-sensitive expressions, multivariable work, and unsupported notation return `unknown` from SymPy. AI can review broader math in context, but the app is not a general proof checker and its feedback can be wrong. Legibility confidence is model-reported, not a guarantee of transcription accuracy.

## Project map

| File | Role |
| --- | --- |
| `static/index.html`, `static/styles.css` | Whiteboard and tutor interface |
| `static/board.js`, `static/solution-board.js` | Drawing, growing solution rows, erasing, history, image export |
| `static/app.js` | Pause detection, requests, revision checks, chat, browser persistence |
| `main.py` | FastAPI routes, request validation, confidence gates, feedback combination |
| `llm.py` | Provider requests, handwriting reader, coach, tutor chat |
| `auth.py` | ChatGPT OAuth and local credential storage |
| `verifier.py` | Conservative SymPy verification |
| `run.py`, `start.ps1` | Local launchers |
| `tests/` | Math, backend, and board regression checks |

`GET /api/status` reports the configured connection and SymPy availability. `POST /api/read-problem` transcribes the separate problem canvas without solving it; the student confirms or edits that transcription. `POST /api/analyze` checks the solution board against the confirmed problem; `POST /api/chat` answers with that context. The server does not save board images to disk. The browser stores the current problem and solution locally; conversation messages stay in page memory and clear on refresh. AI requests send the relevant problem or solution image to the active provider.

## Tests and demonstration

With Python dependencies installed:

```sh
python -m unittest discover -s tests -p "test_*.py" -v
```

For the optional browser-independent board checks, use Node.js 24 (the tested version):

```sh
node --test tests/board.test.mjs tests/solution-board.test.mjs
```

These tests cover symbolic mistakes and corrections, valid alternate paths, confidence handling, and row grouping. Passing them does not establish that a particular provider account can complete live inference. Verify that separately before the demo.

See **[docs/DEMO.md](docs/DEMO.md)** for the rehearsal sequence and exact sample problem.

## License

This submission uses the repository's [MIT license](../../../LICENSE).
