import { redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  return redirect(`/checkout-ironair${url.search}`);
}

export default function LegacyPreorderCheckout() {
  return null;
}
