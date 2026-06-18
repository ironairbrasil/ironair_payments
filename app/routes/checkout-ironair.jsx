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
import { useEffect, useMemo, useState } from "react";
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
  const { items, prefill, itemLoadError, externalReference } = useLoaderData();
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
  const [card, setCard] = useState({
    holderName: "",
    number: "",
    expiry: "",
    ccv: "",
    installments: "1",
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [pixPayment, setPixPayment] = useState(null);
  const [pixStatus, setPixStatus] = useState("");
  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + (Number(item.price) || 0) * (Number(item.quantity) || 1),
        0,
      ),
    [items],
  );

  function updateField(name, value) {
    let nextValue = value;

    if (name === "cpfCnpj") nextValue = formatCpf(value);
    if (name === "phone") nextValue = formatPhone(value);
    if (name === "postalCode") nextValue = formatCep(value);

    setForm((current) => ({ ...current, [name]: nextValue }));
    setErrors((current) => ({ ...current, [name]: "" }));
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
      setErrors((current) => ({
        ...current,
        postalCode: "Não foi possível buscar o CEP.",
      }));
    } finally {
      setCepLoading(false);
    }
  }

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
        items: items.filter(itemIsPayable),
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

      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
        setPaymentNotice("Pagamento enviado para processamento.");
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
          const successParams = new URLSearchParams({
            paymentId: pixPayment.paymentId,
            externalReference: pixPayment.externalReference || "",
          });

          window.location.assign(`/checkout/success?${successParams}`);
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

  return (
    <main className="ia-checkout">
      <section className="ia-left">
        <header className="ia-header">
          <img
            className="ia-logo"
            src="/Iron-Air-Logo.webp"
            alt="Iron Air Brasil"
          />
          <div className="ia-safe">
            <Lock size={15} />
            Checkout seguro
          </div>
        </header>

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

          {itemLoadError ? <div className="ia-error">{itemLoadError}</div> : null}
          {formError ? <div className="ia-error">{formError}</div> : null}
        </form>
      </section>

      <aside className="ia-right">
        <div className="ia-summary">
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

          <div className="ia-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </div>
            <div>
              <span>Frete</span>
              <strong className="muted">Grátis</strong>
            </div>
          </div>

          <div className="ia-total">
            <span>Total</span>
            <strong>{formatMoney(subtotal)}</strong>
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
                        <option value="1">1x de {formatMoney(subtotal)}</option>
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
            disabled={loading || Boolean(itemLoadError) || subtotal <= 0}
          >
            <span>
              {loading
                ? "Processando..."
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
