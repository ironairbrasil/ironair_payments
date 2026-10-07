const ATTRIBUTION_STORAGE_KEY = "ironair:attribution:first-touch";
const ATTRIBUTION_SESSION_KEY = "ironair:attribution:session";
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const ATTRIBUTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
];
const COOKIE_KEYS = ["_fbp", "_fbc"];
export const ATTRIBUTION_KEYS = [...QUERY_KEYS, ...COOKIE_KEYS];

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || ""
  );
}

function cookieDomain() {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  return hostname === "ironair.com.br" || hostname.endsWith(".ironair.com.br")
    ? ";domain=.ironair.com.br"
    : "";
}

function writeCookie(name, value) {
  if (typeof document === "undefined" || !value) return;
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${ATTRIBUTION_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    cookieDomain(),
  ].join(";");
}

function readStored(storage, key, now = Date.now()) {
  try {
    const parsed = safeJsonParse(storage.getItem(key));
    if (parsed?.data && parsed?.capturedAt) {
      return now - Number(parsed.capturedAt) <= ATTRIBUTION_MAX_AGE_MS
        ? compactAttribution(parsed.data)
        : {};
    }
    return compactAttribution(parsed);
  } catch {
    return {};
  }
}

function writeStored(storage, key, value, now = Date.now()) {
  try {
    storage.setItem(key, JSON.stringify({ capturedAt: now, data: value }));
  } catch {
    // Storage can fail in private or locked-down contexts; URL attribution remains intact.
  }
}

function attributionFromSearch(search) {
  const params = new URLSearchParams(search || "");
  return Object.fromEntries(
    QUERY_KEYS.map((key) => [key, params.get(key) || ""]).filter(([, value]) => value),
  );
}

function attributionFromCookies() {
  return Object.fromEntries(
    COOKIE_KEYS.map((key) => [key, decodeURIComponent(readCookie(key) || "")]).filter(
      ([, value]) => value,
    ),
  );
}

function buildFbc(fbclid, now = Date.now()) {
  if (!fbclid) return "";
  return `fb.1.${now}.${fbclid}`;
}

function compactAttribution(value) {
  return Object.fromEntries(
    ATTRIBUTION_KEYS.map((key) => [key, String(value?.[key] || "").slice(0, 500)]).filter(
      ([, item]) => item,
    ),
  );
}

export function mergeAttribution(...sources) {
  return compactAttribution(
    sources.reduce((merged, source) => ({ ...merged, ...compactAttribution(source) }), {}),
  );
}

export function captureAttribution({ search, now } = {}) {
  if (typeof window === "undefined") return {};
  const capturedAt = now || Date.now();

  const current = attributionFromSearch(search ?? window.location.search);
  const cookies = attributionFromCookies();
  const generatedFbc = cookies._fbc || buildFbc(current.fbclid, capturedAt);
  const browserAttribution = compactAttribution({
    ...current,
    ...(cookies._fbp ? { _fbp: cookies._fbp } : {}),
    ...(generatedFbc ? { _fbc: generatedFbc } : {}),
  });

  if (browserAttribution._fbc && !cookies._fbc) {
    writeCookie("_fbc", browserAttribution._fbc);
  }

  const hasCurrentAttribution = Object.keys(browserAttribution).length > 0;
  const storedFirstTouch = readStored(window.localStorage, ATTRIBUTION_STORAGE_KEY, capturedAt);
  const firstTouch = mergeAttribution(
    storedFirstTouch,
    hasCurrentAttribution ? browserAttribution : {},
  );
  const sessionTouch = mergeAttribution(
    readStored(window.sessionStorage, ATTRIBUTION_SESSION_KEY, capturedAt),
    browserAttribution,
  );

  if (Object.keys(firstTouch).length) {
    writeStored(window.localStorage, ATTRIBUTION_STORAGE_KEY, firstTouch, capturedAt);
  }
  if (Object.keys(sessionTouch).length) {
    writeStored(window.sessionStorage, ATTRIBUTION_SESSION_KEY, sessionTouch, capturedAt);
  }

  return mergeAttribution(firstTouch, sessionTouch, attributionFromCookies());
}

export function getPersistedAttribution() {
  if (typeof window === "undefined") return {};
  const now = Date.now();

  return mergeAttribution(
    readStored(window.localStorage, ATTRIBUTION_STORAGE_KEY, now),
    readStored(window.sessionStorage, ATTRIBUTION_SESSION_KEY, now),
    attributionFromCookies(),
  );
}

export function appendAttributionToUrl(url, attribution) {
  const nextUrl = new URL(url, window.location.href);
  const merged = mergeAttribution(attribution);
  for (const [key, value] of Object.entries(merged)) {
    if (!nextUrl.searchParams.get(key)) {
      nextUrl.searchParams.set(key, value);
    }
  }
  return nextUrl.toString();
}

export const ATTRIBUTION_EXPIRATION_DAYS = ATTRIBUTION_MAX_AGE_MS / (24 * 60 * 60 * 1000);
