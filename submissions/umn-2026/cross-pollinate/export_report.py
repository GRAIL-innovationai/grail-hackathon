"""Readable exports for documents, independent of the interface."""
def to_markdown(report):
    a = report["abstraction"]
    lines = ["# Cross–Pollinate", "", "## " + report["title"], "", "### Abstracted problem",
             a["problem_type"], "", a["description"], "", "**Goal:** " + a["goal"]]
    for name in ("known_data", "constraints", "assumptions"):
        lines += ["", "**" + name.replace("_", " ").title() + "**"]
        lines += ["- " + x for x in a[name]]
    for i, c in enumerate(report["recommendations"], 1):
        lines += ["", f"## {i}. {c['domain']}: {c['method']}", "",
                  c["evidence_status"].replace("_", " ") + " · " + c["feasibility"].replace("_", " "), "", c["fit_summary"], "", "### Concept mapping"]
        lines += [f"- {m['target_concept']} → {m['source_concept']}: {m['shared_structure']}" for m in c["structural_mapping"]]
        lines += ["", "### Adaptation"] + [f"{j}. {x}" for j, x in enumerate(c["adaptation_steps"], 1)]
        lines += ["", "### Measurements"] + [f"- {m['variable']} ({m['availability']}): {m['how_to_collect']}. Purpose: {m['purpose']}" for m in c["measurements"]]
        expert = c["collaborator"]
        lines += ["", "### Collaborator", expert["expertise"] + ": " + expert["contribution"], "Search terms: " + "; ".join(expert["search_terms"]), "", "### Quick validation plan"]
        lines += ["- **" + k.replace("_", " ").title() + ":** " + v for k, v in c["validation"].items()]
        lines += ["", "### Limitations"] + ["- " + x for x in c["limitations"]]
        lines += ["", "**Prior art:** " + c["prior_art_note"], "", "**Sources:** " + "; ".join(c["source_ids"])]
    lines += ["", "## Recommended first step", report["recommended_start"], "", "## Rejected candidates"]
    lines += [f"- {x['domain_or_method']}: {x['reason']}" for x in report["rejected_candidates"]]
    lines += ["", "## Open questions"] + ["- " + x for x in report["follow_up_questions"]]
    lines += ["", "## Search limitations"] + ["- " + x for x in report["search_limitations"]]
    lines += ["", report.get("evidence_note", ""), "", "## Retrieved sources"]
    for source in report.get("sources", []):
        lines += [f"- [{source['title']}]({source['url']}) ({source['year']}). {source['retrieval_level']} retrieved. ID: {source['source_id']}."]
    return "\n".join(lines) + "\n"
