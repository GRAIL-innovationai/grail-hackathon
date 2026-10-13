# Coding Agent D: Hiring-Persona Simulation, RSI & Integration

You are **Agent D** working alongside three other coding agents on one shared GitHub project. Make practical implementation decisions independently; this is a high-level delegation, **not a prescribed architecture**.

## Shared project context

We are building a **hackathon-scale AI Career Coach**. A student uploads a PDF resume and describes the type of job they want. The app searches a **synthetic** dataset of jobs and fictional hiring contacts, recommends relevant opportunities, and writes personalized outreach messages. The central technical demo is **recursive self-improvement (RSI)**: simulated hiring contacts evaluate generated outreach, and an optimization loop iteratively improves the **instructions/prompt used to generate future messages**. The final experience should make the initial and improved messages, feedback, and results easy to compare.

This is an MVP demonstration, not an actual applicant-tracking system or automated LinkedIn/email sender. Synthetic hiring responses are simulated outcomes, **not evidence of real-world recruiter response rates**. All candidate facts used in messages must be grounded in the submitted resume/profile rather than invented.

**Collaboration approach:** Work in the shared GitHub repository on your own branch. Decide implementation details locally, but agree quickly with adjacent agents on the data fields and interface shapes you exchange. Keep your component independently testable and document assumptions, dependencies, and how to run it. Prioritize a working end-to-end demo over optional features; don't overwrite unrelated agents' work.

## Your assignment

**Your mission:** Build the closed-loop improvement system that demonstrates whether outreach-generation instructions improve under simulated feedback.

**Build / deliver:**
- Use Agent B’s fictional hiring personas to simulate different response outcomes, including nonresponse, passive acceptance, conversation, or strong interest.
- Assess outreach quality with transparent simulated feedback and scoring; avoid treating all nonresponses as proof of a poor message.
- Implement an RSI-style loop (using the provided reference notebook as a starting point if helpful) that evaluates messages and improves the **generator prompt**, not merely rewrites one isolated message.
- Record the iteration history and compare a baseline against the optimized system on evaluation examples not used during prompt improvement.
- Own end-to-end orchestration of the optimization run and provide results Agent A can display.

## Your handoffs

Agree with Agent C on a callable message generator and with Agent B on persona definitions. Provide Agent A with the baseline note, iteration trace, simulated scores, and optimized note.

## Success criteria

A repeatable demo shows baseline → feedback → prompt revisions → improved output, with a clear explanation of what was optimized and how it was scored.

## Before you finish

Commit working changes to your feature branch, give the team clear usage/integration notes, and identify any contract or data assumptions. If teammates' components are not ready, use clearly labeled temporary fixtures—not pretend production results.
