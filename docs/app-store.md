# Notes for an App Store submission

Collected while deciding whether to add Google sign-in. The short version: don't
add a social login unless you're also prepared to add Sign in with Apple.

## Guideline 4.8 — Login Services

The rule only triggers if you use a **third-party or social** login service to
set up or authenticate the user's primary account. Apple names Facebook Login,
Google Sign-In, Log in with X, Sign In with LinkedIn, Login with Amazon and
WeChat Login. If you do, you must also offer an equivalent option that:

- limits data collection to the user's name and email address,
- lets the user keep their email address private while setting up the account,
- doesn't collect in-app interactions for advertising without consent.

**An app that only uses its own email-and-password system doesn't trigger 4.8 at
all.** That's where this app currently sits, and it's the reason there's no
social login: adding Google would create an obligation that doesn't otherwise
exist.

Worth noting the second bullet. Email and password *seems* like it should
satisfy the requirement, but it can't offer a private email address the way
Apple's Hide My Email does — the developer necessarily sees the real address.
Developer forum threads show reviewers rejecting apps that had manual sign-in
alongside Google, with the note that Sign in with Apple meets the requirements.
Treat "our own email login counts as the equivalent option" as an argument you
may have to make to a reviewer, not a settled fact.

## So which second option?

If a second login method is wanted for the App Store build, **Sign in with Apple
is the better choice than Google**:

- It satisfies 4.8 pre-emptively rather than creating the obligation.
- It's native on iOS. It uses the system sheet, so it avoids the redirect-out
  problem that breaks OAuth in installed PWAs, where iOS opens Safari, completes
  the sign-in there, and never returns to the app's context.
- It needs the Apple Developer account you'd be paying for anyway.
- Supabase supports it as a provider, so the app-side change is small.

## What's implemented

Sign in with Apple is wired up (`signInWithApple` in `src/lib/api.js`, the button
in `Auth.jsx`). On the web it's a redirect through Apple and back to `appUrl()`,
which is why email and password remains the primary path — a redirect out of an
installed iOS PWA can fail to return to the app's context. A native wrapper
would use the system sheet and avoid that.

Supabase setup: Apple Developer account → Services ID, a Sign in with Apple key,
and the return URL pointing at `https://<project-ref>.supabase.co/auth/v1/callback`.
Then enable the Apple provider in Supabase with the Services ID and key. The app
side needs no further change.

## Also required before submitting

- **Guideline 5.1.1(v) — account deletion.** Any app that supports account
  creation must let the user start deletion from inside the app. This app has no
  such flow yet; it will be rejected without one. Supabase needs an edge function
  or admin call for this, since the client library can't delete its own user.
- **A privacy policy URL**, and a privacy nutrition label in App Store Connect.
- **Guideline 4.2 — minimum functionality.** A wrapped website gets rejected on
  its own. Local notifications and offline support are already built, which is
  the kind of native capability that answers this.

---

# Submission guide (everything code-side is done)

The repo now contains the full native wrapper. What the code provides:

- **Capacitor iOS project** in `ios/` (`appId: dev.shebuilt.lines` — change in
  `capacitor.config.json` before first sync if you want a different bundle id).
- **Scheduled local notifications** on iOS: the app plans the next week of
  reminders and hands them to the system, so they fire with the app closed —
  a genuinely native capability, which is the answer to guideline 4.2.
- **Native Sign in with Apple** via the system sheet and `signInWithIdToken`
  (no redirect, so it works inside the wrapper).
- **In-app account deletion** (guideline 5.1.1(v)): Settings → Account, backed
  by the `delete-account` edge function.
- **Privacy policy page** at `public/privacy.html` → https://lines.shebuilt.dev/privacy.html
  after the next web deploy.
- Safe-area insets, external links through the system browser sheet, no
  service worker in the wrapper, App Store icon (1024, no alpha) already in
  the asset catalog.

## One-time server setup

1. **Deploy the deletion function** (from the repo root, with the Supabase CLI
   signed in to your project):

       supabase functions deploy delete-account

   Verify from the deployed web app: create a throwaway account, Settings →
   Account → delete it, confirm the rows are gone.

2. **Sign in with Apple for the native app.** In the Apple Developer portal,
   enable the Sign in with Apple capability for the app's bundle id. Then in
   Supabase → Auth → Providers → Apple, add `dev.shebuilt.lines` to
   **Authorized Client IDs** (alongside the existing Services ID used by the
   web flow).

## Build in Xcode

    npm run ios        # builds web assets, syncs, opens Xcode

Then in Xcode, one-time:

- Signing & Capabilities → set your Team; check the bundle id.
- Add capability: **Sign in with Apple**.
- Run on a real device; scheduled notifications don't behave realistically in
  the simulator.

Smoke test on device: sign up, sign in with Apple, create tasks, enable
reminders (accept the permission prompt), background the app past the daily
time, complete a task offline in airplane mode and watch it sync on return,
open an external link from a note, delete a throwaway account.

## App Store Connect

- **App record**: the name "Lines" alone is unlikely to be free — have
  "Lines — Workstream Tracker" ready. Category: Productivity.
- **Privacy nutrition labels** (matches privacy.html): Data linked to you —
  Contact Info › Email Address (App Functionality), User Content › Other
  (App Functionality). No tracking, no third-party advertising.
- **Privacy policy URL**: https://lines.shebuilt.dev/privacy.html
  (deploy the web app first so it's live when review looks).
- **Support URL**: the GitHub repo works.
- **Export compliance**: uses standard HTTPS encryption only → exempt.
- **Age rating**: everything "None" → 4+.
- **Screenshots**: 6.9" iPhone set required (6.5" optional). iPhone-only
  avoids the iPad set entirely — make sure "iPad" is unchecked in the app
  record. Screenshot the Today view with picks, a line with a sequence, and
  the task detail.
- **App Review notes**: reviewers must be able to sign in. Create a demo
  account seeded with a few lines and tasks, and put its email + password in
  the review notes. Mention that reminders are local notifications and that
  account deletion is in Settings → Account.

## Known review friction, pre-answered

- *"This looks like a website"* (4.2): point at scheduled local notifications
  (fire with the app closed), full offline mode with sync, and Sign in with
  Apple via the system sheet.
- *"Where is account deletion?"* (5.1.1(v)): Settings → Account → Delete my
  account. It deletes server-side immediately.
- *"Sign in with Apple must be offered"* (4.8): it is, natively.
