"""Offline checks for the parts that produce ground truth and scores. Run: python3 test_oracle.py"""
from oracle import z_label, score, baseline, examples

assert z_label(100, 1000, 200, 1000) == "up"
assert z_label(200, 1000, 100, 1000) == "down"
assert z_label(100, 1000, 105, 1000) == "flat"

perfect = [{"label": c, "pred": c} for c in ["up", "down", "flat"]]
assert score(perfect)["macro_f1"] == 1.0
assert score([{"label": "up", "pred": "down"}])["macro_f1"] == 0.0
assert baseline([{"label": "up"}, {"label": "up"}, {"label": "down"}])["accuracy"] == 0.667

exs, n = examples("7.40")  # cached data, no network
assert n > 1000 and all(e["label"] in ("up", "down", "flat") and e["notes"] for e in exs)
from oracle import names_hero
assert names_hero("Nerfs to Anti-Mage's blink") == ["Anti-Mage"] and names_hero("Tiny numeric buffs stay flat") == []
from oracle import p_better
wrong = [{"label": c, "pred": "flat" if c != "flat" else "up"} for c in ["up", "down", "flat"]]
assert p_better(perfect * 10, wrong * 10) > 0.99 and p_better(perfect * 10, perfect * 10) == 0.0
from oracle import recall, TRAIN, VAL
pool = [e for p in TRAIN + VAL for e in examples(p)[0]]
got = recall(exs[0], pool)
assert len(got) == 4 and all(m["patch"] in TRAIN + VAL for m in got)  # memory never holds a held-out label
print("ok")
