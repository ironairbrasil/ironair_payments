export default function CheckoutSuccess() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f7f7f5",
        color: "#151515",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 32, margin: "0 0 12px" }}>
          Pagamento recebido
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0 }}>
          Seu pagamento foi enviado para processamento. Assim que o Asaas
          confirmar, o pedido sera liberado na Shopify.
        </p>
      </section>
    </main>
  );
}
