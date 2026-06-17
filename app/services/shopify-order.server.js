import prisma from "../db.server";
import { getAsaasConfig } from "../config/asaas.server";
import { unauthenticated } from "../shopify.server";

const TEST_PRODUCT_TITLE = "Iron Air Sandbox";
const TEST_VARIANT_TITLE = "127V";
const MAX_SHOPIFY_TAG_LENGTH = 40;
const DEV_SHOPIFY_SHOP = "ironair-dev.myshopify.com";

function assertNoShopifyUserErrors(operation, userErrors) {
  if (userErrors?.length) {
    throw new Error(
      `${operation}: ${userErrors.map((error) => error.message).join("; ")}`,
    );
  }
}

function buildOrderTags(asaasPaymentId) {
  const environmentTag =
    getAsaasConfig().env === "production"
      ? "iron-air-production"
      : "iron-air-sandbox";
  const baseOrderTags = ["asaas", environmentTag];

  if (!asaasPaymentId) {
    return baseOrderTags;
  }

  const asaasTag = `asaas:${asaasPaymentId}`;

  return [
    ...baseOrderTags,
    asaasTag.length > MAX_SHOPIFY_TAG_LENGTH
      ? asaasTag.slice(0, MAX_SHOPIFY_TAG_LENGTH)
      : asaasTag,
  ];
}

function buildOrderNote({ asaasPaymentId, externalReference, invoiceUrl }) {
  const environmentName =
    getAsaasConfig().env === "production" ? "production" : "sandbox";

  return [
    `Iron Air ${environmentName} payment via Asaas.`,
    asaasPaymentId ? `Asaas payment: ${asaasPaymentId}` : null,
    `External reference: ${externalReference}`,
    invoiceUrl ? `Invoice URL: ${invoiceUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function getSourceName() {
  return getAsaasConfig().env === "production"
    ? "asaas_production"
    : "asaas_sandbox";
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

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return {};
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
  };
}

function buildShopifyMailingAddress(asaasCustomer) {
  if (!asaasCustomer) {
    return null;
  }

  const customerName = splitCustomerName(asaasCustomer.name);
  const address = {
    ...customerName,
    address1: [asaasCustomer.address, asaasCustomer.addressNumber]
      .filter(Boolean)
      .join(", "),
    address2: asaasCustomer.complement || undefined,
    city: asaasCustomer.cityName || undefined,
    province: asaasCustomer.state || undefined,
    zip: asaasCustomer.postalCode || undefined,
    country: asaasCustomer.country || "Brasil",
    phone: asaasCustomer.mobilePhone || asaasCustomer.phone || undefined,
    company: asaasCustomer.company || undefined,
  };

  return Object.fromEntries(
    Object.entries(address).filter(([, value]) => Boolean(value)),
  );
}

function buildAsaasCustomerAttributes(asaasCustomerId, asaasCustomer) {
  return [
    asaasCustomerId
      ? { key: "asaas_customer_id", value: asaasCustomerId }
      : null,
    asaasCustomer?.cpfCnpj
      ? { key: "asaas_customer_cpf_cnpj", value: asaasCustomer.cpfCnpj }
      : null,
    asaasCustomer?.phone || asaasCustomer?.mobilePhone
      ? {
          key: "asaas_customer_phone",
          value: asaasCustomer.mobilePhone || asaasCustomer.phone,
        }
      : null,
  ].filter(Boolean);
}

function getConfiguredShop() {
  const configuredShop = process.env.SHOPIFY_SHOP?.trim();
  const shop =
    configuredShop ||
    (process.env.NODE_ENV !== "production" ? DEV_SHOPIFY_SHOP : null);

  if (!shop) {
    throw new Error("SHOPIFY_SHOP nao configurado");
  }

  return shop;
}

async function shopifyGraphql(query, variables = {}) {
  const { admin } = await unauthenticated.admin(getConfiguredShop());
  const response = await admin.graphql(query, { variables });
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

export async function findAsaasShopifyOrderByExternalReference(
  externalReference,
) {
  if (!externalReference) {
    return null;
  }

  return prisma.asaasShopifyOrder.findFirst({
    where: { externalReference },
    orderBy: { createdAt: "desc" },
  });
}

export async function createDraftShopifyOrderForCheckout(
  payload,
  { allowTestFallback = false } = {},
) {
  const cartItems = Array.isArray(payload.items)
    ? payload.items.filter((item) => item?.variantGid || item?.variantId)
    : [];
  const { variant } = cartItems.length
    ? { variant: null }
    : allowTestFallback
      ? await getTestVariant()
      : { variant: null };

  if (!cartItems.length && !variant) {
    throw new Error("Checkout requires at least one real Shopify variant.");
  }

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
        sourceName: getSourceName(),
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

export async function deleteDraftShopifyOrder(draftOrderId) {
  if (!draftOrderId) {
    return null;
  }

  const data = await shopifyGraphql(
    `#graphql
      mutation deleteDraftOrder($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }`,
    {
      input: {
        id: draftOrderId,
      },
    },
  );

  assertNoShopifyUserErrors(
    "draftOrderDelete",
    data.draftOrderDelete.userErrors,
  );

  return data.draftOrderDelete.deletedId;
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
        externalReference ? { externalReference } : undefined,
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

  let createdOrder;

  try {
    createdOrder = await prisma.asaasShopifyOrder.create({
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
  } catch (error) {
    if (error?.code !== "P2002") {
      throw error;
    }

    const existingOrderAfterRace =
      await findAsaasShopifyOrderByExternalReference(externalReference);

    if (!existingOrderAfterRace) {
      throw error;
    }

    return existingOrderAfterRace;
  }

  console.log("[SHOPIFY DRAFT ORDER LINKED]", {
    draftOrder: updatedDraftOrder.name,
    draftOrderId: updatedDraftOrder.id,
    payment: asaasPaymentId,
    externalReference,
  });

  return createdOrder;
}

export async function markDraftOrderAsFailed({
  draftOrder,
  externalReference,
  value,
  reason,
}) {
  if (!draftOrder?.id) {
    return null;
  }

  const existingOrder = await findAsaasShopifyOrderByExternalReference(
    externalReference,
  );

  if (existingOrder) {
    return prisma.asaasShopifyOrder.update({
      where: { id: existingOrder.id },
      data: {
        status: "FAILED",
        failureReason: reason,
      },
    });
  }

  return prisma.asaasShopifyOrder.create({
    data: {
      asaasPaymentId: `failed:${externalReference}`,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      externalReference,
      status: "FAILED",
      failureReason: reason,
      value: Number(value),
    },
  });
}

export async function completeDraftOrderForAsaasPayment(
  asaasPaymentId,
  { asaasCheckoutId, asaasCustomerId, asaasCustomer, externalReference } = {},
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

  const customerAddress = buildShopifyMailingAddress(asaasCustomer);

  if (asaasCustomerId || asaasCustomer?.email || customerAddress) {
    const customerData = await shopifyGraphql(
      `#graphql
        mutation updateDraftOrderCustomer($id: ID!, $input: DraftOrderInput!) {
          draftOrderUpdate(id: $id, input: $input) {
            draftOrder {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        id: mappedOrder.draftOrderId,
        input: {
          ...(asaasCustomer?.email ? { email: asaasCustomer.email } : {}),
          ...(customerAddress
            ? {
                billingAddress: customerAddress,
                shippingAddress: customerAddress,
              }
            : {}),
          customAttributes: [
            ...buildCustomAttributes({
              asaasPaymentId: mappedOrder.asaasPaymentId,
              externalReference: mappedOrder.externalReference,
              invoiceUrl: mappedOrder.invoiceUrl,
            }),
            ...buildAsaasCustomerAttributes(asaasCustomerId, asaasCustomer),
          ],
        },
      },
    );

    assertNoShopifyUserErrors(
      "draftOrderUpdate customer",
      customerData.draftOrderUpdate.userErrors,
    );
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
      sourceName: getSourceName(),
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
      asaasCustomerId: asaasCustomerId || mappedOrder.asaasCustomerId,
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
