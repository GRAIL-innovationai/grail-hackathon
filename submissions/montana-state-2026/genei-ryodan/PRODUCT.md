# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Montana State University students in Bozeman taking specific hard classes: Calculus I (M 171), Physics I with calculus (PHSX 220), Precalculus (M 151Q), College Writing I (WRIT 101), CSCI 127, BIOB 160, KIN 322, PSYX 340, plus classes added later as class packs (for example PSCI 230D, EMEC 100, M 172 Calculus II). They use it equally on a phone in short sessions between classes and on a laptop in long study sessions (library or dorm desk, often at night). Anyone can preview; students sign up with a montana.edu email to unlock everything.


Secondary users: Montana State instructors and their TAs, who write a syllabus and run a class in Mathub Faculty (`#/teach`, reached from the "For professors" button; announcements, practice assignments, attendance, insights). It is a separate surface with a more grown-up register than the student site (no mascot, XP or game pieces). Their surface is an Operate tool: forms, tables and checklists that must be fast to scan and hard to get wrong; students' privacy toward their instructor is stated before they join and limited to that class's assignments and check-ins.
## Product Purpose

Get students through hard classes. The job that matters most is the exam: knowing what the next exam covers and when it is, practising until they are ready, and walking in confident. Everything else (notes, flashcards, calendar, grade calculator, daily plan) serves that.

## Positioning

Built by an MSU student (Nikoloz Nonikashvili), free, and made from each class's real syllabus, real exam dates and the instructor's Canvas calendar, so it knows this semester's sections, deadlines and exams, not a generic subject. Practice is generated without limit, with worked steps.

## Operating Context

A student opens the class they are worried about, sees the next exam and how ready they are, and practises the weakest topics; between classes they do a few flashcards or a five-minute lesson on a phone. Real MSU context: semesters and weeks, exam days, Canvas, Wilson Hall and other campus places named in class data, the SUB, the Bridger Range.

## Capabilities and Constraints

- Per class: section notes, formula sheet, flashcards with spaced repetition, an endless quizzer with hint ladders, exam prep and readiness, calendar synced from Canvas, grade calculator, learning path; tools such as graphers and simulators for some classes.
- Across classes: Today plan, focus room with sounds and music, weekly recap, discussions board, people, leagues, XP and streaks, GPA calculator, study guides and resources, request a class, admin panel and class packs.
- Static SPA (plain HTML, CSS and JS in `calc1/`, hash routes) on Hostinger with a PHP + SQLite API in `calc1/api/`; offline service worker; static SEO pages under `learn/`. No build step. Every feature stays through a redesign.
- Accessibility tests (axe) and reduced-motion support already ship.

## Brand Commitments

- Name: Mathub (mathub.space). Credit line: created by Nikoloz Nonikashvili, handmade in Bozeman.
- Bo the bobcat (the mascot) and the hand-made pixel art (the 8-bit Bridger Range, pixel friends and icons) must survive any redesign.
- Not binding: the current M-arrow logo, the "Learn / Practice / Excel" line, the extra looks (Realm, Bobcat, Paper, Forest, Midnight) and geek mode.
- The owner finds these read as AI-generated and wants them gone: purple and blue gradients and glow, every block as a rounded soft-shadow card (cards inside cards, tiny caps labels over everything), and generic voice and icons that could belong to any study app.
- The owner also rejected the opposite: the flat, near-colourless printed trail map (2026.10.02.2) read as a downgrade with no soul. Standing preference: hold the craft level of the most-used learning sites (Khan Academy, Duolingo, Brilliant): bright, warm, tactile and illustrated, with Mathub's own identity, never a copy of any of them. The trail board, its run markers and the "You are here" pin with Bo are liked and stay.

## Evidence on Hand

Real class content per class in `assets/*-data.js` and class packs in `packs/` (notes, calendars, exam dates, flashcards, question generators); real Canvas feeds; Bo and the pixel art in `assets/pixel.js` and the mascot SVG in `assets/app.js`. No testimonials, user counts, grades outcomes or press exist; do not invent any.

## Product Principles

1. The next exam leads. Every class screen answers: when is it, what is on it, how ready am I, what do I do now.
2. Specific to Montana State and this semester. Real course codes, real dates, real places; never generic study-app filler.
3. Made by a person. The voice is a fellow student who has taken these classes, plain and warm, never marketing.
4. Practice over decoration. Anything on screen earns its place by helping someone study.
5. Works the same on a phone between classes and a laptop at midnight.

## Accessibility & Inclusion

WCAG 2.1 AA (the axe suite in `tests/a11y.test.js` must stay clean), text at 11 px or larger, Reduce motion honoured, keyboard and screen-reader paths kept.
