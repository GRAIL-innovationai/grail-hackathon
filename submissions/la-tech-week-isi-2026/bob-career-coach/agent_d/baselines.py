"""Baseline that only reorders existing resume lines toward the job."""

COPY_BASELINE = '''
def tailor_resume(train, tasks):
    """Algorithm: reorder existing lines.
    Idea: keep every original line, and move lines that share words with the job to the top.
    Procedure:
      1. Tokenize the job title and description.
      2. Stable-partition resume lines so overlapping lines come first.
      3. Do not add or rephrase any line.
    """
    import re

    def tokens(text):
        return set(re.findall(r"[a-zA-Z]{4,}", (text or "").lower()))

    out = []
    for task in tasks:
        job = task["job"]
        job_tokens = tokens(job.get("title", "") + " " + job.get("description", ""))
        lines = task["resume"].splitlines()
        head = [line for line in lines if tokens(line) & job_tokens]
        tail = [line for line in lines if line not in head]
        out.append({"task_id": task["task_id"], "tailored_resume": "\\n".join(head + tail)})
    return out
'''.strip()
