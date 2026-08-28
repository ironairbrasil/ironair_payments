import OfferLanding, {
  links,
  loader as offerLoader,
} from "./oferta";

const KIT_IRON_AIR_JALECO_SLUG = "kit-ironair+jaleco";

export { links };

export async function loader(args) {
  if (args.params.slug !== KIT_IRON_AIR_JALECO_SLUG) {
    throw new Response("Página não encontrada", { status: 404 });
  }

  return offerLoader(args);
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
