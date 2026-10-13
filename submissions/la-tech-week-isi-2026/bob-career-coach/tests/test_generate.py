from pathlib import Path

from data.generate import generate_dataset, write_dataset


def test_generate_deterministic():
    a = generate_dataset(seed=7)
    b = generate_dataset(seed=7)
    assert a[0] == b[0]
    assert a[1] == b[1]
    assert a[2] == b[2]
    assert a[3] == b[3]


def test_dataset_sizes(tmp_path: Path):
    import json

    write_dataset(tmp_path, seed=1)
    jobs = (tmp_path / "jobs.json").read_text()
    assert '"job_id": "j099"' in jobs
    inputs = [json.loads(line) for line in (tmp_path / "inputs.jsonl").read_text().splitlines()]
    assert len(inputs) == 9
    profiles = [json.loads(line) for line in (tmp_path / "profiles.jsonl").read_text().splitlines()]
    assert len(profiles) == 9
    companies = json.loads((tmp_path / "companies.json").read_text())
    contacts = json.loads((tmp_path / "contacts.json").read_text())
    assert len(companies) == 8
    assert len(contacts) == 16
    match = [json.loads(line) for line in (tmp_path / "match_labels.jsonl").read_text().splitlines()]
    assert len(match) == 9
    for row in inputs:
        allowed = " ".join(
            phrase
            for skill in row["profile"]["skills"]
            for phrase in skill["truthful_phrases"]
        ).lower()
        for line in row["resume"].splitlines():
            if line.startswith("• Experience with "):
                phrase = line.removeprefix("• Experience with ")
                assert phrase.lower() in allowed
    splits = json.loads((tmp_path / "splits.json").read_text())
    assert len(splits["splits"]["train"]) == 3
    assert len(splits["splits"]["val"]) == 3
    assert len(splits["splits"]["test"]) == 3
    tasks = [json.loads(line) for line in (tmp_path / "tasks.jsonl").read_text().splitlines()]
    assert 6 <= len(tasks) <= 18
    train = [task for task in tasks if task["split"] == "train"]
    val = [task for task in tasks if task["split"] == "val"]
    assert train and all("target_keywords" in task for task in train)
    assert val and all("target_keywords" not in task for task in val)
    labels = [json.loads(line) for line in (tmp_path / "labels.jsonl").read_text().splitlines()]
    assert {row["task_id"] for row in labels} == {task["task_id"] for task in tasks}
