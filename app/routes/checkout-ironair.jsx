/* eslint-disable react/prop-types */
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Headphones,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  Truck,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  const [cepLoading, setCepLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
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
    if (onlyDigits(form.cpfCnpj).length !== 11) nextErrors.cpfCnpj = "CPF inválido.";
    if (onlyDigits(form.phone).length < 10) nextErrors.phone = "Telefone inválido.";
    if (onlyDigits(form.postalCode).length !== 8) nextErrors.postalCode = "CEP inválido.";
    if (!form.address1.trim()) nextErrors.address1 = "Informe o endereço.";
    if (!form.number.trim()) nextErrors.number = "Informe o numero.";
    if (!form.neighborhood.trim()) nextErrors.neighborhood = "Informe o bairro.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!/^[A-Z]{2}$/.test(form.provinceCode)) nextErrors.provinceCode = "UF inválida.";

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function submitCheckout(event) {
    event.preventDefault();
    setFormError("");

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
        items: items.filter(itemIsPayable),
      };
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.checkoutUrl) {
        throw new Error(data.error || "Não foi possível criar o pagamento.");
      }

      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ia-checkout">
      <section className="ia-left">
        <header className="ia-header">
          <div className="ia-logo">
            <strong>IRON AIR</strong>
            <span>BRASIL</span>
          </div>
          <div className="ia-safe">
            <Lock size={15} />
            Checkout seguro
          </div>
        </header>

        <nav className="ia-breadcrumb" aria-label="Etapas do checkout">
          <span>Carrinho</span>
          <ChevronRight size={17} />
          <strong>Informações</strong>
          <ChevronRight size={17} />
          <span>Pagamento</span>
          <ChevronRight size={17} />
          <span>Revisão</span>
        </nav>

        <form className="ia-form" onSubmit={submitCheckout} noValidate>
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

          <button
            className="ia-submit"
            type="submit"
            disabled={loading || Boolean(itemLoadError) || subtotal <= 0}
          >
            <span>{loading ? "Criando pagamento..." : "Continuar para pagamento"}</span>
            <ArrowRight size={28} />
          </button>

          <div className="ia-protected">
            <ShieldCheck size={18} />
            Seus dados estão protegidos com criptografia de ponta a ponta.
          </div>
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
              <div className="ia-asaas">ASAAS</div>
              <div>
                <strong>Pagar com Asaas</strong>
                <span>Boleto, Pix, Cartão e mais</span>
              </div>
              <i />
            </div>
          </section>

          <div className="ia-benefits">
            <div>
              <Shield size={22} />
              <p>
                <strong>Compra 100% segura</strong>
                <span>Seus dados protegidos</span>
              </p>
            </div>
            <div>
              <ShieldCheck size={22} />
              <p>
                <strong>Pagamento processado pelo Asaas</strong>
                <span>Ambiente criptografado e certificado</span>
              </p>
            </div>
            <div>
              <Truck size={22} />
              <p>
                <strong>Pedido com rastreamento</strong>
                <span>Você receberá atualizações por e-mail e WhatsApp</span>
              </p>
            </div>
            <div>
              <Headphones size={22} />
              <p>
                <strong>Suporte humanizado</strong>
                <span>Atendimento rápido e dedicado</span>
              </p>
            </div>
          </div>
        </div>
      </aside>

      <footer className="ia-footer">
        <div>
          <Truck size={24} />
          <p>
            <strong>Frete grátis</strong>
            <span>Para todo o Brasil</span>
          </p>
        </div>
        <div>
          <ShieldCheck size={24} />
          <p>
            <strong>Enviamos para todo Brasil</strong>
            <span>Com código de rastreio</span>
          </p>
        </div>
        <div>
          <CreditCard size={24} />
          <p>
            <strong>Parcele em até 12x</strong>
            <span>No cartão de crédito</span>
          </p>
        </div>
        <div>
          <Undo2 size={24} />
          <p>
            <strong>7 dias para devolução</strong>
            <span>Ou reembolso total</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
