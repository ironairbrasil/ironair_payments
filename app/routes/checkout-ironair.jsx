import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";

function numberFromParam(value, fallback = 0) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function cleanVariantId(variantId) {
  return String(variantId || "").trim();
}

function handleFromTitle(title) {
  return String(title || "iron-air")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "iron-air";
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const variantId = cleanVariantId(url.searchParams.get("variantId"));
  const quantity = Math.max(1, Math.floor(numberFromParam(url.searchParams.get("quantity"), 1)));
  const price = numberFromParam(url.searchParams.get("price"), 0);

  return Response.json({
    variantId,
    quantity,
    title: url.searchParams.get("title") || "Iron Air",
    image: url.searchParams.get("image") || "",
    productHandle:
      url.searchParams.get("productHandle") ||
      url.searchParams.get("handle") ||
      handleFromTitle(url.searchParams.get("title") || "Iron Air"),
    price,
  });
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || parts[0] || "",
  };
}

function buildCheckoutPayload(product, form) {
  const name = form.get("name");
  const email = form.get("email");
  const cpfCnpj = form.get("cpfCnpj");
  const phone = form.get("phone");
  const postalCode = form.get("postalCode");
  const address1 = form.get("address1");
  const addressNumber = form.get("addressNumber");
  const address2 = form.get("address2");
  const neighborhood = form.get("neighborhood");
  const city = form.get("city");
  const province = form.get("province");
  const quantity = Math.max(1, Number(product.quantity) || 1);
  const price = Number(product.price || 0);
  const total = Number((price * quantity).toFixed(2));
  const { firstName, lastName } = splitName(name);

  return {
    name,
    email,
    cpfCnpj,
    phone,
    value: total,
    externalReference: `ironair-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: "checkout-ironair",
    customer: {
      name,
      email,
      cpfCnpj,
      phone,
    },
    shippingAddress: {
      firstName,
      lastName,
      address1: `${address1}, ${addressNumber}`,
      address2: [address2, neighborhood].filter(Boolean).join(" - "),
      city,
      province,
      zip: postalCode,
      country: "BR",
      phone,
    },
    items: [
      {
        variantGid: product.variantId,
        quantity,
        title: product.title,
        productHandle: product.productHandle,
        price,
        linePrice: total,
        image: product.image,
      },
    ],
  };
}

export default function CheckoutIronAir() {
  const product = useLoaderData();
  const [status, setStatus] = useState({ loading: false, error: "" });
  const total = useMemo(
    () => Number((Number(product.price || 0) * Number(product.quantity || 1)).toFixed(2)),
    [product.price, product.quantity],
  );
  const canCheckout = product.variantId && product.price > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canCheckout || status.loading) return;

    setStatus({ loading: true, error: "" });

    try {
      const payload = buildCheckoutPayload(
        { ...product, price: Number(product.price), quantity: Number(product.quantity) },
        new FormData(event.currentTarget),
      );
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Nao foi possivel iniciar o pagamento.");
      }

      const paymentUrl = data.paymentUrl || data.checkoutUrl;
      if (!paymentUrl) {
        throw new Error("Checkout sem URL de pagamento.");
      }

      window.location.href = paymentUrl;
    } catch (error) {
      setStatus({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel iniciar o pagamento.",
      });
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.brand}>Iron Air Brasil</div>
        <div style={styles.grid}>
          <section style={styles.summary}>
            {product.image ? (
              <img src={product.image} alt={product.title} style={styles.image} />
            ) : null}
            <div>
              <h1 style={styles.title}>Finalize sua compra</h1>
              <p style={styles.subtitle}>Confira o produto e preencha seus dados.</p>
            </div>
            <div style={styles.productLine}>
              <div>
                <strong>{product.title}</strong>
                <span style={styles.muted}>Quantidade: {product.quantity}</span>
              </div>
              <strong>{currency(total)}</strong>
            </div>
            <div style={styles.variant}>{product.variantId || "Variante nao informada"}</div>
          </section>

          <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.formHeader}>
              <h2 style={styles.formTitle}>Dados para pagamento</h2>
              <p style={styles.muted}>O Asaas abre somente depois desta etapa.</p>
            </div>

            {!canCheckout ? (
              <div style={styles.error}>
                Produto invalido. Volte para a loja e clique em Comprar agora novamente.
              </div>
            ) : null}

            <div style={styles.fields}>
              <label style={styles.label}>
                Nome completo
                <input style={styles.input} name="name" required autoComplete="name" />
              </label>
              <label style={styles.label}>
                Email
                <input style={styles.input} type="email" name="email" required autoComplete="email" />
              </label>
              <label style={styles.label}>
                CPF
                <input style={styles.input} name="cpfCnpj" required inputMode="numeric" autoComplete="off" />
              </label>
              <label style={styles.label}>
                Telefone
                <input style={styles.input} name="phone" required inputMode="tel" autoComplete="tel" />
              </label>
              <label style={styles.label}>
                CEP
                <input style={styles.input} name="postalCode" required inputMode="numeric" autoComplete="postal-code" />
              </label>
              <label style={styles.label}>
                Endereco
                <input style={styles.input} name="address1" required autoComplete="address-line1" />
              </label>
              <label style={styles.label}>
                Numero
                <input style={styles.input} name="addressNumber" required autoComplete="address-line2" />
              </label>
              <label style={styles.label}>
                Complemento
                <input style={styles.input} name="address2" autoComplete="address-line2" />
              </label>
              <label style={styles.label}>
                Bairro
                <input style={styles.input} name="neighborhood" required />
              </label>
              <label style={styles.label}>
                Cidade
                <input style={styles.input} name="city" required autoComplete="address-level2" />
              </label>
              <label style={styles.label}>
                Estado
                <input style={styles.input} name="province" required maxLength={2} autoComplete="address-level1" />
              </label>
            </div>

            {status.error ? <div style={styles.error}>{status.error}</div> : null}

            <button style={styles.button} type="submit" disabled={!canCheckout || status.loading}>
              {status.loading ? "Criando pagamento..." : "Continuar para pagamento"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f6f2",
    color: "#151515",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "28px 16px",
  },
  shell: {
    width: "min(1120px, 100%)",
    margin: "0 auto",
  },
  brand: {
    color: "#0f4f4a",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0,
    marginBottom: 18,
    textTransform: "uppercase",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 20,
    alignItems: "start",
  },
  summary: {
    background: "#ffffff",
    border: "1px solid #e5e2d8",
    borderRadius: 8,
    padding: 20,
    display: "grid",
    gap: 18,
  },
  image: {
    width: "100%",
    aspectRatio: "1 / 1",
    objectFit: "contain",
    background: "#f3f5f4",
    borderRadius: 6,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#666",
    fontSize: 16,
    lineHeight: 1.45,
  },
  productLine: {
    borderTop: "1px solid #ebe8df",
    paddingTop: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    fontSize: 18,
  },
  variant: {
    color: "#667",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  form: {
    background: "#ffffff",
    border: "1px solid #e5e2d8",
    borderRadius: 8,
    padding: 20,
    display: "grid",
    gap: 18,
  },
  formHeader: {
    display: "grid",
    gap: 4,
  },
  formTitle: {
    margin: 0,
    fontSize: 22,
  },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
    color: "#363636",
    fontSize: 13,
    fontWeight: 800,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d7d2c6",
    borderRadius: 6,
    padding: "13px 12px",
    font: "inherit",
    fontSize: 15,
    outlineColor: "#0f4f4a",
  },
  button: {
    border: 0,
    borderRadius: 6,
    padding: "15px 18px",
    background: "#0f4f4a",
    color: "#ffffff",
    font: "inherit",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  error: {
    border: "1px solid #f2b6b6",
    background: "#fff5f5",
    color: "#9b1c1c",
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    fontWeight: 800,
  },
  muted: {
    display: "block",
    color: "#666",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
  },
};
