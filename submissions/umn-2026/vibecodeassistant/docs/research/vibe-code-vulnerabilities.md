# Deep Research: Security, Design, and Compliance Gaps in Vibe-Coded Web Apps

*Purpose: inform an agent that inspects both a running localhost app and its source code. Research date: 2026-10-03.*

## Executive Summary

The evidence doesn't support the common story that AI writes injection bugs. In controlled full-app tests, AI coding agents mostly avoid exploitable SQL injection and XSS because frameworks (ORMs, React escaping) handle those by default. They fail where no framework default exists: **authorization, business logic, and security controls nobody asked for** (CSRF, security headers, rate limiting), plus **SSRF**. Every one of the 15 apps in Tenzai's study had no CSRF protection and no security headers, and all five agents introduced SSRF ([Tenzai](https://www.tenzai.com/blog/bad-vibes-comparing-the-secure-coding-capabilities-of-popular-coding-agents)). Platform-built apps (Lovable, Bolt, Base44) are dominated by an even simpler failure: a backend-as-a-service like Supabase or Firebase exposed straight to the browser with Row Level Security (RLS) or security rules missing. This gave CVE-2025-48757 (170 of 1,645 Lovable showcase apps, 10.3%), plus Escape's 2,000+ vulnerabilities and 400+ exposed secrets across 5,600 apps ([Escape](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/)).

That shapes the agent's design. The highest-value checks are **cross-surface**: find a key, table name, route, or version in the source, then confirm exploitability with a non-destructive request against the running app. Single-surface checks are either noisy (raw LLM review of source) or blind (black-box probing with no context). Published benchmarks show raw LLM security review gives 15–40% precision and 50–60% run-to-run finding stability. Agent setups that use tools and verification reach roughly 70–85% precision ([Rafter](https://rafter.so/blog/benchmarking-ai-code-security-agents)). Deterministic tools should produce the candidate findings, the LLM should triage them and hunt logic flaws, and live confirmation should decide severity.

Two scope claims in the original brief need pushback. **Memory leaks** can only be *suspected* from static patterns. They're confirmed only by repeated-interaction heap diffing (MemLab-style), so the agent must label them that way or it will lose user trust. **Legal pages** (privacy policy, terms, cookie consent) can be checked for presence and for conditions that trigger them. Whether their content is adequate is a legal judgment the tool shouldn't claim to make.

## Key Findings

1. **About 45% of AI-generated code samples fail security tests, and the rate hasn't improved across 2025–2026 testing cycles.** Java fails at over 70%. XSS (CWE-80) fails 86% of the time and log injection (CWE-117) 88% in isolated snippets ([Veracode 2025](https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals), [Veracode 2026](https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/), [CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)).
2. **Full-app tests show a different distribution from snippet tests.** Tenzai's 69 vulnerabilities across 15 apps were mostly authorization and business logic flaws: role checks that skipped other roles, negative quantities in 4 of 5 agents, negative prices in 3 of 5. Exploitable SQLi and XSS were *absent* ([Tenzai](https://www.tenzai.com/blog/bad-vibes-comparing-the-secure-coding-capabilities-of-popular-coding-agents), [CSO Online](https://www.csoonline.com/article/4116923/output-from-vibe-coding-tools-prone-to-critical-security-flaws-study-finds.html)).
3. **Supabase RLS is the single most common critical issue in platform-built apps.** The anon key in the bundle is public by design. With RLS off it grants full read/write. The service_role key turns up in frontend code and bypasses RLS entirely ([Escape](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/), [Rafter](https://rafter.so/blog/secure-lovable-apps), [Rocking Tech summary](https://rockingtech.co.uk/blog/your-lovable-app-hit-a-wall)).
4. **Most critical findings needed no authentication**, and Escape's passive scan was explicitly a lower bound ([Escape](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/)).
5. **Firebase's equivalent is test-mode rules** (`allow read, write: if true;`) left in production ([Firebase docs](https://firebase.google.com/docs/firestore/security/insecure-rules), [ModernPentest](https://modernpentest.com/blog/securing-firebase-in-production)).
6. **Platform-level auth flaws happen too.** Base44 exposed registration and OTP endpoints without auth, keyed only by an `app_id` visible in `manifest.json` ([Wiz](https://www.wiz.io/blog/critical-vulnerability-base44)).
7. **Package hallucination is measurable.** 19.7% of 576K generated samples referenced a non-existent package. 43% of those hallucinated names recur on every run, which makes them squattable ([USENIX Security 2025 via CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/), [Socket](https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks)).
8. **Framework CVEs matter more than app code for Next.js.** CVE-2025-29927 bypasses middleware auth via the `x-middleware-subrequest` header ([NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-29927)). CVE-2025-55182 ("React2Shell", CVSS 10) is pre-auth RCE in React Server Components and was actively exploited ([Wiz](https://www.wiz.io/blog/critical-vulnerability-in-react-cve-2025-55182), [Google TI](https://cloud.google.com/blog/topics/threat-intelligence/threat-actors-exploit-react2shell-cve-2025-55182)).
9. **OWASP Top 10:2025** moved Security Misconfiguration to #2, added Software Supply Chain Failures (#3) and Mishandling of Exceptional Conditions (#10, fail-open logic), and folded SSRF into Broken Access Control (#1) ([OWASP](https://top10.owasp.org/2025/en/), [GitLab](https://about.gitlab.com/blog/2025-owasp-top-10-whats-changed-and-why-it-matters/)).
10. **AI-wrapper apps add an economic attack surface.** "Denial of wallet" means unmetered LLM endpoints that drain API budgets ([OWASP LLM10:2025](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/)). Separately, public Google API keys silently become Gemini credentials once the Generative Language API is enabled on the project: 2,863 live keys were found in Common Crawl ([Truffle Security](https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules)).
11. **Accessibility failures are near-universal and mostly automatable.** 94.8% of top home pages fail WCAG 2. The leading failures are low contrast (79.1%), missing alt text (55.5%), and missing form labels (48.2%) ([WebAIM Million 2025](https://webaim.org/projects/million/2025)). Automated axe-core testing covers ~57% of issues by volume ([Deque](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)).

## Detailed Analysis

### 1. Resolving the XSS contradiction
Veracode measures 86% XSS failure; Tenzai finds no exploitable XSS. Both are right. Veracode tests isolated code generation, and Tenzai tests full apps where React/Next escapes output by default. **XSS in vibe-coded apps lives at the escape hatches.** Look for `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, markdown renderers fed LLM or user output without sanitizing, `href={userInput}` (`javascript:` URLs), and server-rendered templates with `|safe` or `{!! !!}`. The agent should grep for these sinks rather than run generic XSS fuzzing.

### 2. Check catalog by detection surface

Legend: **S** = source analysis, **L** = live localhost probing, **S→L** = find in source, confirm live.

| # | Check | Surface | Detection method | Severity basis |
|---|---|---|---|---|
| 1 | Supabase RLS disabled/permissive | S→L | Table names from `supabase/migrations`, types, `.from('x')` calls → `GET /rest/v1/x?select=*` with anon key; grep `using (true)` | Critical if rows return |
| 2 | Privileged key in client | S→L | Bundle/`.env` scan; decode JWT `role` claim (`service_role`); prefixes `sk_live`, `sk-`, `AKIA`; `NEXT_PUBLIC_`/`VITE_`/`REACT_APP_` + secret-looking names | Critical |
| 3 | Firebase rules | S | `firestore.rules`/`storage.rules`/`database.rules.json`: `if true`, `if request.auth != null` on user data (any user reads all), `request.time < timestamp.date(...)` test-mode expiry | Critical/High |
| 4 | Broken object-level authorization (IDOR) | S→L | Routes with `:id`/`[id]` whose query lacks an owner filter; confirm with two test accounts | High |
| 5 | Function-level authz / client-only auth | S→L | Admin routes protected only in UI/`localStorage`; server actions and route handlers with no session check; call directly | High/Critical |
| 6 | Middleware-only auth (Next.js) | S→L | `middleware.ts` is the sole guard; version < 12.3.5/13.5.9/14.2.25/15.2.3 → send `x-middleware-subrequest` | Critical if bypass works |
| 7 | Known-vulnerable framework | S | Lockfile vs CVE-2025-55182 patched versions, CVE-2025-29927; `npm audit`/`osv-scanner`/`pip-audit` | Critical for RCE |
| 8 | Hallucinated or typosquat deps | S | Each dep exists on registry? age/downloads/maintainers; install scripts | High |
| 9 | SSRF | S→L | `fetch(req.body.url)`, `requests.get(user_url)`, link previews, image proxies, webhooks; probe with `http://127.0.0.1`, `169.254.169.254` *against localhost only* | High |
| 10 | Business-logic validation | S→L | Price/quantity/amount fields accepted from client; negative/zero/huge values; price computed client-side | High |
| 11 | CSRF | S→L | Cookie-session auth + state-changing POST without token/SameSite; check `Set-Cookie` attributes | Medium/High |
| 12 | Security headers | L | CSP, HSTS (prod config), X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy | Medium |
| 13 | CORS | S→L | `origin: '*'` or reflected Origin with `credentials: true`; send `Origin: https://evil.test` | High if credentialed |
| 14 | Rate limiting | S→L | No limiter on login, signup, password reset, OTP, LLM endpoints; small burst test (≤20 req) | Medium; High on LLM/OTP |
| 15 | Token storage | S | JWT in `localStorage`; cookies missing `HttpOnly`/`Secure`/`SameSite` | Medium |
| 16 | JWT misuse | S | `jwt.decode` used for auth instead of `verify`; `alg: none` accepted; hardcoded `'secret'` | Critical |
| 17 | Webhook verification | S | Stripe/GitHub webhook handlers without signature check; empty-secret fallback; `express.json()` before raw body | High |
| 18 | Debug/verbose errors | S→L | Flask `debug=True` (Werkzeug console = RCE), Django `DEBUG=True`, stack traces in 500 responses, exposed source maps | Critical (Werkzeug) / Medium |
| 19 | Injection at raw sinks | S | Template-string SQL, f-string SQL, `exec`/`eval`, `subprocess(shell=True)`, `pickle`/`yaml.load` | High |
| 20 | XSS escape hatches | S→L | See §1; confirm by injecting a benign marker | High |
| 21 | Fail-open error handling (OWASP A10) | S | `catch {}` that continues; auth check in `try` whose `catch` returns next(); missing global handler | Medium/High |
| 22 | LLM endpoint abuse | S→L | Unauthenticated `/api/chat`; no per-user quota or max_tokens; provider key in client | High (cost) |
| 23 | Prompt injection / output handling | S | User text concatenated into system prompt; LLM output rendered as HTML or passed to tools/SQL | Medium/High |
| 24 | Storage buckets | S→L | Supabase storage public buckets, Firebase storage rules, S3 URLs listable | High if PII |
| 25 | Secrets in git history | S | `gitleaks`/`trufflehog` over full history, not just HEAD | High |

### 3. Stack detection → attack plan

The agent should fingerprint the stack first. Each stack has a short, high-yield playbook.

**Fingerprints:** `package.json` deps (`next`, `@supabase/supabase-js`, `firebase`, `express`, `prisma`, `openai`, `stripe`); `requirements.txt`/`pyproject.toml` (`flask`, `fastapi`, `django`); config files (`next.config.*`, `supabase/config.toml`, `firebase.json`, `firestore.rules`, `vercel.json`); live signals (`x-powered-by`, `/_next/` paths, `/rest/v1/` calls in network traffic).

- **Next.js / React:** version vs CVE-2025-55182 and CVE-2025-29927 → middleware-only auth → server actions and route handlers missing session checks (server actions are public POST endpoints) → `NEXT_PUBLIC_*` secrets → escape-hatch XSS → `headers()` in `next.config` → production source maps.
- **Supabase:** decode every JWT found (anon vs service_role) → enumerate tables from migrations/types → live anon `select` per table, and a non-destructive insert check only with user approval → `using (true)` / `with check (true)` policies → SECURITY DEFINER views and `function_search_path_mutable` (mirror the [Supabase Security Advisor](https://www.supascale.app/blog/security-and-performance-advisors-for-selfhosted-supabase) lints, or run them) → public storage buckets.
- **Firebase:** rules files (`if true`, auth-only, time-limited) → service-account JSON committed → App Check absent → Google API key restrictions, plus whether Gemini is enabled on that project. Don't flag the web `apiKey` itself as a leaked secret ([Firebase docs](https://firebase.google.com/docs/projects/api-keys)).
- **Node / Express:** `helmet` absent → `cors` config → `express-rate-limit` on auth routes → `/:id` routes without owner filter → raw SQL templates → `jwt.decode` → webhook raw-body handling → error handler leaking `err.stack` → body size limits.
- **Python (Flask/FastAPI/Django):** `debug=True`/`DEBUG=True`, `ALLOWED_HOSTS=['*']` → hardcoded `SECRET_KEY` → FastAPI `CORSMiddleware(allow_origins=["*"], allow_credentials=True)` → routes missing `Depends(get_current_user)` → f-string SQL, `shell=True`, `pickle`, `yaml.load` → `requests.get(user_input)` SSRF.
- **AI-wrapper overlay (any stack):** provider key in client → unauthenticated or unmetered LLM routes → no `max_tokens` → prompt concatenation → LLM output rendered unsanitized → tool calls with write access.

### 4. Design flaws: memory leaks and performance

**Detectable statically (label as "suspected"):**
- React: `useEffect` that calls `addEventListener`, `setInterval`, `subscribe`, `onSnapshot`, `supabase.channel()`, or `new WebSocket` without a returned cleanup. A missing dependency array that re-subscribes on every render ([OneUptime](https://oneuptime.com/blog/post/2026-01-15-debug-memory-leaks-react-applications/view), [Kavanagh](https://johnkavanagh.co.uk/articles/preventing-and-debugging-memory-leaks-in-react/)).
- Node server: module-level `Map`/array/object used as a cache with no eviction or TTL; listeners added inside request handlers; `setInterval` with no `clearInterval`; unbounded log/metric buffers ([Netguru](https://www.netguru.com/blog/node-js-memory-leaks), [Sematext](https://sematext.com/blog/nodejs-memory-leaks/)).
- Performance: N+1 queries (DB calls inside loops or `.map`), `select *` with no pagination, fetch waterfalls, unoptimized images, huge client bundles.

**Confirmable live:** drive the localhost app through a repeated interaction (open/close a modal or route 10×), take heap snapshots, and diff for growing detached DOM nodes, listener counts, and retained closures. Meta's [MemLab](https://engineering.fb.com/2022/09/12/open-source/memlab/) automates exactly this with Puppeteer and works for Node heaps too. Chrome DevTools MCP already exposes `take_heapsnapshot`, `performance_start_trace`, and `lighthouse_audit`. Only promote a leak to "confirmed" when a static suspect and a growing heap diff agree.

### 5. Missing required parts

| Item | Trigger (when it's required) | How to check |
|---|---|---|
| Privacy policy | Collects any personal data: email forms, auth, analytics, cookies ([Turley Law](https://turleylaw.com/blog/website-legal-requirements-2026)) | Link present on every page; CalOPPA wants a homepage link containing the word "privacy" ([Termly](https://termly.io/resources/articles/legal-requirements-for-websites/)) |
| Cookie consent | Non-essential cookies or trackers with EU/UK visitors (GDPR/ePrivacy) | **Live:** load the page with a fresh profile and record cookies and third-party requests (GA, Meta pixel, Hotjar) *before* any interaction. Firing before consent is a concrete finding. Equal Accept/Reject options; no pre-ticked boxes ([Cookiebot](https://www.cookiebot.com/en/legal-requirements-for-websites/)) |
| "Do Not Sell or Share" link | CCPA/CPRA, if selling/sharing data or running targeted ads | Link presence |
| Terms of service | Accounts, user content, payments | Link presence |
| Refund/shipping policy | E-commerce | Link presence when Stripe checkout is detected |
| Account deletion | GDPR erasure right; app-store rules for companion apps | A delete-account path exists in UI and API |
| Email unsubscribe | Marketing email (CAN-SPAM) | Unsubscribe link in email templates |
| Accessibility (WCAG 2.1 AA) | ADA Title III exposure (US), European Accessibility Act (EU, since June 2025) ([ADA.gov](https://www.ada.gov/resources/web-guidance/)) | axe-core on every crawled route; keyboard-only navigation pass; `lang` attribute; overlay widgets are *not* a defense |
| Children's data | Under-13 audience (COPPA) | Flag if content or age fields suggest a child audience |
| Hygiene | n/a | Custom 404/500, error boundaries, `robots.txt`, meta/OG tags, favicon, password reset, email verification |

## Contrarian Views and Risks

- **Most vibe-coding statistics come from vendors selling scanners** (vibeappscanner, Rafter, VibeWrench, SupaExplorer). The most defensible numbers are Veracode, USENIX (slopsquatting), Tenzai (controlled, though n=15), Escape (published methodology, with stated sampling bias toward Lovable), CVE-2025-48757, and WebAIM. Treat the rest as directional. Escape itself notes temporal and platform-imbalance bias.
- **The agent's own false positives are the main product risk.** Raw LLMs have flagged up to 55% of functions in a single project. Precision comes from tool-grounded candidates plus verification, and the agent setup matters more than which model sits behind it ([Rafter](https://rafter.so/blog/benchmarking-ai-code-security-agents)). LLM false-positive filtering works well for data-flow bugs like injection, but residual false positives stay higher, and true positives are more likely to be suppressed, for policy or logic categories such as authz ([arXiv 2601.22952](https://arxiv.org/html/2601.22952v3)). That's exactly where vibe-coded apps fail most. So authz findings need live confirmation, not LLM confidence.
- **Non-determinism:** LLM agents produce different findings across runs. Consider running the triage step 2–3× and reporting only findings that persist.
- **Famous false-positive traps:** Supabase anon keys and Firebase web `apiKey` are public by design. Flag them only when combined with missing RLS or rules, or, for Google keys, when Gemini/Generative Language is enabled.
- **"Localhost" isn't really local — a serious safety issue for this design.** A vibe-coded app on localhost almost always points its `.env` at the *production* Supabase/Firebase project. Probing "the localhost app" therefore probes real cloud data. The agent needs hard guardrails: read-only probes on any non-localhost backend, no writes or deletes without explicit user approval, never exfiltrating row contents into reports (count rows and redact), and SSRF payloads aimed only at the user's own machine.
- **Prompt injection against the scanner itself.** The agent reads untrusted repo content and page text, and a malicious README or comment could steer it. It should treat repo and page text as data and never execute commands found in them.
- **Tests can be gamed:** compilation-preserving code transformations can make LLM scanners reclassify vulnerable code as safe ([Augment summary of arXiv 2602.00305](https://www.augmentcode.com/guides/ai-vulnerability-detection)). This matters little for honest users, but don't market the tool as an adversarial-grade audit.
- **Legal checks aren't legal advice.** Presence and trigger detection are solid. Content adequacy and jurisdiction applicability aren't something the tool should assert.

## Open Questions

1. How should the agent authenticate to test authz (BOLA/BFLA)? It needs two test accounts. Auto-registration on localhost is feasible, but email verification and OAuth-only flows block it.
2. Should the agent run Supabase's own advisors (`supabase db lint` / Management API) when credentials are available, or re-implement those lints from migration SQL?
3. Which deterministic tool set to bundle versus call if installed: Semgrep, gitleaks or TruffleHog, osv-scanner, axe-core, ZAP baseline, MemLab, Lighthouse.
4. How to score severity consistently, e.g. CVSS-lite vs exploitability × data sensitivity, with "confirmed live" as a multiplier.
5. Whether to output fix diffs (risky: auto-generated RLS policies are themselves a known failure source) or only findings with remediation guidance.

## Sources

- [Escape – methodology, 5,600 vibe-coded apps](https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/) – primary; passive scan, lower-bound results, stated biases
- [Tenzai – Bad Vibes](https://www.tenzai.com/blog/bad-vibes-comparing-the-secure-coding-capabilities-of-popular-coding-agents) – primary controlled study, 5 agents × 3 apps
- [CSO Online on Tenzai](https://www.csoonline.com/article/4116923/output-from-vibe-coding-tools-prone-to-critical-security-flaws-study-finds.html) – press coverage, severity split
- [Veracode 2025 GenAI report](https://www.veracode.com/blog/genai-code-security-report/) / [press release](https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals) – 45% failure, per-CWE rates
- [Veracode 2026 report](https://www.veracode.com/blog/2026-genai-code-security-report-ai-risk/) – no improvement year over year
- [CSA – AI-generated CVE surge](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/) – synthesis
- [CSA – Slopsquatting](https://labs.cloudsecurityalliance.org/research/csa-research-note-slopsquatting-ai-supply-chain-20260419-csa/) – summarizes USENIX 2025 paper
- [Socket – Slopsquatting](https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks) – paper details
- [Rafter – Securing Lovable apps](https://rafter.so/blog/secure-lovable-apps) – vendor; service_role-in-client pattern
- [Rafter – Benchmarking AI security agents](https://rafter.so/blog/benchmarking-ai-code-security-agents) – vendor; precision and stability figures
- [Rocking Tech – Lovable wall](https://rockingtech.co.uk/blog/your-lovable-app-hit-a-wall) – secondary aggregation of CVE-2025-48757, SupaExplorer, VibeWrench
- [vibeappscanner research](https://vibeappscanner.com/research) – vendor stats, directional only
- [Wiz – Base44 auth bypass](https://www.wiz.io/blog/critical-vulnerability-base44) – primary
- [Wiz – React2Shell](https://www.wiz.io/blog/critical-vulnerability-in-react-cve-2025-55182) / [Google TI](https://cloud.google.com/blog/topics/threat-intelligence/threat-actors-exploit-react2shell-cve-2025-55182) – CVE-2025-55182 details and exploitation
- [NVD CVE-2025-29927](https://nvd.nist.gov/vuln/detail/CVE-2025-29927) / [Datadog analysis](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/) – Next.js middleware bypass
- [OWASP Top 10:2025](https://top10.owasp.org/2025/en/) / [GitLab changes summary](https://about.gitlab.com/blog/2025-owasp-top-10-whats-changed-and-why-it-matters/) / [Qualys](https://blog.qualys.com/qualys-insights/2026/06/15/what-changed-in-owasp-top-10-2025-and-recommendations-for-each-category) – category changes
- [OWASP LLM10:2025 Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) – denial of wallet
- [Truffle Security – Google keys and Gemini](https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules) – primary; 2,863 live keys
- [Firebase – API keys](https://firebase.google.com/docs/projects/api-keys) / [insecure rules](https://firebase.google.com/docs/firestore/security/insecure-rules) – official
- [ModernPentest – Firebase checklist](https://modernpentest.com/blog/securing-firebase-in-production) – exposure stats (secondary)
- [Supabase advisors overview](https://www.supascale.app/blog/security-and-performance-advisors-for-selfhosted-supabase) – lint names
- [Flask debugging docs](https://flask.palletsprojects.com/en/stable/debugging/) / [HackTricks Werkzeug](https://hacktricks.wiki/en/network-services-pentesting/pentesting-web/werkzeug.html) – debug console RCE
- [Stripe webhook bypass advisory (n8n)](https://github.com/n8n-io/n8n/security/advisories/GHSA-jf52-3f2h-h9j5) / [CVE-2026-41432](https://github.com/advisories/GHSA-xff3-5c9p-2mr4) – real-world webhook verification failures
- [CWE-602](https://cwe.mitre.org/data/definitions/602.html) – client-side enforcement of server-side security
- [arXiv 2601.22952 – LLM agents for SAST FP filtering](https://arxiv.org/html/2601.22952v3) – per-category reliability
- [Augment – AI vulnerability detection](https://www.augmentcode.com/guides/ai-vulnerability-detection) – recall vs precision trade-off, adversarial evasion
- [MemLab (Meta)](https://engineering.fb.com/2022/09/12/open-source/memlab/) – automated heap-diff leak detection
- [OneUptime – React leaks](https://oneuptime.com/blog/post/2026-01-15-debug-memory-leaks-react-applications/view) / [Kavanagh](https://johnkavanagh.co.uk/articles/preventing-and-debugging-memory-leaks-in-react/) – leak patterns
- [Netguru](https://www.netguru.com/blog/node-js-memory-leaks) / [Sematext](https://sematext.com/blog/nodejs-memory-leaks/) – Node leak patterns
- [WebAIM Million 2025](https://webaim.org/projects/million/2025) – accessibility failure rates
- [Deque – 57% automated coverage](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/) – limits of automated a11y testing
- [ADA.gov web guidance](https://www.ada.gov/resources/web-guidance/) – official
- [Cookiebot legal requirements](https://www.cookiebot.com/en/legal-requirements-for-websites/) / [Termly](https://termly.io/resources/articles/legal-requirements-for-websites/) / [Turley Law](https://turleylaw.com/blog/website-legal-requirements-2026) – privacy, cookie, and legal-page requirements (vendor and law-firm sources)

## Rerun Inputs
workflow: firecrawl-deep-research
topic: security vulnerabilities, design flaws, and missing compliance parts in vibe-coded web apps (Next.js/Supabase/Firebase, Express, Python) for a source+localhost scanning agent
depth: thorough
output: markdown
