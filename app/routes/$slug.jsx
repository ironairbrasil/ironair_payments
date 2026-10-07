import process from "node:process";

import {
  getIronAirPublicProduct,
  getShopifyPublicProduct,
} from "../services/ironair-product.server";
import OfferLanding, { links } from "./oferta";

const IRON_AIR_SLUG = "ironair";
const KIT_IRON_AIR_JALECO_SLUG = "kit-ironair+jaleco";
const KIT_IRON_AIR_JALECO_HANDLE = "kit-jaleco-iron-air";
const CUSTOMER_WEEK_SLUG = "semana-do-cliente";

export { links };

export async function loader(args) {
  if (
    args.params.slug !== IRON_AIR_SLUG &&
    args.params.slug !== KIT_IRON_AIR_JALECO_SLUG &&
    args.params.slug !== CUSTOMER_WEEK_SLUG
  ) {
    throw new Response("Página não encontrada", { status: 404 });
  }

  const isKitOffer = args.params.slug === KIT_IRON_AIR_JALECO_SLUG;
  const isIronAirOffer = args.params.slug === IRON_AIR_SLUG;

  return {
    product: await (isKitOffer
      ? getShopifyPublicProduct(KIT_IRON_AIR_JALECO_HANDLE)
      : getIronAirPublicProduct()),
    payOrigin: process.env.PAYMENTS_PUBLIC_URL || "https://pay.ironair.com.br",
    campaign:
      isKitOffer || isIronAirOffer ? undefined : "customer-week",
    leadWithPurchase: isIronAirOffer,
  };
}

export function meta({ data }) {
  if (data?.leadWithPurchase) {
    return [
      { title: "Iron Air Brasil" },
      {
        name: "description",
        content: "Escolha seu Iron Air e finalize sua compra com segurança.",
      },
      { property: "og:title", content: "Iron Air Brasil" },
      { property: "og:type", content: "product" },
    ];
  }

  if (data?.campaign === "customer-week") {
    return [
      { title: "Iron Air | Semana do Cliente" },
      {
        name: "description",
        content: "Oferta especial Semana do Cliente Iron Air.",
      },
      { property: "og:title", content: "Iron Air | Semana do Cliente" },
      { property: "og:type", content: "product" },
    ];
  }

  return [
    { title: "Kit Iron Air + Jaleco" },
    {
      name: "description",
      content:
        "Conheça o Kit Iron Air + Jaleco e cuide das suas roupas com mais praticidade.",
    },
    { property: "og:title", content: "Kit Iron Air + Jaleco" },
    { property: "og:type", content: "product" },
  ];
}

export default function KitIronAirJaleco() {
  return <OfferLanding />;
}
