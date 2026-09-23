# Contributing

## Submitting your project

You need a GitHub account and git. Using an AI coding agent? The paste-in prompt in the [README](README.md#submitting-with-an-ai-agent) does all of this for you.

- On Windows, run these commands in Git Bash, which is installed with Git for Windows.
- If git has never been set up on this computer, first run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.

### 1. Fork and clone

Click **Fork** at the top of https://github.com/GRAIL-innovationai/grail-hackathon, then:

```bash
git clone https://github.com/<your-username>/grail-hackathon.git
cd grail-hackathon
git checkout -b submit/<event>/<team-slug>
```

`<event>` is a folder in `submissions/`, for example `umn-2026`. `<team-slug>` is your team name in lowercase letters, digits and hyphens, for example `team-rocket`.

### 2. Add your code

```bash
mkdir -p submissions/<event>/<team-slug>
```

Copy your project's source code into that folder. Leave out:

- dependency and cache folders: `node_modules/`, `.venv/`, `venv/`, `__pycache__/`
- secrets: `.env` files (a `.env.example` with placeholder values is fine) and private keys (`*.pem`, `*.key`, `id_rsa*`)
- the `.git` folder: copy your files, not your repository.
- any file over 10 MB. Upload it elsewhere (Google Drive, Hugging Face, a GitHub release) and link it from your README. The whole folder must stay under 50 MB.

Also search your code for API keys, tokens and passwords written directly into files, and replace them with environment variables documented in `.env.example`.

If your project is a git repo, this copies only the files git tracks, which skips most of the above:

```bash
git -C /path/to/your-project ls-files -z | (cd /path/to/your-project && tar --null -T - -cf -) | tar -xf - -C submissions/<event>/<team-slug>
```

### 3. Write your README

Copy [submissions/_template/README.md](submissions/_template/README.md) into your folder and fill it in. If your project already has a `README.md`, add the four required sections to it instead: **Team**, **Summary**, **Demo**, **How to run**.

### 4. Check it

```bash
python3 scripts/validate_submission.py submissions/<event>/<team-slug>
```

Fix every `ERROR` line until it prints `OK: submission looks good.` On Windows, use `python` or `py` instead of `python3`.

### 5. Open a pull request

```bash
git add submissions/<event>/<team-slug>
git commit -m "Submit <Team Name> to <event>"
git push -u origin submit/<event>/<team-slug>
```

Open `https://github.com/<your-username>/grail-hackathon`, click **Compare & pull request**, title it `[<event>] <Team Name>`, and tick the checklist.

A `validate` check runs on your pull request. On your first contribution it may wait until an organizer approves it. If it fails, click **Details** to see the errors, fix them, then commit and push again. The pull request updates automatically.

If `git push` is blocked because it contains a secret, or the pull request's secret scan fails, first revoke or rotate that key — don't use GitHub's link to allow the secret. Then remove the key from your code, commit, and push again. Deleting the key in a new commit isn't enough while the old key still works: the scan checks every commit in the pull request.

### Updating your submission

Push more commits to the same branch before the deadline. Don't open a second pull request.

## For organizers

### Adding an event

1. Create `submissions/<event>/README.md` (start from `submissions/umn-2026/README.md`) and push it to `main` directly. Org admins bypass the branch rules.
2. Add the event to the **Events** table in the root [README](README.md).

### Reviewing submissions

- If a first-time contributor's CI is waiting, click **Approve and run workflows** on the pull request.
- A green `validate` check doesn't prove scope: a pull request can edit the workflow it is judged by.
- In **Files changed**, confirm every file (including renamed and deleted ones) is inside one team folder that belongs to the pull request author's team.
- Reject any change to `.github/` or `scripts/`.
- After judging, merge with **Squash and merge**.

### Checking the deadline

Commit dates are set on the participant's machine and can be faked. Instead, use the time GitHub ran CI for the pull request's last commit, which GitHub records on every push:

```bash
sha=$(gh pr view <number> --repo GRAIL-innovationai/grail-hackathon --json headRefOid --jq .headRefOid)
gh run list --repo GRAIL-innovationai/grail-hackathon --commit "$sha" --json createdAt,status,conclusion
```

If `createdAt` is after the deadline, the last push was late.

If `gh run list` returns nothing for the commit, CI never ran for it (for example, the commit message contained `[skip ci]`), so the push time is unverified. Judge it by hand.
