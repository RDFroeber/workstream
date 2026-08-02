// ---------------------------------------------------------------------------
// Finding links in free text.
//
// Only http and https are ever returned. Anything else — javascript:, data:,
// file: — is dropped rather than rendered, because these strings come from a
// notes field and end up as href attributes.
// ---------------------------------------------------------------------------

// Closing parens are allowed into the match and balanced afterwards. Excluding
// them outright truncated legitimate addresses like
// en.wikipedia.org/wiki/Foo_(bar) at the opening bracket.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'\]]+/gi

const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

// Trailing punctuation is almost always sentence punctuation, not part of the
// address: "see https://example.com/docs." should not link the full stop.
function trimTrailing(raw) {
  let out = raw
  while (out.length && '.,;:!?'.includes(out[out.length - 1])) out = out.slice(0, -1)
  // Balance closing brackets that the regex may have swept up.
  while (out.endsWith(')') && (out.match(/\(/g) || []).length < (out.match(/\)/g) || []).length) {
    out = out.slice(0, -1)
  }
  return out
}

/**
 * Extract the linkable URLs from a block of text.
 * Returns `{ href, label }` — `href` is always absolute and safe to use.
 */
export function extractLinks(text) {
  if (!text) return []
  const found = []
  const seen = new Set()
  for (const match of String(text).matchAll(URL_RE)) {
    const label = trimTrailing(match[0])
    if (!label) continue
    const href = label.toLowerCase().startsWith('www.') ? `https://${label}` : label
    let parsed
    try {
      parsed = new URL(href)
    } catch {
      continue
    }
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) continue
    if (seen.has(parsed.href)) continue
    seen.add(parsed.href)
    found.push({ href: parsed.href, label })
  }
  return found
}

/** A short, readable label: host plus a hint of the path. */
export function shortenLink(href) {
  try {
    const u = new URL(href)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname === '/' ? '' : u.pathname
    const tail = path.length > 20 ? `${path.slice(0, 18)}…` : path
    return host + tail
  } catch {
    return href
  }
}
