# Research Matchmaker — cloud preview

A private English preview of the Research Matchmaker student journey, adapted for ChatGPT Sites. The original local app remains in the parent project.

## What works

Explore interests, compare research directions, create a weekly plan, track tasks, choose a university, inspect sourced UMN faculty examples, and edit or export an introduction email. Resume text import supports TXT and Markdown with a confirmation preview.

This deployment runs **Guided demo** only. It does not call an AI provider, send email, or use OpenClaw. No school is assumed. Other schools receive an honest catalog-coverage message.

Progress is stored in the browser. The current session is sent to the server for each guided step, but the application does not persist student sessions in a server database. Use Settings to export or clear local data.

## Local checks

```sh
npm run dev -- --port 5180
npx tsc --noEmit
npm run build
```

The Sites starter manages the Worker build and deployment metadata. Keep `.openai/hosting.json` and the `sites()` Vite integration when updating this preview. Publish with the Sites source workflow; do not deploy through a separate hosting service.

The current preview was tested with the original desktop and mobile student journey. Faculty source notes are in [docs/sources.md](docs/sources.md).
