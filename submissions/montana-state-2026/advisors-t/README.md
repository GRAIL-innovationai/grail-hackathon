# Campus Advisor

## Team

**Team name:** Advisors T

| Name | GitHub |
|---|---|
| Kearney Adams | — |
| Sebas | @sebaschambaj05-hub |

## Summary

Campus Advisor is an AI advising agent for new and international students at Montana universities. A student first picks their university (Montana State University, MSU Billings, Montana Tech or University of Montana), then the agent matches them to majors with evidence, reads an uploaded transcript to suggest their first classes, drafts a meeting email to the right academic advisor, and prepares them for career fairs with an elevator pitch, in English, Spanish, Portuguese, French or Chinese. Every fact comes from each university's official catalog, with sources and the date checked, and the agent says "not available in the catalog yet" instead of inventing courses, advisors or events. It matters because new students, especially international ones, often pick majors and classes with little guidance before they ever meet an advisor.

## How to run

Needs Python 3.11+ and an Anthropic API key (https://console.anthropic.com).

```bash
pip install -r requirements.txt
cp .env.example .env            # then paste your key after ANTHROPIC_API_KEY=
python -m uvicorn main:app --host 127.0.0.1 --port 8000
# open http://127.0.0.1:8000, choose a university, create an account and chat
```

On Windows you can instead double-click `START.bat`, which does all of this for you.

A chat web app for new Montana State University students: major matching, transcript upload for a first-semester plan, advisor emails and career fair prep, in English, Spanish, Portuguese, French or Chinese.

### Windows

1. Install Python 3.11 or newer from https://www.python.org/downloads/ and check **"Add python.exe to PATH"** during setup.
2. Double-click **`START.bat`**. The first time, it opens a `.env` file: paste your Anthropic API key after `ANTHROPIC_API_KEY=`, save, close Notepad.
3. Double-click **`START.bat`** again. It installs what it needs (first time only, about a minute), starts the server and opens http://127.0.0.1:8000 in your browser.
4. Keep the black window open while you use the app. Close it to stop.

### Mac/Linux

Run `./start.sh` instead (same steps).

Opening `static/index.html` directly won't work: the page needs the server for sign-in, saved chats and Claude. Always start it with `START.bat`.

What stays on your computer: `.env` (your API key and the sign-in secret, created on first run), `campus_advisor.db` (accounts and saved conversations) and `.venv` (Python packages). Don't share `.env`.

## Universities

Each folder in `universities/` is one university on the picker: `msu-bozeman`, `um-missoula`, `montana-tech`, `msu-billings`. Each `catalog.json` has the majors, credit system, advisors, career events, career resources and brand colors, with sources checked on 2026-10-17. To add a university, add a folder with a `catalog.json` in the same shape (the `id` must match the folder name) and restart.

## Endpoints

| Route | Auth | What it does |
|---|---|---|
| `POST /api/auth/register` | — | JSON `{email, password}` → 201. 409 if the email exists. Password: 8+ characters with a letter and a number |
| `POST /api/auth/token` | — | OAuth2 form `username` (email) + `password` → `{access_token, token_type, expires_in}`. 8 failed tries per IP+email in 15 min → 429 |
| `GET /api/auth/me` | Bearer | `{id, email, created_at}` |
| `GET /api/sessions` | Bearer | The user's saved conversations, newest first (no messages) |
| `POST /api/sessions` | Bearer | `{id?, university_id, messages[], title?}`: no `id` creates (201), with `id` updates. Title comes from the first student message |
| `GET /api/sessions/{id}` | Bearer | One conversation with its messages. 404 if it isn't yours |
| `DELETE /api/sessions/{id}` | Bearer | Deletes one conversation (204) |
| `GET /api/universities` | — | The universities on the picker (name, campus, colors, majors) |
| `POST /api/chat` | Bearer | `{university_id, messages, language?, transcript?}` → `{reply, truncated}` |
| `POST /api/transcript` | Bearer | multipart `file` (PDF, JPG/PNG/WebP, .txt; max 10 MB) → `{transcript}`. The file is not stored |
| `GET /api/health` | — | `{status, model}` |

Chat and transcript need an account, so your API key can't be used by anyone on the internet.

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI server; caches the system prompt, adds today's date, language and transcript per request |
| `static/index.html` | Chat page with transcript upload and language picker |
| `static/main.css` | Theme variables (`--primary-color`, `--accent-color`, `--bg-color`, `--card-bg`, `--text-color`), light and dark |
| `static/main.js` | Chat, transcript upload, Markdown, email Copy button, `updateUniversityTheme()` |
| `agent-prompt.md`, `skills/` | The agent: prompt template (filled with the chosen university) and 6 skills |
| `universities/*/catalog.json` | One data file per university |
| `START.bat`, `start.sh`, `.env.example` | One-click start and settings |
| `docs/` | Project notes and test profiles |
| `claude-page/` | Source of the Claude-hosted student page (runs only inside Claude) |

## University theming
The student picks a university first (step 1). Its brand colors from `catalog.json` theme the whole page, and the header shows its name with a "Change university" link. Saved conversations remember their university.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model ID. Check docs.claude.com for current IDs |
| `MAX_TOKENS` | `1500` | Longest reply |
| `JWT_SECRET` | random per start | Key that signs login tokens. Set it in production |
| `ACCESS_TOKEN_MINUTES` | `1440` | How long a sign-in lasts (24 hours) |
| `DATABASE_URL` | `sqlite:///campus_advisor.db` | Any SQLAlchemy URL (e.g. PostgreSQL later) |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:8000,http://localhost:8000` | Only needed if the page is hosted on another domain |

## Before launch
- Native-speaker review of the Portuguese, French and Chinese terms.
- Update `events` in catalog.json when the spring 2027 career fair date is announced.
- Host with HTTPS only (tokens travel in headers).
- Tokens are in `localStorage`, as requested. Any XSS bug could read them: replies are escaped before display, but for a public launch consider an httpOnly cookie instead.
- Add password reset and email verification (not included).
- The login rate limit is in memory: use Redis if you run more than one server process.
- Back up `campus_advisor.db`: it holds students' conversations.
