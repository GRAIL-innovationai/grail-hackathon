# Scout interface and agent state audit

The design calls for a student-controlled record, recommendations linked to background, actionable preparation, and a conversation beside the next step. This review covers the local Scout website.

| Area | Finding and targeted change |
| --- | --- |
| Faculty cards | Canonical research facts remain sourced. Agent-authored fit, discussion question, relevant experience and preparation are saved separately through `inspect_professor.guidance`. Current profile quotes and a research-description quote are required. These are interpretations, not lab requirements. Completed recommendation turns must save guidance for retrieved cards. |
| Changed background | Personalized faculty guidance becomes stale when the confirmed profile or selected direction changes. The page shows general research context with an explicit refresh action rather than presenting old guidance as personalized. |
| Faculty name lookup | Omitted middle initials and titles resolve to the same catalog card, so “Joseph Konstan” can update “Joseph A. Konstan.” Partial tokens and unrelated names do not match. |
| Next-step sidebar | Uses `complete_research_step.nextStep`, not the mere presence of an old email. Saved follow-up suggestions appear on all stages and survive refresh. Manual changes invalidate stale guidance and fall back to the current workspace stage. Completed plans offer reflection. |
| Existing plans | “Open my plan” only opens it. It does not call the model or overwrite completed work. A direction snapshot preserves the question the tasks were prepared for; revised questions or reduced time budgets show an update action. |
| Email review | Agent-authored review points supplement universal factual checks. Changing the subject/body/checklist resets checked boxes, including for the same recipient. Changed background/direction shows a review-and-update notice without deleting the draft. |
| Profile card | Shows confirmed experience and goal as well as interests and time. Editing interests preserves agent-authored work; faculty guidance becomes stale rather than quietly claiming a current fit. |
| Reference/UI content | Faculty facts, source dates, unknown recruitment status, decorative art and general navigation stay stable intentionally. The catalog is not live recruitment search. Direction cards and tasks retain the dynamic generation implemented earlier. |

Context fingerprints are only stale-content indicators, not security controls or semantic proof of a model's claims. Students still review factual accuracy. Legacy saved plans receive a snapshot on their next agent turn; legacy emails without a context marker retain universal review checks.

Verification covers tool writes, source/profile quote validation, failed completion repair, persistence, stale-state handling, desktop/mobile flows and a real signed-in provider call. Browser regression fixtures use synthetic profiles and do not alter the user's saved browser session.

The signed-in provider verification saved Konstan guidance for a synthetic student with basic Python, an interest in learning-resource recommendations and two hours per week. The resulting card contained a specific evaluation question and a two-hour preparation suggestion, and the saved sidebar next step matched the returned workspace context. This verifies persistence through the live tool loop; it does not establish factual correctness of every possible model response.
