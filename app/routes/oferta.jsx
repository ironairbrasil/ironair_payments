/* eslint-disable react/prop-types */
import process from "node:process";
import { ArrowRight, Clock3, PackageCheck, ShieldCheck, Sparkles, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useLocation } from "react-router";

import { getIronAirPublicProduct } from "../services/ironair-product.server";
import landingStyles from "../styles/oferta.css?url";

export function links() {
  return [{ rel: "stylesheet", href: landingStyles }];
}

export function meta() {
  return [
    { title: "Iron Air | Suas roupas falam antes de você" },
    { name: "description", content: "Conheça o Iron Air e cuide das suas roupas com mais praticidade no dia a dia." },
    { property: "og:title", content: "Suas roupas falam antes de você." },
    { property: "og:type", content: "product" },
  ];
}

export async function loader() {
  const product = await getIronAirPublicProduct();
  return {
    product,
    payOrigin: process.env.PAYMENTS_PUBLIC_URL || "https://pay.ironair.com.br",
  };
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function OfferLanding({ data }) {
  const loaderData = useLoaderData();
  const { product, payOrigin } = data || loaderData;
  const location = useLocation();
  const firstAvailable = product.variants.find((variant) => variant.available) || product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id || "");
  const selected = product.variants.find((variant) => variant.id === variantId) || firstAvailable;
  useEffect(() => {
    if (!selected) return;
    window.fbq?.("track", "ViewContent", { content_ids: [selected.numericId], content_type: "product", value: selected.price, currency: "BRL" });
    window.gtag?.("event", "view_item", { currency: "BRL", value: selected.price, items: [{ item_id: selected.numericId, item_name: product.title, item_variant: selected.title }] });
  }, [product.title, selected]);
  const checkoutUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.set("variantId", selected?.id || "");
    params.set("productId", String(product.id));
    params.set("title", product.title);
    params.set("variantTitle", selected?.title || "");
    params.set("quantity", "1");
    params.set("price", Number(selected?.price || 0).toFixed(2));
    params.set("image", product.featuredImage || "");
    params.set("source", "offer");
    return `${payOrigin}/?${params.toString()}`;
  }, [location.search, payOrigin, product, selected]);

  function buy(event) {
    if (!selected?.available) event.preventDefault();
    if (typeof window !== "undefined") {
      window.fbq?.("track", "InitiateCheckout", { content_ids: [selected?.numericId], content_type: "product", value: selected?.price, currency: "BRL" });
      window.gtag?.("event", "begin_checkout", { currency: "BRL", value: selected?.price, items: [{ item_id: selected?.numericId, item_name: product.title, item_variant: selected?.title }] });
    }
  }

  const BuyButton = ({ label = "QUERO MEU IRON AIR" }) => (
    <a className={`offer-cta ${selected?.available ? "" : "is-disabled"}`} href={checkoutUrl} onClick={buy} aria-disabled={!selected?.available}>
      {selected?.available ? label : "INDISPONÍVEL NESTA VOLTAGEM"}<ArrowRight size={20} />
    </a>
  );

  return (
    <main className="offer-page">
      <section className="offer-reference-hero" aria-label="Lançamento Iron Air">
        <img
          src="/iron-air-hero-lancamento.png"
          alt="Iron Air: o jeito inteligente de cuidar das suas roupas, sem ferro e sem esforço"
          width="1536"
          height="1024"
          loading="eager"
          fetchPriority="high"
        />
      </section>

      <section className="offer-section problem"><p className="eyebrow">O PROBLEMA NÃO É A ROUPA</p><h2>É o tempo que você perde para deixá-la pronta.</h2><div className="problem-grid">{["Você já está atrasado e percebe a camisa amarrotada.","Ferro e tábua ocupam espaço e exigem atenção o tempo inteiro.","Várias peças transformam uma tarefa simples em mais uma obrigação."].map((text,i)=><article key={text}><b>0{i+1}</b><p>{text}</p></article>)}</div></section>

      <section className="offer-section demo"><div><p className="eyebrow">SIMPLES DE ENTENDER</p><h2>Vista. Ajuste. Ligue. Siga sua rotina.</h2><ol><li><span>1</span>Coloque a roupa levemente úmida.</li><li><span>2</span>Ajuste o balão e prenda a peça.</li><li><span>3</span>Defina tempo e temperatura.</li><li><span>4</span>Deixe o Iron Air trabalhar.</li></ol></div><div className="video-placeholder"><Wind size={48}/><strong>Vídeo demonstrativo</strong><span>Conteúdo oficial a inserir</span></div></section>

      <section className="offer-section"><p className="eyebrow">MAIS PRATICIDADE</p><h2>Feito para uma rotina que não pode parar.</h2><div className="benefit-grid">{[[Clock3,"Menos tempo ativo passando roupa"],[Sparkles,"Ajuda a reduzir amassados"],[Wind,"Mãos livres durante o ciclo"],[PackageCheck,"Compacto e fácil de usar"]].map(([Icon,text])=><article key={text}><Icon/><strong>{text}</strong></article>)}</div></section>

      <section className="offer-section comparison"><p className="eyebrow">ESCOLHA O SEU PROCESSO</p><h2>Ferro + tábua ou Iron Air?</h2><div className="compare-grid"><article><h3>Ferro + tábua</h3><p>Atenção e movimento manual durante toda a tarefa.</p><p>Mais espaço para montar e guardar.</p><p>Você fica preso à peça até terminar.</p></article><article className="highlight"><h3>Iron Air</h3><p>Ajuste a peça e deixe o ciclo trabalhar.</p><p>Estrutura compacta para a rotina.</p><p>Suas mãos ficam livres durante o processo.</p></article></div></section>

      <section className="offer-section proof"><p className="eyebrow">DEMONSTRAÇÃO REAL</p><h2>Veja resultados e experiências de quem usa.</h2><div className="proof-grid"><div>Vídeo / UGC<br/><small>Conteúdo pendente</small></div><div>Depoimentos verificados<br/><small>Conteúdo pendente</small></div><div>Antes e depois<br/><small>Conteúdo pendente</small></div></div></section>

      <section className="offer-section safety"><ShieldCheck size={42}/><div><p className="eyebrow">SEGURANÇA NO USO</p><h2>Proteções descritas na documentação oficial.</h2><p>Desligamento automático após o ciclo, sistema anti-superaquecimento e desligamento em caso de queda.</p><small>Número de certificação regulatória não publicado enquanto não houver documento oficial disponível.</small></div></section>

      <section className="offer-section offer-box" id="comprar"><div><p className="eyebrow">ESCOLHA SUA VOLTAGEM</p><h2>{product.title}</h2><div className="voltage-options">{product.variants.map((variant)=><button key={variant.id} type="button" className={variant.id===selected?.id?"selected":""} disabled={!variant.available} onClick={()=>setVariantId(variant.id)}>{variant.title}<small>{variant.available?"Disponível":"Sem estoque"}</small></button>)}</div><p className="stock-note">Disponibilidade consultada na Shopify. A confirmação final ocorre antes da criação do pagamento.</p></div><div className="price-card">{selected?.compareAtPrice?<del>{money(selected.compareAtPrice)}</del>:null}<strong>{money(selected?.price)}</strong><span>Pagamento via Pix ou cartão. Parcelamento e frete são confirmados no checkout.</span><BuyButton /></div></section>

      <section className="offer-section faq"><p className="eyebrow">PERGUNTAS FREQUENTES</p><h2>Antes de decidir</h2>{[
        ["O Iron Air passa a roupa?","O produto seca e ajuda a reduzir amassados e modelar peças compatíveis. O resultado depende do tecido e do ajuste da roupa."],
        ["Ele gera pressão na roupa?","O balão infla e ajuda a manter a peça esticada durante o fluxo de ar quente."],
        ["Quais peças podem ser usadas?","A documentação oficial cita camisas, camisetas, polos e calças, seguindo as orientações de ajuste e temperatura."],
        ["Quanto tempo leva?","O tempo varia conforme tecido, umidade e peça. Ajuste o ciclo seguindo as instruções do produto."],
        ["Tem 127V e 220V?","Sim. Selecione a voltagem correta antes de continuar para o checkout."],
        ["Qual é a garantia?","A condição e o prazo comercial precisam ser confirmados pela Iron Air antes da publicação de uma resposta definitiva."],
        ["Como funciona o envio?","O CEP e as opções disponíveis são consultados no checkout."],
        ["É seguro?","Use a tensão correta e siga o manual. O produto possui as proteções descritas na seção de segurança acima."],
      ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>

      <section className="final-cta"><h2>Sua roupa pronta para falar por você.</h2><p>Escolha a voltagem e finalize sua compra no checkout oficial Iron Air.</p><BuyButton /></section>
      <footer>© 2026 Iron Air Brasil · Checkout processado com segurança</footer>
    </main>
  );
}
