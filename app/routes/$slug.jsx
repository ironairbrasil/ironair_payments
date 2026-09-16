import process from "node:process";

import {
  getIronAirPublicProduct,
  getShopifyPublicProduct,
} from "../services/ironair-product.server";
import OfferLanding, { links } from "./oferta";

const KIT_IRON_AIR_JALECO_SLUG = "kit-ironair+jaleco";
const KIT_IRON_AIR_JALECO_HANDLE = "kit-jaleco-iron-air";
const CUSTOMER_WEEK_SLUG = "semana-do-cliente";

export { links };

export async function loader(args) {
  if (
    args.params.slug !== KIT_IRON_AIR_JALECO_SLUG &&
    args.params.slug !== CUSTOMER_WEEK_SLUG
  ) {
    throw new Response("Página não encontrada", { status: 404 });
  }

  const isKitOffer = args.params.slug === KIT_IRON_AIR_JALECO_SLUG;

  return {
    product: await (isKitOffer
      ? getShopifyPublicProduct(KIT_IRON_AIR_JALECO_HANDLE)
      : getIronAirPublicProduct()),
    payOrigin: process.env.PAYMENTS_PUBLIC_URL || "https://pay.ironair.com.br",
    campaign: isKitOffer ? undefined : "customer-week",
  };
}

export function meta({ data }) {
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
