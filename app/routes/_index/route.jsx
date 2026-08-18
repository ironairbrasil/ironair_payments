import { redirect, Form, useLoaderData } from "react-router";

import IronAirCheckout, { loader as checkoutLoader, links as checkoutLinks } from "../checkout-ironair";
import OfferLanding, { loader as offerLoader, links as offerLinks } from "../oferta";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

const PAY_HOSTS = new Set(["pay.ironair.com.br"]);
const OFFER_HOSTS = new Set(["oferta.ironair.com.br"]);

function requestHostname(request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || new URL(request.url).hostname).split(":")[0].toLowerCase();
}

export function links() {
  return [...checkoutLinks(), ...offerLinks()];
}

export function meta({ data }) {
  if (data?.surface === "offer") {
    return [
      { title: "Iron Air | Suas roupas falam antes de você" },
      { name: "description", content: "Conheça o Iron Air e cuide das suas roupas com mais praticidade no dia a dia." },
    ];
  }

  return [{ title: data?.surface === "pay" ? "Checkout | Iron Air Brasil" : "Iron Air Payments" }];
}

export const loader = async (args) => {
  const url = new URL(args.request.url);
  const hostname = requestHostname(args.request);

  if (OFFER_HOSTS.has(hostname) || url.searchParams.get("surface") === "offer") {
    return { surface: "offer", ...(await offerLoader(args)) };
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
  if (data.surface === "pay") return <IronAirCheckout />;

  return <div className={styles.index}><div className={styles.content}><h1 className={styles.heading}>Iron Air Payments</h1><p className={styles.text}>Área técnica do aplicativo Shopify.</p>{data.showForm && <Form className={styles.form} method="post" action="/auth/login"><label className={styles.label}><span>Shop domain</span><input className={styles.input} type="text" name="shop" /></label><button className={styles.button} type="submit">Log in</button></Form>}</div></div>;
}
