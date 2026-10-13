# Templates

## Human-readable project spec

```markdown
## Project: [Name]
**Target role:** [Role @ Company]   **Time budget:** [H] hours over [W] weeks

### Gaps addressed
| JD requirement (quoted) | Evidence of gap | Bucket | Tier |
|---|---|---|---|
| "..." | Resume has no ... | Project-closable | supported |

### Target bullet(s) — 🔒 LOCKED
1. [Bullet with [N] metric slots]

### Pitch
[One paragraph]

### Claim → work map
| Claim in bullet | Work that earns it |
|---|---|

### Milestones
1. [Riskiest piece first] — [h] hrs
2. ...

### Evidence required to unlock
- [ ] Public repo with README (setup, architecture, results)
- [ ] ...

### Rubric
| Claim | Counts as evidence | Minimum bar |
|---|---|---|

### Stretch (not in bullet)
- ...

### Interview hooks
- ...
```

## Verification report

```markdown
### Bullet 1: LOCKED → PARTIAL
| Claim | Status | Decided by |
|---|---|---|
| "deployed" | ✅ met | README L42: live URL, responds |
| "[N] daily records" | ❓ can't verify | No run logs in repo |

**Resume-ready version (verified claims only):**
> [Smaller, true bullet]

**To fully unlock:** [specific missing evidence]
```

## JSON for the host agent

```json
{
  "skill": "proof-project-designer",
  "target_role": {"title": "", "company": "", "jd_id": ""},
  "constraints": {"hours_per_week": 0, "weeks": 0, "assumed": true},
  "gaps": [
    {
      "id": "g1",
      "jd_requirement": "quoted text",
      "profile_evidence": "resume line or 'not present in profile'",
      "bucket": "project_closable | partial | not_closable",
      "tier": "supported | inferred | speculative"
    }
  ],
  "project": {
    "name": "",
    "pitch": "",
    "milestones": [{"title": "", "hours": 0}],
    "evidence_required": [""],
    "stretch": [""],
    "interview_hooks": [""]
  },
  "bullets": [
    {
      "id": "b1",
      "gap_ids": ["g1"],
      "text": "bullet with [N] slots",
      "status": "LOCKED | PARTIAL | UNLOCKED",
      "resume_ready_text": null,
      "rubric": [
        {
          "claim": "",
          "evidence_criteria": "",
          "status": "unchecked | met | not_met | cannot_verify",
          "decided_by": ""
        }
      ],
      "metric_values": {}
    }
  ],
  "evidence_links": []
}
```

`resume_ready_text` stays `null` while LOCKED. When PARTIAL, it holds the smaller verified bullet; when UNLOCKED, the full bullet with metric slots filled from `metric_values`.
