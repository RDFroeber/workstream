// ---------------------------------------------------------------------------
// Where is this running: browser, installed PWA, or the native iOS wrapper?
//
// The app is the same bundle everywhere; this module is the single place that
// answers the question, so the rest of the code branches on `isNative()`
// rather than sniffing user agents. On the plain web, @capacitor/core is a
// tiny shim whose isNativePlatform() returns false.
// ---------------------------------------------------------------------------

import { Capacitor } from '@capacitor/core'

export function isNative() {
  return Capacitor.isNativePlatform()
}

/**
 * Open an external URL the way the platform expects.
 *
 * In the native wrapper a target="_blank" anchor is a trap: WKWebView has no
 * tabs, so the click navigates the app's own webview to the external site,
 * with no browser chrome and no way back. Routing through the system browser
 * sheet keeps the app where it was. On the web this is just window.open.
 */
export async function openExternal(url) {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
