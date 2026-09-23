---
name: grail-hackathon-submit
description: Submit or update a team's project in the GRAIL hackathon repo (GRAIL-innovationai/grail-hackathon) as a pull request. Use when the user asks to submit, hand in, or update their GRAIL hackathon project.
---

# Submit a project to the GRAIL hackathon

You are helping a hackathon team submit their project to https://github.com/GRAIL-innovationai/grail-hackathon. A submission is a pull request that adds the team's full source code to `submissions/<event>/<team-slug>/`, with a `README.md` that has four required sections. Work through the steps in order. Commands assume a bash-compatible shell (on Windows, Git Bash).

## Rules

- Get an explicit "yes" from the user in Step 2 before you fork, push, or open a pull request.
- Only create or change files inside `submissions/<event>/<team-slug>/`. Never edit other teams' folders, files at the repo root, `.github/`, or `scripts/`.
- Never force-push. Never commit secrets.
- If a step fails and you can't fix it, stop and tell the user what failed and why.
- Your shell may not keep variables or the working directory between commands. In every command, `cd` to the right directory and set the variables it uses (`EVENT`, `SLUG`, `TEAM_NAME`, `PROJECT_DIR`, `DEST`, `GH_USER`), or substitute literal values. `PROJECT_DIR` must be an absolute path.

## Step 1: Gather the details

List the events open for submissions:

```bash
gh api repos/GRAIL-innovationai/grail-hackathon/contents/submissions \
  --jq '.[] | select(.type == "dir" and (.name | startswith("_") | not)) | .name'
```

Without `gh`, run `curl -s https://api.github.com/repos/GRAIL-innovationai/grail-hackathon/contents/submissions` and take the `name` of each entry with `"type": "dir"`, skipping `_template`.

Collect the following. Work out what you can from the project, ask the user for the rest, and have them confirm anything you drafted:

- **Event:** one of the folders listed above. If there is more than one, ask.
- **Team name**, and a **team slug** made from it: lowercase letters, digits and single hyphens (`Team Rocket!` → `team-rocket`).
- **Members:** each member's full name and GitHub username.
- **Summary:** one paragraph on what the project does, who it is for, and why it matters. Draft it from the code and let the user edit it.
- **Demo:** a link to a video and/or slides. Required, so ask for it.
- **How to run:** setup and run commands. Derive them from the project (`package.json` scripts, `requirements.txt`, `Makefile`, an existing README) and confirm.
- **Project directory:** the folder with the team's code, usually the current directory.

Check that the slug is free:

```bash
gh api "repos/GRAIL-innovationai/grail-hackathon/contents/submissions/$EVENT/$SLUG" --silent 2>/dev/null && echo taken || echo free
```

If it is taken by another team, choose a different slug with the user. If it is this team's own earlier submission, follow **Updating a submission** below instead.

## Step 2: Confirm with the user

Show the user this message, filled in, and wait for an explicit yes:

> Your code will be published **publicly** at github.com/GRAIL-innovationai/grail-hackathon in `submissions/<event>/<team-slug>/`, under the MIT license unless you add your own LICENSE file to that folder. The team members' names and GitHub usernames in the README will also be public. I will fork the repo to your GitHub account, push a branch, and open a pull request. Shall I go ahead?

## Step 3: Fork and clone

You need `git` and the GitHub CLI `gh`, logged in (`gh auth status`). If `gh` is missing, point the user to https://cli.github.com and `gh auth login`. If they can't install it, see **Without the GitHub CLI** below.

Clone the fork next to the project, not inside it:

```bash
PROJECT_DIR="$(pwd)"            # or wherever the team's code is
cd "$(dirname "$PROJECT_DIR")"
gh repo fork GRAIL-innovationai/grail-hackathon --clone --default-branch-only
cd grail-hackathon
git fetch upstream
git checkout -b "submit/$EVENT/$SLUG" upstream/main
```

If a `grail-hackathon` folder already exists there, check that it's a clone of the fork before reusing it:

```bash
git -C grail-hackathon remote get-url upstream
```

This should print the GRAIL-innovationai/grail-hackathon URL. If it does, `cd` into the folder and run only the last two commands (`git fetch upstream` and `git checkout -b ...`).

If that command fails but `origin` is the user's fork, the `upstream` remote is just missing: add it, then continue as above.

```bash
git remote add upstream https://github.com/GRAIL-innovationai/grail-hackathon.git
```

If the folder is something else (for example, the team's own project is called `grail-hackathon`), run the fork command from a fresh empty directory instead, such as `"$(dirname "$PROJECT_DIR")/grail-submission"`.

## Step 4: Copy the code

```bash
DEST="submissions/$EVENT/$SLUG"
mkdir -p "$DEST"
```

**If the project is a git repo** (`git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree` prints `true`), copy only the files git tracks. This respects the team's `.gitignore` and skips `.git`, `node_modules`, `.env` files and build output. First check for untracked files:

```bash
git -C "$PROJECT_DIR" status --short
```

Lines starting with `??` are untracked files, which won't be copied. Ask the user whether they belong in the submission, and if so, have them `git add` those files first. Then copy:

```bash
git -C "$PROJECT_DIR" ls-files -z | (cd "$PROJECT_DIR" && tar --null -T - -cf -) | tar -xf - -C "$DEST"
```

If `tar` reports `Cannot stat`, a tracked file was deleted on disk. Ask the user to commit or restore the deletion, then copy again.

**If the project is not a git repo**, copy everything except dependencies, caches and secrets:

```bash
rsync -a --include='.env.example' \
  --exclude='.git' --exclude='node_modules' --exclude='.venv' --exclude='venv' \
  --exclude='__pycache__' --exclude='.env' --exclude='.env.*' --exclude='*.pem' \
  --exclude='*.key' --exclude='id_rsa*' --exclude='.DS_Store' \
  "$PROJECT_DIR"/ "$DEST"/
```

If `rsync` isn't available, copy the files with the tools you have, skipping the same paths.

## Step 5: Write the README

If `$DEST/README.md` came over from the project, keep its content and add whichever of the four sections it lacks near the top. Otherwise start from the template:

```bash
cp submissions/_template/README.md "$DEST/README.md"
```

The README must contain these four level-2 headings, spelled like this:

```markdown
## Team
## Summary
## Demo
## How to run
```

Fill them in with the details from Step 1 (for the Team section, use the member table format from `submissions/_template/README.md`). Show the user the finished README and apply their edits.

## Step 6: Validate

Run the same check CI runs. If `python3` isn't found, use `python` or `py`.

```bash
python3 scripts/validate_submission.py "$DEST"
```

Fix every `ERROR` line and run it again until it prints `OK: submission looks good.` Typical fixes:

- A file over 10 MB, or a folder over 50 MB: delete the file from `$DEST` (never from the user's project), have the user upload it elsewhere (Google Drive, Hugging Face, a GitHub release), and link it in the README.
- `.env` or a private key: delete it from `$DEST`. For `.env`, add a `.env.example` with the same variable names and placeholder values.
- `node_modules/`, `.venv/`, `__pycache__/`: delete it from `$DEST`.

Never edit `scripts/validate_submission.py` to make it pass. CI uses its own copy.

Then look for hard-coded secrets:

```bash
grep -rIinE '(api[_-]?key|secret|token|passw(or)?d)[^=:]*[=:]|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE KEY' "$DEST"
```

Review each match:
- Reading a value from the environment (`os.environ["API_KEY"]`, `process.env.API_KEY`) or an empty placeholder in `.env.example` is fine.
- A real key written into the code is not. Replace it with a read from an environment variable, add the variable to `.env.example`, and tell the user to **rotate the key**, because it is already exposed if the project was ever pushed publicly.

CI also scans for secrets. If `git push` is blocked because it contains a secret, or the pull request's secret scan fails, first revoke or rotate that key — don't use GitHub's link to allow the secret. Then remove the key from the code, commit, and push again. Deleting the key in a new commit isn't enough while the old key still works: the scan checks every commit in the pull request.

## Step 7: Commit, push, and open the pull request

```bash
git add -f "$DEST"
git status --short
```

`-f` is needed because a `.gitignore` copied from the team's project could otherwise make `git add` skip tracked files; this is safe because the validator has already checked the folder for forbidden files.

Every line of `git status --short` must be under `$DEST/`. If anything else shows up, unstage it (`git restore --staged <path>`) and find out why it changed.

```bash
git commit -m "Submit $TEAM_NAME to $EVENT"
```

Before pushing, show the user the staged file list (the `git status --short` output above) and the folder size (`du -sh "$DEST"`), and get their OK. Then:

```bash
git push -u origin "submit/$EVENT/$SLUG"
```

Write the pull request body from `.github/pull_request_template.md`. Fill in the event, team and folder, tick (`[x]`) each checklist item you have verified, and save it to a file outside the repo. Then:

```bash
GH_USER="$(gh api user --jq .login)"
gh pr create --repo GRAIL-innovationai/grail-hackathon --base main \
  --head "$GH_USER:submit/$EVENT/$SLUG" \
  --title "[$EVENT] $TEAM_NAME" --body-file /path/to/pr-body.md
```

## Step 8: Report back

Tell the user:

- The pull request URL.
- A `validate` check now runs on the pull request, and on a first contribution it may wait until an organizer approves it. They can watch it with `gh pr checks <url> --watch`. If it fails, the log shows either validator errors or a secret-scan finding; see Step 6 for how to recover from each, then commit and push to the same branch.
- To change the submission before the deadline, push more commits to the same branch. Don't open a second pull request. Organizers judge lateness by when the last push reached GitHub.

## Updating a submission

If the pull request was already merged or closed, ask the organizers before changing anything. Otherwise, in the `grail-hackathon` clone:

```bash
git fetch origin
git checkout "submit/$EVENT/$SLUG"
git pull
cp "$DEST/README.md" "${TMPDIR:-/tmp}/grail-readme.md"
git rm -rq "$DEST"
mkdir -p "$DEST"
```

Copy the code again as in Step 4, then restore the README and update it if needed:

```bash
cp "${TMPDIR:-/tmp}/grail-readme.md" "$DEST/README.md"
```

Continue with Steps 6 and 7, but skip `gh pr create`: pushing updates the existing pull request. Before pushing, confirm with the user as in Step 2. Then report back as in Step 8.

## Without the GitHub CLI

1. Ask the user to open https://github.com/GRAIL-innovationai/grail-hackathon/fork in a browser, create the fork, and tell you their GitHub username (`GH_USER`).
2. Clone the fork and add the upstream remote:
   ```bash
   git clone "https://github.com/$GH_USER/grail-hackathon.git"
   cd grail-hackathon
   git remote add upstream https://github.com/GRAIL-innovationai/grail-hackathon.git
   git fetch upstream
   git checkout -b "submit/$EVENT/$SLUG" upstream/main
   ```
3. Continue with Steps 4 to 7 up to and including `git push`. Then give the user this link to open the pull request, along with the title and body to paste in:
   `https://github.com/GRAIL-innovationai/grail-hackathon/compare/main...$GH_USER:grail-hackathon:submit/$EVENT/$SLUG?expand=1`
