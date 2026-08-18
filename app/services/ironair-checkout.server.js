import crypto from "node:crypto";
import prisma from "../db.server";

import {
  createAsaasCreditCardPaymentForCustomCheckout,
  createAsaasPixPaymentForCustomCheckout,
  getAsaasCustomer,
  getAsaasPixQrCode,
  isAsaasPaymentApproved,
} from "./asaas.server";
import {
  attachAsaasPaymentToDraftOrder,
  completeDraftOrderForAsaasPayment,
} from "./shopify-order.server";
import { createCorreiosPrePostageIfEligible } from "./correios-order.server";
import {
  createDraftShopifyOrderForIronAirCheckout,
  deleteDraftShopifyOrder,
  findAsaasShopifyOrderByExternalReference,
  markDraftOrderAsFailed,
} from "./shopify-order.server";
import { quoteCorreiosShipping } from "./correios.server";
import {
  applyFreeShippingToOption,
  getStateFromCep,
  isBrazilState,
} from "./free-shipping.server";
import {
  createPreorderShippingOption,
  namespaceCheckoutExternalReference,
  normalizeCheckoutQuantity,
  PREORDER_TYPE,
} from "./preorder-checkout.server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UF_PATTERN = /^[A-Z]{2}$/;
const PAYMENT_METHODS = new Set(["PIX", "CREDIT_CARD"]);
const PIX_COUPON_CODE = "PIX10";
const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid",
];

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

function normalizeShippingOption(value = {}) {
  const carrier = String(value.carrier || "").trim();
  const service = String(value.service || "").trim().toUpperCase();
  const serviceCode = String(value.serviceCode || "").trim();
  const price = Number(value.price);
  const deadlineDays = Number(value.deadlineDays);
  const destinationCep = onlyDigits(value.destinationCep);

  if (!carrier || carrier.toUpperCase() !== "CORREIOS") {
    throw new Error("Selecione uma opção de frete válida.");
  }

  if (!["PAC", "SEDEX"].includes(service) || !serviceCode) {
    throw new Error("Selecione PAC ou SEDEX para continuar.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Valor de frete inválido.");
  }

  if (!Number.isInteger(deadlineDays) || deadlineDays < 0) {
    throw new Error("Prazo de frete inválido.");
  }

  if (destinationCep.length !== 8) {
    throw new Error("CEP de frete inválido.");
  }

  return {
    carrier: "Correios",
    service,
    serviceCode,
    price,
    originalPrice:
      value.originalPrice !== undefined ? Number(value.originalPrice) : price,
    isFreeShipping: Boolean(value.isFreeShipping),
    promotionLabel: String(value.promotionLabel || "").trim(),
    title: String(value.title || "").trim(),
    deadlineDays,
    destinationCep,
  };
}

async function verifyCheckoutShippingOption(payload) {
  const destinationCep = payload.shippingAddress.postalCode;
  const selectedOption = payload.shippingOption;
  const addressState = payload.shippingAddress.provinceCode;

  if (selectedOption.destinationCep !== destinationCep) {
    throw new Error("O CEP do frete selecionado não corresponde ao endereço.");
  }

  const quote = await quoteCorreiosShipping({
    destinationCep,
    destinationState: addressState,
    items: payload.items,
  });
  const confirmedState = quote.destinationAddress?.uf || getStateFromCep(destinationCep);

  if (confirmedState && confirmedState !== addressState) {
    throw new Error("O CEP informado não corresponde ao estado do endereço.");
  }

  const quotedOption = quote.options.find(
    (option) =>
      option.serviceCode === selectedOption.serviceCode &&
      option.service === selectedOption.service,
  );

  if (!quotedOption) {
    throw new Error("Opção de frete inválida para este CEP.");
  }

  const finalOption = applyFreeShippingToOption(quotedOption, {
    destinationCep,
    state: confirmedState,
  });

  return {
    ...finalOption,
    destinationCep,
    isFreeShipping:
      Boolean(finalOption.isFreeShipping) ||
      isBrazilState(confirmedState),
  };
}

function normalizeCouponCode(value) {
  const couponCode = String(value || "").trim().toUpperCase();

  if (!couponCode) {
    return "";
  }

  if (couponCode !== PIX_COUPON_CODE) {
    throw new Error("Cupom inválido.");
  }

  return couponCode;
}

export function normalizeIronAirCheckoutPayload(payload, { orderType } = {}) {
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
  const couponCode = normalizeCouponCode(payload.couponCode);

  if (couponCode && paymentMethod !== "PIX") {
    throw new Error("O cupom PIX10 é válido somente para pagamento via Pix.");
  }

  if (!items.length) {
    throw new Error("Carrinho vazio.");
  }

  const normalizedItems = items.map((item) => {
    const quantity = normalizeCheckoutQuantity(item.quantity, orderType);
    const variantId = normalizeVariantGid(requireText(item, "variantId", "variantId"));

    return {
      variantId,
      title: String(item.title || "").trim(),
      quantity,
      price: Number(item.price) || 0,
      image: String(item.image || "").trim(),
    };
  });

  const requestedExternalReference = String(payload.externalReference || "").trim();
  const generatedExternalReference = `ironair_${Date.now()}_${crypto.randomUUID()}`;
  const externalReference = requestedExternalReference || generatedExternalReference;
  const normalizedPayload = {
    externalReference: namespaceCheckoutExternalReference(externalReference, orderType),
    paymentMethod,
    customer: normalizedCustomer,
    shippingAddress: normalizedShippingAddress,
    billingAddress: normalizedBillingAddress,
    items: normalizedItems,
    shippingOption:
      orderType === PREORDER_TYPE
        ? createPreorderShippingOption(normalizedShippingAddress.postalCode)
        : normalizeShippingOption(payload.shippingOption),
    couponCode,
    orderType: orderType === PREORDER_TYPE ? PREORDER_TYPE : "standard",
    attribution: Object.fromEntries(
      ATTRIBUTION_KEYS.map((key) => [key, String(payload.attribution?.[key] || "").slice(0, 500)])
        .filter(([, value]) => value),
    ),
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
      installments: Math.min(
        12,
        Math.max(1, Math.trunc(Number(creditCard.installments) || 1)),
      ),
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
  const normalizedPayload = normalizeIronAirCheckoutPayload(payload, options);
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
      paymentStatus: existingOrder.status === "PAID" ? "CONFIRMED" : "PENDING",
      externalReference: existingOrder.externalReference,
      draftOrderId: existingOrder.draftOrderId,
      draftOrderName: existingOrder.draftOrderName,
      reused: true,
    };
  }

  try {
    await prisma.checkoutAttempt.create({
      data: { externalReference: normalizedPayload.externalReference },
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;

    const orderCreatedByConcurrentRequest =
      await findAsaasShopifyOrderByExternalReference(normalizedPayload.externalReference);

    if (orderCreatedByConcurrentRequest?.asaasPaymentId) {
      const pix = normalizedPayload.paymentMethod === "PIX"
        ? await getAsaasPixQrCode(orderCreatedByConcurrentRequest.asaasPaymentId)
        : null;
      return {
        checkoutUrl: null,
        paymentId: orderCreatedByConcurrentRequest.asaasPaymentId,
        pix,
        paymentMethod: normalizedPayload.paymentMethod,
        paymentStatus: orderCreatedByConcurrentRequest.status === "PAID" ? "CONFIRMED" : "PENDING",
        externalReference: orderCreatedByConcurrentRequest.externalReference,
        draftOrderId: orderCreatedByConcurrentRequest.draftOrderId,
        draftOrderName: orderCreatedByConcurrentRequest.draftOrderName,
        reused: true,
      };
    }

    throw new Error("Este checkout já está sendo processado. Aguarde alguns segundos e tente novamente.");
  }

  let draftOrder;
  let verifiedItems;
  let totalValue;

  try {
    if (normalizedPayload.orderType !== PREORDER_TYPE) {
      normalizedPayload.shippingOption =
        await verifyCheckoutShippingOption(normalizedPayload);
    }

    const draftResult = await createDraftShopifyOrderForIronAirCheckout(
      normalizedPayload,
    );
    draftOrder = draftResult.draftOrder;
    verifiedItems = draftResult.items;
    totalValue = draftResult.value;

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
            descriptionPrefix:
              normalizedPayload.orderType === PREORDER_TYPE
                ? "Iron Air - Pré-venda"
                : undefined,
          })
        : await createAsaasPixPaymentForCustomCheckout({
            customer: normalizedPayload.customer,
            shippingAddress: normalizedPayload.shippingAddress,
            externalReference: normalizedPayload.externalReference,
            items: verifiedItems,
            value: totalValue,
            descriptionPrefix:
              normalizedPayload.orderType === PREORDER_TYPE
                ? "Iron Air - Pré-venda"
                : undefined,
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
      shippingOption: normalizedPayload.shippingOption,
      couponCode: draftResult.discount?.couponCode || null,
      discountAmount: draftResult.discount?.discountAmount || 0,
      discountType: draftResult.discount?.discountType || null,
      orderType: normalizedPayload.orderType,
      attribution: normalizedPayload.attribution,
    });
    await prisma.checkoutAttempt.update({
      where: { externalReference: normalizedPayload.externalReference },
      data: { status: "COMPLETED", failureReason: null },
    });

    // Credit-card payments can be approved before the asynchronous webhook
    // reaches us. Finish the order here as well so the Correios pre-postage is
    // not dependent on the timing of that webhook.
    if (isAsaasPaymentApproved(payment)) {
      const asaasCustomer = await getAsaasCustomer(payment.customer);
      const completedOrder = await completeDraftOrderForAsaasPayment(payment.id, {
        asaasCustomerId: payment.customer,
        asaasCustomer,
        asaasPayment: payment,
        externalReference:
          payment.externalReference || normalizedPayload.externalReference,
      });

      if (completedOrder) {
        await createCorreiosPrePostageIfEligible(completedOrder, {
          customer: asaasCustomer,
        });
      }
    }

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

    await prisma.checkoutAttempt.update({
      where: { externalReference: normalizedPayload.externalReference },
      data: { status: "FAILED", failureReason: reason },
    }).catch(() => null);

    if (draftOrder?.id) {
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
    }

    throw error;
  }
}
