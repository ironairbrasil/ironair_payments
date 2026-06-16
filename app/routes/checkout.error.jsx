export default function CheckoutError() {
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
          Checkout interrompido
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0 }}>
          O pagamento nao foi concluido. Voce pode iniciar um novo checkout
          quando quiser.
        </p>
      </section>
    </main>
  );
}
