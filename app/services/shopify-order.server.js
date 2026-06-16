import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2026-07";
const TEST_PRODUCT_TITLE = "Iron Air Sandbox";
const TEST_VARIANT_TITLE = "127V";
const BASE_ORDER_TAGS = ["asaas", "iron-air-sandbox"];
const MAX_SHOPIFY_TAG_LENGTH = 40;

function assertNoShopifyUserErrors(operation, userErrors) {
  if (userErrors?.length) {
    throw new Error(
      `${operation}: ${userErrors.map((error) => error.message).join("; ")}`,
    );
  }
}

function buildOrderTags(asaasPaymentId) {
  if (!asaasPaymentId) {
    return BASE_ORDER_TAGS;
  }

  const asaasTag = `asaas:${asaasPaymentId}`;

  return [
    ...BASE_ORDER_TAGS,
    asaasTag.length > MAX_SHOPIFY_TAG_LENGTH
      ? asaasTag.slice(0, MAX_SHOPIFY_TAG_LENGTH)
      : asaasTag,
  ];
}

function buildOrderNote({ asaasPaymentId, externalReference, invoiceUrl }) {
  return [
    "Iron Air Sandbox payment via Asaas.",
    asaasPaymentId ? `Asaas payment: ${asaasPaymentId}` : null,
    `External reference: ${externalReference}`,
    invoiceUrl ? `Invoice URL: ${invoiceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCustomAttributes({
  asaasPaymentId,
  externalReference,
  invoiceUrl,
}) {
  return [
    asaasPaymentId
      ? { key: "asaas_payment_id", value: asaasPaymentId }
      : null,
    invoiceUrl ? { key: "asaas_invoice_url", value: invoiceUrl } : null,
    { key: "externalReference", value: externalReference },
  ].filter(Boolean);
}

async function getOfflineSession() {
  const shop = process.env.SHOPIFY_SHOP || "iron-air-brasil-ltda.myshopify.com";
  const session = await prisma.session.findFirst({
    where: {
      shop,
      isOnline: false,
    },
  });

  if (!session?.accessToken) {
    throw new Error(`No offline Shopify session found for ${shop}.`);
  }

  return session;
}

async function shopifyGraphql(query, variables = {}) {
  const session = await getOfflineSession();
  const response = await fetch(
    `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const data = await response.json();

  if (!response.ok || data.errors) {
    throw new Error(JSON.stringify(data.errors ?? data));
  }

  return data.data;
}

async function getTestVariant() {
  const data = await shopifyGraphql(
    `#graphql
      query getTestProduct($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                  }
                }
              }
            }
          }
        }
      }`,
    { query: `title:'${TEST_PRODUCT_TITLE}'` },
  );

  const product = data.products.edges[0]?.node;
  const variant = product?.variants.edges
    .map((edge) => edge.node)
    .find((node) => node.title === TEST_VARIANT_TITLE);

  if (!product || !variant) {
    throw new Error(
      `Shopify test product/variant not found: ${TEST_PRODUCT_TITLE} / ${TEST_VARIANT_TITLE}.`,
    );
  }

  return { product, variant };
}

export async function createDraftShopifyOrderForCheckout(payload) {
  const cartItems = Array.isArray(payload.items)
    ? payload.items.filter((item) => item?.variantGid || item?.variantId)
    : [];
  const { variant } = cartItems.length ? { variant: null } : await getTestVariant();
  const amount = Number(payload.value).toFixed(2);
  const lineItems = cartItems.length
    ? cartItems.map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const variantId =
          item.variantGid ||
          `gid://shopify/ProductVariant/${String(item.variantId).replace(/\D/g, "")}`;
        const unitAmount = Number(item.price || item.linePrice / quantity || 0);

        return {
          variantId,
          quantity,
          ...(Number.isFinite(unitAmount) && unitAmount > 0
            ? {
                originalUnitPriceWithCurrency: {
                  amount: unitAmount.toFixed(2),
                  currencyCode: "BRL",
                },
              }
            : {}),
          customAttributes: [
            {
              key: "externalReference",
              value: payload.externalReference,
            },
            item.sku
              ? {
                  key: "sku",
                  value: String(item.sku),
                }
              : null,
          ].filter(Boolean),
        };
      })
    : [
        {
          variantId: variant.id,
          quantity: 1,
          sku: variant.sku,
          originalUnitPriceWithCurrency: {
            amount,
            currencyCode: "BRL",
          },
          customAttributes: [
            {
              key: "externalReference",
              value: payload.externalReference,
            },
          ],
        },
      ];

  const data = await shopifyGraphql(
    `#graphql
      mutation createDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            status
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      input: {
        email: payload.email,
        presentmentCurrencyCode: "BRL",
        sourceName: "asaas_sandbox",
        taxExempt: true,
        visibleToCustomer: false,
        tags: buildOrderTags(),
        note: buildOrderNote({
          externalReference: payload.externalReference,
        }),
        customAttributes: buildCustomAttributes({
          externalReference: payload.externalReference,
        }),
        lineItems,
      },
    },
  );

  assertNoShopifyUserErrors(
    "draftOrderCreate",
    data.draftOrderCreate.userErrors,
  );

  const draftOrder = data.draftOrderCreate.draftOrder;

  console.log("[SHOPIFY DRAFT ORDER CREATED]", {
    draftOrder: draftOrder.name,
    draftOrderId: draftOrder.id,
    externalReference: payload.externalReference,
  });

  return draftOrder;
}

export async function attachAsaasPaymentToDraftOrder({
  draftOrder,
  asaasPaymentId,
  asaasCheckoutId,
  asaasCustomerId,
  value,
  externalReference,
  invoiceUrl,
  checkoutUrl,
}) {
  const existingOrder = await prisma.asaasShopifyOrder.findFirst({
    where: {
      OR: [
        { asaasPaymentId },
        asaasCheckoutId ? { asaasCheckoutId } : undefined,
      ].filter(Boolean),
    },
  });

  if (existingOrder) {
    return existingOrder;
  }

  const data = await shopifyGraphql(
    `#graphql
      mutation updateDraftOrder($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            id
            name
            status
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      id: draftOrder.id,
      input: {
        tags: buildOrderTags(asaasPaymentId),
        note: buildOrderNote({
          asaasPaymentId,
          externalReference,
          invoiceUrl,
        }),
        customAttributes: buildCustomAttributes({
          asaasPaymentId,
          externalReference,
          invoiceUrl,
        }),
      },
    },
  );

  assertNoShopifyUserErrors(
    "draftOrderUpdate",
    data.draftOrderUpdate.userErrors,
  );

  const updatedDraftOrder = data.draftOrderUpdate.draftOrder;

  const createdOrder = await prisma.asaasShopifyOrder.create({
    data: {
      asaasPaymentId,
      asaasCheckoutId,
      asaasCustomerId,
      draftOrderId: updatedDraftOrder.id,
      draftOrderName: updatedDraftOrder.name,
      externalReference,
      status: "PENDING",
      invoiceUrl,
      asaasCheckoutUrl: checkoutUrl,
      value: Number(value),
    },
  });

  console.log("[SHOPIFY DRAFT ORDER LINKED]", {
    draftOrder: updatedDraftOrder.name,
    draftOrderId: updatedDraftOrder.id,
    payment: asaasPaymentId,
    externalReference,
  });

  return createdOrder;
}

export async function completeDraftOrderForAsaasPayment(
  asaasPaymentId,
  { asaasCheckoutId, externalReference } = {},
) {
  const mappedOrder = await prisma.asaasShopifyOrder.findFirst({
    where: {
      OR: [
        asaasPaymentId ? { asaasPaymentId } : undefined,
        asaasCheckoutId ? { asaasCheckoutId } : undefined,
        externalReference ? { externalReference } : undefined,
      ].filter(Boolean),
    },
  });

  if (!mappedOrder) {
    console.warn("[SHOPIFY DRAFT ORDER MISSING]", {
      payment: asaasPaymentId,
      checkout: asaasCheckoutId,
      externalReference,
    });

    return null;
  }

  if (mappedOrder.status === "PAID") {
    return mappedOrder;
  }

  if (!mappedOrder.draftOrderId) {
    console.warn("[SHOPIFY DRAFT ORDER MISSING]", {
      payment: asaasPaymentId,
      order: mappedOrder.shopifyOrderName,
    });

    return mappedOrder;
  }

  const data = await shopifyGraphql(
    `#graphql
      mutation completeDraftOrder($id: ID!, $sourceName: String) {
        draftOrderComplete(id: $id, sourceName: $sourceName) {
          draftOrder {
            id
            name
            status
            order {
              id
              name
              displayFinancialStatus
              fullyPaid
              tags
              note
              customAttributes {
                key
                value
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      id: mappedOrder.draftOrderId,
      sourceName: "asaas_sandbox",
    },
  );

  assertNoShopifyUserErrors(
    "draftOrderComplete",
    data.draftOrderComplete.userErrors,
  );

  const draftOrder = data.draftOrderComplete.draftOrder;
  const order = draftOrder.order;

  if (!order) {
    throw new Error(`Draft order ${mappedOrder.draftOrderId} did not return an order.`);
  }

  const updatedOrder = await prisma.asaasShopifyOrder.update({
    where: { id: mappedOrder.id },
    data: {
      status: "PAID",
      shopifyOrderId: order.id,
      shopifyOrderName: order.name,
      paidAt: new Date(),
    },
  });

  console.log("[SHOPIFY ORDER CREATED]", {
    draftOrder: draftOrder.name,
    order: order.name,
    orderId: order.id,
    payment: asaasPaymentId,
  });

  return updatedOrder;
}
