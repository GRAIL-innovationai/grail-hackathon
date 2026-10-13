#!/usr/bin/env python3
"""Patch Oracle: predicts how a Dota 2 patch shifts each hero's pro pick rate,
scores itself against real match data, and rewrites its own playbook when the
evals say it was wrong.

  python3 oracle.py data      # fetch + cache patch notes and match stats, show labels
  python3 oracle.py improve   # offline evals + self-improvement loop -> runs/
  python3 oracle.py online    # score the best playbook on the live patch -> runs/
  python3 oracle.py ablate    # does the model read the notes? held-out with notes hidden -> runs/
  python3 oracle.py memory    # held-out with similar past cases and their real outcomes in the prompt -> runs/
  python3 oracle.py report    # print the stored results (no API key needed)
"""
import json, math, os, random, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).parent
DATA, RUNS, BOOKS = ROOT / "data", ROOT / "runs", ROOT / "playbooks"
TRAIN, VAL, TEST, ONLINE = ["7.38"], ["7.39"], ["7.40", "7.41"], "7.41f"
CLASSES = ["up", "down", "flat"]


def env(key, default=None):
    f = ROOT / ".env"
    for line in f.read_text().splitlines() if f.exists() else []:
        k, _, v = line.partition("=")
        if k.strip() == key:
            return v.strip().strip('"')
    return os.environ.get(key, default)


MODEL = env("MODEL", "google/gemma-4-31b-it")
REFLECT_MODEL = env("REFLECT_MODEL", "anthropic/claude-haiku-5.5")
BUDGET = float(env("BUDGET_USD", "1.0"))  # hard stop on OpenRouter spend per command
spent = 0.0


# ---------- data ----------

def emit(kind, **d):
    """Append a progress event; the ui/ page animates runs/events.jsonl live."""
    RUNS.mkdir(exist_ok=True)
    with open(RUNS / "events.jsonl", "a") as f:
        f.write(json.dumps({"t": round(time.time(), 2), "kind": kind, **d}) + "\n")


def get(url, body=None, headers=None):
    req = urllib.request.Request(url, data=body, headers={"User-Agent": "patch-oracle", **(headers or {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3 or getattr(e, "code", 500) in (400, 401, 402, 403, 404):
                raise
            time.sleep(2 ** attempt)


def cached(name, fn):
    f = DATA / f"{name}.json"
    if not f.exists():
        DATA.mkdir(exist_ok=True)
        f.write_text(json.dumps(fn(), indent=1))
    return json.loads(f.read_text())


def sql(q):
    return get("https://api.opendota.com/api/explorer?sql=" + urllib.parse.quote(q))["rows"]


def stats(t0, t1):
    """Pro-match picks and wins per hero in [t0, t1). Source: OpenDota explorer."""
    rows = sql(f"""select pm.hero_id, count(*) picks,
        sum(case when (pm.player_slot < 128) = m.radiant_win then 1 else 0 end) wins
        from matches m join player_matches pm using(match_id)
        where m.start_time >= {t0} and m.start_time < {t1} group by 1""")
    n = sql(f"select count(*) n from matches where start_time >= {t0} and start_time < {t1}")[0]["n"]
    return {"window": [t0, t1], "matches": int(n),
            "heroes": {str(r["hero_id"]): [int(r["picks"]), int(r["wins"])] for r in rows}}


def patches():
    return {p["patch_number"]: p["patch_timestamp"] for p in cached(
        "patches", lambda: get("https://www.dota2.com/datafeed/patchnoteslist?language=english")["patches"])}


def windows(p):
    """Before/after time windows. Major patch: whole previous cycle vs whole cycle.
    Letter patch: previous letter patch vs this one."""
    ts = patches()
    major = lambda x: re.fullmatch(r"\d+\.\d+", x)
    kind = [x for x in ts if major(x)] if major(p) else list(ts)
    i = kind.index(p)
    end = ts[kind[i + 1]] if i + 1 < len(kind) else int(time.time())
    return (ts[kind[i - 1]], ts[p]), (ts[p], end)


def hero_names():
    return {k: v["localized_name"] for k, v in cached(
        "heroes", lambda: get("https://api.opendota.com/api/constants/heroes")).items()}


def notes(p):
    def fetch():
        ab = get("https://api.opendota.com/api/constants/ability_ids")
        d = get(f"https://www.dota2.com/datafeed/patchnotes?version={p}&language=english")
        out = {}
        for h in d.get("heroes") or []:
            lines = [n["note"] for n in h.get("hero_notes") or []]
            lines += [f"[talent] {n['note']}" for n in h.get("talent_notes") or []]
            for a in h.get("abilities") or []:
                name = ab.get(str(a["ability_id"]), str(a["ability_id"]))
                lines += [f"[{name}] {n['note']}" for n in a.get("ability_notes") or []]
            if lines:
                out[str(h["hero_id"])] = lines
        return out
    return cached(f"notes_{p}", fetch)


def z_label(k1, n1, k2, n2):
    """Two-proportion z-test on pick rate: up / down / flat at 95%."""
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)) or 1
    z = (k2 / n2 - k1 / n1) / se
    return "up" if z > 1.96 else "down" if z < -1.96 else "flat"


def examples(p, live=False):
    (b0, b1), (a0, a1) = windows(p)
    before = cached(f"stats_{p}_before", lambda: stats(b0, b1))
    after = stats(a0, a1) if live else cached(f"stats_{p}_after", lambda: stats(a0, a1))
    heroes, out = cached("heroes", lambda: get("https://api.opendota.com/api/constants/heroes")), []
    picks = sorted(k for k, _ in before["heroes"].values())
    for hid, lines in notes(p).items():
        kb, wb = before["heroes"].get(hid, [0, 0])
        ka, wa = after["heroes"].get(hid, [0, 0])
        h = heroes.get(hid, {})
        out.append({"patch": p, "id": hid, "hero": h.get("localized_name", hid), "notes": lines,
                    "img": "https://cdn.cloudflare.steamstatic.com" + h.get("img", ""),
                    "pick_before": round(100 * kb / before["matches"], 1),
                    "win_before": round(100 * wb / kb, 1) if kb else None,
                    "more_popular_than": round(100 * sum(k < kb for k in picks) / len(picks)),
                    "pick_after": round(100 * ka / after["matches"], 1),
                    "label": z_label(kb, before["matches"], ka, after["matches"])})
    return out, after["matches"]


# ---------- model ----------

def llm(system, user, model=MODEL, temperature=0):
    global spent
    key = env("OPENROUTER_API_KEY") or sys.exit("Set OPENROUTER_API_KEY in .env (see README).")
    if spent > BUDGET:
        sys.exit(f"Budget of ${BUDGET} reached (spent ${spent:.3f}).")
    # Fixed seed, no hidden reasoning, and one fp8 provider first: by default OpenRouter routes each call to a
    # random provider (fp4 to bf16), which adds run-to-run noise. Providers that don't serve the model are skipped.
    body = json.dumps({"model": model, "temperature": temperature, "seed": 0, "reasoning": {"effort": "none"},
                       "provider": {"order": ["parasail/fp8", "deepinfra/fp8"], "allow_fallbacks": True},
                       "usage": {"include": True}, "messages": [
        {"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    r = get("https://openrouter.ai/api/v1/chat/completions", body,
            {"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    spent += r.get("usage", {}).get("cost", 0)
    return r["choices"][0]["message"]["content"]


PREDICT = """For each hero below, predict how its PRO-match pick rate changes in this patch
compared with the previous one: "up", "down" or "flat" (no statistically significant change).
Return only a JSON array: [{{"id": "<hero id>", "pick": "up|down|flat", "why": "<max 12 words>"}}]

Patch {patch}. Heroes:
{heroes}"""


def predict(batch, book):
    heroes = "\n".join(
        f"- id {e['id']} {e['hero']} (pick rate before {e['pick_before']}%, more popular than "
        f"{e['more_popular_than']}% of heroes, win rate before {e['win_before']}%)\n"
        + "\n".join(f"  * {n}" for n in e["notes"][:25])
        + "".join(f"\n  past case, measured: {m['hero']} in {m['patch']}, pick {m['pick_before']}% -> {m['pick_after']}% "
                  f"({m['label']}). Changes: {' | '.join(m['notes'][:4])}" for m in e.get("memory", [])) for e in batch)
    system = "You are a Dota 2 pro-meta analyst. Follow this playbook:\n\n" + book
    for _ in range(3):
        try:
            text = llm(system, PREDICT.format(patch=batch[0]["patch"], heroes=heroes))
            got = {str(x["id"]): x for x in json.loads(text[text.index("["): text.rindex("]") + 1])}
            return [{**e, "pred": got.get(e["id"], {}).get("pick", "flat"),
                     "why": got.get(e["id"], {}).get("why", "")} for e in batch]
        except (ValueError, KeyError):
            continue
    return [{**e, "pred": "flat", "why": "unparseable model output"} for e in batch]


def run(exs, book, phase, size=20):
    batches = [exs[i:i + size] for i in range(0, len(exs), size)]
    with ThreadPoolExecutor(8) as pool:
        futs = [pool.submit(predict, b, book) for b in batches]
        for f in as_completed(futs):
            for p in f.result():
                emit("pred", phase=phase, patch=p["patch"], hero=p["hero"], img=p["img"], note=p["notes"][0],
                     pred=p["pred"], label=p["label"], why=p["why"], before=p["pick_before"], after=p["pick_after"])
    preds = [p for f in futs for p in f.result()]
    emit("score", phase=phase, **score(preds))
    return preds


def score(preds):
    """Macro-F1 over up/down/flat (primary), plus accuracy and the confusion counts."""
    f1s = []
    for c in CLASSES:
        tp = sum(p["pred"] == c == p["label"] for p in preds)
        fp = sum(p["pred"] == c != p["label"] for p in preds)
        fn = sum(p["label"] == c != p["pred"] for p in preds)
        f1s.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    conf = {f"{a}->{b}": sum(p["label"] == a and p["pred"] == b for p in preds) for a in CLASSES for b in CLASSES}
    return {"macro_f1": round(sum(f1s) / 3, 3),
            "accuracy": round(sum(p["pred"] == p["label"] for p in preds) / len(preds), 3),
            "n": len(preds), "confusion": conf}


def baseline(exs):
    """Honest floor: always predict the majority class."""
    labels = [e["label"] for e in exs]
    return score([{**e, "pred": max(CLASSES, key=labels.count)} for e in exs])


def popularity_preds(exs):
    """No notes, no LLM: heroes picked more than the patch median go down, the rest go up
    (regression to the mean). The bar the playbook has to beat."""
    med = {p: sorted(e["pick_before"] for e in exs if e["patch"] == p) for p in {e["patch"] for e in exs}}
    med = {p: v[len(v) // 2] for p, v in med.items()}
    return [{**e, "pred": "down" if e["pick_before"] > med[e["patch"]] else "up"} for e in exs]


def popularity_baseline(exs):
    return score(popularity_preds(exs))


def p_better(a, b, n=1000):
    """Paired bootstrap over heroes: share of resamples where predictions a beat b on macro-F1.
    a and b must cover the same heroes in the same order."""
    rng, idx = random.Random(0), range(len(a))
    wins = 0
    for _ in range(n):
        s = rng.choices(idx, k=len(a))
        wins += score([a[i] for i in s])["macro_f1"] > score([b[i] for i in s])["macro_f1"]
    return wins / n


def by_popularity(preds):
    """Metric feedback for the reflector: outcomes and accuracy per third of prior pick rate."""
    xs = sorted(p["pick_before"] for p in preds)
    lo, hi = xs[len(xs) // 3], xs[2 * len(xs) // 3]
    out = []
    for name, g in [(f"least picked third (<= {lo}%)", [p for p in preds if p["pick_before"] <= lo]),
                    (f"middle third", [p for p in preds if lo < p["pick_before"] <= hi]),
                    (f"most picked third (> {hi}%)", [p for p in preds if p["pick_before"] > hi])]:
        count = lambda key: "/".join(str(sum(p[key] == c for p in g)) for c in CLASSES)
        out.append(f"- {name}: actual up/down/flat {count('label')}, predicted {count('pred')}, "
                   f"accuracy {sum(p['pred'] == p['label'] for p in g) / max(len(g), 1):.0%}")
    return "\n".join(out)


# ---------- self-improvement ----------

REFLECT = """You maintain a playbook that a model follows to predict how Dota 2 patch changes
shift each hero's PRO pick rate (up / down / flat = no significant change).

Current playbook:
---
{book}
---
On the training patch it scored macro-F1 {f1}. Confusion (actual->predicted): {conf}
Outcomes by the hero's pick rate before the patch:
{popularity}
A sample of its mistakes:
{errors}

{rejected}
Improve the playbook with a SMALL edit: keep the rules that work, and add, change or remove
at most 3 rules to fix the biggest pattern behind these mistakes. Look at which kinds of
changes really move pro pick rates, how big a change must be, how the hero's prior
popularity matters, and when "flat" is the right call. Rules must generalise to future
patches: never mention a specific hero by name. At most {max_words} words, markdown bullets.
Return only the playbook text."""


def reflect(book, preds, s, rng, rejected=""):
    wrong = [p for p in preds if p["pred"] != p["label"]]
    errors = "\n".join(
        f"- predicted {p['pred']}, actual {p['label']} (pick {p['pick_before']}% -> {p['pick_after']}%). "
        f"Changes: {' | '.join(p['notes'][:8])}" for p in rng.sample(wrong, min(30, len(wrong))))
    return llm("You are an expert prompt engineer and Dota 2 analyst.",
               REFLECT.format(book=book, f1=s["macro_f1"], conf=s["confusion"], errors=errors,
                              popularity=by_popularity(preds), rejected=rejected, max_words=MAX_WORDS),
               REFLECT_MODEL, temperature=0.7).strip()


# ponytail: hero names that are also English words can't be told apart from prose, so they are skipped
WORDS = {"Tiny", "Lion", "Doom", "Oracle", "Razor", "Sniper", "Tinker", "Warlock", "Weaver", "Undying",
         "Enigma", "Silencer", "Visage", "Mars", "Spectre"}


def names_hero(book):
    return [n for n in hero_names().values()
            if len(n) > 3 and n not in WORDS and re.search(rf"\b{re.escape(n)}\b", book)]


GATE = 0.8  # a rewrite is kept only if it beats the best playbook in this share of validation resamples
MAX_WORDS = 400  # enforced here, not just asked for in the prompt: longer playbooks overfit and cost more


def improve(rounds=3):
    """Reflect on train mistakes, keep a rewrite only if it reliably beats the best playbook
    on the validation patch, then score on held-out patches the loop never saw."""
    # demo-page runs (serve.py sets PO_LIVE) must not overwrite the recorded results
    books, out = (RUNS / "live", RUNS / "live") if os.environ.get("PO_LIVE") else (BOOKS, RUNS)
    out.mkdir(parents=True, exist_ok=True)
    train, val, test = ([e for p in ps for e in examples(p)[0]] for ps in (TRAIN, VAL, TEST))
    book, version = (BOOKS / "v0.md").read_text(), 0
    emit("start", cmd="improve", model=MODEL, reflect_model=REFLECT_MODEL, train=TRAIN, val=VAL, test=TEST,
         playbook=book, val_baselines={"majority": baseline(val)["macro_f1"],
                                       "popularity": popularity_baseline(val)["macro_f1"]})
    preds = run(train, book, "train · v0")
    best = score(best_val := run(val, book, "val · v0"))
    history = [{"version": 0, "train": score(preds), "val": best, "accepted": True}]
    print(f"v0 val macro-F1 {best['macro_f1']}")
    rng, rejected = random.Random(0), ""
    for r in range(1, rounds + 1):
        emit("reflect", version=r)
        cand = reflect(book, preds, score(preds), rng, rejected)
        words = len(cand.split())
        why = (f"it names heroes {leaks}" if (leaks := names_hero(cand)) else
               f"it is {words} words, over the {MAX_WORDS}-word limit" if words > MAX_WORDS else "")
        if why:
            emit("playbook", version=r, text=cand, accepted=False, reason=why)
            history.append({"version": r, "rejected": why})
            rejected += f"A previous attempt was discarded because {why}. Try again. It was:\n{cand}\n\n"
            print(f"v{r} rejected: {why}")
            continue
        emit("playbook", version=r, text=cand, accepted=None)
        (books / f"v{r}.md").write_text(cand + "\n")
        cand_preds = run(train, cand, f"train · v{r}")
        s = score(cand_val := run(val, cand, f"val · v{r}"))
        p = p_better(cand_val, best_val)
        ok = p >= GATE
        emit("gate", version=r, f1=s["macro_f1"], best=best["macro_f1"], p=p, accepted=ok)
        history.append({"version": r, "train": score(cand_preds), "val": s, "p_better": p, "accepted": ok})
        print(f"v{r} val macro-F1 {s['macro_f1']} vs {best['macro_f1']}, wins {p:.0%} of resamples "
              f"-> {'ACCEPTED' if ok else 'rejected'}")
        if ok:
            book, version, best, best_val, preds, rejected = cand, r, s, cand_val, cand_preds, ""
        else:
            rejected += (f"A previous attempt scored {s['macro_f1']} on the validation patch against {best['macro_f1']} "
                         f"and won only {p:.0%} of resamples (needs {GATE:.0%}), so it was discarded. "
                         f"Try a different fix. It was:\n{cand}\n\n")
    (books / "best.md").write_text(book + "\n")
    emit("test", baseline=baseline(test)["macro_f1"], popularity=popularity_baseline(test)["macro_f1"])
    v0_test = score(v0_preds := run(test, (BOOKS / "v0.md").read_text(), "held-out · v0"))
    best_test = score(test_preds := run(test, book, f"held-out · v{version}"))
    # how often the best playbook beats each reference when the held-out heroes are resampled
    p_test = {"vs_seed_v0": p_better(test_preds, v0_preds), "vs_popularity": p_better(test_preds, popularity_preds(test))}
    result = {"model": MODEL, "reflect_model": REFLECT_MODEL, "train_patches": TRAIN, "val_patches": VAL,
              "test_patches": TEST, "history": history, "best_version": version,
              "test": {"majority_baseline": baseline(test), "popularity_baseline": popularity_baseline(test),
                       "seed_v0": v0_test, f"best_v{version}": best_test}, "test_p_better": p_test,
              "gate": GATE, "max_words": MAX_WORDS, "spent_usd": round(spent, 4)}
    (out / "offline.json").write_text(json.dumps(result, indent=1))
    (out / "test_predictions.json").write_text(json.dumps(test_preds, indent=1))
    emit("done", cmd="improve", best_version=version, spent=round(spent, 4), test=result["test"])
    print(f"held-out {TEST}: majority {baseline(test)['macro_f1']}, popularity {popularity_baseline(test)['macro_f1']}, "
          f"v0 {v0_test['macro_f1']}, v{version} {best_test['macro_f1']}")


def online():
    """Online eval: the live patch keeps collecting matches; every run re-fetches them."""
    out = RUNS / "live" if os.environ.get("PO_LIVE") else RUNS  # demo-page runs keep the recorded log intact
    out.mkdir(parents=True, exist_ok=True)
    exs, n = examples(ONLINE, live=True)
    emit("start", cmd="online", model=MODEL, patch=ONLINE, matches=n, playbook=(BOOKS / "best.md").read_text())
    preds = run(exs, (BOOKS / "best.md").read_text(), f"online · {ONLINE}")
    s = {"patch": ONLINE, "at": time.strftime("%Y-%m-%d %H:%M"), "model": MODEL, "matches_since_patch": n,
         "baseline": baseline(exs), "popularity_baseline": popularity_baseline(exs), "best": score(preds)}
    log = json.loads((out / "online.json").read_text()) if (out / "online.json").exists() else []
    (out / "online.json").write_text(json.dumps(log + [s], indent=1))
    (out / "online_predictions.json").write_text(json.dumps(preds, indent=1))
    emit("done", cmd="online", spent=round(spent, 4), **s)
    print(json.dumps(s, indent=1))


def data():
    for p in TRAIN + VAL + TEST + [ONLINE]:
        exs, n = examples(p)
        print(p, f"{len(exs)} heroes changed, {n} pro matches after,",
              {c: sum(e["label"] == c for e in exs) for c in CLASSES})


def ablate():
    """Does the model read the patch notes, or only the popularity numbers? Same best playbook,
    same held-out heroes, once with the notes and once with them hidden."""
    test, book = [e for p in TEST for e in examples(p)[0]], (BOOKS / "best.md").read_text()
    full = run(test, book, "ablation · notes shown")
    blind = run([{**e, "notes": ["(patch notes hidden)"]} for e in test], book, "ablation · notes hidden")
    s = {"model": MODEL, "patches": TEST, "notes_shown": score(full), "notes_hidden": score(blind),
         "p_notes_help": p_better(full, blind), "popularity_baseline": popularity_baseline(test),
         "p_beats_popularity": p_better(full, popularity_preds(test)),
         "spent_usd": round(spent, 4)}
    (RUNS / "ablation.json").write_text(json.dumps(s, indent=1))
    print(f"held-out macro-F1: notes shown {s['notes_shown']['macro_f1']}, notes hidden {s['notes_hidden']['macro_f1']}, "
          f"popularity rule {s['popularity_baseline']['macro_f1']}; notes help in {s['p_notes_help']:.0%} of resamples, "
          f"beats the popularity rule in {s['p_beats_popularity']:.0%}")


def recall(e, pool, k=4):
    """Episodic memory: the k past changes whose notes share the most words with this one (Jaccard)."""
    # ponytail: bag-of-words overlap, no embeddings; ability names make a hero's own past changes rank high
    words = lambda x: set(re.findall(r"[a-z]+", " ".join(x["notes"]).lower()))
    w = words(e)
    return sorted(pool, key=lambda m: -len(w & words(m)) / len(w | words(m)))[:k]


def memory(k=4):
    """Does context beat rules alone? Same best playbook on the held-out heroes, once as usual and once with
    the k most similar past changes and their measured outcomes. Memory holds only patches released before
    every held-out patch (train + validation), so no future label leaks in."""
    pool = [e for p in TRAIN + VAL for e in examples(p)[0]]
    test, book = [e for p in TEST for e in examples(p)[0]], (BOOKS / "best.md").read_text()
    off = run(test, book, "memory · off")
    on = run([{**e, "memory": recall(e, pool, k)} for e in test], book, "memory · on")
    s = {"model": MODEL, "patches": TEST, "memory_patches": TRAIN + VAL, "k": k,
         "memory_off": score(off), "memory_on": score(on), "p_memory_helps": p_better(on, off),
         "p_beats_popularity": p_better(on, popularity_preds(test)), "popularity_baseline": popularity_baseline(test),
         "spent_usd": round(spent, 4)}
    (RUNS / "memory.json").write_text(json.dumps(s, indent=1))
    print(f"held-out macro-F1: memory off {s['memory_off']['macro_f1']}, memory on {s['memory_on']['macro_f1']}, "
          f"popularity rule {s['popularity_baseline']['macro_f1']}; memory helps in {s['p_memory_helps']:.0%} of "
          f"resamples, beats the popularity rule in {s['p_beats_popularity']:.0%}")


def report():
    for f in ["offline.json", "online.json", "ablation.json", "memory.json"]:
        if (RUNS / f).exists():
            print(f"== {f}\n" + (RUNS / f).read_text())


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    {"data": data, "improve": lambda: improve(int(sys.argv[2]) if len(sys.argv) > 2 else 3),
     "online": online, "ablate": ablate, "memory": memory, "report": report}[cmd]()
