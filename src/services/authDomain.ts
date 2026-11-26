// authDomain.ts — picks the Firebase Auth `authDomain` for the current page.
//
// Why this exists: Google sign-in from the installed PWA uses signInWithRedirect.
// When `authDomain` (globe-expenses.firebaseapp.com) differs from the domain the
// app is served from (globe-expenses.web.app), the redirect result is stored by a
// cross-origin iframe. Browsers now partition third-party storage (Safari 16.1+,
// Chrome 115+, Firefox 109+), so the app never sees it: getRedirectResult()
// returns null and the user lands back on the welcome page, signed out.
//
// Firebase's recommended fix ("Best practices for using signInWithRedirect",
// option 1): make `authDomain` the same domain as the app. Firebase Hosting serves
// the /__/auth/* handler on every one of its domains, so when the page is served
// from one of this project's default Hosting domains we use that domain.
//
// Anywhere else (localhost, preview channels) we keep the configured value:
// Google only accepts OAuth redirect URIs registered in advance, and preview
// channel domains are not registered.
//
// REQUIRED console setting (once): in Google Cloud Console → APIs & Services →
// Credentials → the "Web client (auto created by Google Service)" OAuth client,
// add `https://<projectId>.web.app/__/auth/handler` to Authorized redirect URIs.
// Without it Google sign-in fails with redirect_uri_mismatch on web.app.

/**
 * Returns the auth domain to use for a page served from `hostname`.
 * Pure function so it can be unit-tested without a browser.
 */
export function resolveAuthDomain(
  hostname: string,
  projectId: string | undefined,
  configured: string | undefined,
): string | undefined {
  if (projectId) {
    const hostingDomains = [`${projectId}.web.app`, `${projectId}.firebaseapp.com`]
    if (hostingDomains.includes(hostname)) return hostname
  }
  return configured
}
