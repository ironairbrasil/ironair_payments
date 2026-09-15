import { data, redirect, Form, useLoaderData } from "react-router";

import IronAirCheckout, {
  loader as checkoutLoader,
  links as checkoutLinks,
} from "../checkout-ironair";
import OfferLanding, {
  loader as offerLoader,
  links as offerLinks,
  meta as metaOffer,
} from "../oferta";
import { login } from "../../shopify.server";

const PAY_HOSTS = new Set(["pay.ironair.com.br"]);
const OFFER_HOSTS = new Set(["oferta.ironair.com.br"]);

function requestHostname(request) {
  const forwarded = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  return (forwarded || new URL(request.url).hostname)
    .split(":")[0]
    .toLowerCase();
}

export function links() {
  return offerLinks();
}

export function meta({ data }) {
  if (data?.surface === "offer") {
    return metaOffer();
  }

  return [
    {
      title:
        data?.surface === "pay"
          ? "Checkout | Iron Air Brasil"
          : "Iron Air Payments",
    },
  ];
}

export function headers({ loaderHeaders }) {
  return loaderHeaders;
}

export const loader = async (args) => {
  const url = new URL(args.request.url);
  const hostname = requestHostname(args.request);

  if (
    OFFER_HOSTS.has(hostname) ||
    url.searchParams.get("surface") === "offer"
  ) {
    return data(
      { surface: "offer", ...(await offerLoader(args)) },
      {
        headers: {
          "Cache-Control": "public, max-age=0, must-revalidate",
          "CDN-Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300",
          "Vercel-CDN-Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  }

  if (PAY_HOSTS.has(hostname) || url.searchParams.get("surface") === "pay") {
    return { surface: "pay", ...(await checkoutLoader(args)) };
  }

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { surface: "app", showForm: Boolean(login) };
};

export default function Index() {
  const data = useLoaderData();

  if (data.surface === "offer") return <OfferLanding data={data} />;
  if (data.surface === "pay") {
    return (
      <>
        {checkoutLinks().map((link) => (
          <link key={link.href} {...link} />
        ))}
        <IronAirCheckout />
      </>
    );
  }

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "1rem",
        textAlign: "center",
      }}
    >
      <div style={{ display: "grid", gap: "2rem" }}>
        <h1 style={{ margin: 0 }}>Iron Air Payments</h1>
        <p style={{ margin: 0, fontSize: "1.2rem", paddingBottom: "2rem" }}>
          Área técnica do aplicativo Shopify.
        </p>
        {data.showForm && (
          <Form
            method="post"
            action="/auth/login"
            style={{ display: "flex", gap: "1rem", margin: "0 auto" }}
          >
            <label style={{ display: "grid", gap: ".2rem", textAlign: "left" }}>
              <span>Shop domain</span>
              <input style={{ padding: ".4rem" }} type="text" name="shop" />
            </label>
            <button style={{ padding: ".4rem" }} type="submit">
              Log in
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
