"""Fabrication linter. Pure, no LLM. A message may only contain facts that appear in the candidate's lines."""
import re

from .schemas import Candidate, Lint

TOOLS = {
    "kafka", "kubernetes", "k8s", "react", "fastapi", "postgresql", "postgres", "docker", "aws", "azure",
    "gcp", "spark", "airflow", "redis", "pytorch", "tensorflow", "langchain", "llamaindex", "graphql",
    "terraform", "python", "java", "javascript", "typescript", "golang", "rust", "c++", "c#", "scala",
    "kotlin", "sql", "mysql", "mongodb", "elasticsearch", "snowflake", "bigquery", "databricks",
    "dbt", "flink", "hadoop", "django", "flask", "node.js", "next.js", "vue", "angular", "pandas", "numpy",
    "scikit-learn", "jax", "cuda", "triton", "vllm", "mlflow", "kubeflow", "huggingface", "onnx",
    "grpc", "rabbitmq", "celery", "nginx", "prometheus", "grafana", "jenkins", "linux", "s3",
}
MONTHS = {
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
    "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov",
    "dec", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
}
STOP = MONTHS | {
    "i", "led", "built", "a", "an", "the", "and", "or", "but", "if", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "are", "was", "were", "be", "my", "your", "our", "their", "we", "you",
    "they", "it", "this", "that", "hi", "hello", "hey", "dear", "thanks", "thank", "best", "regards",
    "would", "could", "can", "will", "happy", "open", "quick", "ps",
}

NUM = re.compile(r"(?<![\w.$])(\$?\d[\d,]*(?:\.\d+)?)(\s?(?:%|\+|(?:k|m|b|x|ms|s|gb|tb)\b))?", re.I)
CAP = re.compile(r"\b[A-Z][\w+#]*(?:\.[A-Za-z]+)*")


def _found(token: str, haystack: str) -> bool:
    """Case-insensitive whole-token match; allows a trailing plural 's' and flexible number/unit spacing."""
    pat = r"\s?".join(re.escape(p) for p in token.lower().split())
    return re.search(rf"(?<![\w.]){pat}s?(?![\w])", haystack) is not None


def lint_message(text: str, candidate: Candidate, allow: str = "") -> Lint:
    """`allow` = recipient/company/title text the message may name (never job reqs: that is where fabrication comes from)."""
    haystack = " ".join(l.text for l in candidate.lines).lower() + " " + allow.lower()
    tokens: list[str] = [m.group(1) + (m.group(2) or "") for m in NUM.finditer(text)]
    for m in CAP.finditer(text):
        tok = m.group(0)
        if tok.lower() in STOP:
            continue
        # ponytail: a capitalised word that only starts a sentence ("Excited", "Open") is skipped unless it is
        # a known tool or has inner capitals (AWS, FastAPI). A brand-new proper noun at sentence start slips through.
        prev = text[: m.start()].rstrip()
        if (not prev or prev[-1] in ".!?:—–\n") and tok.lower() not in TOOLS and tok[1:].islower():
            continue
        tokens.append(tok)
    lower = text.lower()
    tokens += [t for t in TOOLS if re.search(rf"(?<![\w.]){re.escape(t)}(?![\w+#])", lower)]

    offending, seen = [], set()
    for t in tokens:
        key = t.lower().strip()
        if key not in seen and not _found(t.strip(), haystack):
            seen.add(key)
            offending.append(t.strip())
    return Lint(passed=not offending, offending=offending)
