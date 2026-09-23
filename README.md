# GRAIL Hackathon Submissions

Projects built at GRAIL hackathons. Each team submits its full source code as a pull request into its own folder under `submissions/<event>/<team-slug>/`.

## Events

| Event | Folder |
|---|---|
| UMN 2026 | [submissions/umn-2026](submissions/umn-2026/) |

## How to submit

1. Fork this repo and create a branch.
2. Create `submissions/<event>/<your-team-slug>/` (lowercase letters, digits and hyphens, e.g. `team-rocket`) and copy your project's code into it. Leave out `node_modules/`, virtualenvs, `.env` files, private keys, and any file over 10 MB. The folder must stay under 50 MB.
3. Add a `README.md` based on [the template](submissions/_template/README.md) with the **Team**, **Summary**, **Demo** and **How to run** sections.
4. Run `python3 scripts/validate_submission.py submissions/<event>/<your-team-slug>` and fix any errors.
5. Open a pull request to `main`. One pull request per team.

New to git? [CONTRIBUTING.md](CONTRIBUTING.md) walks through every command.

## Submitting with an AI agent

If you use an AI coding agent (Claude Code, Codex, Cursor, …), open it in your project folder and paste:

> Read https://raw.githubusercontent.com/GRAIL-innovationai/grail-hackathon/main/skills/grail-hackathon-submit/SKILL.md and follow it to submit this project to the GRAIL hackathon.

The agent asks for your team details, confirms with you before publishing anything, and opens the pull request.

Claude Code users can also install it as a skill, then ask Claude to submit the project:

```bash
mkdir -p ~/.claude/skills/grail-hackathon-submit && curl -fsSL https://raw.githubusercontent.com/GRAIL-innovationai/grail-hackathon/main/skills/grail-hackathon-submit/SKILL.md -o ~/.claude/skills/grail-hackathon-submit/SKILL.md
```

## Rules

- **Submissions are public.** Code is MIT-licensed (see [LICENSE](LICENSE)) unless your team folder contains its own `LICENSE` file.
- Your pull request may only change files inside your team folder.
- Each event sets its own deadline. Organizers check when your last push reached GitHub.
- Questions? [Open an issue](https://github.com/GRAIL-innovationai/grail-hackathon/issues).
