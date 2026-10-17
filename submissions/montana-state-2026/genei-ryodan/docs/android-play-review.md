# Mathub for Android: getting through Google Play review

This is the checklist for shipping the Mathub Android app (`calc1/app/android`) on Google Play without a
rejection or a suspension. It lists what Google rejects apps for, what Mathub does about each one, the answers
for Play Console, and how to build, test and release. The iOS checklist is in [`ios-app-review.md`](ios-app-review.md).

Research date: October 2026. Play policies change; re-read the sources below before each release.

## Sources

- Developer Program Policy (Policy Center): https://play.google.com/about/developer-content-policy/
- Target API level requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- App testing requirements for new personal developer accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- User-generated content: https://support.google.com/googleplay/android-developer/answer/9876937 and https://support.google.com/googleplay/android-developer/answer/12923286
- Webview spam and minimum functionality: https://android-developers.googleblog.com/2020/10/developer-tips-and-guides-common-policy.html
- Exact alarms (Android 14 change): https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- Android developer verification: https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- Capacitor SystemBars (edge to edge): https://capacitorjs.com/docs/apis/system-bars

## What gets apps rejected, and what Mathub does about it

| Policy | Why apps get rejected | What Mathub does |
|---|---|---|
| **Target API level** | Since August 31, 2026, new apps and updates must target Android 16 (API 36). | `targetSdkVersion 36`, `compileSdk 36`, `minSdk 24` (`android/variables.gradle`). CI checks the built APK says `targetSdkVersion:'36'`. |
| **Testing requirement** (new personal accounts) | A personal developer account created after November 13, 2023 cannot publish to production until a closed test has had at least 12 testers opted in for 14 days in a row. | Plan for it: a closed test with classmates (see "Releasing" below). Organization accounts are exempt. |
| **Webview spam / minimum functionality** | An app that only shows a website, or that a bookmark could replace, is removed. | The whole site ships inside the app and works with no connection or account. App-only features: **Create a class** from any syllabus, classes saved as files on the phone and shared as files, exam and daily reminders as notifications, haptics, the share sheet, and the Android back button wired through the app. |
| **User-generated content** | Apps with posts must have terms users accept, moderation, an in-app way to report content and users, and a way to block users, and must act on reports in time. | Members accept the community rules before posting; a word filter; **Report** and **Block** under every post and comment; blocking hides the member's posts, comments, study sessions and notifications at once and files the item for the moderators (blocking from an anonymous post never unmasks anyone); moderators act on reports within 24 hours (Terms 1.4). |
| **Account deletion** | Apps that let people create accounts must offer deletion in the app **and** a web link where people can ask for deletion without the app. | In the app and on the web: **Settings → Delete account**. The web link for the Data safety form: **https://mathub.space/#/policy/delete** (section 6 of the policy page: the steps, an email route for people who cannot sign in, what is deleted and what is kept). |
| **Data safety** | The form must match what the app does; a mismatch is a common rejection and a later enforcement reason. | Answers below, the same facts as the Privacy Policy (section 3) and the iOS privacy manifest. |
| **Privacy policy** | A policy must be linked in Play Console and reachable in the app. | https://mathub.space/#/policy, linked in Settings → On this phone, and in the footer. |
| **Permissions** | Asking for permissions the app does not need, or restricted ones without a declaration. | Only INTERNET, POST_NOTIFICATIONS (asked when a reminder is turned on), RECEIVE_BOOT_COMPLETED and WAKE_LOCK (keep reminders after a restart), VIBRATE (haptics), and for the Pro and Max plans com.android.vending.BILLING and ACCESS_NETWORK_STATE (Google Play Billing and RevenueCat). CI fails the build if anything else appears. |
| **Exact alarms** | `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` are for alarm-clock and calendar apps; other apps get a policy violation. On Android 14+ the permission is also denied by default, so the notifications plugin would open a system settings screen. | Both are removed from the manifest (`tools:node="remove"`); reminders are scheduled as inexact (`isExactNotification: false` in `assets/app-boot.js`), which is fine for "your exam is in 3 days". CI fails if either permission is present. |
| **Deceptive behaviour, metadata** | Misleading titles, icons or screenshots; a title over 30 characters, emoji or all caps; claims about rankings or affiliation. | Title "Mathub" or "Mathub: Study Hub" (under 30 characters). Bo is our own art. Keep "Montana State" out of the title and icon; the description says Mathub is not affiliated with Montana State University. Screenshots come from the app. |
| **Payments and subscriptions** | Selling digital goods outside Google Play Billing; subscription screens that hide the price, the renewal or how to cancel. | Free to download, no ads. Two subscriptions, **Mathub Pro** (classes Bo writes from a syllabus, and making your own classes) and **Mathub Max** (Pro, plus Bo the AI tutor), sold only through Google Play Billing (via RevenueCat); moving from Pro to Max is a Play upgrade. The paywall shows the Play prices and period, that it renews until cancelled and how to cancel, links to the Terms and Privacy Policy, and Restore purchases; Settings has Manage subscription. See [`app-subscriptions.md`](app-subscriptions.md). |
| **AI-generated content** | Apps that generate content with AI must let users report offensive AI output. | Mathub generates nothing with AI and sends nothing to an AI. The student pastes an answer from an AI they chose; the class it makes is saved only on their phone and shown only to them. If reviewers ask, point to this and to the in-app problem report. |
| **Developer verification** | Since September 30, 2026, apps from unverified developers cannot be installed in Brazil, Indonesia, Singapore and Thailand; Google plans to extend this worldwide in 2027. | Complete identity verification in Play Console before the first release; Play registers the app automatically. |
| **16 KB memory pages** | Apps with native code must support 16 KB page sizes for Android 15+ devices. | The app's code is web code and Kotlin/Java; CI checks the bundle for native libraries and, if any appear, checks their alignment. |
| **Edge to edge** (Android 15+) | Not a policy, but apps that draw under the status bar look broken and get one-star reviews. | `EdgeToEdge.enable` in `MainActivity`, Capacitor SystemBars `insetsHandling: "native"`; the page pads itself with `env(safe-area-inset-*)`, and the status bar strip covers the clock. Check on a real device (below). |

## Play Console answers

### Data safety

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only).
- **Do you provide a way for users to request that their data is deleted?** Yes, with the link https://mathub.space/#/policy/delete.
- **Shared with third parties:** none. (Hostinger hosts the site and sends its emails as a service provider, which the form does not count as sharing.)
- **Collected** (all **optional**: the app works without an account; purpose **App functionality** and **Account management** for the first three, **App functionality** for the rest; none processed ephemerally only):
  - Personal info → **Email address**, **Name** (optional display name), **User IDs**
  - App activity → **App interactions** (study progress that syncs), **Other user-generated content** (posts, comments, class requests, classes the student makes when signed in, which sync and can be shared by link, and chats with Bo)
  - Photos and videos → **Photos** (only photos a Max member sends to Bo; processed by Anthropic as a service provider)
  - Files and docs → **Files and docs** (a syllabus a student attaches to a class request)
  - App info and performance → **Diagnostics** (error reports, no account attached)
  - Financial info → **Purchase history** (only for people who subscribe to Pro or Max; processed by RevenueCat as a service provider, so not "shared")
- **Not collected:** location, contacts, photos and videos, audio, calendar, health, other financial info, messages, web history, device or other IDs.
- Classes created in the app and the syllabus pasted into an AI stay on the phone and are not collected.

### Content rating (IARC questionnaire)

- Category: **Reference, News, or Educational**.
- Violence, fear, sexuality, language, controlled substances, gambling: **No**.
- **Users can interact or exchange content:** Yes (moderated class discussions; no private messages).
- **Shares the user's location:** No. **Digital purchases:** Yes (the Mathub Pro and Max subscriptions). **Unrestricted internet access:** No (outside links open in the browser).

### Target audience and content

- Target age groups: **18 and over** (you may add **16–17**). Do **not** choose any group under 13: that brings in the Families policy.
- Ads: **No ads**. News app: **No**. Government app: **No**. Financial features: **None**. Health: **None**.
- **App access:** "All or some functionality is restricted" → give the review account (see below) with these instructions:

```
Everything except discussions works without signing in. To see discussions, tap Sign in (top right), then Log in,
and use the account below. Sign-up is limited to Montana State University addresses, so please use this account.
Create a class (app only): Learn tab → the class button (top left) → "Create a class from a syllabus" → "Try an example class" →
"Add SKIL 101". With Pro, the student copies the instructions to an AI of their choice and pastes the answer back. The example class is free; adding a class from a real syllabus needs the
Mathub Pro (Bo writes it from the syllabus, or the student uses their own AI); Bo, the AI tutor (Bo tab), needs Mathub Max (test with a license-testing
account). Bo's answers come from Anthropic's Claude through our server after the student agrees, and every answer
has Report (AI-Generated Content policy). Report and Block are under every post and comment.
Account deletion: Settings → Delete account, or https://mathub.space/#/policy/delete.
```

### The review account

The same account as for Apple works (see `ios-app-review.md`): add an address you read to `extra_allowed_emails` in
`api/config.local.php` on the server, sign up with it, verify, accept the community rules, and put the address
and password in Play Console → App content → App access.

### Store listing

- **App name:** Mathub (or "Mathub: Study Hub"), 30 characters at most.
- **Short description** (80 characters): "Your classes offline: notes, practice, flashcards. Make any class from its syllabus."
- **Full description:** what the app does, in plain words; end with "Mathub is an independent student project, not affiliated with Montana State University."
- **App icon:** `app/store/play-icon-512.png` (512 × 512, Google rounds the corners).
- **Feature graphic:** `app/store/play-feature-1024x500.png`.
- **Phone screenshots** (2 to 8, sides between 320 and 3840 px, no more than 2:1): `app/store/android-phone-*.png` (1080 × 1920), taken from the app's own pages.
- Category: **Education**. Contact email and website: required; the privacy policy URL: https://mathub.space/#/policy.

## Building

There is no Android SDK in the cloud dev container, so CI builds it (`.github/workflows/android-build.yml`):
every push that touches the app builds a debug APK and an unsigned release bundle and runs the checks above.
The debug APK is kept for 14 days as the **mathub-android-debug-apk** artifact on the workflow run: download it,
copy it to an Android phone, and open it to install (allow installs from your browser or files app when asked).

On your own computer (Android Studio with SDK 36 and JDK 21):

```
cd calc1/app
npm ci
npm run sync:android       # builds www from the site and copies it into android/
npm run open:android       # opens the project in Android Studio
```

## Releasing

1. **Upload key** (once): `keytool -genkeypair -v -keystore mathub-upload.jks -alias mathub -keyalg RSA -keysize 2048 -validity 10000`.
   Keep the file and its passwords safe and out of git. Create `calc1/app/android/keystore.properties`:
   ```
   storeFile=../mathub-upload.jks
   storePassword=...
   keyAlias=mathub
   keyPassword=...
   ```
   (Both names are in `android/.gitignore`.) Google Play App Signing keeps the real signing key; this one only uploads.
2. **Version:** in `android/app/build.gradle`, raise `versionCode` (a whole number, higher on every upload) and `versionName`.
3. **Build:** `npm run sync:android`, then `cd android && ./gradlew bundleRelease`. Upload `app/build/outputs/bundle/release/app-release.aab`.
4. **Closed test** (new personal accounts): Play Console → Testing → Closed testing → create a track, add at least
   12 testers (a Google Group of classmates is easiest), share the opt-in link, and keep them opted in for 14 days.
   Then apply for production access from the dashboard.
5. **Production:** fill in the store listing and App content sections, send for review. Reviews usually take a few
   days; the first one can take longer.

## Check on a real phone before the first release

The CI build proves the project compiles and the manifest is right, not how it feels. On a phone running Android 15
or 16 and one running an older version (Android 10 to 13):
- the status bar and the gesture bar do not cover the top bar or the tab bar, in light and dark mode;
- the keyboard does not cover the field you are typing in (Create a class, step 3);
- back closes a dialog or the class sheet, then goes back a page, then leaves the app from the Learn tab;
- turning on a reminder asks for the notification permission once, and the reminder arrives;
- Send (a created class) and Download my data open the share sheet;
- the Python playground runs code with no connection.

## When the website changes

The app carries its own copy of the site, so a change in `calc1/assets` reaches the app only with a new app
build. Account calls go to `https://mathub.space/api/` through Capacitor's native HTTP, which sends no
browser origin, so the server needs no Android-specific rule.
