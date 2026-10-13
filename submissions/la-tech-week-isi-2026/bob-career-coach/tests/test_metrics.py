from agent_d.metrics import score_tailored_resume


LABEL = {
    "name": "Ava Chen",
    "target_keywords": ["high-throughput sequencing", "probabilistic modeling"],
    "forbidden_claims": ["PhD", "Ph.D"],
    "forbidden_skill_phrases": ["PyTorch", "deep learning frameworks such as PyTorch"],
}


def test_keyword_swap_and_leading_section_score_higher_than_original_wording():
    original = (
        "Ava Chen\n"
        "M.S. in Computer Science\n"
        "• Experience with genomic data analysis\n"
        "• Experience with statistical modeling\n"
    )
    tailored = (
        "Ava Chen\n"
        "Relevant experience: high-throughput sequencing; probabilistic modeling\n"
        "M.S. in Computer Science\n"
        "• Experience with genomic data analysis\n"
        "• Experience with statistical modeling\n"
    )
    original_score = score_tailored_resume(original, LABEL)["combined_score"]
    tailored_score = score_tailored_resume(tailored, LABEL)["combined_score"]
    assert original_score == 0.0
    assert tailored_score == 1.0


def test_only_profile_phrases_are_true():
    label = {
        "name": "Ava Chen",
        "target_keywords": ["high-throughput sequencing"],
        "profile": {
            "name": "Ava Chen",
            "degree": {"level": "ms", "label": "M.S.", "field": "Computer Science"},
            "institution": "Northbridge University",
            "skills": [
                {
                    "id": "genomics",
                    "truthful_phrases": ["genomic data analysis", "single-cell RNA-seq", "genomics", "high-throughput sequencing"],
                }
            ],
        },
    }
    truthful = "Ava Chen — high-throughput sequencing\nM.S. in Computer Science, Northbridge University"
    invented = truthful + "\nPyTorch"
    assert score_tailored_resume(truthful, label)["combined_score"] == 1.0
    assert score_tailored_resume(invented, label)["combined_score"] == 0.0


def test_invented_skill_or_degree_scores_zero():
    invented_skill = "Ava Chen\nRelevant experience\nhigh-throughput sequencing\nprobabilistic modeling\nPyTorch"
    invented_degree = "Ava Chen\nPh.D. in Computer Science\nhigh-throughput sequencing\nprobabilistic modeling"
    assert score_tailored_resume(invented_skill, LABEL)["combined_score"] == 0.0
    assert score_tailored_resume(invented_degree, LABEL)["combined_score"] == 0.0


def test_keywords_buried_at_the_bottom_lose_structure_points():
    buried = (
        "Ava Chen\n"
        "M.S. in Computer Science\n"
        "Teaching and service\n"
        "Awards\n"
        "high-throughput sequencing\n"
        "probabilistic modeling\n"
    )
    metrics = score_tailored_resume(buried, LABEL)
    assert metrics["keyword_alignment"] == 1.0
    assert metrics["structure"] == 0.0
    assert metrics["combined_score"] == 0.65
