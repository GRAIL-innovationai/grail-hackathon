# Mathub for iOS: getting through App Review

This is the checklist for shipping the Mathub iPhone and iPad app (`calc1/app`) without a rejection.
It lists what Apple rejects apps for, what Mathub does about each one, the answers to give in
App Store Connect, the note for the reviewer, and how to build and submit.

Research date: October 2026. Guidelines change; re-read the sources below before each submission.

## Sources

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Common rejection reasons (Apple's own list): https://developer.apple.com/app-store/review/#common-app-rejections
- Upcoming requirements (Xcode 26 / iOS 26 SDK for uploads from April 28, 2026): https://developer.apple.com/news/upcoming-requirements/
- Privacy manifest files and required-reason APIs: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- App privacy details (the "nutrition label"): https://developer.apple.com/app-store/app-privacy-details/
- Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Age ratings (questionnaire updated for 2026): https://developer.apple.com/help/app-store-connect/reference/age-ratings/
- Export compliance (encryption): https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations

## What gets apps rejected, and what Mathub does about it

| Guideline | Why apps get rejected | What Mathub does |
|---|---|---|
| **2.1** App completeness | The most common reason. Crashes, broken links, placeholder text, or a login the reviewer cannot get past. | The review account below. The study tools work offline; account features (sync, discussions) say so when there is no connection. The CI job (`.github/workflows/ios-build.yml`) builds the app for the simulator on every change and checks the bundle. The full Playwright suite runs the app pages with a stand-in for the phone (`tests/app.test.js`). |
| **2.3** Accurate metadata | Screenshots that are not the app, features that are not in it, or prices that do not match. | Take the screenshots from the app on a simulator (sizes below). Describe only what is in the build. |
| **2.5.2** Downloaded code | An app may not download or run code that changes what it does. | Nothing is downloaded at runtime. MathJax and the Python runtime (Pyodide) ship inside the app (`app/scripts/build-www.js` refuses to build if a page loads a script from the internet, and CI checks again). The Python playground runs code the student types, which the guideline allows for apps that teach programming. Class packs and created classes are data (JSON), never code. |
| **4.2** Minimum functionality | An app that is "just a website in a wrapper" is rejected. | The app works with no connection and no account. It has features the website does not: **Create a class** from any syllabus (app-only), classes saved as files on the device, local exam and daily reminders, haptics, the share sheet for files and classes, and the in-app Safari sheet for outside links. |
| **4.2.3(i)** | The app must work without another app installed. | Create a class asks the student to use an AI of their choice, but the app never needs one: **Try an example class** adds a complete class with no AI, and **Import it** opens a class file a friend sent. Everything else works without it. |
| **4.1(c)**, **5.2.1** Brands and trademarks | Another company's name, logo or look in the app name, icon or screenshots; a university's name that suggests it endorses the app. | The app name and icon are Mathub and Bo (our own art). No AI company is named anywhere in the app. Keep "Montana State" out of the app name, subtitle and icon. Say "not affiliated with Montana State University" in the description. |
| **1.2** User-generated content | Apps with posts must filter objectionable content, let users report it and block abusive users, act on reports within 24 hours, and publish contact information. | A word filter on every post and comment. **Report** and **Block** under every post and comment. Blocking hides that member's posts, comments, study sessions and notifications at once and files the item for the moderators (blocking from an anonymous post hides only their anonymous posts, so a block never unmasks anyone). The Terms (section 1.4) and Community Rules commit to no tolerance for abusive content and action within 24 hours. Contact: Settings, the policy page and `#/contact`. Members must accept the rules before their first post. |
| **5.1.1(i)** Privacy policy | A privacy policy must be linked in App Store Connect and inside the app. | `#/policy` (Settings → On this iPhone → Terms and privacy, and the footer). Section 3 covers the app. |
| **5.1.1(v)** Accounts | No login for features that do not need one. Apps with accounts must let people delete the account in the app. | Every study tool works signed out in the app (the website locks a few tools for guests; the app does not). Signing in only adds sync, discussions and classes with an instructor. **Settings → Delete account** deletes the account and its data on the server. |
| **4.8** Login services | Apps that offer a third-party login (Google, Facebook) must also offer an equivalent privacy-focused one such as Sign in with Apple. | Mathub has only its own email and password sign-in, so Sign in with Apple is not required. If a Google or Microsoft login is ever added, add Sign in with Apple in the same release. |
| **Permissions** | Asking for access the app does not need, or a vague purpose string; a missing purpose string crashes the app on first use. | The app asks for one permission: notifications, only when a reminder is turned on. It uses no camera, microphone, photos, location or contacts (the file pickers accept only JSON, PDF, Word and MP3), so Info.plist has no purpose strings. |
| **3.1.1**, **3.1.2** In-app purchase and subscriptions | Unlocking features with anything but In-App Purchase; subscription screens without the price, period, auto-renewal terms, Terms of Use and Privacy Policy links, or a way to restore purchases. | Two auto-renewable subscriptions in one group, **Mathub Pro** (making your own classes) and **Mathub Max** (Pro, plus Bo the AI tutor and classes Bo writes), through In-App Purchase (via RevenueCat). The paywall shows both plans with their App Store prices and period, "renews every month until you cancel" and how to cancel, links to the Terms of Use (`#/policy/create`) and Privacy Policy, and Restore purchases; Settings has Manage subscription. Everything else is free, and so is the example class, so review can try the whole flow. See [`app-subscriptions.md`](app-subscriptions.md). |
| **5.1.2(i)** Data shared with AI (Nov 2025) | Apps must say clearly, and get permission, before sending personal data to a third-party AI. | The app sends nothing to any AI. The student copies the instructions, pastes them into an AI they chose, and pastes the answer back. Step 2 of Create a class says so in plain words, and the Privacy Policy says the AI's own terms apply. |
| **5.1.1**, privacy manifest | Uploads that use "required reason" APIs without a privacy manifest fail with ITMS-91053. | `ios/App/App/PrivacyInfo.xcprivacy`: no tracking, the data types below, UserDefaults (CA92.1) and file timestamps (C617.1). Capacitor and its plugins ship their own manifests. |
| **Build requirements** | Uploads built with an older SDK are refused. | Build with Xcode 26 (iOS 26 SDK). Minimum iOS 15. arm64 only. `ITSAppUsesNonExemptEncryption = false` (the app uses only HTTPS from the system), so there is no export-compliance question per upload. |
| **Icon and launch screen** | An icon with transparency or a placeholder icon is rejected at upload. | 1024 × 1024 PNG, no alpha (CI checks). Navy launch screen with Bo and the wordmark. |

## App Store Connect answers

### App Privacy (must match `PrivacyInfo.xcprivacy` and the Privacy Policy)

- **Do you or your third-party partners collect data from this app?** Yes (only for people who sign in).
- **Tracking:** No. No data is used for tracking, and there is no advertising.
- Data types, all **linked to the user**, **not used for tracking**, purpose **App Functionality** only:
  - Contact Info → **Email Address** (the account)
  - Contact Info → **Name** (optional display name)
  - Identifiers → **User ID** (the account number)
  - User Content → **Other User Content** (posts, comments, class requests, and classes the student makes when signed in: they sync with the account and can be shared by link)
  - Usage Data → **Product Interaction** (study progress that syncs across devices)
- **Diagnostics → Other Diagnostic Data**: **not linked** to the user (error reports carry no account), App Functionality.
- **Purchases → Purchase History**: **linked** to the user (once signed in, RevenueCat knows the subscription by an ID made from the Mathub account number, so it also works on the website), App Functionality, not used for tracking. Only for people who subscribe to Pro or Max.
- **User Content → Other User Content** and **Photos** also cover chats with Bo and photos sent to Bo (Max); **Usage Data → Product Interaction** covers the progress summary sent with each question. All App Functionality, linked, not tracking.
- **Guideline 5.1.2(i) (third-party AI):** before the first question, Ask Bo says what is sent to Anthropic (the question, any photo, a class summary and a progress summary) and asks for agreement; "Let Bo write it" says the syllabus goes to Anthropic. Every answer from Bo has Report.
- Not collected: location, contacts, photos, health, financial info, browsing history, search history, device ID, crash logs from a third-party SDK.
- Classes created in the app and the syllabus a student pastes stay on the device and are **not** collected.

### Age rating

Answer the questionnaire honestly. For Mathub:
- User-generated content: **Yes**, moderated (filter, report, block, moderators).
- Messaging and chat: **No** private messages (public class discussions only).
- Unrestricted web access: **No** (outside links open in the system Safari sheet; there is no browser in the app).
- Everything else (violence, mature themes, gambling, medical, contests, advertising): **None**.

Expect **13+**. Apple's newer rules treat apps with social features as 13+ at minimum; if App Store
Connect asks the social media question, answer **Yes** and keep 13+.

### Other fields

- **Category:** Education (secondary: Productivity).
- **Price:** Free. In-app purchases: the Mathub Pro and Mathub Max monthly subscriptions (submit them with the app version; see `app-subscriptions.md`).
- **Content rights:** the app contains no third-party content you do not have rights to (study notes are
  written in our own words; MathJax and Pyodide are open-source and bundled with their licences).
- **Support URL:** `https://mathub.space/#/contact`. **Privacy Policy URL:** `https://mathub.space/#/policy`.

## The review account

The reviewer cannot sign up: sign-up needs a montana.edu address. Make a review account the server allows:

1. In `api/config.local.php` on the server, add an address you can read mail at:
   `'extra_allowed_emails' => ['your.review.address@example.com'],`
   (config.local.php is never in the zip; edit it on Hostinger.)
2. In the app or on mathub.space, **Sign up** with that address, enter the emailed code, set a password.
3. Sign in once, open Discussions, accept the community rules, and make one harmless post so the reviewer sees Report and Block on someone else's post (post it from your own account, then check from the review account).
4. Put the address and password in App Store Connect → App Review Information → Sign-in required.

Keep the account. Apple reviews every update.

## Notes for the reviewer (paste into App Review Information → Notes)

```
Mathub is a free study app for university classes: notes, practice questions, flashcards, a grade
calculator, a graphing tool and exam countdowns. It works offline and without an account.

Signing in is optional. It syncs progress and opens the class discussions. Sign-up is limited to
Montana State University students, so please use the demo account provided.

Create a class (app-only feature): on the Learn tab, tap the class button at the top left (or the
"Add a class" card) → "Create a class from a syllabus".
 - To try it without any AI: tap "Try an example class", then "Add SKIL 101". The example class is free.
 - Adding a class from a real syllabus (Bo writes it, or the student uses their own AI) needs Mathub Pro;
   Bo, the AI tutor (the Bo tab), needs Mathub Max (In-App Purchase, testable with a sandbox account). Restore purchases is on the paywall and in
   Settings. Bo's answers come from Anthropic's Claude through our server, after the student agrees; every
   answer can be reported.
 - The full flow: the app shows instructions; the student copies them into an AI assistant of their
   own choice together with their syllabus, then pastes the answer back. The app checks and repairs
   the answer and saves the class on the device. The app itself never contacts any AI service and
   sends nothing to one; the student does the copying.

User-generated content: Discussions have a word filter, Report and Block under every post and comment,
and moderators who act on reports within 24 hours. Blocking hides the member's content at once and
alerts the moderators. Blocked members are listed (with Unblock) in Settings.

Account deletion: Settings → Delete account.
Python playground: the Python runtime is bundled in the app; it runs only code the student types, to
learn programming. No code is downloaded.
```

## Screenshots

App Store Connect needs at least one set for each device class the app runs on:
- iPhone 6.9" (1320 × 2868 or 1290 × 2796): required.
- iPad 13" (2064 × 2752 or 2048 × 2732): required, because the app runs on iPad.

Take them in the Simulator (File → Save Screen) from the real app: the Learn tab with your classes and the path,
a class dashboard with the trail to the next exam, the quizzer, flashcards, and Create a class
(step 1 and a preview). No device frames with other brands, no text that promises features the app
does not have.

## Building and submitting

On a Mac with Xcode 26:

```
cd calc1/app
npm ci
npm run sync:ios      # builds www from the site and copies it into ios/
npm run open          # opens ios/App/App.xcodeproj in Xcode
```

In Xcode:
1. Select the **App** target → Signing & Capabilities → your Team. The bundle id is `space.mathub.app`
   (register it in the developer account first, or change it in both the project and `capacitor.config.json`).
2. For each release raise **Version** (MARKETING_VERSION, e.g. 1.0 → 1.1) or at least **Build** (CURRENT_PROJECT_VERSION).
3. Choose "Any iOS Device (arm64)", then Product → Archive → Distribute App → App Store Connect → Upload.
4. In App Store Connect, add the build to the version, fill in the answers above, and submit.

Before each upload: run the test suite (`node tests/run.js`) and check the CI build is green.

## When the website changes

The app carries its own copy of the site. A change to `calc1/assets` reaches the website when the zip
is uploaded to Hostinger, but reaches the app only with a new app build. Account calls go to
`https://mathub.space/api/`, so server changes reach the app at once: keep the API backward
compatible with the app version in the store. The server accepts the app's requests by their origin
(`capacitor://localhost`, see `mh_guard_mutation` in `api/lib.php`).
