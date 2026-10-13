import { useEffect, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

// ---------- copy: the system explained for anyone, with the technical detail underneath ----------

const STEPS = [
  { id: "read", title: "Read the patch notes", plain: "Valve publishes exactly what changed for each hero.",
    tech: "Valve's patch-notes datafeed · 479 hero changes across 4 patches", Visual: NoteVisual },
  { id: "predict", title: "Predict", plain: "An AI guesses: will pro players pick this hero more, less, or about the same?",
    tech: "an LLM follows a short written rulebook, the playbook", Visual: PredictVisual },
  { id: "check", title: "Check reality", plain: "We count how often pros actually picked the hero, before and after the patch.",
    tech: "OpenDota · 57,920 pro matches · two-proportion z-test at 95%", Visual: CheckVisual },
  { id: "score", title: "Grade it", plain: "A fair grade from 0 to 1. Answering the same thing every time scores low.",
    tech: "macro-F1: more, less and same count equally", Visual: ScoreVisual },
  { id: "learn", title: "Learn from mistakes", plain: "A second AI reads the wrong answers and edits the rulebook.",
    tech: "at most 3 rule edits per round · naming a hero is forbidden", Visual: LearnVisual },
  { id: "gate", title: "Keep it only if it's better", plain: "The edited rulebook must do better on a patch it never studied, or it's thrown away.",
    tech: "decided on patch 7.39: must win ≥ 80% of random re-draws · every version is saved", Visual: GateVisual },
];

const EXAM = [
  { patch: "7.38", date: "Feb 2025", role: "Study", text: "The AI predicts, sees its mistakes, and learns from them.", cls: "study" },
  { patch: "7.39", date: "May 2025", role: "Quiz", text: "An edited rulebook is kept only if it scores better here.", cls: "quiz" },
  { patch: "7.40 + 7.41", date: "Dec 2025 – Mar 2026", role: "Final exam", text: "Never used while learning. These are the scores we report.", cls: "exam" },
  { patch: "7.41f", date: "Sep 15, 2026", role: "Real life", text: "Pros are still playing it. Each check downloads the newest matches.", cls: "live" },
];

const SAY = { up: "▲ more", down: "▼ less", flat: "▬ same" };
const PLAIN = { train: "study", val: "quiz", "held-out": "final exam", online: "real life" };
const plainPhase = p => p.replace(/^(train|val|held-out|online)/, m => PLAIN[m]);

// ---------- live state: every event comes from oracle.py (runs/events.jsonl) or a recorded run ----------

const fresh = { active: [], phase: "", tally: { n: 0, ok: 0 }, feed: [], bars: [], book: null, exams: 0, spent: null, running: false };

function upsert(bars, bar) {
  const i = bars.findIndex(b => b.id === bar.id);
  if (i < 0) return [...bars, bar];
  const next = [...bars];
  next[i] = { ...next[i], ...Object.fromEntries(Object.entries(bar).filter(([, v]) => v != null)) };
  return next;
}

function reducer(s, e) {
  if (e.kind === "reset") return fresh;
  const phase = e.phase || "";
  if (phase.startsWith("ablation") || phase.startsWith("memory")) return s;  // side experiments share the event log
  switch (e.kind) {
    case "start": {
      let bars = [];
      if (e.val_baselines) {
        bars = [
          { id: "g-quiz", group: true, label: `Quiz · patch ${e.val.join(", ")} · decides what is kept` },
          { id: "q-maj", label: "Always answer the most common thing", cls: "base", value: e.val_baselines.majority },
          { id: "q-pop", label: "Simple rule: popular heroes drop", cls: "base", value: e.val_baselines.popularity },
        ];
      }
      if (e.cmd === "online") bars = [{ id: "g-live", group: true, label: `Real life · patch ${e.patch} · ${e.matches} pro matches so far` }];
      const book = e.playbook && { text: e.playbook, label: e.cmd === "online" ? "best rulebook" : "v0 · the starting rulebook", status: null };
      return { ...fresh, running: true, active: ["read"], bars, book };
    }
    case "pred": {
      const hit = e.pred === e.label;
      const tally = s.phase === phase ? { n: s.tally.n + 1, ok: s.tally.ok + hit } : { n: 1, ok: +hit };
      const feed = [{ ...e, key: `${e.t}-${e.hero}-${phase}` }, ...s.feed].slice(0, 18);
      return { ...s, active: ["predict", "check"], phase, tally, feed };
    }
    case "score": {
      if (phase.startsWith("train")) return { ...s, active: ["score"] };
      let bar;
      if (phase.startsWith("val")) {
        const v = phase.split("v").pop();
        bar = { id: `q-v${v}`, label: v === "0" ? "AI · starting rulebook (v0)" : `AI · edited rulebook v${v}`, cls: "ai", value: e.macro_f1 };
      } else if (phase.startsWith("held-out")) {
        bar = s.exams === 0
          ? { id: "e-v0", label: "AI · starting rulebook", cls: "ai dim", value: e.macro_f1 }
          : { id: "e-best", label: `AI · after learning (${phase.split(" · ").pop()})`, cls: "ai", value: e.macro_f1 };
      } else {
        bar = { id: "l-best", label: "AI · after learning", cls: "ai", value: e.macro_f1 };
      }
      return { ...s, active: ["score"], bars: upsert(s.bars, bar), exams: s.exams + phase.startsWith("held-out") };
    }
    case "reflect":
      return { ...s, active: ["learn"], book: s.book && { ...s.book, status: { text: "reading the mistakes…", cls: "pend" } } };
    case "playbook": {
      const rejected = e.accepted === false;
      const book = { text: e.text, label: `v${e.version} · proposed edit`,
        status: rejected ? { text: `thrown away: ${e.reason}`, cls: "rej" } : { text: "being tested on the quiz", cls: "pend" } };
      const bars = rejected ? upsert(s.bars, { id: `q-v${e.version}`, label: `AI · edited rulebook v${e.version}`, cls: "ai",
        tag: { text: `thrown away: ${e.reason}`, cls: "rej" } }) : s.bars;
      return { ...s, active: ["learn"], book, bars };
    }
    case "gate": {
      const why = e.p != null ? `wins ${Math.round(e.p * 100)}% of re-draws` : `${e.f1} vs ${e.best}`;
      const tag = e.accepted ? { text: `kept · ${why}`, cls: "kept" } : { text: `thrown away · ${why}`, cls: "rej" };
      return { ...s, active: ["gate"], bars: upsert(s.bars, { id: `q-v${e.version}`, tag }),
        book: s.book && { ...s.book, status: tag } };
    }
    case "test":
      return { ...s, active: ["check"], bars: [...s.bars,
        { id: "g-exam", group: true, label: "Final exam · patches 7.40 + 7.41 · never seen while learning" },
        { id: "e-maj", label: "Always answer the most common thing", cls: "base", value: e.baseline },
        { id: "e-pop", label: "Simple rule: popular heroes drop", cls: "base", value: e.popularity }] };
    case "done": {
      let bars = s.bars;
      if (e.cmd === "online") {
        bars = upsert(bars, { id: "l-maj", label: "Always answer the most common thing", cls: "base", value: e.baseline.macro_f1 });
        bars = upsert(bars, { id: "l-pop", label: "Simple rule: popular heroes drop", cls: "base", value: e.popularity_baseline.macro_f1 });
      }
      return { ...s, active: [], running: false, spent: e.spent, bars };
    }
    default:
      return s;
  }
}

// ---------- app ----------

export default function App() {
  const [state, dispatch] = useReducer(reducer, fresh);
  const [mode, setMode] = useState("idle");  // idle | live | replay
  const [notice, setNotice] = useState("");
  const [v0, setV0] = useState("");
  const [results, setResults] = useState(null);
  const [ablation, setAblation] = useState(null);
  const [memory, setMemory] = useState(null);
  const seen = useRef(null);
  const replaying = useRef(false);

  useEffect(() => {
    fetch("/playbooks/v0.md").then(r => r.text()).then(setV0).catch(() => {});
    Promise.all([fetch("/runs/offline.json").then(r => r.json()), fetch("/runs/online.json").then(r => r.json())])
      .then(([offline, online]) => setResults({ offline, online: online.at(-1) })).catch(() => {});
    fetch("/runs/ablation.json").then(r => r.json()).then(setAblation).catch(() => {});
    fetch("/runs/memory.json").then(r => r.json()).then(setMemory).catch(() => {});
  }, []);

  // live: follow runs/events.jsonl, which oracle.py appends to while it works
  useEffect(() => {
    const id = setInterval(async () => {
      if (replaying.current) return;
      try {
        const r = await fetch("/runs/events.jsonl?" + Date.now());
        const lines = r.ok ? (await r.text()).trim().split("\n").filter(Boolean) : [];
        if (seen.current === null || lines.length < seen.current) { seen.current = lines.length; return; }
        lines.slice(seen.current).forEach(l => {
          const e = JSON.parse(l);
          if (e.kind === "start") setMode("live");
          if (e.kind === "done" && !replaying.current) setMode("idle");
          dispatch(e);
        });
        seen.current = lines.length;
      } catch { /* server not up yet */ }
    }, 700);
    return () => clearInterval(id);
  }, []);

  async function run(cmd) {
    setNotice("");
    const r = await fetch("/run/" + cmd, { method: "POST" }).catch(() => null);
    if (!r) return setNotice("The demo server isn't running. Start it with: python3 serve.py");
    if (r.status === 409) return setNotice("A run is already in progress. Watch it below.");
    if (!r.ok) return setNotice("Live runs need the demo server: python3 serve.py");
    setMode("live");
    document.getElementById("live")?.scrollIntoView({ behavior: "smooth" });
  }

  async function replay() {
    if (replaying.current) return;
    const r = await fetch("/runs/recorded.jsonl").catch(() => null);
    if (!r?.ok) return setNotice("No recorded run found in runs/recorded.jsonl.");
    const events = (await r.text()).trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
    replaying.current = true; setMode("replay"); setNotice("");
    document.getElementById("live")?.scrollIntoView({ behavior: "smooth" });
    for (let i = 0; i < events.length && replaying.current; i++) {
      dispatch(events[i]);
      const gap = i + 1 < events.length ? (events[i + 1].t - events[i].t) * 1000 : 0;
      await new Promise(res => setTimeout(res, Math.min(Math.max(gap / 4, events[i].kind === "pred" ? 45 : 600), 1600)));
    }
    replaying.current = false; setMode("idle");
  }

  return (
    <>
      <TopBar mode={mode} onRun={() => run("improve")} onOnline={() => run("online")} onReplay={replay} />
      <main>
        <Hero onRun={() => run("improve")} onReplay={replay} notice={notice} />
        <HowItWorks active={state.active} />
        <ExamDesign />
        <Live state={state} mode={mode} v0={v0} />
        <Results results={results} ablation={ablation} memory={memory} />
        <footer>
          <p><b>Built with</b> Python standard library · OpenRouter LLMs · OpenDota explorer (pro-match SQL) · Valve's patch-notes datafeed · React + Motion for this page.</p>
          <p>Code and every number on this page: <a href="https://github.com/ThomasCantuti/patch-oracle">github.com/ThomasCantuti/patch-oracle</a></p>
        </footer>
      </main>
    </>
  );
}

// ---------- sections ----------

function TopBar({ mode, onRun, onOnline, onReplay }) {
  const label = { idle: "ready", live: "● AI working live", replay: "▶ replaying a recorded run" }[mode];
  return (
    <header className="top">
      <div className="logo">PATCH <b>ORACLE</b></div>
      <span className={`pill ${mode}`}>{label}</span>
      <nav>
        <a href="#how">How it works</a><a href="#exam">Keeping it honest</a><a href="#live">Watch it learn</a><a href="#results">Results</a>
      </nav>
      <div className="actions">
        <button className="primary" onClick={onRun} disabled={mode !== "idle"}>▶ Run it live</button>
        <button onClick={onOnline} disabled={mode !== "idle"}>Check today's patch</button>
        <button onClick={onReplay} disabled={mode !== "idle"}>Replay recorded run</button>
      </div>
    </header>
  );
}

function Hero({ onRun, onReplay, notice }) {
  return (
    <section className="hero">
      <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>Dota 2 · balance patches · self-improving AI</motion.p>
      <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}>
        Every balance patch is a guess.
      </motion.h1>
      <motion.p className="lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35, duration: .6 }}>
        When a game makes a hero weaker or stronger, nobody knows if it worked until weeks of matches have been played.
        <b> Patch Oracle</b> reads the patch notes and predicts which heroes pro players will pick more or less.
        It checks every guess against real pro matches, and it <b>rewrites its own rulebook</b> when it's wrong.
      </motion.p>
      <motion.div className="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .7 }}>
        <button className="primary big" onClick={onRun}>▶ Watch it learn, live</button>
        <button className="big" onClick={onReplay}>Replay a recorded run</button>
      </motion.div>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="facts">
        <Fact n="479" t="hero changes read" /><Fact n="57,920" t="pro matches counted" /><Fact n="5" t="patches, 2025–2026" />
      </div>
    </section>
  );
}

const Fact = ({ n, t }) => <div className="fact"><span>{n}</span><small>{t}</small></div>;

function HowItWorks({ active }) {
  return (
    <section id="how" className="section">
      <h2>How it works</h2>
      <p className="sub">Six steps on repeat. The AI only makes guesses. Plain code counts the matches and decides what is true.</p>
      <div className="steps">
        {STEPS.map((s, i) => {
          const on = active.includes(s.id);
          return (
            <motion.article key={s.id} className={`step ${on ? "on" : ""}`} animate={{ scale: on ? 1.02 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
              <div className="num">{i + 1}{on && <span className="now">now</span>}</div>
              <h3>{s.title}</h3>
              <div className="visual"><s.Visual /></div>
              <p>{s.plain}</p>
              <code>{s.tech}</code>
            </motion.article>
          );
        })}
      </div>
      <p className="loopnote">↻ Steps 2 to 6 repeat for each new version of the rulebook.</p>
    </section>
  );
}

function ExamDesign() {
  return (
    <section id="exam" className="section">
      <h2>Keeping it honest: study, quiz, final exam, real life</h2>
      <p className="sub">Like a student, the AI is never graded on the material it studied. Each patch has one job.</p>
      <ol className="timeline">
        {EXAM.map((x, i) => (
          <motion.li key={x.patch} className={x.cls} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .12 }}>
            <span className="role">{x.role}</span>
            <strong>Patch {x.patch}</strong>
            <small>{x.date}</small>
            <p>{x.text}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

function Live({ state, mode, v0 }) {
  const { feed, tally, phase, bars, book, spent } = state;
  const v0lines = new Set(v0.split("\n").map(l => l.trim()).filter(Boolean));
  return (
    <section id="live" className="section">
      <h2>Watch it learn</h2>
      <p className="sub">
        {mode === "idle" && !feed.length ? "Press “Run it live” to start the real AI, or replay the run we recorded. Every card is one real prediction, checked against real matches."
          : mode === "replay" ? "Replaying the recorded run from Oct 13, 2026 (Claude Haiku 5.5 predicted, Claude Sonnet 5.5 rewrote the rulebook)."
          : "Every card is one real prediction, checked against real pro matches."}
      </p>
      <div className="console">
        <div className="panel feed">
          <div className="panel-h"><span>Guesses vs reality</span><span className="mono">{phase && `${plainPhase(phase)} · ${tally.ok}/${tally.n} right`}</span></div>
          <div className="cards">
            <AnimatePresence initial={false}>
              {feed.map(e => <PredCard key={e.key} e={e} />)}
            </AnimatePresence>
            {!feed.length && <Empty />}
          </div>
        </div>
        <div className="side">
          <div className="panel">
            <div className="panel-h"><span>Report card</span><span className="mono">grade 0–1, higher is better</span></div>
            <div className="bars">
              {bars.length ? bars.map(b => b.group ? <div key={b.id} className="group">{b.label}</div> : <Bar key={b.id} b={b} />)
                : <p className="muted">Grades appear here as each test finishes.</p>}
            </div>
            {spent != null && <p className="muted small">This run cost ${spent.toFixed(3)} in model calls.</p>}
          </div>
          <div className="panel">
            <div className="panel-h"><span>The rulebook</span><span className="mono">{book?.label || "v0"}</span></div>
            {book?.status && <span className={`status ${book.status.cls}`}>{book.status.text}</span>}
            <ul className="book">
              {(book?.text || v0).split("\n").filter(l => l.trim()).map((l, i) => {
                const added = v0 && !v0lines.has(l.trim());
                return <motion.li key={i + l} className={added ? "added" : ""} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }}>{l.replace(/^\s*-\s*/, "")}</motion.li>;
              })}
            </ul>
            {v0 && <p className="muted small"><span className="swatch" /> highlighted lines were written by the AI itself</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function PredCard({ e }) {
  const hit = e.pred === e.label;
  return (
    <motion.div layout className={`card ${hit ? "hit" : "miss"}`}
      initial={{ opacity: 0, y: -14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .3 }}>
      <img src={e.img} alt="" onError={ev => { ev.currentTarget.style.visibility = "hidden"; }} />
      <div className="who">
        <strong>{e.hero}</strong><small>patch {e.patch} · picked in {e.before}% → {e.after}% of pro matches</small>
        <p className="note">{e.note}</p>
        {e.why && <p className="why">AI's reason: “{e.why}”</p>}
      </div>
      <div className="verdict">
        <span className="k">AI said</span><span className={e.pred}>{SAY[e.pred] || e.pred}</span>
        <span className="k">Reality</span><span className={e.label}>{SAY[e.label]}</span>
        <span className={`mark ${hit ? "ok" : "no"}`}>{hit ? "✓ right" : "✗ wrong"}</span>
      </div>
    </motion.div>
  );
}

function Bar({ b }) {
  return (
    <div className={`bar ${b.cls || ""}`}>
      <span className="label">{b.label}</span>
      <div className="track"><motion.div className="fill" initial={{ width: 0 }} animate={{ width: `${(b.value || 0) * 100}%` }} transition={{ duration: 1, ease: [.2, .7, .2, 1] }} /></div>
      <span className="val">{b.value != null ? b.value.toFixed(2) : "—"}</span>
      {b.tag && <span className={`tag ${b.tag.cls}`}>{b.tag.text}</span>}
    </div>
  );
}

const Empty = () => (
  <div className="empty">
    <p>Nothing running yet.</p>
    <p className="muted">Each card will show a hero, what changed, the AI's guess, and what really happened in pro matches.</p>
  </div>
);

function Results({ results, ablation, memory }) {
  if (!results) return null;
  const t = results.offline.test;
  const bestKey = Object.keys(t).find(k => k.startsWith("best_"));
  const o = results.online;
  const exam = [
    { label: "Always answer the most common thing", v: t.majority_baseline.macro_f1, cls: "base" },
    { label: "Simple rule: popular heroes drop, unpopular ones rise", v: t.popularity_baseline.macro_f1, cls: "base" },
    { label: "AI with the starting rulebook", v: t.seed_v0.macro_f1, cls: "ai dim" },
    { label: "AI after rewriting its own rulebook", v: t[bestKey].macro_f1, cls: "ai" },
  ];
  const live = o && [
    { label: "Always answer the most common thing", v: o.baseline.macro_f1, cls: "base" },
    { label: "Simple rule: popular heroes drop", v: o.popularity_baseline.macro_f1, cls: "base" },
    { label: "AI after rewriting its own rulebook", v: o.best.macro_f1, cls: "ai" },
  ];
  const gain = t[bestKey].macro_f1 - t.seed_v0.macro_f1;
  return (
    <section id="results" className="section">
      <h2>Results</h2>
      <p className="sub">From the recorded run on Oct 13, 2026: Claude Haiku 5.5 predicted, Claude Sonnet 5.5 rewrote the rulebook, and 6 rounds cost ${results.offline.spent_usd?.toFixed(2)}.</p>
      <div className="headline">
        <Big n={`+${gain.toFixed(2)}`} t="better on the final exam after it rewrote its own rulebook" />
        <Big n={t[bestKey].macro_f1.toFixed(2)} t={`beats the simple popularity rule (${t.popularity_baseline.macro_f1.toFixed(2)}) on patches it never saw`} />
        {o && <Big n={o.best.macro_f1.toFixed(2)} t={`on today's live patch, against ${o.popularity_baseline.macro_f1.toFixed(2)} for the simple rule`} />}
      </div>
      <div className="charts">
        <Chart title="Final exam · patches 7.40 + 7.41 · 243 hero changes" rows={exam} />
        {live && <Chart title={`Real life · patch ${o.patch} · ${o.best.n} heroes · ${o.matches_since_patch} matches so far`} rows={live} />}
      </div>
      {ablation && (
        <div className="ablation">
          <div>
            <h3>Does it really read the patch notes?</h3>
            <p>We hid the notes and asked again, keeping everything else the same (hero names, popularity, rulebook).
              If the AI were only remembering heroes, its grade would barely move. Instead it falls apart, so the patch notes carry the signal.
              Notes beat no-notes in {Math.round(ablation.p_notes_help * 100)}% of random re-draws.</p>
            <p className="muted small">Second experiment: {ablation.model?.replace(/^.*\//, "")} with the best rulebook, on the final-exam patches.</p>
          </div>
          <Chart title="Final exam · with and without the patch notes" rows={[
            { label: "AI · patch notes hidden", v: ablation.notes_hidden.macro_f1, cls: "ai dim" },
            { label: "Simple rule: popular heroes drop", v: ablation.popularity_baseline.macro_f1, cls: "base" },
            { label: "AI · patch notes shown", v: ablation.notes_shown.macro_f1, cls: "ai" },
          ]} />
        </div>
      )}
      {memory?.memory_on && (
        <div className="ablation">
          <div>
            <h3>Does remembering past patches help?</h3>
            <p>Before each guess, the AI is shown the {memory.k} most similar changes from earlier patches ({memory.memory_patches?.join(", ")}) and what really happened after them.
              {memory.p_memory_helps >= 0.8
                ? ` With these memories it does better in ${Math.round(memory.p_memory_helps * 100)}% of random re-draws.`
                : ` So far there is no clear gain: memories help in only ${Math.round(memory.p_memory_helps * 100)}% of random re-draws.`}</p>
          </div>
          <Chart title="Final exam · with and without memories of past patches" rows={[
            { label: "AI · no memories", v: memory.memory_off.macro_f1, cls: "ai dim" },
            { label: "Simple rule: popular heroes drop", v: memory.popularity_baseline.macro_f1, cls: "base" },
            { label: "AI · with memories", v: memory.memory_on.macro_f1, cls: "ai" },
          ]} />
        </div>
      )}
      <div className="grade">
        <h3>What does the grade mean?</h3>
        <p>For each hero there are three possible answers: more, less, or same. The grade (macro-F1) scores each answer type separately and averages them, so a lazy strategy like "always say less" gets a low grade. 0 is never right; 1 is always right.</p>
      </div>
      <div className="caveats">
        <h3>What we can't claim yet</h3>
        <ul>
          <li>In the recorded run, grades wobbled by up to about 0.06 between runs of the same rulebook, so small differences can be luck. Fixing the model provider and random seed has since made reruns repeat exactly.</li>
          <li>The AI sees hero names. Hiding the notes shows it mostly relies on them, but some memory of recent patches can't be ruled out.</li>
          <li>The live patch has {o?.best.n ?? 35} hero changes and about {o?.matches_since_patch ?? 500} matches so far: promising, not proof.</li>
          <li>We only use pro matches, and pros pick heroes differently from everyday players.</li>
        </ul>
      </div>
    </section>
  );
}

const Big = ({ n, t }) => <div className="big-n"><span>{n}</span><p>{t}</p></div>;

function Chart({ title, rows }) {
  return (
    <div className="panel chart">
      <div className="panel-h"><span>{title}</span></div>
      {rows.map(r => (
        <div key={r.label} className={`crow ${r.cls}`}>
          <span className="label">{r.label}</span>
          <div className="track"><motion.div className="fill" initial={{ width: 0 }} whileInView={{ width: `${r.v * 100}%` }} viewport={{ once: true }} transition={{ duration: 1.1, ease: [.2, .7, .2, 1] }} /></div>
          <span className="val">{r.v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- mini diagrams for the six steps ----------

function NoteVisual() {
  return <div className="v-note"><span className="ab">Mana Void</span> Cooldown <s>70s</s> → <b>100s</b></div>;
}

function PredictVisual() {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI(x => (x + 1) % 3), 1400); return () => clearInterval(id); }, []);
  return (
    <div className="v-chips">
      {["up", "down", "flat"].map((c, j) => <span key={c} className={`chip ${c} ${i === j ? "pick" : ""}`}>{SAY[c]}</span>)}
    </div>
  );
}

function CheckVisual() {
  return (
    <div className="v-check">
      <div><span style={{ width: "74%" }} /><small>before · 11.2%</small></div>
      <div><span className="after" style={{ width: "54%" }} /><small>after · 8.2%</small></div>
      <em>real drop, not luck → answer: ▼ less</em>
    </div>
  );
}

function ScoreVisual() {
  return (
    <div className="v-score">
      <div className="scale"><motion.i initial={{ left: "0%" }} whileInView={{ left: "40%" }} viewport={{ once: true }} transition={{ duration: 1.2 }} /></div>
      <div className="ticks"><span>0 never right</span><span>1 always right</span></div>
    </div>
  );
}

function LearnVisual() {
  return (
    <div className="v-learn">
      <div className="del">− Mixed or small changes: predict “same”.</div>
      <div className="add">+ Popular heroes that get any nerf: predict “less”.</div>
    </div>
  );
}

function GateVisual() {
  return (
    <div className="v-gate">
      <div><small>old rulebook</small><span style={{ width: "46%" }} /><b>0.46</b></div>
      <div><small>edited</small><span className="new" style={{ width: "54%" }} /><b>0.54 ✓ kept</b></div>
    </div>
  );
}
