import process from "node:process";
import { useEffect } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

export function meta() {
  return [{ title: "Iron Air Brasil" }];
}

export function loader({ request }) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostname = (forwardedHost || url.hostname).split(":")[0].toLowerCase();
  const isOffer =
    hostname === "oferta.ironair.com.br" || url.searchParams.get("surface") === "offer";

  return {
    metaPixelId:
      process.env.PUBLIC_META_PIXEL_ID || "1605257171025393",
    gaMeasurementId: process.env.PUBLIC_GA_MEASUREMENT_ID || "",
    clarityProjectId: isOffer
      ? process.env.PUBLIC_CLARITY_OFFER_ID || "y7hb8leb2g"
      : process.env.PUBLIC_CLARITY_CHECKOUT_ID || "y0bdyld647",
  };
}

// Values come from this module's server loader and are optional environment settings.
// eslint-disable-next-line react/prop-types
function Analytics({ clarityProjectId, metaPixelId, gaMeasurementId }) {
  useEffect(() => {
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
  }, [clarityProjectId, gaMeasurementId, metaPixelId]);

  return null;
}

export default function App() {
  const { metaPixelId, gaMeasurementId, clarityProjectId } = useLoaderData();
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link suppressHydrationWarning rel="icon" type="image/x-icon" href="/favicon.ico?v=2" />
        <link suppressHydrationWarning rel="icon" type="image/png" href="/iron-air-favicon.png?v=2" />
        <link suppressHydrationWarning rel="apple-touch-icon" href="/iron-air-favicon.png?v=2" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Analytics
          clarityProjectId={clarityProjectId}
          gaMeasurementId={gaMeasurementId}
          metaPixelId={metaPixelId}
        />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
