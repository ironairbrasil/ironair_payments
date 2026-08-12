import prisma from "../db.server";
import { getAsaasConfig } from "../config/asaas.server";
import { unauthenticated } from "../shopify.server";
import { FREE_SHIPPING_TITLE } from "./free-shipping.server";

const TEST_PRODUCT_TITLE = "Iron Air Sandbox";
const TEST_VARIANT_TITLE = "127V";
const MAX_SHOPIFY_TAG_LENGTH = 40;
const DEV_SHOPIFY_SHOP = "ironair-dev.myshopify.com";
const PIX_DISCOUNT_TYPE = "PIX";
const PREORDER_TYPE = "preorder";

function isPreorderShippingOption(shippingOption) {
  return String(shippingOption?.serviceCode || "").toUpperCase() === "PREORDER";
}

function assertNoShopifyUserErrors(operation, userErrors) {
  if (userErrors?.length) {
    throw new Error(
      `${operation}: ${userErrors.map((error) => error.message).join("; ")}`,
    );
  }
}

function buildOrderTags(asaasPaymentId, orderType) {
  const environmentTag =
    getAsaasConfig().env === "production"
      ? "iron-air-production"
      : "iron-air-sandbox";
  const baseOrderTags = [
    "asaas",
    environmentTag,
    ...(orderType === PREORDER_TYPE ? ["pre-venda", "iron-air-pre-venda"] : []),
  ];

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

function buildOrderNote({ externalReference, orderType } = {}) {
  const environmentName =
    getAsaasConfig().env === "production" ? "production" : "sandbox";

  return [
    `Iron Air ${environmentName} checkout via Asaas.`,
    orderType === PREORDER_TYPE
      ? "Pedido realizado por meio do checkout de pré-venda.\nFrete cobrado do cliente: R$ 0,00.\nEnvio previsto após chegada e liberação do lote."
      : null,
    externalReference ? `External reference: ${externalReference}` : null,
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
    [
      "email",
      "cpfCnpj",
      "CPF/CNPJ",
      "customer_phone",
      "asaas_customer_phone",
    ].includes(value.key) &&
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
    countryCode: "BR",
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
  externalReference,
  customer,
  source,
  paidAt,
  paymentStatus,
  shippingOption,
  discount,
  orderType,
}) {
  return [
    customer?.cpfCnpj ? { key: "CPF/CNPJ", value: customer.cpfCnpj } : null,
    paymentStatus ? { key: "Pagamento", value: paymentStatus } : null,
    paidAt ? { key: "Data pagamento", value: formatDateTimeForBrazil(paidAt) } : null,
    externalReference ? { key: "externalReference", value: externalReference } : null,
    source ? { key: "source", value: source } : null,
    orderType === PREORDER_TYPE ? { key: "orderType", value: PREORDER_TYPE } : null,
    discount?.couponCode ? { key: "Cupom", value: discount.couponCode } : null,
    discount?.discountAmount
      ? { key: "Desconto valor", value: Number(discount.discountAmount).toFixed(2) }
      : null,
    discount?.discountType ? { key: "Desconto tipo", value: discount.discountType } : null,
    shippingOption?.carrier
      ? { key: "Frete transportadora", value: shippingOption.carrier }
      : null,
    shippingOption?.service
      ? { key: "Frete servico", value: shippingOption.service }
      : null,
    shippingOption?.serviceCode
      ? { key: "Frete codigo", value: shippingOption.serviceCode }
      : null,
    shippingOption?.price !== undefined
      ? { key: "Frete valor", value: Number(shippingOption.price).toFixed(2) }
      : null,
    shippingOption?.originalPrice !== undefined
      ? {
          key: "Frete valor original",
          value: Number(shippingOption.originalPrice).toFixed(2),
        }
      : null,
    shippingOption?.isFreeShipping
      ? { key: "Frete promocao", value: shippingOption.promotionLabel || FREE_SHIPPING_TITLE }
      : null,
    shippingOption?.deadlineDays !== undefined
      ? { key: "Frete prazo", value: `${shippingOption.deadlineDays} dias uteis` }
      : null,
    shippingOption?.destinationCep
      ? { key: "Frete CEP destino", value: shippingOption.destinationCep }
      : null,
  ].filter(Boolean);
}

function formatDateTimeForBrazil(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPaymentLabel(asaasPayment = {}) {
  const billingType = String(asaasPayment.billingType || "").toUpperCase();

  if (billingType === "PIX") {
    return "Pago via Pix";
  }

  if (billingType === "CREDIT_CARD") {
    return "Pago via cartão";
  }

  return "Pago via Asaas";
}

function buildAsaasMetafields({
  asaasPaymentId,
  asaasCheckoutId,
  asaasCustomerId,
  invoiceUrl,
  externalReference,
  asaasPayment,
  shippingOption,
  discount,
}) {
  return [
    asaasPaymentId
      ? {
          namespace: "ironair_asaas",
          key: "payment_id",
          type: "single_line_text_field",
          value: asaasPaymentId,
        }
      : null,
    asaasCheckoutId
      ? {
          namespace: "ironair_asaas",
          key: "checkout_id",
          type: "single_line_text_field",
          value: asaasCheckoutId,
        }
      : null,
    asaasCustomerId
      ? {
          namespace: "ironair_asaas",
          key: "customer_id",
          type: "single_line_text_field",
          value: asaasCustomerId,
        }
      : null,
    invoiceUrl
      ? { namespace: "ironair_asaas", key: "invoice_url", type: "url", value: invoiceUrl }
      : null,
    externalReference
      ? {
          namespace: "ironair_asaas",
          key: "external_reference",
          type: "single_line_text_field",
          value: externalReference,
        }
      : null,
    asaasPayment
      ? {
          namespace: "ironair_asaas",
          key: "payment_payload",
          type: "json",
          value: JSON.stringify(sanitizePayloadForLog(asaasPayment)),
        }
      : null,
    discount?.couponCode
      ? {
          namespace: "ironair_discount",
          key: "coupon_code",
          type: "single_line_text_field",
          value: discount.couponCode,
        }
      : null,
    discount?.discountAmount
      ? {
          namespace: "ironair_discount",
          key: "amount",
          type: "number_decimal",
          value: Number(discount.discountAmount).toFixed(2),
        }
      : null,
    discount?.discountType
      ? {
          namespace: "ironair_discount",
          key: "type",
          type: "single_line_text_field",
          value: discount.discountType,
        }
      : null,
    shippingOption?.carrier
      ? {
          namespace: "ironair_shipping",
          key: "carrier",
          type: "single_line_text_field",
          value: shippingOption.carrier,
        }
      : null,
    shippingOption?.service
      ? {
          namespace: "ironair_shipping",
          key: "service",
          type: "single_line_text_field",
          value: shippingOption.service,
        }
      : null,
    shippingOption?.serviceCode
      ? {
          namespace: "ironair_shipping",
          key: "service_code",
          type: "single_line_text_field",
          value: shippingOption.serviceCode,
        }
      : null,
    shippingOption?.price !== undefined
      ? {
          namespace: "ironair_shipping",
          key: "price",
          type: "number_decimal",
          value: Number(shippingOption.price).toFixed(2),
        }
      : null,
    shippingOption?.originalPrice !== undefined
      ? {
          namespace: "ironair_shipping",
          key: "original_price",
          type: "number_decimal",
          value: Number(shippingOption.originalPrice).toFixed(2),
        }
      : null,
    shippingOption?.isFreeShipping
      ? {
          namespace: "ironair_shipping",
          key: "promotion",
          type: "single_line_text_field",
          value: shippingOption.promotionLabel || FREE_SHIPPING_TITLE,
        }
      : null,
    shippingOption?.deadlineDays !== undefined
      ? {
          namespace: "ironair_shipping",
          key: "deadline_days",
          type: "number_integer",
          value: String(shippingOption.deadlineDays),
        }
      : null,
    shippingOption?.destinationCep
      ? {
          namespace: "ironair_shipping",
          key: "destination_cep",
          type: "single_line_text_field",
          value: shippingOption.destinationCep,
        }
      : null,
  ].filter(Boolean);
}

function getMappedShippingOption(mappedOrder = {}) {
  if (!mappedOrder.shippingCarrier) {
    return null;
  }

  return {
    carrier: mappedOrder.shippingCarrier,
    service: mappedOrder.shippingService,
    serviceCode: mappedOrder.shippingServiceCode,
    price: mappedOrder.shippingPrice,
    deadlineDays: mappedOrder.shippingDeadlineDays,
    destinationCep: mappedOrder.shippingDestinationCep,
  };
}

function getMappedDiscount(mappedOrder = {}) {
  if (!mappedOrder.couponCode || !Number(mappedOrder.discountAmount)) {
    return null;
  }

  return {
    couponCode: mappedOrder.couponCode,
    discountAmount: Number(mappedOrder.discountAmount),
    discountType: mappedOrder.discountType || PIX_DISCOUNT_TYPE,
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function buildPixDiscount(verifiedItems, couponCode) {
  if (!couponCode) {
    return null;
  }

  const subtotal = verifiedItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
  const discountAmount = roundMoney(subtotal * 0.1);

  if (discountAmount <= 0) {
    return null;
  }

  return {
    couponCode,
    discountAmount,
    discountType: PIX_DISCOUNT_TYPE,
  };
}

function buildShopifyAppliedDiscount(discount) {
  if (!discount?.discountAmount) {
    return undefined;
  }

  return {
    title: discount.couponCode,
    description: "Desconto Pix Iron Air",
    value: Number(discount.discountAmount.toFixed(2)),
    valueType: "FIXED_AMOUNT",
    amountWithCurrency: {
      amount: Number(discount.discountAmount).toFixed(2),
      currencyCode: "BRL",
    },
  };
}

function buildShopifyShippingLine(shippingOption) {
  if (!shippingOption) {
    return undefined;
  }

  return {
    title:
      shippingOption.title ||
      (shippingOption.isFreeShipping
        ? FREE_SHIPPING_TITLE
        : `${shippingOption.carrier} ${shippingOption.service}`),
    priceWithCurrency: {
      amount: Number(shippingOption.price || 0).toFixed(2),
      currencyCode: "BRL",
    },
  };
}

function buildBrazilTaxLocalizedFields(customer = {}) {
  return customer?.cpfCnpj
    ? [
        {
          key: "TAX_CREDENTIAL_BR",
          value: customer.cpfCnpj,
        },
      ]
    : undefined;
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

async function updateCompletedShopifyOrderMetadata(orderId, input) {
  if (!orderId) {
    return null;
  }

  const data = await shopifyGraphql(
    `#graphql
      mutation updateCompletedOrderMetadata($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
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
      input: {
        id: orderId,
        ...input,
      },
    },
  );

  assertNoShopifyUserErrors(
    "orderUpdate metadata",
    data.orderUpdate.userErrors,
  );

  return data.orderUpdate.order;
}

export async function updateShopifyOrderCorreiosMetadata(
  orderId,
  {
    shippingStatus,
    prePostageId,
    trackingCode,
    labelUrl,
    error,
  } = {},
) {
  if (!orderId) {
    return null;
  }

  const metafields = [
    shippingStatus
      ? {
          namespace: "ironair_shipping",
          key: "status",
          type: "single_line_text_field",
          value: shippingStatus,
        }
      : null,
    prePostageId
      ? {
          namespace: "ironair_shipping",
          key: "correios_prepostage_id",
          type: "single_line_text_field",
          value: prePostageId,
        }
      : null,
    trackingCode
      ? {
          namespace: "ironair_shipping",
          key: "correios_tracking_code",
          type: "single_line_text_field",
          value: trackingCode,
        }
      : null,
    labelUrl
      ? {
          namespace: "ironair_shipping",
          key: "correios_label_url",
          type: "url",
          value: labelUrl,
        }
      : null,
    error
      ? {
          namespace: "ironair_shipping",
          key: "correios_error",
          type: "multi_line_text_field",
          value: String(error).slice(0, 5000),
        }
      : null,
  ].filter(Boolean);

  if (!metafields.length) {
    return null;
  }

  return updateCompletedShopifyOrderMetadata(orderId, { metafields });
}

export async function createShopifyFulfillmentWithTracking(
  orderId,
  trackingCode,
) {
  if (!orderId || !trackingCode) {
    return null;
  }

  const trackingUrl = `https://www.correios.com.br/rastreamento?objetos=${encodeURIComponent(
    trackingCode,
  )}`;
  const fulfillmentOrderData = await shopifyGraphql(
    `#graphql
      query getFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
            }
          }
        }
      }`,
    { id: orderId },
  );
  const fulfillmentOrders =
    fulfillmentOrderData.order?.fulfillmentOrders?.nodes || [];
  const fulfillableOrders = fulfillmentOrders.filter((fulfillmentOrder) =>
    ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(
      String(fulfillmentOrder.status || "").toUpperCase(),
    ),
  );

  if (!fulfillableOrders.length) {
    return {
      skipped: true,
      reason: "No open Shopify fulfillment order found.",
    };
  }

  const data = await shopifyGraphql(
    `#graphql
      mutation createFulfillment($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
            trackingInfo {
              company
              number
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: fulfillableOrders.map((fulfillmentOrder) => ({
          fulfillmentOrderId: fulfillmentOrder.id,
        })),
        notifyCustomer: false,
        trackingInfo: {
          company: "Correios",
          number: trackingCode,
          url: trackingUrl,
        },
      },
    },
  );

  assertNoShopifyUserErrors(
    "fulfillmentCreateV2",
    data.fulfillmentCreateV2.userErrors,
  );

  return data.fulfillmentCreateV2.fulfillment;
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
  const discount = buildPixDiscount(verifiedItems, payload.couponCode);
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
    source: "ironair_custom_checkout",
    shippingOption: payload.shippingOption,
    discount,
    orderType: payload.orderType,
  });
  const input = {
    email: payload.customer.email,
    shippingAddress,
    billingAddress,
    presentmentCurrencyCode: "BRL",
    sourceName: getSourceName(),
    taxExempt: true,
    visibleToCustomer: false,
    tags: buildOrderTags(undefined, payload.orderType),
    note: buildOrderNote({ externalReference, orderType: payload.orderType }),
    customAttributes,
    appliedDiscount: buildShopifyAppliedDiscount(discount),
    shippingLine: buildShopifyShippingLine(payload.shippingOption),
    localizedFields: buildBrazilTaxLocalizedFields(payload.customer),
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
    value: roundMoney(verifiedItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ) - Number(discount?.discountAmount || 0) + Number(payload.shippingOption?.price || 0)),
    discount,
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
  shippingOption,
  couponCode,
  discountAmount,
  discountType,
  orderType,
}) {
  const discount =
    couponCode && Number(discountAmount) > 0
      ? {
          couponCode,
          discountAmount: Number(discountAmount),
          discountType: discountType || PIX_DISCOUNT_TYPE,
        }
      : null;
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
    // A card payment can be confirmed while the checkout request is still
    // finishing. Keep the existing mapping, but fill the shipping data that
    // makes a paid order eligible for the Correios pre-postage flow.
    if (!shippingOption) {
      return existingOrder;
    }

    return prisma.asaasShopifyOrder.update({
      where: { id: existingOrder.id },
      data: {
        shippingCarrier: shippingOption.carrier || null,
        shippingService: shippingOption.service || null,
        shippingServiceCode: shippingOption.serviceCode || null,
        shippingPrice:
          shippingOption.price !== undefined ? Number(shippingOption.price) : null,
        shippingDeadlineDays: shippingOption.deadlineDays ?? null,
        shippingDestinationCep: shippingOption.destinationCep || null,
      },
    });
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
        tags: buildOrderTags(asaasPaymentId, orderType),
        note: buildOrderNote({
          asaasPaymentId,
          externalReference,
          invoiceUrl,
          orderType,
        }),
        customAttributes: buildCustomAttributes({
          externalReference,
          customer,
          source: customer ? "ironair_custom_checkout" : undefined,
          shippingOption,
          discount,
          orderType,
        }),
        metafields: buildAsaasMetafields({
          asaasPaymentId,
          asaasCheckoutId,
          asaasCustomerId,
          invoiceUrl,
          externalReference,
          shippingOption,
          discount,
        }),
        localizedFields: buildBrazilTaxLocalizedFields(customer),
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
        couponCode: discount?.couponCode || null,
        discountAmount: discount?.discountAmount || null,
        discountType: discount?.discountType || null,
        shippingCarrier: shippingOption?.carrier || null,
        shippingService: shippingOption?.service || null,
        shippingServiceCode: shippingOption?.serviceCode || null,
        shippingPrice:
          shippingOption?.price !== undefined ? Number(shippingOption.price) : null,
        shippingDeadlineDays: shippingOption?.deadlineDays ?? null,
        shippingDestinationCep: shippingOption?.destinationCep || null,
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
    const shippingOption = getMappedShippingOption(mappedOrder);

    if (
      shippingOption &&
      !isPreorderShippingOption(shippingOption) &&
      !mappedOrder.shippingStatus
    ) {
      await prisma.asaasShopifyOrder.update({
        where: { id: mappedOrder.id },
        data: { shippingStatus: "AWAITING_LABEL" },
      });
    }

    if (mappedOrder.shopifyOrderId) {
      await updateCompletedShopifyOrderMetadata(mappedOrder.shopifyOrderId, {
        customAttributes: buildCustomAttributes({
          externalReference: mappedOrder.externalReference,
          customer: asaasCustomer || {},
          paidAt: mappedOrder.paidAt || new Date().toISOString(),
          paymentStatus: getPaymentLabel(asaasPayment),
          shippingOption,
        }),
        metafields: buildAsaasMetafields({
          asaasPaymentId: asaasPaymentId || mappedOrder.asaasPaymentId,
          asaasCheckoutId: asaasCheckoutId || mappedOrder.asaasCheckoutId,
          asaasCustomerId: asaasCustomerId || mappedOrder.asaasCustomerId,
          invoiceUrl: mappedOrder.invoiceUrl,
          externalReference: mappedOrder.externalReference,
          asaasPayment,
          shippingOption,
        }),
      });
    }

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
  const shippingOption = getMappedShippingOption(mappedOrder);
  const discount = getMappedDiscount(mappedOrder);

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
            externalReference: mappedOrder.externalReference,
            customer: effectiveCustomer,
            paidAt: new Date().toISOString(),
            paymentStatus: getPaymentLabel(asaasPayment),
            shippingOption,
            discount,
          }),
        ],
        metafields: buildAsaasMetafields({
          asaasPaymentId: paymentId,
          asaasCheckoutId: checkoutId,
          asaasCustomerId,
          invoiceUrl: mappedOrder.invoiceUrl,
          externalReference: mappedOrder.externalReference,
          asaasPayment,
          shippingOption,
          discount,
        }),
        localizedFields: buildBrazilTaxLocalizedFields(effectiveCustomer),
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

  await updateCompletedShopifyOrderMetadata(order.id, {
    customAttributes: buildCustomAttributes({
      externalReference: mappedOrder.externalReference,
      customer: effectiveCustomer,
      paidAt: new Date().toISOString(),
      paymentStatus: getPaymentLabel(asaasPayment),
      shippingOption,
      discount,
    }),
    metafields: buildAsaasMetafields({
      asaasPaymentId: paymentId,
      asaasCheckoutId: checkoutId,
      asaasCustomerId,
      invoiceUrl: mappedOrder.invoiceUrl,
      externalReference: mappedOrder.externalReference,
      asaasPayment,
      shippingOption,
      discount,
    }),
  });

  const updatedOrder = await prisma.asaasShopifyOrder.update({
    where: { id: mappedOrder.id },
    data: {
      status: "PAID",
      asaasPaymentId: paymentId,
      asaasCheckoutId: checkoutId,
      asaasCustomerId: asaasCustomerId || mappedOrder.asaasCustomerId,
      shopifyOrderId: order.id,
      shopifyOrderName: order.name,
      shippingStatus:
        shippingOption && !isPreorderShippingOption(shippingOption)
          ? "AWAITING_LABEL"
          : null,
      correiosError: null,
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
