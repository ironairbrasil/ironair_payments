import process from "node:process";

import { getShopifyPublicProduct } from "../services/ironair-product.server";
import OfferLanding, { links } from "./oferta";

const KIT_IRON_AIR_JALECO_SLUG = "kit-ironair+jaleco";
const KIT_IRON_AIR_JALECO_HANDLE = "kit-jaleco-iron-air";

export { links };

export async function loader(args) {
  if (args.params.slug !== KIT_IRON_AIR_JALECO_SLUG) {
    throw new Response("Página não encontrada", { status: 404 });
  }

  return {
    product: await getShopifyPublicProduct(KIT_IRON_AIR_JALECO_HANDLE),
    payOrigin: process.env.PAYMENTS_PUBLIC_URL || "https://pay.ironair.com.br",
  };
}

export function meta() {
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
  return <OfferLanding hideLaunchHero />;
}
