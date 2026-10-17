# Mathub Pro and Mathub Max: the plans, Bo, and the AI server

Two monthly plans, on the website and in the iPhone, iPad and Android apps:

| Plan | Price | What it unlocks |
|---|---|---|
| **Mathub Pro** | $15 a month | **Classes Bo writes** from a syllabus you drop in or paste (PDF, photo or text; up to 15 a month), and making classes any other way: with the AI you already use (copy the instructions, paste the answer), from a class file, or from a class someone shares. |
| **Mathub Max** | $50 a month | Everything in Pro, plus **Ask Bo, the AI tutor** (`#/tutor`), with photos of problems and, on the website, **voice calls with Bo** (`assets/talk.js`). |

Everything else stays free:

- **The example class** ("Try an example class") is free, so anyone (and App Review) can try the flow.
- **Classes made before the plans existed** stay free (marked free the first time the new version starts).
- **When a plan ends**, the classes made with it are kept, locked, and open again the moment it is back.
- **Offline**, the apps remember until when the plan is paid for, so classes stay open on a plane.

One plan works everywhere the student signs in with the same Mathub account:

| Where | How it is sold | How Mathub knows the plan |
|---|---|---|
| iPhone, iPad | App Store In-App Purchase | RevenueCat SDK in the app (`@revenuecat/purchases-capacitor`) |
| Android | Google Play Billing | the same SDK |
| Website | RevenueCat **Web Purchase Links** (checkout by Stripe), one per plan | `api/myclasses.php` asks RevenueCat's REST API (`create_status`) |

All of them use the same RevenueCat customer, **`mh_<account id>`** (the apps call `Purchases.logIn` when the
student signs in). Entitlements: **`pro`** and **`max`**; a Max product unlocks both. The apps never mention or
link to the web checkout (App Store 3.1.1 / 3.1.3(b), Play Payments policy); a plan bought on the web simply
works in the app after signing in.

| | Pro | Max |
|---|---|---|
| App Store product (one subscription group "Mathub", Max ranked above Pro) | `mathub_pro_monthly` | `mathub_max_monthly` |
| Google Play subscription, base plan | `mathub_pro` / `monthly` | `mathub_max` / `monthly` |
| RevenueCat entitlements | `pro` | `pro` and `max` |
| RevenueCat offering `default`: package identifiers | `pro` | `max` |
| Web Purchase Link (its own offering) | `pro_web_link` | `max_web_link` |

Code: `assets/create.js` (plans: `App.subscription`, the paywall `App.paywall({ need: 'pro' | 'max' })`, the lock
`App.courseGate`, the Create page with "Bo writes it from your syllabus"), `assets/tutor.js` (Ask Bo), `api/myclasses.php` (`create_status`, plans and
`plan_grants`), `api/ai.php` (the AI server). Tests: `tests/app.test.js` (a stand-in store),
`tests/create-web.test.js`, `tests/tutor-web.test.js`, `tests/myclasses-api.test.js` and `tests/ai-api.test.js`
(stand-ins for RevenueCat and the AI in `tests/pyodide/router.php`).

## 1. The money side (once)

**Google Play Console**
1. Settings → Payments profile: create the merchant profile and add your bank account.
2. Upload a build with the billing permission to a testing track first (Play only then lets you create subscriptions).
3. Monetize with Play → Products → Subscriptions: create `mathub_pro` ("Mathub Pro") with a base plan `monthly`,
   auto-renewing, 1 month, US$14.99 (or 15.00), and `mathub_max` ("Mathub Max") with a base plan `monthly`,
   US$49.99 (or 50.00). Activate both.

**App Store Connect**
1. Business: sign the **Paid Apps Agreement**, add bank and tax information; enroll in the **Small Business Program** (15%).
2. Your app → Monetization → Subscriptions: create the group "Mathub", then `mathub_max_monthly` (level 1, "Mathub Max",
   $49.99) and `mathub_pro_monthly` (level 2, "Mathub Pro", $14.99), 1 month each. Putting Max above Pro in the
   group makes a Pro member's purchase of Max an upgrade. Add display names, descriptions and a screenshot of the paywall.
3. Submit the subscriptions **together with an app version** (on the version page, under In-App Purchases and Subscriptions).
4. Add the Terms of Use link to the App Store description: `Terms of Use: https://mathub.space/#/policy/create`.

**Stripe (for the website)**: create a Stripe account, finish its activation, and connect it in RevenueCat
(Project settings → Web → Stripe).

## 2. RevenueCat (revenuecat.com)

1. Project "Mathub"; add the **App Store** app (bundle `space.mathub.app`, In-App Purchase Key), the **Play Store**
   app (package `space.mathub.app`, service-account JSON) and a **Web Billing** app (Stripe connected) with two
   products: "Mathub Pro" $15 a month and "Mathub Max" $50 a month.
2. Products: the App Store, Play Store and web products for both plans.
3. Entitlements: `pro` (attach every Pro **and** Max product) and `max` (attach the Max products).
4. Offerings: `default` (current) with two custom packages, identifiers **`pro`** and **`max`**, each with its App
   Store and Play product. For the website, two more offerings, `web_pro` and `web_max`, each with its web product.
5. Web → **Web Purchase Links**: one for `web_pro`, one for `web_max`. Set the success redirect of both to
   `https://mathub.space/#/create?paid=1`. Copy both links (`https://pay.rev.cat/<token>/`).
6. API keys: copy the public `appl_…` and `goog_…` keys and create a **secret** key (`sk_…`) for the server.

## 3. Bo and the AI server (Anthropic)

Ask Bo and the classes Bo writes run through Mathub's own server, `api/ai.php`. The apps and the website never talk
to the AI directly. The server holds the key, checks the plan (Pro or Max to write a class, Max to talk with Bo),
enforces the limits, and keeps every request small:

- **Class summaries.** Each class is turned into a compact text (facts, grading, exams, then every unit with one
  line per topic): Calculus I is about 5,000 characters (≈1,300 tokens). Built-in classes come from
  `api/classdata/*.json` (run `node scripts/build-classdata.js` after changing a class), packs from
  `packs/*.mathub.json`, and a student's own class from the copy saved with their account.
- **Progress snapshot.** The device sends a short summary (next exam and readiness, weakest topics, recent
  mistakes, flashcards due, deadlines); the server trims it again to a few lines.
- **Short memory.** Only the last 6 chat turns go to the AI, plus up to 12 short notes Bo keeps about the student
  (`[remember: …]` in his reply). The full chat (40 turns per class) is kept for the screen only.
- **Prompt caching.** Bo's instructions and the class summary are marked `cache_control: ephemeral`, so repeat
  questions in a session pay a fraction for them.
- **Classes in steps.** The syllabus is read once into an outline (kept on the server for a day); each unit is then
  written from that outline (≈1,000 tokens in), not the whole syllabus again.
- **Small answers.** Bo is told to answer in about 150 words; answers are capped at 700 tokens.
- **The smallest model that does the job:** `claude-haiku-5-5` for both Bo and class writing. If the classes Bo
  writes are not good enough, set `ai_model_class` to `claude-sonnet-5-5` (costs more); keep Bo on Haiku.
- **Limits per account:** 1,500 questions a month (300 a day, 12 a minute) and 15 classes a month, set in
  `api/config.php` (`ai_tutor_monthly`, `ai_tutor_daily`, `ai_class_monthly`). Usage per month (questions, classes,
  tokens in and out) is in the `ai_usage` table.
- Free greetings: Bo's first message in a chat and the suggestions are made on the device, with no AI call.

**Calling Bo** (website only; `assets/talk.js`, Call Bo on Ask Bo) has two engines behind one call screen:

**Live calls** (the default when `openai_key` is set): a real-time voice conversation, speech to speech, through
OpenAI's Realtime API over WebRTC. It feels like a phone call: Bo answers in about half a second in a natural voice
(Cedar by default; Marin, Ash, Ballad, Coral, Sage, Verse), waits until the student is actually done ("semantic"
turn detection, with a setting for how quickly he jumps in), and stops the moment the student talks over him.

- **Set up by the server, key never in the browser.** The browser sends its WebRTC offer to `ai_live_start`; the
  server adds Bo's instructions and posts both to OpenAI (`/v1/realtime/calls`), returning the answer. Bo's
  instructions are his live persona (a friend a year ahead who is great at the class, not an assistant: short turns,
  real reactions, asks more than tells, no help-desk phrases), the class summary, today, the progress snapshot, his
  notes and the last six chat turns.
- **Tools:** `write_on_board` (LaTeX on his whiteboard while he talks), `draw_on_board` (a graph, number line,
  figure, table, chart, normal curve or probability tree on the same board) and `remember` (a note for next time).
- **How he teaches:** the rules in `docs/bo-teaching.md`; on a call he takes a proper turn (about 20 to 40 seconds)
  to explain something new, with the board, then checks with a real question.
- **Minutes:** the browser reports every 30 seconds (`ai_live_tick`); past a limit the server hangs the call up
  (`/v1/realtime/calls/{id}/hangup`), as it does for calls that stop reporting (housekeeping) and for the old call
  when a new one starts. Limits per account: `ai_live_call` (30 minutes a call), `ai_live_daily` (90 a day),
  `ai_live_monthly` (300 a month). What was said is saved to the chat with Bo (`ai_live_log`), notes to his notes.
- **Model and cost:** `ai_live_model` = `gpt-realtime-2.1-mini` (a few cents a minute of conversation); set it to
  `gpt-realtime-2.1` for Bo's best reasoning at several times the price. Check OpenAI's pricing page for the
  current rates and set a monthly budget in the OpenAI dashboard. If OpenAI refuses one of the settings, the server
  retries with the fewest (a note goes to the PHP error log).

**Basic voice** (no key, a browser without WebRTC, a call that cannot connect, or the student's choice in the
call settings): the browser hears, the answer streams from Claude, and Bo reads it out sentence by sentence.

- Bo's answers **stream** (`ai_tutor` with `stream: 1` sends JSON lines while the AI writes), so he starts talking
  after his first sentence, about a second or two after the student stops.
- **Voice mode** (`voice: 1`) tells Bo to answer like a tutor talking: a few short sentences, math said in words,
  formulas on his **board** (`[board: ...]`, shown on screen, never read aloud), one question at a time. Answers
  are capped at 400 tokens.
- **Hearing:** the browser's own speech recognition (Chrome, Edge, Safari) is used first: free and instant, with live
  captions. Firefox has none: with `openai_key` set, a short recording is sent to `ai_listen` and turned into text
  (with the class's topics as a hint so math words come out right); without it, the student types and Bo talks.
- **Bo's voice:** with `openai_key` set, `ai_speak` makes each sentence in a natural voice (students can pick Ash,
  Ballad, Coral, Sage, Verse or Alloy, and the speed). Without it, or after the monthly limit, the best voice on the
  device reads it.
- **Costs:** speech is about 1.5 cents a minute and listening about a third of a cent a minute (OpenAI's prices
  at the time of writing). Limits per account: `ai_voice_monthly` (300,000 characters, about 5 hours of Bo talking)
  and `ai_listen_monthly` (10 hours), counted in `ai_usage.voice` and `ai_usage.listen`. Each spoken question also
  counts as one of the 1,500 questions a month. No audio is stored anywhere.
- The site's `.htaccess` allows the microphone for Mathub's own pages (`Permissions-Policy: microphone=(self)`).

To switch Bo on: create an API key at console.anthropic.com (Settings → API keys; add a payment method and set a
monthly spend limit there), then put it in `api/config.local.php`.

## 4. Put the keys in

In `calc1/assets/create.js` (public SDK keys, meant to ship inside apps):

```
const BILLING = { ios: 'appl_xxxxxxxx', android: 'goog_xxxxxxxx', pro: 'pro', max: 'max' };
```

Then `cd calc1/app && npm run sync` and make new app builds.

On the server: either in the admin panel (Keys & settings, which keeps them in `api/data/site-config.json` and
never shows them again), or in `api/config.local.php` (never in the repository or the zip):

```
'revenuecat_secret' => 'sk_xxxxxxxx',
'pro_web_link'      => 'https://pay.rev.cat/xxxxxxxx/',
'max_web_link'      => 'https://pay.rev.cat/yyyyyyyy/',
'anthropic_key'     => 'sk-ant-xxxxxxxx',
'openai_key'        => 'sk-proj-xxxxxxxx',   // live calls with Bo, his natural voice, and listening in Firefox
'plan_grants'       => ['you@montana.edu' => 'max'],   // testers who get a plan without paying
'revenuecat_v2_key' => 'sk_xxxxxxxx',   // optional: Cancel plan cancels website plans right on Mathub
'revenuecat_project' => 'projxxxxxxxx',
```

**Cancelling (Your plan, `#/plan`).** The page shows the plan, how it is paid, when it renews, this month's use and
Manage billing (the customer portal RevenueCat gives each website subscription: receipts, card, cancel, turn back
on). **Cancel plan** asks first (when it ends, what stops, what is kept, an optional reason saved in
`plan_feedback`), then `plan_cancel` on the server:
- App Store or Google Play plans: the page opens the store's subscriptions (only the store can cancel them).
- Website plans: with `revenuecat_v2_key` (a v2 secret key allowed to write customer information and
  subscriptions) and `revenuecat_project` (the project id from the RevenueCat dashboard URL), the server lists the
  customer's subscriptions (`GET /v2/projects/{project}/customers/mh_<id>/subscriptions`) and cancels the active
  Web Billing one (`POST /v2/projects/{project}/subscriptions/{id}/actions/cancel`); it runs to the end of the
  month paid for. Without those keys, or if RevenueCat says no, the page opens the subscription's billing page
  instead, so cancelling always works. Check the cancel call once with a sandbox purchase before relying on it.
- A plan from `plan_grants`, or one given in the admin panel (Members → a member's plan), has nothing to cancel.
  If the member also pays for a smaller plan, Your plan offers Manage billing and Cancel for that one.

`pro_web_price` and `max_web_price` default to `$15` and `$50`. Without the app keys the apps cannot sell the
plans; without the server keys the website cannot sell them and plans bought in the apps are not recognised there;
without `anthropic_key` Bo says he is not switched on yet; without `openai_key` there are no live calls, and calls
use basic voice (Chrome, Edge and Safari, with the device's own voice).

## 5. Test before you release

- **Android:** Play Console → License testing (your Google account); install from a test track; monthly
  subscriptions renew every 5 minutes. Try Pro, then Max (an upgrade).
- **iPhone:** a Sandbox tester (App Store Connect → Users and Access → Sandbox); Settings → App Store → Sandbox Account.
- **Website:** RevenueCat sandbox Web Purchase Links and Stripe's test card `4242 4242 4242 4242`.
- **Bo without paying:** give your account Max (or Pro) from the admin panel: Members → your plan; or add it to
  `plan_grants` with `'max'` (or `'pro'`).
- Check: Create a class → drop in a syllabus → Write my class → the plans card (Pro picked) → Get Pro → Write my
  class again → the steps run → Add. Ask Bo → Move up to Max → agree → ask a question; attach a photo; "What Bo
  knows" (beside the chat on a wide screen) shows the notes. Cancel; after it lapses classes lock and Bo shows Meet Bo again.

## 6. What changes in the store forms

- **App Store App Privacy:** Purchases → Purchase History (App Functionality, linked to the user). User Content →
  Other User Content (classes, chats with Bo, photos sent to Bo; App Functionality; linked). Usage Data → Product
  Interaction (study progress sent with questions to Bo; App Functionality; linked). Not used for tracking.
- **App Review guideline 5.1.2(i) (sharing personal data with third-party AI):** Ask Bo shows what is sent to
  Anthropic and asks for agreement before the first question; "Write my class" says the syllabus goes to Anthropic.
- **Google Play Data safety:** Financial info → Purchase history; App activity → App interactions and Other
  user-generated content (classes, chats with Bo); Photos (only those sent to Bo). Anthropic and RevenueCat are
  service providers, so this is not "shared". **AI-Generated Content policy:** every answer from Bo has Report,
  which files it for the moderators.
- **Review notes:** "Making a class (Bo writes it from a syllabus) needs Mathub Pro; Bo, the AI tutor, needs Mathub Max. To try without buying:
  Create a class → Try an example class (free). Sandbox purchases unlock both. Bo's answers come from Anthropic's
  Claude through our server; the student agrees before the first question, and every answer can be reported."

## Sharing a class

A class saved with the account can be shared (`myclass_share`): an 8-character code and the link
`https://mathub.space/#/c/CODE` with its QR code (`assets/vendor/qrcode.js`, MIT, loaded on demand). Anyone can
open it and see the class without the owner's name; adding a copy needs Pro or Max. Shared classes have Report;
moderators can stop a share from Admin → Problems (`admin_unshare`).

## What the paywall shows (store rules)

Apple (3.1.2) and Google ask that a subscription screen states what you get, the price and period, that it renews
automatically and how to cancel, with links to the Terms and the Privacy Policy, and a way to restore purchases.
The paywall shows both plans as cards (only Max where Bo is needed, "Move up to Max" for Pro members) with the
store's prices, what each unlocks, one button naming the plan and price, **Restore purchases** (apps) or
**I already subscribed** (website), the renewal terms and how to cancel, and the Terms (section 1.12,
`#/policy/create`) and Privacy Policy links. No countdowns, no crossed-out prices.
