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

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== null && value !== ""),
  );
}

function maskValue(value) {
  const text = String(value || "");

  if (text.includes("@")) {
    const [user, domain] = text.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }

  return text.length > 4 ? `${text.slice(0, 3)}***${text.slice(-2)}` : "***";
}

function sanitizePayloadForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (
    typeof value.key === "string" &&
    ["email", "cpfCnpj", "customer_phone", "asaas_customer_phone"].includes(
      value.key,
    ) &&
    value.value
  ) {
    return {
      ...value,
      value: maskValue(value.value),
    };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["email", "cpfCnpj", "phone", "mobilePhone", "customer_phone"].includes(
        key,
      )
        ? maskValue(item)
        : sanitizePayloadForLog(item),
    ]),
  );
}

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1),
  };
}

function buildShopifyAddress(address = {}, customer = {}) {
  const { firstName, lastName } = splitCustomerName(
    address.name || customer.name,
  );
  const address1 = [address.address, address.addressNumber || address.number]
    .filter(Boolean)
    .join(", ");
  const address2 = [address.complement, address.province]
    .filter(Boolean)
    .join(" - ");

  return compactObject({
    firstName,
    lastName,
    address1,
    address2,
    city: address.cityName || address.city,
    provinceCode: address.state,
    zip: address.postalCode,
    countryCode: address.country || "BR",
    phone: address.phone || customer.mobilePhone || customer.phone,
  });
}

function buildCheckoutShopifyAddress(address = {}, customer = {}) {
  const { firstName, lastName } = splitCustomerName(customer.name);
  const address1 = [address.address1, address.number].filter(Boolean).join(", ");
  const address2 = [address.complement, address.neighborhood]
    .filter(Boolean)
    .join(" - ");

  return compactObject({
    firstName,
    lastName,
    address1,
    address2,
    city: address.city,
    provinceCode: address.provinceCode,
    zip: address.postalCode,
    countryCode: address.countryCode || "BR",
    phone: address.phone || customer.phone,
  });
}

function hasAsaasAddress(asaasCustomer = {}) {
  return Boolean(
    asaasCustomer.address &&
      asaasCustomer.addressNumber &&
      asaasCustomer.postalCode &&
      (asaasCustomer.cityName || asaasCustomer.city) &&
      asaasCustomer.state,
  );
}

function buildCustomAttributes({
  asaasPaymentId,
  asaasCheckoutId,
  externalReference,
  invoiceUrl,
  customer,
  shippingAddress,
  source,
  paidAt,
  paymentStatus,
}) {
  return [
    asaasPaymentId
      ? { key: "asaas_payment_id", value: asaasPaymentId }
      : null,
    asaasCheckoutId
      ? { key: "asaas_checkout_id", value: asaasCheckoutId }
      : null,
    invoiceUrl ? { key: "asaas_invoice_url", value: invoiceUrl } : null,
    { key: "externalReference", value: externalReference },
    source ? { key: "source", value: source } : null,
    customer?.cpfCnpj ? { key: "cpfCnpj", value: customer.cpfCnpj } : null,
    customer?.name ? { key: "customer_name", value: customer.name } : null,
    customer?.email ? { key: "customer_email", value: customer.email } : null,
    customer?.phone || customer?.mobilePhone
      ? {
          key: "customer_phone",
          value: customer.mobilePhone || customer.phone,
        }
      : null,
    shippingAddress?.postalCode
      ? { key: "shipping_postal_code", value: shippingAddress.postalCode }
      : null,
    shippingAddress?.number
      ? { key: "shipping_number", value: shippingAddress.number }
      : null,
    shippingAddress?.neighborhood
      ? {
          key: "shipping_neighborhood",
          value: shippingAddress.neighborhood,
        }
      : null,
    paidAt ? { key: "paidAt", value: paidAt } : null,
    paymentStatus ? { key: "paymentStatus", value: paymentStatus } : null,
  ].filter(Boolean);
}

function buildAsaasCustomerAttributes(asaasCustomerId, asaasCustomer) {
  return [
    asaasCustomerId
      ? { key: "asaas_customer_id", value: asaasCustomerId }
      : null,
    asaasCustomer?.name
      ? { key: "asaas_customer_name", value: asaasCustomer.name }
      : null,
    asaasCustomer?.email
      ? { key: "asaas_customer_email", value: asaasCustomer.email }
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

function normalizeVariantGid(variantId) {
  const text = String(variantId || "");

  if (text.startsWith("gid://shopify/ProductVariant/")) {
    return text;
  }

  return `gid://shopify/ProductVariant/${text.replace(/\D/g, "")}`;
}

export async function getVerifiedShopifyCheckoutItems(items) {
  const requestedItems = Array.isArray(items) ? items : [];
  const variantIds = requestedItems.map((item) => normalizeVariantGid(item.variantId));

  if (!variantIds.length) {
    throw new Error("Checkout requires at least one item.");
  }

  const data = await shopifyGraphql(
    `#graphql
      query getCheckoutVariants($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            price
            compareAtPrice
            sku
            product {
              id
              title
              featuredImage {
                url
                altText
              }
            }
            image {
              url
              altText
            }
          }
        }
      }`,
    { ids: variantIds },
  );

  return data.nodes.map((node, index) => {
    const requestedItem = requestedItems[index];

    if (!node?.id) {
      throw new Error(`Shopify variant not found: ${requestedItem.variantId}.`);
    }

    const quantity = Math.max(1, Number(requestedItem.quantity) || 1);
    const price = Number(node.price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid Shopify variant price: ${node.id}.`);
    }

    return {
      variantId: node.id,
      quantity,
      title:
        requestedItem.title ||
        node.product?.title ||
        node.title ||
        "Iron Air",
      price,
      compareAtPrice: node.compareAtPrice ? Number(node.compareAtPrice) : null,
      image: node.image?.url || node.product?.featuredImage?.url || requestedItem.image || "",
      sku: node.sku || requestedItem.sku || "",
      productId: node.product?.id || requestedItem.productId || "",
    };
  });
}

export async function createDraftShopifyOrderForIronAirCheckout(payload) {
  const verifiedItems = await getVerifiedShopifyCheckoutItems(payload.items);
  const externalReference = payload.externalReference;
  const shippingAddress = buildCheckoutShopifyAddress(
    payload.shippingAddress,
    payload.customer,
  );
  const billingAddress = buildCheckoutShopifyAddress(
    payload.billingAddress || payload.shippingAddress,
    payload.customer,
  );
  const lineItems = verifiedItems.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
    customAttributes: [
      { key: "externalReference", value: externalReference },
      item.sku ? { key: "sku", value: item.sku } : null,
    ].filter(Boolean),
  }));
  const customAttributes = buildCustomAttributes({
    externalReference,
    customer: payload.customer,
    shippingAddress: payload.shippingAddress,
    source: "ironair_custom_checkout",
  });
  const input = {
    email: payload.customer.email,
    shippingAddress,
    billingAddress,
    presentmentCurrencyCode: "BRL",
    sourceName: getSourceName(),
    taxExempt: true,
    visibleToCustomer: false,
    tags: buildOrderTags(),
    note: buildOrderNote({ externalReference }),
    customAttributes,
    lineItems,
  };

  console.log("[SHOPIFY CUSTOM CHECKOUT DRAFT PAYLOAD]", {
    input: sanitizePayloadForLog(input),
  });

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
    { input },
  );

  assertNoShopifyUserErrors(
    "draftOrderCreate custom checkout",
    data.draftOrderCreate.userErrors,
  );

  return {
    draftOrder: data.draftOrderCreate.draftOrder,
    items: verifiedItems,
    value: verifiedItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  };
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
          customer: payload.customer,
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
  customer,
  shippingAddress,
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
          asaasCheckoutId,
          externalReference,
          invoiceUrl,
          customer,
          shippingAddress,
          source: customer ? "ironair_custom_checkout" : undefined,
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
    checkout: asaasCheckoutId,
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
  {
    asaasCheckoutId,
    asaasCustomerId,
    asaasCustomer,
    asaasPayment,
    externalReference,
  } = {},
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

  const effectiveCustomer = asaasCustomer || {};
  const checkoutId = asaasCheckoutId || mappedOrder.asaasCheckoutId;
  const paymentId = asaasPaymentId || mappedOrder.asaasPaymentId;
  const hasCustomerAddress = hasAsaasAddress(effectiveCustomer);

  console.log("[asaas] Payment data selected for Shopify.", {
    response: sanitizePayloadForLog(asaasPayment),
  });
  console.log("[asaas] Customer data selected for Shopify.", {
    response: sanitizePayloadForLog(effectiveCustomer),
  });

  console.log("[SHOPIFY DRAFT ORDER MAPPING CONTEXT]", {
    id: mappedOrder.id,
    draftOrderId: mappedOrder.draftOrderId,
    externalReference: mappedOrder.externalReference,
    checkoutId,
    paymentId,
    customer: sanitizePayloadForLog(effectiveCustomer),
  });

  if (
    asaasCustomerId ||
    asaasCustomer?.email ||
    effectiveCustomer.email ||
    hasCustomerAddress ||
    effectiveCustomer.cpfCnpj ||
    effectiveCustomer.mobilePhone ||
    effectiveCustomer.phone ||
    paymentId ||
    checkoutId ||
    mappedOrder.externalReference
  ) {
    try {
      const shopifyUpdatePayload = {
        ...(effectiveCustomer.email ? { email: effectiveCustomer.email } : {}),
        ...(hasCustomerAddress
          ? {
              shippingAddress: buildShopifyAddress(
                effectiveCustomer,
                effectiveCustomer,
              ),
              billingAddress: buildShopifyAddress(
                effectiveCustomer,
                effectiveCustomer,
              ),
            }
          : {}),
        customAttributes: [
          ...buildCustomAttributes({
            asaasPaymentId: paymentId,
            asaasCheckoutId: checkoutId,
            externalReference: mappedOrder.externalReference,
            invoiceUrl: mappedOrder.invoiceUrl,
            customer: effectiveCustomer,
            paidAt: new Date().toISOString(),
            paymentStatus: "PAID",
          }),
          ...buildAsaasCustomerAttributes(asaasCustomerId, asaasCustomer),
        ],
      };

      console.log("[SHOPIFY DRAFT ORDER UPDATE PAYLOAD]", {
        draftOrderId: mappedOrder.draftOrderId,
        input: sanitizePayloadForLog(shopifyUpdatePayload),
      });

      const customerData = await shopifyGraphql(
        `#graphql
          mutation updateDraftOrderCustomer($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
              draftOrder {
                id
                name
                email
                customAttributes {
                  key
                  value
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
          input: shopifyUpdatePayload,
        },
      );

      assertNoShopifyUserErrors(
        "draftOrderUpdate customer",
        customerData.draftOrderUpdate.userErrors,
      );
    } catch (error) {
      console.warn("[SHOPIFY DRAFT CUSTOMER UPDATE FAILED]", {
        draftOrder: mappedOrder.draftOrderName,
        draftOrderId: mappedOrder.draftOrderId,
        customer: asaasCustomerId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
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
      asaasPaymentId: paymentId,
      asaasCheckoutId: checkoutId,
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
