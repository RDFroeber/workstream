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
