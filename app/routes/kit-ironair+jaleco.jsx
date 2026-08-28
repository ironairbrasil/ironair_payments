import OfferLanding, { links, loader } from "./oferta";

export { links, loader };

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
