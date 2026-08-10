/* eslint-disable react/prop-types */
import {
  ArrowRight,
  Check,
  ChevronDown,
  Headphones,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData } from "react-router";

import checkoutStyles from "../styles/checkout-ironair.css?url";

const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const DEFAULT_ITEM = {
  variantId: "gid://shopify/ProductVariant/1234567890",
  title: "Borrifador de Água Pressurizado",
  quantity: 1,
  price: 79,
  compareAtPrice: null,
  image: "",
};

const STORE_ORIGIN = "https://ironair.com.br";
const PIX_COUPON_CODE = "PIX10";
const MAX_CARD_INSTALLMENTS = 12;
export const PREORDER_SHIPPING_ESTIMATE =
  "Envio previsto em até 30 dias, após a chegada e liberação do produto no Brasil.";

export function links() {
  return [{ rel: "stylesheet", href: checkoutStyles }];
}

function decodeValue(value) {
  let decoded = String(value || "").trim();

  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

function parseCurrency(value, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const raw = decodeValue(value);
  if (!raw) return fallback;

  const normalized = raw.replace(/[^\d.,-]/g, "");
  const hasDecimalSeparator = /[,.]/.test(normalized);
  const number = Number(normalized.replace(",", "."));

  if (!Number.isFinite(number)) return fallback;
  if (!hasDecimalSeparator && Number.isInteger(number) && number >= 1000) {
    return number / 100;
  }

  return number;
}

function normalizeImageUrl(value) {
  const image = decodeValue(value);

  if (!image) return "";
  if (image.startsWith("//")) return `https:${image}`;
  if (image.startsWith("/")) return `${STORE_ORIGIN}${image}`;
  if (/^https?:\/\//i.test(image)) return image;

  return "";
}

function normalizeItem(item, index = 0) {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const price = parseCurrency(item.price, 0);

  return {
    variantId: decodeValue(item.variantId || item.id || ""),
    productId: decodeValue(item.productId || ""),
    title: decodeValue(item.title || DEFAULT_ITEM.title),
    variantTitle: decodeValue(item.variantTitle || item.variant || item.options || ""),
    quantity,
    price,
    compareAtPrice: item.compareAtPrice ? parseCurrency(item.compareAtPrice) : null,
    image: normalizeImageUrl(item.image || item.featured_image || ""),
    key: decodeValue(item.key || item.variantId || `item-${index}`),
  };
}

function parseBracketItems(searchParams) {
  const itemMap = new Map();

  for (const [key, value] of searchParams.entries()) {
    const match = key.match(/^items\[(\d+)\]\[([^\]]+)\]$/);
    if (!match) continue;

    const [, index, field] = match;
    const current = itemMap.get(index) || {};
    current[field] = value;
    itemMap.set(index, current);
  }

  return [...itemMap.entries()]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, item], index) => normalizeItem(item, index));
}

function itemIsPayable(item) {
  return Boolean(
    item.variantId &&
      item.title &&
      Number(item.quantity) > 0 &&
      Number(item.price) > 0,
  );
}

function queryValue(searchParams, keys) {
  for (const key of keys) {
    const value = decodeValue(searchParams.get(key));
    if (value) return value;
  }

  return "";
}

function normalizeProvinceCode(value) {
  const province = decodeValue(value).toUpperCase();

  if (BRAZIL_STATES.includes(province)) return province;

  return "";
}

function parsePrefill(searchParams) {
  const firstName = queryValue(searchParams, [
    "customer[firstName]",
    "customer[first_name]",
    "firstName",
    "first_name",
  ]);
  const lastName = queryValue(searchParams, [
    "customer[lastName]",
    "customer[last_name]",
    "lastName",
    "last_name",
  ]);
  const name =
    queryValue(searchParams, ["customer[name]", "customerName", "name"]) ||
    [firstName, lastName].filter(Boolean).join(" ");
  const phone = queryValue(searchParams, [
    "customer[phone]",
    "shippingAddress[phone]",
    "defaultAddress[phone]",
    "phone",
  ]);
  const provinceCode = normalizeProvinceCode(
    queryValue(searchParams, [
      "shippingAddress[provinceCode]",
      "shippingAddress[province_code]",
      "defaultAddress[provinceCode]",
      "defaultAddress[province_code]",
      "provinceCode",
      "province_code",
      "state",
      "uf",
    ]),
  );

  return {
    email: queryValue(searchParams, ["customer[email]", "email"]),
    name,
    cpfCnpj: queryValue(searchParams, [
      "customer[cpfCnpj]",
      "customer[cpf_cnpj]",
      "customer[cpf]",
      "cpfCnpj",
      "cpf",
    ]),
    phone,
    postalCode: queryValue(searchParams, [
      "shippingAddress[postalCode]",
      "shippingAddress[zip]",
      "defaultAddress[postalCode]",
      "defaultAddress[zip]",
      "postalCode",
      "zip",
      "cep",
    ]),
    address1: queryValue(searchParams, [
      "shippingAddress[address1]",
      "defaultAddress[address1]",
      "address1",
    ]),
    number: queryValue(searchParams, [
      "shippingAddress[number]",
      "defaultAddress[number]",
      "addressNumber",
      "number",
    ]),
    complement: queryValue(searchParams, [
      "shippingAddress[complement]",
      "shippingAddress[address2]",
      "defaultAddress[complement]",
      "defaultAddress[address2]",
      "complement",
      "address2",
    ]),
    neighborhood: queryValue(searchParams, [
      "shippingAddress[neighborhood]",
      "defaultAddress[neighborhood]",
      "neighborhood",
      "bairro",
    ]),
    city: queryValue(searchParams, [
      "shippingAddress[city]",
      "defaultAddress[city]",
      "city",
    ]),
    provinceCode,
  };
}

function parseItems(searchParams) {
  const encodedItems = searchParams.get("items");
  const bracketItems = parseBracketItems(searchParams);

  if (bracketItems.length) {
    return bracketItems;
  }

  if (encodedItems) {
    try {
      const parsedItems = JSON.parse(decodeValue(encodedItems));

      if (Array.isArray(parsedItems) && parsedItems.length) {
        return parsedItems.map((item, index) => normalizeItem(item, index));
      }
    } catch {
      // Fallback to single-item query params below.
    }
  }

  return [
    {
      variantId: searchParams.get("variantId") || "",
      productId: searchParams.get("productId") || "",
      title: searchParams.get("title") || "",
      quantity: Math.max(1, Number(searchParams.get("quantity")) || 1),
      price: parseCurrency(searchParams.get("price"), 0),
      compareAtPrice: searchParams.get("compareAtPrice")
        ? parseCurrency(searchParams.get("compareAtPrice"))
        : null,
      image: searchParams.get("image") || "",
    },
  ].map((item, index) => normalizeItem(item, index));
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "";
  const parsedItems = parseItems(url.searchParams);
  const validItems = parsedItems.filter(itemIsPayable);
  const shouldUseDefault = !source && !validItems.length;
  const items = shouldUseDefault ? [DEFAULT_ITEM] : parsedItems;
  const itemLoadError =
    source === "cart" &&
    (!validItems.length || validItems.length !== parsedItems.length)
      ? "Não conseguimos carregar os itens do carrinho. Volte à loja e tente novamente."
      : "";

  return {
    items,
    prefill: parsePrefill(url.searchParams),
    itemLoadError,
    externalReference: url.searchParams.get("externalReference") || "",
    couponCode:
      queryValue(url.searchParams, ["coupon", "couponCode", "discount", "discountCode"]) ||
      "",
  };
}

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

function formatCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCep(value) {
  const digits = onlyDigits(value).slice(0, 8);

  return digits.replace(/(\d{5})(\d)/, "$1-$2");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCardNumber(value) {
  return onlyDigits(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value) {
  const digits = onlyDigits(value).slice(0, 6);

  if (digits.length <= 2) return digits;

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function normalizeCouponCode(value) {
  return String(value || "").trim().toUpperCase();
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  className = "",
  children,
  ...props
}) {
  return (
    <label className={`ia-field ${className} ${error ? "has-error" : ""}`}>
      <span>{label}</span>
      <input
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        {...props}
      />
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

export default function IronAirCheckout() {
  const {
    items,
    prefill,
    itemLoadError,
    externalReference,
    couponCode: initialCouponCode,
    checkoutMode,
  } = useLoaderData();
  const preorder = checkoutMode === "preorder";
  const [form, setForm] = useState({
    email: prefill.email || "",
    name: prefill.name || "",
    cpfCnpj: formatCpf(prefill.cpfCnpj || ""),
    phone: formatPhone(prefill.phone || ""),
    postalCode: formatCep(prefill.postalCode || ""),
    address1: prefill.address1 || "",
    number: prefill.number || "",
    complement: prefill.complement || "",
    neighborhood: prefill.neighborhood || "",
    city: prefill.city || "",
    provinceCode: prefill.provinceCode || "SP",
    newsletter: true,
    saveAddress: true,
  });
  const [errors, setErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [couponCode, setCouponCode] = useState(normalizeCouponCode(initialCouponCode));
  const [card, setCard] = useState({
    holderName: "",
    number: "",
    expiry: "",
    ccv: "",
    installments: "1",
  });
  const [cepLoading, setCepLoading] = useState(false);
  const lastCepLookupRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [pixPayment, setPixPayment] = useState(null);
  const [pixStatus, setPixStatus] = useState("");
  const [cardPayment, setCardPayment] = useState(null);
  const [cardStatus, setCardStatus] = useState("");
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedShippingOption, setSelectedShippingOption] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [shippingQuotedCep, setShippingQuotedCep] = useState("");
  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + (Number(item.price) || 0) * (Number(item.quantity) || 1),
        0,
      ),
    [items],
  );
  const shippingTotal = Number(selectedShippingOption?.price) || 0;
  const selectedShippingOriginalTotal = Number(
    selectedShippingOption?.originalPrice ?? selectedShippingOption?.price ?? 0,
  );
  const selectedShippingIsFree = Boolean(selectedShippingOption?.isFreeShipping);
  const normalizedCouponCode = normalizeCouponCode(couponCode);
  const couponIsPix10 = normalizedCouponCode === PIX_COUPON_CODE;
  const couponError =
    normalizedCouponCode && !couponIsPix10
      ? "Cupom inválido."
      : couponIsPix10 && paymentMethod !== "PIX"
        ? "O cupom PIX10 é válido somente para pagamento via Pix."
        : "";
  const discountAmount = couponIsPix10 && paymentMethod === "PIX" ? subtotal * 0.1 : 0;
  const checkoutTotal = subtotal - discountAmount + shippingTotal;
  const installmentOptions = useMemo(
    () =>
      Array.from({ length: MAX_CARD_INSTALLMENTS }, (_, index) => {
        const count = index + 1;
        return {
          count,
          value: checkoutTotal / count,
        };
      }),
    [checkoutTotal],
  );

  function updateField(name, value) {
    let nextValue = value;

    if (name === "cpfCnpj") nextValue = formatCpf(value);
    if (name === "phone") nextValue = formatPhone(value);
    if (name === "postalCode") nextValue = formatCep(value);

    setForm((current) => ({ ...current, [name]: nextValue }));
    setErrors((current) => ({ ...current, [name]: "" }));

    if (name === "postalCode" && !preorder) {
      setSelectedShippingOption(null);
      setShippingOptions([]);
      setShippingError("");
      setShippingQuotedCep("");
    }
  }

  function updateCardField(name, value) {
    let nextValue = value;

    if (name === "number") nextValue = formatCardNumber(value);
    if (name === "expiry") nextValue = formatExpiry(value);
    if (name === "ccv") nextValue = onlyDigits(value).slice(0, 4);

    setCard((current) => ({ ...current, [name]: nextValue }));
    setErrors((current) => ({ ...current, [`card.${name}`]: "" }));
  }

  async function lookupCep() {
    const cep = onlyDigits(form.postalCode);

    if (cep.length !== 8) {
      setErrors((current) => ({ ...current, postalCode: "Informe um CEP válido." }));
      return;
    }

    if (lastCepLookupRef.current === cep) return;

    lastCepLookupRef.current = cep;

    setCepLoading(true);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErrors((current) => ({ ...current, postalCode: "CEP nao encontrado." }));
        return;
      }

      setForm((current) => ({
        ...current,
        address1: data.logradouro || current.address1,
        neighborhood: data.bairro || current.neighborhood,
        city: data.localidade || current.city,
        provinceCode: data.uf || current.provinceCode,
      }));
    } catch {
      lastCepLookupRef.current = "";
      setErrors((current) => ({
        ...current,
        postalCode: "Não foi possível buscar o CEP.",
      }));
    } finally {
      setCepLoading(false);
    }
  }

  async function handleCepKeyDown(event) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    event.stopPropagation();
    await lookupCep();
  }

  useEffect(() => {
    const cep = onlyDigits(form.postalCode);

    if (cep.length !== 8 || lastCepLookupRef.current === cep) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      lookupCep();
    }, 400);

    return () => window.clearTimeout(timeout);
    // lookupCep intentionally reads the latest checkout form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.postalCode]);

  function validateForm() {
    const nextErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = "Informe um e-mail válido.";
    }
    if (!form.name.trim()) nextErrors.name = "Informe seu nome completo.";
    if (!isValidCpf(form.cpfCnpj)) nextErrors.cpfCnpj = "CPF inválido.";
    if (onlyDigits(form.phone).length < 10) nextErrors.phone = "Telefone inválido.";
    if (onlyDigits(form.postalCode).length !== 8) nextErrors.postalCode = "CEP inválido.";
    if (!form.address1.trim()) nextErrors.address1 = "Informe o endereço.";
    if (!form.number.trim()) nextErrors.number = "Informe o numero.";
    if (!form.neighborhood.trim()) nextErrors.neighborhood = "Informe o bairro.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!/^[A-Z]{2}$/.test(form.provinceCode)) nextErrors.provinceCode = "UF inválida.";
    if (!preorder && !selectedShippingOption) {
      nextErrors.shipping = "Selecione uma opção de frete.";
    }
    if (couponError) nextErrors.coupon = couponError;

    if (paymentMethod === "CREDIT_CARD") {
      const [expiryMonth = "", expiryYear = ""] = card.expiry.split("/");

      if (!card.holderName.trim()) nextErrors["card.holderName"] = "Informe o nome.";
      if (onlyDigits(card.number).length < 13) nextErrors["card.number"] = "Cartão inválido.";
      if (expiryMonth.length !== 2 || expiryYear.length < 2) {
        nextErrors["card.expiry"] = "Validade inválida.";
      }
      if (onlyDigits(card.ccv).length < 3) nextErrors["card.ccv"] = "CVV inválido.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function submitCheckout(event) {
    event.preventDefault();
    setFormError("");
    setPaymentNotice("");
    setPixPayment(null);
    setPixStatus("");
    setCardPayment(null);
    setCardStatus("");

    if (itemLoadError || subtotal <= 0) {
      setFormError(
        itemLoadError ||
          "Não conseguimos carregar os itens do carrinho. Volte à loja e tente novamente.",
      );
      return;
    }

    if (!validateForm()) return;

    setLoading(true);

    try {
      const payload = {
        externalReference,
        customer: {
          name: form.name.trim(),
          email: form.email.trim(),
          cpfCnpj: onlyDigits(form.cpfCnpj),
          phone: onlyDigits(form.phone),
        },
        shippingAddress: {
          postalCode: onlyDigits(form.postalCode),
          address1: form.address1.trim(),
          number: form.number.trim(),
          complement: form.complement.trim(),
          neighborhood: form.neighborhood.trim(),
          city: form.city.trim(),
          provinceCode: form.provinceCode,
          countryCode: "BR",
          phone: onlyDigits(form.phone),
        },
        billingAddress: {
          postalCode: onlyDigits(form.postalCode),
          address1: form.address1.trim(),
          number: form.number.trim(),
          complement: form.complement.trim(),
          neighborhood: form.neighborhood.trim(),
          city: form.city.trim(),
          provinceCode: form.provinceCode,
          countryCode: "BR",
          phone: onlyDigits(form.phone),
        },
        paymentMethod,
        couponCode: normalizedCouponCode,
        items: items.filter(itemIsPayable),
        ...(preorder ? {} : { shippingOption: selectedShippingOption }),
      };

      if (paymentMethod === "CREDIT_CARD") {
        const [expiryMonth, expiryYear] = card.expiry.split("/");

        payload.creditCard = {
          holderName: card.holderName.trim(),
          number: onlyDigits(card.number),
          expiryMonth,
          expiryYear,
          ccv: onlyDigits(card.ccv),
          installments: Number(card.installments) || 1,
        };
      }

      const response = await fetch(
        preorder ? "/api/checkout/preorder/create" : "/api/checkout/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Não foi possível criar o pagamento.");
      }

      if (paymentMethod === "PIX") {
        if (!data.pix?.payload) throw new Error("Não foi possível gerar o Pix.");

        setPixPayment({
          paymentId: data.paymentId,
          externalReference: data.externalReference,
          payload: data.pix.payload,
          encodedImage: data.pix.encodedImage,
          expirationDate: data.pix.expirationDate,
        });
        setPixStatus(data.paymentStatus || "PENDING");
      } else {
        setPixPayment(null);
        setPixStatus("");
        setCardPayment({
          paymentId: data.paymentId,
          externalReference: data.externalReference,
        });
        setCardStatus(data.paymentStatus || "PENDING");
        setPaymentNotice("Pagamento enviado para confirmação.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function copyPixCode() {
    if (!pixPayment?.payload) return;

    await navigator.clipboard.writeText(pixPayment.payload);
  }

  function redirectToSuccess(payment) {
    const successParams = new URLSearchParams({
      paymentId: payment.paymentId,
      externalReference: payment.externalReference || "",
    });

    window.location.assign(`/checkout/success?${successParams}`);
  }

  useEffect(() => {
    if (preorder) {
      return undefined;
    }

    const destinationCep = onlyDigits(form.postalCode);
    const payableItems = items.filter(itemIsPayable);

    if (destinationCep.length !== 8 || !payableItems.length) {
      setShippingLoading(false);
      return undefined;
    }

    if (destinationCep === shippingQuotedCep && shippingOptions.length) {
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let cancelled = false;

    async function quoteShipping() {
      setShippingLoading(true);
      setShippingError("");
      setShippingOptions([]);
      setSelectedShippingOption(null);

      try {
        const response = await fetch("/api/shipping/correios/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            destinationCep,
            destinationState: form.provinceCode,
            items: payableItems,
          }),
        });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Não foi possível cotar o frete.");
        }

        const options = Array.isArray(data.options)
          ? data.options
              .filter((option) => Number(option.price) >= 0)
              .sort((first, second) => Number(first.price) - Number(second.price))
          : [];

        if (!options.length) {
          throw new Error("Não encontramos opções de frete para este CEP.");
        }

        setShippingOptions(options);
        setShippingQuotedCep(destinationCep);
      } catch (error) {
        if (cancelled) return;

        setShippingOptions([]);
        setSelectedShippingOption(null);
        setShippingError(
          error instanceof DOMException && error.name === "AbortError"
            ? "A cotação demorou demais. Confira o CEP e tente novamente."
            : error instanceof Error
              ? error.message
              : "Não foi possível cotar o frete agora.",
        );
      } finally {
        if (!cancelled) {
          setShippingLoading(false);
        }
        window.clearTimeout(timeout);
      }
    }

    quoteShipping();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [preorder, form.postalCode, form.provinceCode, items, shippingOptions.length, shippingQuotedCep]);

  useEffect(() => {
    if (!pixPayment?.paymentId || pixStatus === "PAID") {
      return undefined;
    }

    let cancelled = false;

    async function checkPaymentStatus() {
      try {
        const params = new URLSearchParams({
          paymentId: pixPayment.paymentId,
          externalReference: pixPayment.externalReference || "",
        });
        const response = await fetch(`/api/checkout/status?${params}`);
        const data = await response.json();

        if (cancelled || !data.success) return;

        setPixStatus(data.paid ? "PAID" : data.status || "PENDING");

        if (data.paid) {
          redirectToSuccess(pixPayment);
        }
      } catch {
        // Keep polling; the webhook may still finish the order.
      }
    }

    checkPaymentStatus();
    const interval = window.setInterval(checkPaymentStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pixPayment, pixStatus]);

  useEffect(() => {
    if (!cardPayment?.paymentId || cardStatus === "PAID") {
      return undefined;
    }

    let cancelled = false;

    async function checkPaymentStatus() {
      try {
        const params = new URLSearchParams({
          paymentId: cardPayment.paymentId,
          externalReference: cardPayment.externalReference || "",
        });
        const response = await fetch(`/api/checkout/status?${params}`);
        const data = await response.json();

        if (cancelled || !data.success) return;

        setCardStatus(data.paid ? "PAID" : data.status || "PENDING");

        if (data.paid) {
          setPaymentNotice("Pagamento confirmado. Redirecionando...");
          redirectToSuccess(cardPayment);
        } else {
          setPaymentNotice("Pagamento enviado para confirmação.");
        }
      } catch {
        // Keep polling; the webhook may still finish the order.
      }
    }

    checkPaymentStatus();
    const interval = window.setInterval(checkPaymentStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cardPayment, cardStatus]);

  return (
    <main className="ia-checkout">
      <section className="ia-left">
        <header className="ia-header">
          <a
            className="ia-logo-link"
            href={STORE_ORIGIN}
            aria-label="Voltar para a loja Iron Air Brasil"
          >
            <img
              className="ia-logo"
              src="/Iron-Air-Logo.webp"
              alt="Iron Air Brasil"
            />
          </a>
          <div className="ia-safe">
            <Lock size={15} />
            Checkout seguro
          </div>
        </header>

        {preorder ? (
          <div className="ia-preorder-topbar">
            <strong>Pré-venda Iron Air</strong>
            <span>Garanta agora sua unidade do próximo lote.</span>
          </div>
        ) : null}

        <form
          id="ironair-checkout-form"
          className="ia-form"
          onSubmit={submitCheckout}
          noValidate
        >
          <section className="ia-section ia-delivery">
            <h1>Entrega</h1>
            <Field
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              error={errors.email}
            >
              {form.email && !errors.email ? <Check className="ia-valid" size={22} /> : null}
            </Field>

            <label className="ia-field ia-select ia-country">
              <span>País/Região</span>
              <select defaultValue="BR" disabled>
                <option value="BR">Brasil</option>
              </select>
              <ChevronDown size={18} />
            </label>

            <Field
              label="Nome completo"
              name="name"
              value={form.name}
              onChange={updateField}
              error={errors.name}
            />

            <div className="ia-grid two compact">
              <Field
                label="CPF"
                name="cpfCnpj"
                value={form.cpfCnpj}
                onChange={updateField}
                error={errors.cpfCnpj}
                inputMode="numeric"
              />
              <Field
                label="Telefone / WhatsApp"
                name="phone"
                value={form.phone}
                onChange={updateField}
                error={errors.phone}
                inputMode="tel"
              />
            </div>

            <div className="ia-grid cep">
              <Field
                label="CEP"
                name="postalCode"
                value={form.postalCode}
                onChange={updateField}
                error={errors.postalCode}
                inputMode="numeric"
                onKeyDown={handleCepKeyDown}
              >
                <button
                  className="ia-cep"
                  type="button"
                  onClick={lookupCep}
                  disabled={cepLoading}
                >
                  {cepLoading ? "Buscando" : "Buscar CEP"}
                  <Search size={18} />
                </button>
              </Field>
              <Field
                label="Endereço"
                name="address1"
                value={form.address1}
                onChange={updateField}
                error={errors.address1}
              />
            </div>
            <div className="ia-grid two compact">
              <Field
                label="Número"
                name="number"
                value={form.number}
                onChange={updateField}
                error={errors.number}
              />
              <Field
                label="Complemento"
                name="complement"
                value={form.complement}
                onChange={updateField}
              />
            </div>
            <div className="ia-grid city">
              <Field
                label="Bairro"
                name="neighborhood"
                value={form.neighborhood}
                onChange={updateField}
                error={errors.neighborhood}
              />
              <Field
                label="Cidade"
                name="city"
                value={form.city}
                onChange={updateField}
                error={errors.city}
              />
              <label className={`ia-field ia-select ${errors.provinceCode ? "has-error" : ""}`}>
                <span>Estado</span>
                <select
                  value={form.provinceCode}
                  onChange={(event) => updateField("provinceCode", event.target.value)}
                >
                  {BRAZIL_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} />
                {errors.provinceCode ? <small>{errors.provinceCode}</small> : null}
              </label>
            </div>
            <label className="ia-check">
              <input
                checked={form.saveAddress}
                type="checkbox"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    saveAddress: event.target.checked,
                  }))
                }
              />
              <span>Salvar endereço para próximas compras</span>
            </label>
          </section>

          <section className="ia-section ia-shipping">
            <h2>Frete</h2>
            <div className="ia-shipping-banner">
              <strong>Frete Grátis para todo o Brasil</strong>
              <span>
                {preorder
                  ? "O envio será realizado após a chegada e liberação do lote da pré-venda."
                  : "PAC ou SEDEX grátis conforme disponibilidade no seu CEP."}
              </span>
            </div>
            {preorder ? (
              <div className="ia-preorder-shipping-option">
                <span className="ia-preorder-radio" aria-hidden="true" />
                <span>
                  <strong>Pré-venda — Frete grátis</strong>
                  <small>{PREORDER_SHIPPING_ESTIMATE}</small>
                </span>
                <b>Grátis</b>
              </div>
            ) : null}
            {!preorder && shippingLoading ? (
              <div className="ia-shipping-state">Cotando PAC e SEDEX...</div>
            ) : null}
            {!preorder && shippingError ? <div className="ia-error">{shippingError}</div> : null}
            {!preorder && !shippingLoading && !shippingError && !shippingOptions.length ? (
              <div className="ia-shipping-state">
                Informe um CEP válido para ver as opções de entrega.
              </div>
            ) : null}
            {!preorder && shippingOptions.length ? (
              <div className="ia-shipping-options">
                {shippingOptions.map((option) => {
                  const isSelected =
                    selectedShippingOption?.serviceCode === option.serviceCode;

                  return (
                    <button
                      className={`ia-shipping-option ${isSelected ? "is-selected" : ""}`}
                      key={option.serviceCode}
                      type="button"
                      onClick={() =>
                        setSelectedShippingOption({
                          ...option,
                          destinationCep: onlyDigits(form.postalCode),
                        })
                      }
                    >
                      <input
                        aria-label={`Selecionar frete ${option.service}`}
                        checked={isSelected}
                        readOnly
                        type="radio"
                      />
                      <span className="ia-shipping-copy">
                        <strong>{option.service}</strong>
                        <small>{option.deadlineDays} dias úteis</small>
                      </span>
                      <b className={option.isFreeShipping ? "ia-free-shipping-price" : ""}>
                        {option.isFreeShipping ? (
                          <>
                            <s>{formatMoney(option.originalPrice ?? option.price)}</s>
                            <span>Grátis</span>
                          </>
                        ) : (
                          formatMoney(option.price)
                        )}
                      </b>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!preorder && errors.shipping ? <div className="ia-error">{errors.shipping}</div> : null}
          </section>

          {itemLoadError ? <div className="ia-error">{itemLoadError}</div> : null}
          {formError ? <div className="ia-error">{formError}</div> : null}
        </form>
      </section>

      <aside className="ia-right">
        <div className="ia-summary">
          {preorder ? (
            <section className="ia-preorder-notice">
              <strong>Produto em pré-venda</strong>
              <p>Esta compra garante sua unidade do próximo lote.</p>
              <p>{PREORDER_SHIPPING_ESTIMATE}</p>
              <p>Os pedidos serão enviados por ordem de compra.</p>
            </section>
          ) : null}
          <div className="ia-products">
            {items.map((item, index) => (
              <div className="ia-product" key={item.key || `${item.variantId}-${index}`}>
                <div className="ia-thumb">
                  {item.image ? (
                    <img src={item.image} alt={item.title} />
                  ) : (
                    <span>IRON AIR</span>
                  )}
                  <b>{item.quantity || 1}</b>
                </div>
                <div>
                  <p>{item.title || DEFAULT_ITEM.title}</p>
                  {item.variantTitle ? <em>{item.variantTitle}</em> : null}
                </div>
                <strong>{formatMoney((Number(item.price) || 0) * (item.quantity || 1))}</strong>
              </div>
            ))}
            {itemLoadError ? (
              <div className="ia-summary-error">
                Não conseguimos carregar os itens do carrinho.
              </div>
            ) : null}
          </div>

          <div className="ia-coupon">
            <label className={`ia-field ${couponError ? "has-error" : ""}`}>
              <span>Desconto</span>
              <input
                name="couponCode"
                value={couponCode}
                onChange={(event) => {
                  setCouponCode(normalizeCouponCode(event.target.value));
                  setErrors((current) => ({ ...current, coupon: "" }));
                }}
                placeholder="Insira o cupom"
              />
              {couponError || errors.coupon ? <small>{couponError || errors.coupon}</small> : null}
            </label>
          </div>

          <div className="ia-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </div>
            {couponIsPix10 && paymentMethod === "PIX" ? (
              <div className="ia-discount-line">
                <span>Desconto PIX</span>
                <strong>-{formatMoney(discountAmount)}</strong>
              </div>
            ) : null}
            <div>
              <span>Frete</span>
              <strong className={preorder || selectedShippingOption ? "" : "muted"}>
                {preorder ? (
                  "Grátis"
                ) : selectedShippingOption ? (
                  selectedShippingIsFree ? (
                    <span className="ia-summary-free-shipping">
                      <s>{formatMoney(selectedShippingOriginalTotal)}</s>
                      <span>Grátis</span>
                    </span>
                  ) : (
                    formatMoney(shippingTotal)
                  )
                ) : (
                  "Selecione"
                )}
              </strong>
            </div>
          </div>

          <div className="ia-total">
            <span>Total</span>
            <strong>{formatMoney(checkoutTotal)}</strong>
          </div>

          <section className="ia-payment">
            <h3>Método de pagamento</h3>
            <div className="ia-payment-card">
              <div className="ia-asaas">
                <img src="/asaas-logo.svg" alt="Asaas" />
              </div>
              <div>
                <strong>Pagar com Asaas</strong>
                <span>Pix e Cartão</span>
              </div>
              <i />
            </div>
          </section>

          <div className="ia-payment-methods">
            <section className={`ia-method ${paymentMethod === "PIX" ? "is-open" : ""}`}>
              <button
                className="ia-method-header"
                type="button"
                onClick={() => setPaymentMethod("PIX")}
              >
                <span>
                  <input checked={paymentMethod === "PIX"} readOnly type="radio" />
                  Pix
                </span>
                <ChevronDown size={18} />
              </button>
              {paymentMethod === "PIX" ? (
                <div className="ia-method-body">
                  {pixPayment ? (
                    <section className="ia-pix-result" aria-live="polite">
                      <div>
                        <h2>{pixStatus === "PAID" ? "Pix confirmado" : "Pix gerado"}</h2>
                        <p>
                          {pixStatus === "PAID"
                            ? "Pagamento confirmado. Seu pedido será atualizado em instantes."
                            : "Escaneie o QR Code ou copie o código Pix. Assim que o pagamento for confirmado, seu pedido será liberado."}
                        </p>
                      </div>
                      {pixPayment.encodedImage ? (
                        <img
                          src={`data:image/png;base64,${pixPayment.encodedImage}`}
                          alt="QR Code Pix"
                        />
                      ) : null}
                      <textarea readOnly value={pixPayment.payload} />
                      <button type="button" onClick={copyPixCode}>
                        Copiar código Pix
                      </button>
                    </section>
                  ) : (
                    <p>
                      O QR Code Pix será gerado aqui depois que você confirmar os dados.
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            <section
              className={`ia-method ${paymentMethod === "CREDIT_CARD" ? "is-open" : ""}`}
            >
              <button
                className="ia-method-header"
                type="button"
                onClick={() => setPaymentMethod("CREDIT_CARD")}
              >
                <span>
                  <input
                    checked={paymentMethod === "CREDIT_CARD"}
                    readOnly
                    type="radio"
                  />
                  Cartão de crédito
                </span>
                <ChevronDown size={18} />
              </button>
              {paymentMethod === "CREDIT_CARD" ? (
                <div className="ia-method-body">
                  <div className="ia-card-fields">
                    <Field
                      label="Nome impresso no cartão"
                      name="holderName"
                      value={card.holderName}
                      onChange={updateCardField}
                      error={errors["card.holderName"]}
                    />
                    <Field
                      label="Número do cartão"
                      name="number"
                      value={card.number}
                      onChange={updateCardField}
                      error={errors["card.number"]}
                      inputMode="numeric"
                    />
                    <div className="ia-grid two compact">
                      <Field
                        label="Validade"
                        name="expiry"
                        value={card.expiry}
                        onChange={updateCardField}
                        error={errors["card.expiry"]}
                        inputMode="numeric"
                        placeholder="MM/AA"
                      />
                      <Field
                        label="CVV"
                        name="ccv"
                        value={card.ccv}
                        onChange={updateCardField}
                        error={errors["card.ccv"]}
                        inputMode="numeric"
                      />
                    </div>
                    <label className="ia-field ia-select">
                      <span>Parcelas</span>
                      <select
                        value={card.installments}
                        onChange={(event) => updateCardField("installments", event.target.value)}
                      >
                        {installmentOptions.map(({ count, value }) => (
                          <option key={count} value={String(count)}>
                            {count}x de {formatMoney(value)} sem juros
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} />
                    </label>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <button
            className="ia-submit"
            type="submit"
            form="ironair-checkout-form"
            disabled={
              loading ||
              (!preorder && shippingLoading) ||
              Boolean(itemLoadError) ||
              subtotal <= 0
            }
          >
            <span>
              {loading
                ? "Processando..."
                : preorder
                  ? "GARANTIR MINHA UNIDADE"
                  : paymentMethod === "PIX"
                    ? "Gerar Pix"
                    : "Pagar com cartão"}
            </span>
            <ArrowRight size={28} />
          </button>

          {paymentNotice ? <div className="ia-notice">{paymentNotice}</div> : null}

          <div className="ia-protected">
            <ShieldCheck size={18} />
            Seus dados estão protegidos com criptografia de ponta a ponta.
          </div>
        </div>
      </aside>

      <footer className="ia-footer">
        <div>
          <Shield size={24} />
          <p>
            <strong>Compra 100% segura</strong>
            <span>Seus dados protegidos</span>
          </p>
        </div>
        <div>
          <ShieldCheck size={24} />
          <p>
            <strong>Pagamento processado pelo Asaas</strong>
            <span>Ambiente criptografado e certificado</span>
          </p>
        </div>
        <div>
          <Truck size={24} />
          <p>
            <strong>Pedido com rastreamento</strong>
            <span>Atualizações por e-mail e WhatsApp</span>
          </p>
        </div>
        <div>
          <Headphones size={24} />
          <p>
            <strong>Suporte humanizado</strong>
            <span>Atendimento rápido e dedicado</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
