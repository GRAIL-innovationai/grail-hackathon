"""Small, inspectable vocabulary; no inferred proficiency or invented skills."""

import re
import unicodedata


ALIASES = {
    "Python": ("python",),
    "JavaScript": ("javascript", "js"),
    "TypeScript": ("typescript", "ts"),
    "Java": ("java",),
    "C++": ("c++", "cpp"),
    "C#": ("c#", "c sharp"),
    "Go": ("golang", "go"),
    "Rust": ("rust",),
    "Ruby": ("ruby",),
    "Swift": ("swift",),
    "Kotlin": ("kotlin",),
    "SQL": ("sql",),
    "React": ("react", "react.js", "reactjs"),
    "Next.js": ("next.js", "nextjs"),
    "Node.js": ("node.js", "nodejs"),
    "HTML": ("html", "html5"),
    "CSS": ("css", "css3"),
    "FastAPI": ("fastapi",),
    "Flask": ("flask",),
    "Django": ("django",),
    "PostgreSQL": ("postgresql", "postgres"),
    "MySQL": ("mysql",),
    "MongoDB": ("mongodb",),
    "Redis": ("redis",),
    "Git": ("git",),
    "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"),
    "AWS": ("aws", "amazon web services"),
    "Azure": ("azure",),
    "GCP": ("gcp", "google cloud"),
    "Linux": ("linux",),
    "Terraform": ("terraform",),
    "CI/CD": ("ci/cd", "continuous integration"),
    "Machine Learning": ("machine learning", "ml"),
    "Deep Learning": ("deep learning",),
    "PyTorch": ("pytorch", "torch-based models"),
    "TensorFlow": ("tensorflow", "tf pipelines"),
    "scikit-learn": ("scikit-learn", "sklearn"),
    "pandas": ("pandas",),
    "NumPy": ("numpy",),
    "R": ("r",),
    "Tableau": ("tableau",),
    "Power BI": ("power bi",),
    "Excel": ("excel",),
    "Figma": ("figma",),
    "Data Analysis": ("data analysis", "data analytics"),
    "Data Visualization": ("data visualization",),
    "Statistics": ("statistics", "stats", "statistical analysis", "statistical modeling", "bayesian inference", "probabilistic modeling"),
    "A/B Testing": ("a/b testing", "ab testing"),
    "NLP": ("nlp", "natural language processing", "computational linguistics"),
    "Computer Vision": ("cv", "computer vision", "image understanding", "visual recognition"),
    "Reinforcement Learning": ("rl", "reinforcement learning", "rl agents", "sequential decision making"),
    "Genomics": ("genomics", "genomic data analysis", "single-cell rna-seq", "high-throughput sequencing"),
    "Neuroscience": ("neuro", "neuroscience", "computational neuroscience", "neural recording analysis", "neural data analysis"),
    "Teaching": ("teaching", "mentored undergraduates", "led discussion sections", "teaching experience", "mentoring students"),
    "Scientific Writing": ("scientific writing", "peer-reviewed publications", "journal articles", "strong publication record"),
    "High Performance Computing": ("hpc", "high-performance computing", "cluster computing", "gpu clusters", "large-scale training"),
    "Responsible AI": ("fairness", "algorithmic fairness", "bias auditing", "responsible ai", "fairness in ml"),
    "Airflow": ("airflow",),
    "Spark": ("spark", "apache spark"),
    "LangChain": ("langchain",),
    "GraphQL": ("graphql",),
    "REST APIs": ("rest api", "rest apis", "restful"),
    "Testing": ("unit testing", "automated testing", "pytest", "jest"),
    "Communication": ("communication",),
    "Leadership": ("leadership",),
    "Project Management": ("project management",),
}


def clean_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value).replace("\x00", "")


def compact(value: str) -> str:
    return " ".join(clean_text(value).split())


def alias_pattern(alias: str) -> str:
    return r"(?<![\w+#])" + re.escape(alias) + r"(?![\w+#])"


def canonical_skill(value: str) -> str:
    value = compact(value)
    for canonical, aliases in ALIASES.items():
        if value.casefold() in {canonical.casefold(), *(alias.casefold() for alias in aliases)}:
            return canonical
    return value


def skill_key(value: str) -> str:
    return canonical_skill(value).casefold()


def skill_in_text(skill: str, text: str) -> bool:
    canonical = canonical_skill(skill)
    aliases = ALIASES.get(canonical, (canonical,))
    return any(re.search(alias_pattern(alias), text, re.I) for alias in aliases)


def non_qualification(text: str) -> bool:
    return bool(re.search(
        r"\b(?:no (?:experience|knowledge)(?: with| in| of)?|not familiar with|"
        r"(?:do not|don't) know|without|learning|want to learn|plan to (?:learn|use|build))\b", text, re.I
    ))


def mentioned_skills(text: str, *, explicit: bool = False) -> list[str]:
    results = []
    for canonical, aliases in ALIASES.items():
        for alias in aliases:
            # Bare Go and R are too ambiguous outside a skills list.
            if not explicit and alias in {"go", "r", "ts", "js", "cv", "rl"}:
                continue
            match = re.search(alias_pattern(alias), text, re.I)
            if match:
                before = re.split(r"[,;.!?]", text[:match.start()])[-1]
                if non_qualification(before):
                    continue
                results.append(canonical)
                break
    return results


def tokens(text: str) -> set[str]:
    words = set(re.findall(r"[a-z0-9]+(?:[+#]+)?", clean_text(text).casefold()))
    expansions = {
        "swe": {"software", "engineer"},
        "sde": {"software", "engineer"},
        "engineering": {"engineer"},
        "developer": {"engineer"},
        "development": {"engineer"},
        "analyst": {"analysis"},
        "analytics": {"analysis"},
        "ml": {"machine", "learning"},
        "frontend": {"front", "end"},
        "backend": {"back", "end"},
        "internship": {"intern"},
    }
    for word in tuple(words):
        words.update(expansions.get(word, ()))
    return words - {"a", "an", "and", "at", "for", "in", "of", "the", "to", "with", "i", "want", "looking", "seeking", "role", "job", "position"}
