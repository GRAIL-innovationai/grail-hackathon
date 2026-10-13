# RSI results: baseline vs optimized generator instructions

> **FIXTURE RUN: personas, profiles, jobs and the generator are temporary stand-ins. The offline generator reacts to the same directive sentences the rule improver writes, so improvements are guaranteed by construction. This demonstrates the loop mechanics, not how a real LLM generator behaves.**

## What was optimized and how it was scored

The optimized artifact is the **generator instructions** (the prompt), not any single message. Simulated hiring contacts score each message on 8 weighted criteria (personalization, persona_hook, specificity, job_relevance, clear_ask, concision, no_boilerplate, tone_fit) minus a grounding penalty for claims not in the resume. Outcomes (no response / passive accept / conversation / strong interest) are simulated from that quality and each contact's reply propensity. The optimizer maximizes quality, so a quiet contact does not count against a message.

## Instructions

**Baseline**

```
Write a short LinkedIn-style outreach message from the candidate to the hiring contact about the job. Be polite and express interest.
```

**Optimized**

```
Write a short LinkedIn-style outreach message from the candidate to the hiring contact about the job. Be polite and express interest.
- Connect the message to something this contact cares about, using their stated priorities.
- Cite one or two concrete projects or results taken directly from the resume.
- Only state facts that appear in the resume; never invent experience, years, or numbers.
- Avoid generic phrases such as 'I am writing to express my interest' or 'passionate'.
- Address the contact by first name and mention their company and role.
- End with one low-friction ask, such as a 15-minute call.
- Explicitly connect the candidate's skills to the job's required skills.
- Match the contact's communication style (formal, casual, or direct) in greeting and sign-off.
```

## Iteration history (stop reason: reached max_iters)

| Iter | Candidates (dev quality) | Selected | Accepted | Dev before → after |
|---|---|---|---|---|
| 1 | persona_hook 0.386, grounding 0.215, personalization 0.273 | persona_hook | yes | 0.149 → 0.386 |
| 2 | grounding 0.469, specificity 0.481, no_boilerplate 0.464 | specificity | yes | 0.386 → 0.481 |
| 3 | grounding 0.610, no_boilerplate 0.562, personalization 0.554 | grounding | yes | 0.481 → 0.610 |
| 4 | no_boilerplate 0.690, job_relevance 0.645, personalization 0.683 | no_boilerplate | yes | 0.610 → 0.690 |
| 5 | job_relevance 0.742, personalization 0.764, clear_ask 0.750 | personalization | yes | 0.690 → 0.764 |
| 6 | job_relevance 0.815, clear_ask 0.824, tone_fit 0.811 | clear_ask | yes | 0.764 → 0.824 |
| 7 | job_relevance 0.875, tone_fit 0.871, concision 0.779 | job_relevance | yes | 0.824 → 0.875 |
| 8 | tone_fit 0.921, concision 0.779 | tone_fit | yes | 0.875 → 0.921 |

## Held-out test results (n=8 examples, candidates never seen during optimization)

| Metric | Baseline | Optimized | Delta |
|---|---|---|---|
| Mean rubric quality | 0.194 | 0.979 | +0.785 (95% CI +0.725 to +0.837) |
| Mean expected outcome (0-1) | 0.069 | 0.510 | +0.440 |
| Simulated reply probability | 20% | 56% | +36.4 pts |
| Messages with ungrounded claims | 100% | 0% | -100.0 pts |
| Mean word count | 67 | 99 | |

Optimized beat baseline on 100% of test examples (ties: 0%).

| Criterion | Baseline | Optimized |
|---|---|---|
| personalization | 0.10 | 1.00 |
| persona_hook | 0.00 | 1.00 |
| specificity | 0.28 | 1.00 |
| job_relevance | 0.56 | 0.94 |
| clear_ask | 0.50 | 1.00 |
| concision | 1.00 | 0.86 |
| no_boilerplate | 0.00 | 1.00 |
| tone_fit | 0.62 | 1.00 |

## Largest test improvement: Jordan Alvarez → Noor Haddad (Growth Marketing Manager, Copperleaf Commerce)

**Baseline** (quality 0.13, simulated outcome: passive_accept)

> Hello,
> 
> I am writing to express my interest in the Marketing Analyst position. As a passionate and hard-working student, I would love to pick your brain about the role. I believe my skills are a great fit for your team. I have 3+ years of hands-on experience with SQL. I would appreciate the opportunity to hear back from you.
> 
> Thank you for your time,
> Jordan Alvarez

Simulated feedback:
- It doesn't read as written for me or Copperleaf Commerce. Use my name and my company.
- Nothing connects to what my team cares about (experiments, campaign results, storytelling).
- No concrete project or result from your resume. Show me one specific thing you built or achieved.

**Optimized** (quality 1.00, simulated outcome: strong_interest)

> Hi Noor,
> 
> I'm Jordan Alvarez, a statistics senior at Lakeshore State University, and I'm applying for the Marketing Analyst role at Copperleaf Commerce. Your focus on experiments and campaign results as Growth Marketing Manager is what drew me to Copperleaf Commerce. At Harborview Nonprofit, I automated weekly reports and saved the team 5 hours a week. I built City Bike Demand Dashboard: Tableau dashboard forecasting bike-share demand using SQL and Python. My work with SQL and Excel maps directly to the required skills for this role. Would you be open to a 15-minute call next week?
> 
> Thanks!
> Jordan Alvarez


## Smallest test improvement: Priya Nair → Priya Raman (Robotics Team Lead, Tidewater Robotics)

**Baseline** (quality 0.29, simulated outcome: no_response)

> Hello,
> 
> I am writing to express my interest in the Robotics Software Engineer position. As a passionate and hard-working student, I would love to pick your brain about the role. I believe my skills are a great fit for your team. I have 3+ years of hands-on experience with Python. I would appreciate the opportunity to hear back from you.
> 
> Thank you for your time,
> Priya Nair

Simulated feedback:
- Nothing connects to what my team cares about (control systems, simulation, hands-on builds).
- No concrete project or result from your resume. Show me one specific thing you built or achieved.
- It never ties your skills to what this job requires (C++, ROS, Python, control systems).

Non-response read: *message_likely_contributed*. Quality 0.29 is low and P(no response)=84%; the message plausibly contributed.

**Optimized** (quality 0.90, simulated outcome: no_response)

> Hi Priya,
> 
> I'm Priya Nair, a computer science junior at Eastgate Institute of Technology, and I'm applying for the Robotics Software Engineer role at Tidewater Robotics. Your focus on control systems and simulation as Robotics Team Lead is what drew me to Tidewater Robotics. At Eastgate Vision Lab, I built data pipelines for image datasets. I built Skin Lesion Classifier: PyTorch image classifier that reached 87% accuracy on a public dataset. My work with Python maps directly to the required skills for this role. Would you be open to a 15-minute call next week?
> 
> Thanks,
> Priya Nair

Simulated feedback:
- It never ties your skills to what this job requires (C++, ROS, Python, control systems).

Non-response read: *likely_persona_unavailable*. Quality 0.90 is high; silence from Priya Raman is expected (P(no response)=67%). Not evidence the message was weak.

## Caveats

- FIXTURE RUN: personas, profiles, jobs and the generator are temporary stand-ins. The offline generator reacts to the same directive sentences the rule improver writes, so improvements are guaranteed by construction. This demonstrates the loop mechanics, not how a real LLM generator behaves.
- All outcomes are SIMULATED from a transparent rubric and persona parameters. They are not evidence of real-world recruiter response rates.
- Quality (rubric score) is what the optimizer maximizes; outcomes are probabilistic and a single non-response is not treated as proof of a poor message.
- Only the generator INSTRUCTIONS were optimized. Train feedback drove revisions, dev gated acceptance, test was held out.
- Held-out sample is small; read the bootstrap confidence intervals, not just the means.
