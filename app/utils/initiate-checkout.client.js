const EVENT_PARAM = "meta_event_id";
const BROWSER_SENT_PARAM = "meta_browser_sent";

export function createInitiateCheckoutEventId() {
  const random = window.crypto?.randomUUID?.().replaceAll("-", "") ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `ironair_ic_${random}`;
}

export function addInitiateCheckoutEventToUrl(url, eventId) {
  const nextUrl = new URL(url, window.location.href);
  nextUrl.searchParams.set(EVENT_PARAM, eventId);
  nextUrl.searchParams.set(BROWSER_SENT_PARAM, "1");
  return nextUrl.toString();
}

export function readInitiateCheckoutEvent(search = window.location.search) {
  const params = new URLSearchParams(search);
  const candidate = params.get(EVENT_PARAM) || "";
  const eventId = /^ironair_ic_[A-Za-z0-9_-]{8,100}$/.test(candidate)
    ? candidate
    : createInitiateCheckoutEventId();

  if (!candidate) {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set(EVENT_PARAM, eventId);
    window.history.replaceState(window.history.state, "", currentUrl);
  }

  return {
    eventId,
    browserSent: params.get(BROWSER_SENT_PARAM) === "1" && Boolean(candidate),
  };
}

export function trackInitiateCheckoutBrowser({ eventId, value, contentIds }) {
  const storageKey = `ironair:initiate-checkout:browser:${eventId}`;
  if (window.sessionStorage.getItem(storageKey)) return;

  const send = () => {
    if (!window.fbq) return false;
    window.fbq(
      "track",
      "InitiateCheckout",
      { content_ids: contentIds, content_type: "product", value, currency: "BRL" },
      { eventID: eventId },
    );
    window.sessionStorage.setItem(storageKey, "1");
    return true;
  };
  if (send()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (send() || attempts >= 20) window.clearInterval(timer);
  }, 250);
}

export function trackInitiateCheckoutServer({ eventId, value, contentIds, attribution }) {
  const storageKey = `ironair:initiate-checkout:capi:${eventId}`;
  if (window.sessionStorage.getItem(storageKey)) return;
  window.sessionStorage.setItem(storageKey, "pending");

  fetch("/api/meta/initiate-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventId,
      value,
      contentIds,
      sourceUrl: window.location.href,
      fbp: attribution?._fbp,
      fbc: attribution?._fbc,
    }),
  }).then((response) => {
    if (!response.ok) window.sessionStorage.removeItem(storageKey);
    else window.sessionStorage.setItem(storageKey, "sent");
  }).catch(() => window.sessionStorage.removeItem(storageKey));
}

export function trackAddPaymentInfo({
  value,
  contentIds,
  paymentMethod,
  externalReference,
  customer,
  shippingAddress,
  attribution,
}) {
  const random = window.crypto?.randomUUID?.().replaceAll("-", "") ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const eventId = `ironair_api_${random}`;
  const storageKey = `ironair:add-payment-info:${externalReference}`;
  if (window.sessionStorage.getItem(storageKey)) return;
  window.sessionStorage.setItem(storageKey, eventId);

  window.fbq?.(
    "track",
    "AddPaymentInfo",
    {
      content_ids: contentIds,
      content_type: "product",
      value,
      currency: "BRL",
      payment_type: paymentMethod,
    },
    { eventID: eventId },
  );
  window.gtag?.("event", "add_payment_info", {
    currency: "BRL",
    value,
    payment_type: paymentMethod,
  });

  fetch("/api/meta/add-payment-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventId,
      value,
      contentIds,
      paymentMethod,
      externalReference,
      customer,
      shippingAddress,
      sourceUrl: window.location.href,
      fbp: attribution?._fbp,
      fbc: attribution?._fbc,
    }),
  }).then((response) => {
    if (!response.ok) window.sessionStorage.removeItem(storageKey);
  }).catch(() => window.sessionStorage.removeItem(storageKey));
}
