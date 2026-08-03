import IronAirCheckout, {
  links,
  loader as checkoutLoader,
} from "./checkout-ironair";

export { links };

export async function loader(args) {
  const data = await checkoutLoader(args);

  return {
    ...data,
    checkoutMode: "preorder",
    externalReference:
      data.externalReference ||
      `preorder_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  };
}

export default function PreorderCheckout() {
  return <IronAirCheckout />;
}
