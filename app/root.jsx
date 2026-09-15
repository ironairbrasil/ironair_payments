/* eslint-disable react/prop-types */
import process from "node:process";
import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

export function meta() {
  return [{ title: "Iron Air Brasil" }];
}

export function loader({ request }) {
  const url = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const hostname = (forwardedHost || url.hostname).split(":")[0].toLowerCase();
  const isOffer =
    hostname === "oferta.ironair.com.br" ||
    url.searchParams.get("surface") === "offer";

  return {
    deferAnalytics: isOffer,
    metaPixelId: process.env.PUBLIC_META_PIXEL_ID || "1605257171025393",
    gaMeasurementId: process.env.PUBLIC_GA_MEASUREMENT_ID || "",
    clarityProjectId: isOffer
      ? process.env.PUBLIC_CLARITY_OFFER_ID || "y7hb8leb2g"
      : process.env.PUBLIC_CLARITY_CHECKOUT_ID || "y0bdyld647",
  };
}

// Values come from this module's server loader and are optional environment settings.
function Analytics({
  clarityProjectId,
  metaPixelId,
  gaMeasurementId,
  deferAnalytics,
}) {
  useEffect(() => {
    const loadAnalytics = () => {
      cleanup();

      if (deferAnalytics && !document.querySelector('[data-utmify="loaded"]')) {
        window.pixelId = "6aa1c3454dbf28bfd8efb9a4";
        [
          "https://cdn.utmify.com.br/scripts/pixel/pixel.js",
          "https://cdn.utmify.com.br/scripts/utms/latest.js",
        ].forEach((src) => {
          const script = document.createElement("script");
          script.async = true;
          script.src = src;
          script.dataset.utmify = "loaded";
          if (src.includes("utms/latest.js")) {
            script.setAttribute("data-utmify-prevent-xcod-sck", "");
            script.setAttribute("data-utmify-prevent-subids", "");
          }
          document.head.appendChild(script);
        });
      }

      if (clarityProjectId && !window.clarity) {
        window.clarity = (...args) => {
          window.clarity.q = window.clarity.q || [];
          window.clarity.q.push(args);
        };
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
        document.head.appendChild(script);
      }

      if (metaPixelId && !window.fbq) {
        const fbq = (...args) => {
          fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
        };
        fbq.queue = [];
        fbq.loaded = true;
        fbq.version = "2.0";
        window.fbq = fbq;
        window._fbq = fbq;
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);
        fbq("init", metaPixelId);
        fbq("track", "PageView");
      }

      if (gaMeasurementId && !window.gtag) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = (...args) => window.dataLayer.push(args);
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
        document.head.appendChild(script);
        window.gtag("js", new Date());
        window.gtag("config", gaMeasurementId);
      }
    };

    const interactionEvents = ["pointerdown", "keydown", "touchstart"];
    let fallbackTimer;
    const cleanup = () => {
      interactionEvents.forEach((eventName) =>
        window.removeEventListener(eventName, loadAnalytics),
      );
      window.clearTimeout(fallbackTimer);
    };

    if (deferAnalytics) {
      interactionEvents.forEach((eventName) =>
        window.addEventListener(eventName, loadAnalytics, {
          once: true,
          passive: true,
        }),
      );
      fallbackTimer = window.setTimeout(loadAnalytics, 60000);
    } else {
      loadAnalytics();
    }

    return cleanup;
  }, [clarityProjectId, deferAnalytics, gaMeasurementId, metaPixelId]);

  return null;
}

export default function App() {
  const { metaPixelId, gaMeasurementId, clarityProjectId, deferAnalytics } =
    useLoaderData();
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link
          suppressHydrationWarning
          rel="icon"
          type="image/x-icon"
          href="/favicon.ico?v=2"
        />
        <link
          suppressHydrationWarning
          rel="icon"
          type="image/png"
          href="/iron-air-favicon.png?v=2"
        />
        <link
          suppressHydrationWarning
          rel="apple-touch-icon"
          href="/iron-air-favicon.png?v=2"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Analytics
          clarityProjectId={clarityProjectId}
          gaMeasurementId={gaMeasurementId}
          metaPixelId={metaPixelId}
          deferAnalytics={deferAnalytics}
        />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
