"""Canonical skills, fields, and surface forms for resumes vs job posts."""

from __future__ import annotations

# skill_id -> resume wording options, job wording options
SKILLS: dict[str, dict[str, list[str]]] = {
    "pytorch": {
        "resume": ["PyTorch", "torch-based models"],
        "job": ["PyTorch", "deep learning frameworks such as PyTorch"],
    },
    "tensorflow": {
        "resume": ["TensorFlow", "TF pipelines"],
        "job": ["TensorFlow", "experience with TensorFlow or JAX"],
    },
    "nlp": {
        "resume": ["natural language processing", "NLP"],
        "job": ["natural language processing", "computational linguistics"],
    },
    "cv": {
        "resume": ["computer vision", "image understanding"],
        "job": ["computer vision", "visual recognition"],
    },
    "rl": {
        "resume": ["reinforcement learning", "RL agents"],
        "job": ["reinforcement learning", "sequential decision making"],
    },
    "stats": {
        "resume": ["statistical modeling", "Bayesian inference"],
        "job": ["statistics", "probabilistic modeling"],
    },
    "genomics": {
        "resume": ["genomic data analysis", "single-cell RNA-seq"],
        "job": ["genomics", "high-throughput sequencing"],
    },
    "neuro": {
        "resume": ["neural recording analysis", "computational neuroscience"],
        "job": ["neuroscience", "neural data analysis"],
    },
    "teaching": {
        "resume": ["mentored undergraduates", "led discussion sections"],
        "job": ["teaching experience", "mentoring students"],
    },
    "writing": {
        "resume": ["peer-reviewed publications", "journal articles"],
        "job": ["strong publication record", "scientific writing"],
    },
    "hpc": {
        "resume": ["cluster computing", "GPU clusters"],
        "job": ["high-performance computing", "large-scale training"],
    },
    "fairness": {
        "resume": ["algorithmic fairness", "bias auditing"],
        "job": ["responsible AI", "fairness in ML"],
    },
}

FIELDS = {
    "ml": "machine learning",
    "compbio": "computational biology",
    "neurosci": "computational neuroscience",
    "hci": "human-computer interaction",
    "robotics": "robotics",
}

ROLE_TYPES = [
    "postdoc",
    "assistant_professor",
    "lecturer",
    "research_scientist",
    "industry_research",
]

DEGREE_RANK = {"bs": 0, "ms": 1, "phd": 2}
DEGREE_LABEL = {"bs": "B.S.", "ms": "M.S.", "phd": "Ph.D."}

CITIES = [
    "Boston, MA",
    "San Francisco, CA",
    "Seattle, WA",
    "Austin, TX",
    "Chicago, IL",
    "New York, NY",
    "Pittsburgh, PA",
    "Madison, WI",
    "Ann Arbor, MI",
    "Denver, CO",
]

INSTITUTIONS = [
    "Northbridge University",
    "Lakeview Institute of Technology",
    "Cedar Hill College",
    "Bay Area Research Lab",
    "Midwest Medical School",
]

COMPANIES = [
    ("Northbridge University", "university"),
    ("Lakeview Institute of Technology", "university"),
    ("Cedar Hill College", "university"),
    ("Midwest Medical School", "university"),
    ("Bay Area Research Lab", "lab"),
    ("Harbor Machine Learning", "industry"),
    ("Lumen Bioworks", "industry"),
    ("Northwind Robotics", "industry"),
]

CONTACT_ROLES = ["recruiter", "engineer", "hiring_manager", "executive"]

CONTACT_FIRST_NAMES = [
    "Riley", "Quinn", "Harper", "Skyler", "Rowan", "Avery", "Parker", "Reese",
    "Finley", "Emerson", "Hayden", "Sawyer", "Cameron", "Blake", "Drew", "Jules",
]
CONTACT_LAST_NAMES = [
    "Brooks", "Iyer", "Santos", "Nakamura", "Berg", "Okeke", "Laurent", "Shah",
    "Walsh", "Cho", "Adler", "Mensah", "Petrov", "Singh", "Moreau", "Kaplan",
]

FIRST_NAMES = ["Ava", "Jordan", "Priya", "Marcus", "Elena", "Sam", "Noah", "Mei", "Diego"]
LAST_NAMES = ["Chen", "Okonkwo", "Patel", "Nguyen", "Garcia", "Kim", "Rossi", "Ali", "Fischer"]
