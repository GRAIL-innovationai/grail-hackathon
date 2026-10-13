# Career Coach — Agent Role Separation

**Purpose:** Delegate four parallel workstreams to coding agents A, B, C, and D. Each agent should own an outcome, not a predetermined framework or file layout.

## Shared project context

We are building a **hackathon-scale AI Career Coach**. A student uploads a PDF resume and describes the type of job they want. The app searches a **synthetic** dataset of jobs and fictional hiring contacts, recommends relevant opportunities, and writes personalized outreach messages. The central technical demo is **recursive self-improvement (RSI)**: simulated hiring contacts evaluate generated outreach, and an optimization loop iteratively improves the **instructions/prompt used to generate future messages**. The final experience should make the initial and improved messages, feedback, and results easy to compare.

This is an MVP demonstration, not an actual applicant-tracking system or automated LinkedIn/email sender. Synthetic hiring responses are simulated outcomes, **not evidence of real-world recruiter response rates**. All candidate facts used in messages must be grounded in the submitted resume/profile rather than invented.

**Collaboration approach:** Work in the shared GitHub repository on your own branch. Decide implementation details locally, but agree quickly with adjacent agents on the data fields and interface shapes you exchange. Keep your component independently testable and document assumptions, dependencies, and how to run it. Prioritize a working end-to-end demo over optional features; don't overwrite unrelated agents' work.

## Workstream summary

| Agent | Ownership | Main handoff |
| --- | --- | --- |
| **A** | Web experience and deployment/demo | Connects all components into one user flow |
| **B** | Synthetic jobs, candidates, and hiring personas | Supplies structured test data to C and D |
| **C** | Resume parsing, job recommendations, and outreach generation | Supplies a reusable generator and career-coach outputs |
| **D** | Hiring-persona simulation, scoring, RSI, and run orchestration | Supplies iteration/results data to A |

## What the MVP should demonstrate

1. A candidate uploads a resume and describes a target job.
2. The app surfaces a relevant fictional job and hiring contact.
3. The system generates a baseline outreach message.
4. Simulated hiring-persona feedback drives iterative improvement of the **message-generation prompt**.
5. The UI shows an optimized output with a comparison to baseline.

**Scope guardrail:** Do **not** prioritize live job scraping, real outreach sending, complete resume rewriting, or a full application tracker until the above works end-to-end.

## Start-together alignment

Agree only on lightweight shared contracts: the candidate profile, job and contact records, how C exposes message generation to D, and how D returns an optimization trace to A. Begin with a small sample dataset and integrate early. The agents may choose implementation languages, frameworks, storage, and algorithms autonomously.

---
## Agent A — Web Experience & Demo

**Mission:** Build the user-facing application and make the complete project easy to demonstrate.

**Own these outcomes:**
- Create a simple flow for PDF resume upload and a short description of the desired job or career direction.
- Present relevant matched jobs and the fictional hiring contacts associated with them.
- Display the initial outreach note, RSI iterations or evaluator feedback, and the final optimized note, with clear simulated scores.
- Integrate with teammates’ functionality, handle loading/error states, and prepare a shareable demo/deployment if practical.

**Coordination:** Coordinate with Agent C on the resume-to-jobs experience and with Agent D on how optimization results and iteration history will be returned.

**Definition of done:** A user can run the complete demo through the UI, with actual outputs from the other components rather than hardcoded success results.

---
## Agent B — Synthetic Dataset & Hiring Personas

**Mission:** Build the realistic, consistent fictional world used for job matching and outreach evaluation.

**Own these outcomes:**
- Generate a manageable set of synthetic companies, job postings, and hiring contacts (e.g., recruiters, engineers, hiring managers, executives).
- Give contacts meaningful persona differences, such as priorities, seniority, communication preferences, and likelihood of responding.
- Provide synthetic student resumes/profiles as test cases; include job-fit annotations or reference relevance information when useful.
- Keep data structured, internally consistent, reproducible, and separated for development versus held-out evaluation where possible.

**Coordination:** Agree on essential fields with Agent C (matching/generation) and Agent D (persona simulation and evaluation). Provide small sample fixtures early so others can integrate before the full dataset exists.

**Definition of done:** Other agents can reliably load fictional jobs, candidate examples, and contact personas that support an end-to-end demo and a credible held-out evaluation.

---
## Agent C — Resume Understanding, Matching & Outreach

**Mission:** Build the core career-coach intelligence that converts a candidate’s resume and goals into relevant job recommendations and honest personalized outreach.

**Own these outcomes:**
- Extract useful candidate information from uploaded resumes (education, skills, experience, and projects).
- Rank or select suitable jobs from Agent B’s synthetic postings using a pragmatic matching approach.
- Generate concise, role- and contact-aware outreach messages grounded in the candidate’s documented experience.
- Make outreach generation reusable with a configurable generation prompt, so Agent D can test and improve the prompting strategy.

**Coordination:** Coordinate with Agent B on data fields; with Agent A on candidate/job/result inputs and outputs; and especially with Agent D on how its optimizer can invoke the same message generator repeatedly.

**Definition of done:** Given a sample resume, target role, synthetic job, contact persona, and generator instructions, the system can produce a relevant job suggestion and a factually grounded baseline outreach note.

---
## Agent D — Hiring-Persona Simulation, RSI & Integration

**Mission:** Build the closed-loop improvement system that demonstrates whether outreach-generation instructions improve under simulated feedback.

**Own these outcomes:**
- Use Agent B’s fictional hiring personas to simulate different response outcomes, including nonresponse, passive acceptance, conversation, or strong interest.
- Assess outreach quality with transparent simulated feedback and scoring; avoid treating all nonresponses as proof of a poor message.
- Implement an RSI-style loop (using the provided reference notebook as a starting point if helpful) that evaluates messages and improves the **generator prompt**, not merely rewrites one isolated message.
- Record the iteration history and compare a baseline against the optimized system on evaluation examples not used during prompt improvement.
- Own end-to-end orchestration of the optimization run and provide results Agent A can display.

**Coordination:** Agree with Agent C on a callable message generator and with Agent B on persona definitions. Provide Agent A with the baseline note, iteration trace, simulated scores, and optimized note.

**Definition of done:** A repeatable demo shows baseline → feedback → prompt revisions → improved output, with a clear explanation of what was optimized and how it was scored.


## GitHub collaboration note

Each agent should use a dedicated branch (such as `agent-a-ui`, `agent-b-data`, `agent-c-career`, `agent-d-rsi`) and open pull requests into the shared main branch. Resolve shared interface decisions in the project README or a brief shared contract rather than assigning several agents to rewrite the same file.
