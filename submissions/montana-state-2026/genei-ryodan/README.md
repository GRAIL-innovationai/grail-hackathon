# Mathub

A study hub for every university class, built from each class's real syllabus, with Bo: an AI tutor who can see what you're working on.

Live at **[mathub.space](https://mathub.space)**.

## Team

**Team name:** Genei Ryodan

| Name | GitHub |
|---|---|
| Nikoloz Nonikashvili | @NickNonikashvili |

## Summary

Studying for a university class is scattered across the syllabus PDF, Canvas, the textbook, online homework and a group chat, help runs out when office hours end, and nobody tells you whether you're ready for the exam until the grade comes back. Mathub turns each class's syllabus into one hub: notes for every topic, every exam and deadline, endless practice questions with worked answers, spaced-repetition flashcards, a ten-minute daily plan, and a readiness score for the next exam. Bo, the AI tutor, is an agent that knows the syllabus, the exam dates and the questions you missed. He floats on every page and reads the screen: tap a question and he walks you through it with a hint before the answer. He works problems out on a whiteboard with graphs, sliders and a check question, talks with you on a live voice call, answers in English, Spanish or Russian, and can write a whole new class from any syllabus you drop in. It's for students who want a tutor at eleven at night, and it matters because a good tutor is the biggest help a struggling student can get and most can't afford one.

## Demo

- Live site: [mathub.space](https://mathub.space)
- Slides: [Mathub-hackathon.pptx](Mathub-hackathon.pptx) (14 slides with speaker notes)

## How to run

You need PHP 8.1 or newer with the `pdo_sqlite`, `curl` and `mbstring` extensions. There is no build step.

```bash
cd submissions/montana-state-2026/genei-ryodan
php -S 127.0.0.1:8000
# open http://127.0.0.1:8000
```

The first request creates the SQLite database in `api/data/`. Sign-up is limited to `montana.edu` addresses by default; change `allowed_domains` or add `extra_allowed_emails` in `api/config.php`. With `'mail_mode' => 'log'`, verification codes are written to `api/data/mail.log` instead of being emailed.

Bo needs API keys. Put them in a new file, `api/config.local.php`, which is read on top of `api/config.php` and must never be committed:

```php
<?php
return [
  'anthropic_key' => '...',  // Bo's chat, reading the page and writing classes (Claude)
  'openai_key'    => '...',  // optional: Bo's voice and live calls
  'admins'        => ['you@montana.edu'],
  'plan_grants'   => ['you@montana.edu' => 'max'],  // use Bo without a subscription while testing
];
```

**What's not in this folder.** To keep student and class data private, this public copy leaves out the user database, the built-in Montana State classes (their notes, questions, syllabi and instructor details), the class packs and the static class study pages. The site runs without them: the class list starts empty, and you add a class with **Create a class** (Bo writes it from a syllabus) or by importing a class pack. The browser tests in `tests/` were written against the full site, so many of them expect the built-in classes.

The iPhone and Android apps in `app/` are Capacitor projects that wrap the same site. They aren't needed to run it.

## Tech stack

- **Front end:** plain JavaScript, HTML and CSS with no framework; works offline through a service worker. MathJax for math, Pyodide for Python in the browser, GSAP for motion.
- **Server:** PHP and SQLite (accounts, sync, discussions, plans through RevenueCat and Stripe).
- **AI:** Anthropic's Claude for Bo's chat, reading the page and writing classes from a syllabus (`api/ai.php`); OpenAI Realtime for live voice calls.
- **Languages:** a translation layer (`assets/i18n.js`) that translates the interface as it draws; English, Spanish and Russian.
- **Apps:** Capacitor for iOS and Android.
- **Tests:** Playwright browser tests in `tests/`.

## License

This project is MIT-licensed, the repo default, unless this folder contains its own `LICENSE` file.
