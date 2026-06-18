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
  title: "Borrifador de Agua Pressurizado",
  quantity: 1,
  price: 79,
  compareAtPrice: null,
  image: "",
};

export function links() {
  return [{ rel: "stylesheet", href: checkoutStyles }];
}

function parseCurrency(value, fallback = 0) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function parseItems(searchParams) {
  const encodedItems = searchParams.get("items");

  if (encodedItems) {
    try {
      const parsedItems = JSON.parse(encodedItems);

      if (Array.isArray(parsedItems) && parsedItems.length) {
        return parsedItems;
      }
    } catch {
      // Fallback to single-item query params below.
    }
  }

  return [
    {
      variantId: searchParams.get("variantId") || DEFAULT_ITEM.variantId,
      productId: searchParams.get("productId") || "",
      title: searchParams.get("title") || DEFAULT_ITEM.title,
      quantity: Math.max(1, Number(searchParams.get("quantity")) || 1),
      price: parseCurrency(searchParams.get("price"), DEFAULT_ITEM.price),
      compareAtPrice: searchParams.get("compareAtPrice")
        ? parseCurrency(searchParams.get("compareAtPrice"))
        : null,
      image: searchParams.get("image") || DEFAULT_ITEM.image,
    },
  ];
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const items = parseItems(url.searchParams);

  return {
    items,
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
  const { items, externalReference } = useLoaderData();
  const [form, setForm] = useState({
    email: "",
    name: "",
    cpfCnpj: "",
    phone: "",
    postalCode: "",
    address1: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    provinceCode: "SP",
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
      setErrors((current) => ({ ...current, postalCode: "Informe um CEP valido." }));
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
        postalCode: "Nao foi possivel buscar o CEP.",
      }));
    } finally {
      setCepLoading(false);
    }
  }

  function validateForm() {
    const nextErrors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = "Informe um e-mail valido.";
    }
    if (!form.name.trim()) nextErrors.name = "Informe seu nome completo.";
    if (onlyDigits(form.cpfCnpj).length !== 11) nextErrors.cpfCnpj = "CPF invalido.";
    if (onlyDigits(form.phone).length < 10) nextErrors.phone = "Telefone invalido.";
    if (onlyDigits(form.postalCode).length !== 8) nextErrors.postalCode = "CEP invalido.";
    if (!form.address1.trim()) nextErrors.address1 = "Informe o endereco.";
    if (!form.number.trim()) nextErrors.number = "Informe o numero.";
    if (!form.neighborhood.trim()) nextErrors.neighborhood = "Informe o bairro.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!/^[A-Z]{2}$/.test(form.provinceCode)) nextErrors.provinceCode = "UF invalida.";

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function submitCheckout(event) {
    event.preventDefault();
    setFormError("");

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
        items,
      };
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.checkoutUrl) {
        throw new Error(data.error || "Nao foi possivel criar o pagamento.");
      }

      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const primaryItem = items[0] || DEFAULT_ITEM;

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
          <strong>Informacoes</strong>
          <ChevronRight size={17} />
          <span>Pagamento</span>
          <ChevronRight size={17} />
          <span>Revisao</span>
        </nav>

        <form className="ia-form" onSubmit={submitCheckout} noValidate>
          <section className="ia-section">
            <h1>Contato</h1>
            <p>Informe seu e-mail para receber atualizacoes do pedido.</p>
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
            <label className="ia-check">
              <input
                checked={form.newsletter}
                type="checkbox"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    newsletter: event.target.checked,
                  }))
                }
              />
              <span>Quero receber novidades e ofertas da Iron Air Brasil</span>
            </label>
          </section>

          <section className="ia-section">
            <h2>Dados pessoais</h2>
            <p>Precisamos dessas informacoes para emitir sua nota fiscal.</p>
            <div className="ia-grid two">
              <Field
                label="Nome completo"
                name="name"
                value={form.name}
                onChange={updateField}
                error={errors.name}
              />
              <Field
                label="CPF"
                name="cpfCnpj"
                value={form.cpfCnpj}
                onChange={updateField}
                error={errors.cpfCnpj}
                inputMode="numeric"
              />
            </div>
            <Field
              label="Telefone / WhatsApp"
              name="phone"
              value={form.phone}
              onChange={updateField}
              error={errors.phone}
              inputMode="tel"
            />
          </section>

          <section className="ia-section">
            <h2>Endereco de entrega</h2>
            <p>Enviaremos para o endereco abaixo.</p>
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
                label="Endereco"
                name="address1"
                value={form.address1}
                onChange={updateField}
                error={errors.address1}
              />
            </div>
            <div className="ia-grid two compact">
              <Field
                label="Numero"
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
              <span>Salvar endereco para proximas compras</span>
            </label>
          </section>

          {formError ? <div className="ia-error">{formError}</div> : null}

          <button className="ia-submit" type="submit" disabled={loading}>
            <span>{loading ? "Criando pagamento..." : "Continuar para pagamento"}</span>
            <ArrowRight size={28} />
          </button>

          <div className="ia-protected">
            <ShieldCheck size={18} />
            Seus dados estao protegidos com criptografia de ponta a ponta.
          </div>
        </form>
      </section>

      <aside className="ia-right">
        <div className="ia-summary">
          <div className="ia-product">
            <div className="ia-thumb">
              {primaryItem.image ? (
                <img src={primaryItem.image} alt={primaryItem.title} />
              ) : (
                <span>IRON AIR</span>
              )}
              <b>{primaryItem.quantity || 1}</b>
            </div>
            <p>{primaryItem.title}</p>
            <strong>{formatMoney((Number(primaryItem.price) || 0) * (primaryItem.quantity || 1))}</strong>
          </div>

          <div className="ia-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
            </div>
            <div>
              <span>Frete</span>
              <strong className="muted">Gratis</strong>
            </div>
          </div>

          <div className="ia-total">
            <span>Total</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>

          <section className="ia-payment">
            <h3>Metodo de pagamento</h3>
            <div className="ia-payment-card">
              <div className="ia-asaas">ASAAS</div>
              <div>
                <strong>Pagar com Asaas</strong>
                <span>Boleto, Pix, Cartao e mais</span>
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
                <span>Voce recebera atualizacoes por e-mail e WhatsApp</span>
              </p>
            </div>
            <div>
              <Headphones size={22} />
              <p>
                <strong>Suporte humanizado</strong>
                <span>Atendimento rapido e dedicado</span>
              </p>
            </div>
          </div>
        </div>
      </aside>

      <footer className="ia-footer">
        <div>
          <Truck size={24} />
          <p>
            <strong>Frete gratis</strong>
            <span>Para todo o Brasil</span>
          </p>
        </div>
        <div>
          <ShieldCheck size={24} />
          <p>
            <strong>Enviamos para todo Brasil</strong>
            <span>Com codigo de rastreio</span>
          </p>
        </div>
        <div>
          <CreditCard size={24} />
          <p>
            <strong>Parcele em ate 12x</strong>
            <span>No cartao de credito</span>
          </p>
        </div>
        <div>
          <Undo2 size={24} />
          <p>
            <strong>7 dias para devolucao</strong>
            <span>Ou reembolso total</span>
          </p>
        </div>
      </footer>
    </main>
  );
}
