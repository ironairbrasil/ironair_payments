const DEFAULT_STORE_ORIGIN = "https://ironair.com.br";
const DEFAULT_PRODUCT_HANDLE = "iron-air";

function storeOrigin() {
  return (process.env.IRON_AIR_STORE_ORIGIN || DEFAULT_STORE_ORIGIN).replace(
    /\/+$/,
    "",
  );
}

export async function getIronAirPublicProduct() {
  const handle = process.env.IRON_AIR_PRODUCT_HANDLE || DEFAULT_PRODUCT_HANDLE;
  const response = await fetch(
    `${storeOrigin()}/products/${encodeURIComponent(handle)}.js`,
    {
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar o Iron Air da Shopify (${response.status}).`,
    );
  }

  const product = await response.json();
  const fullDescriptionHtml = product.description || "";
  const specificationsHeading =
    /<h[1-6][^>]*>\s*Especificações\s+Técnicas\s*<\/h[1-6]>/i;
  const specificationsMatch = specificationsHeading.exec(fullDescriptionHtml);
  const descriptionHtml = specificationsMatch
    ? fullDescriptionHtml.slice(0, specificationsMatch.index).trim()
    : fullDescriptionHtml;
  const specificationsHtml = specificationsMatch
    ? fullDescriptionHtml
        .slice(specificationsMatch.index + specificationsMatch[0].length)
        .trim()
    : "";

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    descriptionHtml,
    specificationsHtml,
    featuredImage: product.featured_image?.startsWith("//")
      ? `https:${product.featured_image}`
      : product.featured_image || "",
    images: (product.images || []).map((image) =>
      image.startsWith("//") ? `https:${image}` : image,
    ),
    variants: (product.variants || []).map((variant) => ({
      id: `gid://shopify/ProductVariant/${variant.id}`,
      numericId: String(variant.id),
      title: variant.public_title || variant.title,
      price: Number(variant.price || 0) / 100,
      compareAtPrice: variant.compare_at_price
        ? Number(variant.compare_at_price) / 100
        : null,
      available: Boolean(variant.available),
      inventoryManagement: variant.inventory_management || null,
    })),
  };
}

export function publicProductToCheckoutItem(product, variant) {
  return {
    variantId: variant.id,
    productId: String(product.id),
    title: product.title,
    variantTitle: variant.title,
    quantity: 1,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    image: product.featuredImage,
  };
}
