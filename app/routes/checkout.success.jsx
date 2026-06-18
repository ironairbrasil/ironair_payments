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
      <section
        style={{
          width: "100%",
          maxWidth: 560,
          border: "1px solid #dedede",
          borderRadius: 8,
          background: "#fff",
          padding: 32,
        }}
      >
        <img
          src="/Iron-Air-Logo.webp"
          alt="Iron Air Brasil"
          style={{ width: 180, height: "auto", display: "block", marginBottom: 28 }}
        />
        <div
          style={{
            width: 48,
            height: 48,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            background: "#0f7a3a",
            color: "#fff",
            fontSize: 28,
            fontWeight: 800,
            marginBottom: 18,
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 30, margin: "0 0 12px" }}>Pagamento confirmado</h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0, color: "#555" }}>
          Recebemos seu pagamento. Seu pedido foi criado e você receberá as
          atualizações por e-mail e WhatsApp.
        </p>
        <a
          href="https://ironair.com.br"
          style={{
            height: 48,
            marginTop: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 22px",
            borderRadius: 5,
            background: "#050505",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Voltar para a loja
        </a>
      </section>
    </main>
  );
}
