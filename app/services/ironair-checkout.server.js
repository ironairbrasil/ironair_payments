import crypto from "node:crypto";

import {
  createAsaasCreditCardPaymentForCustomCheckout,
  createAsaasPixPaymentForCustomCheckout,
  getAsaasPixQrCode,
} from "./asaas.server";
import { attachAsaasPaymentToDraftOrder } from "./shopify-order.server";
import {
  createDraftShopifyOrderForIronAirCheckout,
  deleteDraftShopifyOrder,
  findAsaasShopifyOrderByExternalReference,
  markDraftOrderAsFailed,
} from "./shopify-order.server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UF_PATTERN = /^[A-Z]{2}$/;
const PAYMENT_METHODS = new Set(["PIX", "CREDIT_CARD"]);

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base) => {
    const sum = base
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (base.length + 1 - index), 0);
    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(cpf.slice(0, 9)) === Number(cpf[9]) &&
    calculateDigit(cpf.slice(0, 10)) === Number(cpf[10])
  );
}

function requireText(source, field, label = field) {
  const value = String(source?.[field] || "").trim();

  if (!value) {
    throw new Error(`Campo obrigatorio: ${label}.`);
  }

  return value;
}

function normalizeVariantGid(variantId) {
  const text = String(variantId || "");

  if (text.startsWith("gid://shopify/ProductVariant/")) {
    return text;
  }

  return `gid://shopify/ProductVariant/${text.replace(/\D/g, "")}`;
}

function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (["email", "cpfCnpj", "phone"].includes(key)) {
        const text = String(item || "");
        return [key, text.length > 4 ? `${text.slice(0, 3)}***${text.slice(-2)}` : "***"];
      }

      return [key, sanitizeForLog(item)];
    }),
  );
}

export function normalizeIronAirCheckoutPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload inválido.");
  }

  const customer = payload.customer || {};
  const shippingAddress = payload.shippingAddress || {};
  const billingAddress = payload.billingAddress || shippingAddress;
  const normalizedCustomer = {
    name: requireText(customer, "name", "nome completo"),
    email: requireText(customer, "email", "email").toLowerCase(),
    cpfCnpj: onlyDigits(requireText(customer, "cpfCnpj", "CPF")),
    phone: onlyDigits(requireText(customer, "phone", "telefone")),
  };

  if (!EMAIL_PATTERN.test(normalizedCustomer.email)) {
    throw new Error("Email inválido.");
  }

  if (!isValidCpf(normalizedCustomer.cpfCnpj)) {
    throw new Error("CPF inválido.");
  }

  if (normalizedCustomer.phone.length < 10) {
    throw new Error("Telefone inválido.");
  }

  const normalizedShippingAddress = {
    postalCode: onlyDigits(requireText(shippingAddress, "postalCode", "CEP")),
    address1: requireText(shippingAddress, "address1", "endereço"),
    number: requireText(shippingAddress, "number", "numero"),
    complement: String(shippingAddress.complement || "").trim(),
    neighborhood: requireText(shippingAddress, "neighborhood", "bairro"),
    city: requireText(shippingAddress, "city", "cidade"),
    provinceCode: requireText(shippingAddress, "provinceCode", "estado").toUpperCase(),
    countryCode: "BR",
    phone: normalizedCustomer.phone,
  };

  if (normalizedShippingAddress.postalCode.length !== 8) {
    throw new Error("CEP inválido.");
  }

  if (!UF_PATTERN.test(normalizedShippingAddress.provinceCode)) {
    throw new Error("Estado/UF inválido.");
  }

  const normalizedBillingAddress = {
    ...normalizedShippingAddress,
    ...billingAddress,
    postalCode: onlyDigits(billingAddress.postalCode || normalizedShippingAddress.postalCode),
    provinceCode: String(
      billingAddress.provinceCode || normalizedShippingAddress.provinceCode,
    ).toUpperCase(),
    countryCode: "BR",
    phone: normalizedCustomer.phone,
  };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const paymentMethod = PAYMENT_METHODS.has(payload.paymentMethod)
    ? payload.paymentMethod
    : "PIX";

  if (!items.length) {
    throw new Error("Carrinho vazio.");
  }

  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const variantId = normalizeVariantGid(requireText(item, "variantId", "variantId"));

    return {
      variantId,
      title: String(item.title || "").trim(),
      quantity,
      price: Number(item.price) || 0,
      image: String(item.image || "").trim(),
    };
  });

  const normalizedPayload = {
    externalReference:
      String(payload.externalReference || "").trim() ||
      `ironair_${Date.now()}_${crypto.randomUUID()}`,
    paymentMethod,
    customer: normalizedCustomer,
    shippingAddress: normalizedShippingAddress,
    billingAddress: normalizedBillingAddress,
    items: normalizedItems,
  };

  if (paymentMethod === "CREDIT_CARD") {
    const creditCard = payload.creditCard || {};
    const expiryMonth = onlyDigits(requireText(creditCard, "expiryMonth", "mês de validade"));
    const expiryYear = onlyDigits(requireText(creditCard, "expiryYear", "ano de validade"));

    normalizedPayload.creditCard = {
      holderName: requireText(creditCard, "holderName", "nome no cartão"),
      number: onlyDigits(requireText(creditCard, "number", "número do cartão")),
      expiryMonth: expiryMonth.padStart(2, "0"),
      expiryYear: expiryYear.length === 2 ? `20${expiryYear}` : expiryYear,
      ccv: onlyDigits(requireText(creditCard, "ccv", "CVV")),
    };

    if (normalizedPayload.creditCard.number.length < 13) {
      throw new Error("Número do cartão inválido.");
    }

    if (normalizedPayload.creditCard.ccv.length < 3) {
      throw new Error("CVV inválido.");
    }
  }

  return normalizedPayload;
}

export async function createIronAirCheckout(payload, options = {}) {
  const normalizedPayload = normalizeIronAirCheckoutPayload(payload);
  const existingOrder = await findAsaasShopifyOrderByExternalReference(
    normalizedPayload.externalReference,
  );

  if (existingOrder?.asaasPaymentId) {
    const pix =
      normalizedPayload.paymentMethod === "PIX"
        ? await getAsaasPixQrCode(existingOrder.asaasPaymentId)
        : null;

    return {
      checkoutUrl: null,
      paymentId: existingOrder.asaasPaymentId,
      pix,
      paymentMethod: normalizedPayload.paymentMethod,
      externalReference: existingOrder.externalReference,
      draftOrderId: existingOrder.draftOrderId,
      draftOrderName: existingOrder.draftOrderName,
      reused: true,
    };
  }

  let draftOrder;
  let verifiedItems;
  let totalValue;

  const draftResult = await createDraftShopifyOrderForIronAirCheckout(
    normalizedPayload,
  );
  draftOrder = draftResult.draftOrder;
  verifiedItems = draftResult.items;
  totalValue = draftResult.value;

  try {
    const asaasResult =
      normalizedPayload.paymentMethod === "CREDIT_CARD"
        ? await createAsaasCreditCardPaymentForCustomCheckout({
            customer: normalizedPayload.customer,
            shippingAddress: normalizedPayload.shippingAddress,
            externalReference: normalizedPayload.externalReference,
            items: verifiedItems,
            value: totalValue,
            creditCard: normalizedPayload.creditCard,
            remoteIp: options.remoteIp,
          })
        : await createAsaasPixPaymentForCustomCheckout({
            customer: normalizedPayload.customer,
            shippingAddress: normalizedPayload.shippingAddress,
            externalReference: normalizedPayload.externalReference,
            items: verifiedItems,
            value: totalValue,
          });
    const payment = asaasResult.payment;
    const mappedOrder = await attachAsaasPaymentToDraftOrder({
      draftOrder,
      asaasPaymentId: payment.id,
      asaasCheckoutId: null,
      asaasCustomerId: payment.customer || asaasResult.asaasCustomer?.id,
      value: totalValue,
      externalReference:
        payment.externalReference || normalizedPayload.externalReference,
      invoiceUrl: payment.invoiceUrl || null,
      checkoutUrl: null,
      customer: normalizedPayload.customer,
      shippingAddress: normalizedPayload.shippingAddress,
    });

    console.log("[ironair checkout] Payloads sent.", {
      shopify: "See [SHOPIFY CUSTOM CHECKOUT DRAFT PAYLOAD]",
      asaas: sanitizeForLog({
        customer: normalizedPayload.customer,
        shippingAddress: normalizedPayload.shippingAddress,
        externalReference: normalizedPayload.externalReference,
        items: verifiedItems,
      }),
    });

    return {
      checkoutUrl: null,
      checkoutId: null,
      paymentId: payment.id,
      pix: asaasResult.pix,
      paymentMethod: normalizedPayload.paymentMethod,
      paymentStatus: payment.status,
      externalReference: mappedOrder.externalReference,
      draftOrderId: mappedOrder.draftOrderId,
      draftOrderName: mappedOrder.draftOrderName,
      reused: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    try {
      await deleteDraftShopifyOrder(draftOrder.id);
    } finally {
      await markDraftOrderAsFailed({
        draftOrder,
        externalReference: normalizedPayload.externalReference,
        value: totalValue || 0,
        reason,
      });
    }

    throw error;
  }
}
