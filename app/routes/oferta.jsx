/* eslint-disable react/prop-types */
import process from "node:process";
import {
  ArrowRight,
  BicepsFlexed,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock3,
  Coffee,
  Flame,
  Footprints,
  Handshake,
  MousePointerClick,
  PackageCheck,
  Power,
  ShieldCheck,
  Shirt,
  Table2,
  TriangleAlert,
  UserRound,
  Wind,
  Leaf,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData, useLocation } from "react-router";

import { getIronAirPublicProduct } from "../services/ironair-product.server";
import landingStyles from "../styles/oferta.css?url";

export function links() {
  return [
    { rel: "stylesheet", href: landingStyles },
    {
      rel: "preload",
      as: "image",
      href: "/images/optimized/hero-background-768.avif",
      media: "(max-width: 800px)",
      fetchPriority: "high",
    },
    {
      rel: "preload",
      as: "image",
      href: "/images/optimized/hero-background-1536.avif",
      media: "(min-width: 801px)",
      fetchPriority: "high",
    },
    {
      rel: "preload",
      as: "image",
      href: "/images/optimized/iron-air-shirt-500.avif",
      media: "(max-width: 800px)",
      fetchPriority: "high",
    },
    {
      rel: "preload",
      as: "image",
      href: "/images/optimized/iron-air-shirt-1000.avif",
      media: "(min-width: 801px)",
      fetchPriority: "high",
    },
  ];
}

export function meta() {
  return [
    { title: "Iron Air | Suas roupas falam antes de você" },
    {
      name: "description",
      content:
        "Conheça o Iron Air e cuide das suas roupas com mais praticidade no dia a dia.",
    },
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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

const HERO_PRODUCTS = [
  {
    key: "shirt",
    image: "iron-air-shirt",
    label: "Iron Air com camisa",
  },
  {
    key: "pants",
    image: "iron-air-pants",
    label: "Iron Air com calça",
  },
  {
    key: "shoes",
    image: "iron-air-shoes",
    label: "Iron Air com sapatos",
  },
];

const ACTION_VIDEOS = [
  [
    "https://ironair.com.br/cdn/shop/videos/c/vp/83f5e912327d4d5c96a5956f59631dd8/83f5e912327d4d5c96a5956f59631dd8.HD-1080p-7.2Mbps-86083940.mp4?v=0",
    "https://ironair.com.br/cdn/shop/files/preview_images/83f5e912327d4d5c96a5956f59631dd8.thumbnail.0000000000_900x.jpg?v=1781016560",
  ],
  [
    "https://ironair.com.br/cdn/shop/videos/c/vp/384e7866bf164d0b9bfd70ffebb1860e/384e7866bf164d0b9bfd70ffebb1860e.HD-1080p-7.2Mbps-86101814.mp4?v=0",
    "https://ironair.com.br/cdn/shop/files/preview_images/384e7866bf164d0b9bfd70ffebb1860e.thumbnail.0000000000_900x.jpg?v=1781025408",
  ],
  [
    "https://ironair.com.br/cdn/shop/videos/c/vp/7ff27a4600da444ebdf0dd16f8c7f4fe/7ff27a4600da444ebdf0dd16f8c7f4fe.HD-1080p-7.2Mbps-86101815.mp4?v=0",
    "https://ironair.com.br/cdn/shop/files/preview_images/WJq89ZZBEF11g-YXsn-wP_loTTd3ZB_00001_900x.jpg?v=1784224691",
  ],
  [
    "https://ironair.com.br/cdn/shop/videos/c/vp/3dc19aa84ff5477793699b1b0975a120/3dc19aa84ff5477793699b1b0975a120.HD-1080p-7.2Mbps-89131270.mp4?v=0",
    "https://ironair.com.br/cdn/shop/files/preview_images/3dc19aa84ff5477793699b1b0975a120.thumbnail.0000000000_900x.jpg?v=1784224396",
  ],
  [
    "https://ironair.com.br/cdn/shop/videos/c/vp/1fdd648d46654f7b932d323c7aa84e6d/1fdd648d46654f7b932d323c7aa84e6d.HD-1080p-7.2Mbps-89130546.mp4?v=0",
    "https://ironair.com.br/cdn/shop/files/preview_images/mulher_image_900x.png?v=1784224163",
  ],
];

const SIDE_BY_SIDE_ROWS = [
  [Table2, "Tábua", "Necessária", "Não usa"],
  [UserRound, "Quem faz o trabalho", "Você", "O aparelho"],
  [Clock3, "Sua presença", "O tempo todo", "Só para colocar e retirar"],
  [
    Shirt,
    "Como passa",
    "Parte por parte",
    <>
      A peça inteira
      <br />
      com fluxo de ar
    </>,
  ],
  [Flame, "Risco de queimar a roupa", "Pode acontecer", "Sem riscos"],
  [
    TriangleAlert,
    "Risco de acidente por contato",
    <>
      Superfície
      <br />
      extremamente quente
    </>,
    "Sem riscos",
  ],
  [
    Power,
    "Esquecer ligado",
    "Exige atenção",
    <>
      Timer + desligamento
      <br />
      automático
    </>,
  ],
  [
    BicepsFlexed,
    "Esforço físico",
    "Movimento repetitivo",
    <>
      O aparelho faz
      <br />o trabalho
    </>,
  ],
  [Coffee, "Enquanto funciona", "Você passa a roupa", "Você faz outra coisa"],
  [
    Leaf,
    "Energia",
    <>
      Depende do tempo
      <br />
      de uso
    </>,
    <>
      Ciclo programado
      <br />
      por timer
    </>,
  ],
];

const COMPARISON_CONFIG = {
  weeksPerYear: 52,
  traditionalIron: {
    activeMinutesPerItem: 8, // Estimativa editável; não é uma medição científica.
    powerWatts: 1200, // Referência editável para o ferro usado na comparação.
  },
  ironAir: {
    cycleMinutesPerItem: 9, // Ponto médio configurável da faixa pública de 6–12 min.
    activeSetupMinutesPerItem: 1.5, // Estimativa editável de posicionamento e retirada.
    powerWattsByVoltage: { "127V": 1250, "220V": 1400 },
  },
};

const OFFER_TERMS = {
  pixDiscount: 0.1,
  installments: 12,
  rating: 4.8,
  reviewCount: 4,
};

function PaymentMethods({ compact = false }) {
  return (
    <div
      className={`payment-methods ${compact ? "is-compact" : ""}`}
      aria-label="Meios de pagamento aceitos"
    >
      <span className="payment-label">Pagamento seguro</span>
      <span className="payment-brand visa">VISA</span>
      <span className="payment-brand mastercard" aria-label="Mastercard">
        <i />
        <i />
      </span>
      <span className="payment-brand hipercard">Hipercard</span>
      <span className="payment-brand elo">elo</span>
      <span className="payment-brand pix">
        <i /> PIX
      </span>
    </div>
  );
}

function SocialIcon({ name }) {
  if (name === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.7" r="1" className="social-fill" />
      </svg>
    );
  }
  if (name === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14.3 21v-8h2.8l.4-3.1h-3.2V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H8v3.1h2.9v8h3.4Z"
          className="social-fill"
        />
      </svg>
    );
  }
  if (name === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 8.1a3 3 0 0 0-2.1-2.2C17 5.4 12 5.4 12 5.4s-5 0-6.9.5A3 3 0 0 0 3 8.1 31 31 0 0 0 2.5 12 31 31 0 0 0 3 15.9a3 3 0 0 0 2.1 2.2c1.9.5 6.9.5 6.9.5s5 0 6.9-.5a3 3 0 0 0 2.1-2.2c.5-1.3.5-3.9.5-3.9s0-2.6-.5-3.9Z" />
        <path d="m10 15.2 5.2-3.2L10 8.8v6.4Z" className="social-fill" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.4 3c.3 2.2 1.6 3.6 3.6 3.8v3.1a8.4 8.4 0 0 1-3.6-.9v6.2a5.8 5.8 0 1 1-5-5.7v3.2a2.7 2.7 0 1 0 1.8 2.5V3h3.2Z"
        className="social-fill"
      />
    </svg>
  );
}

function OptimizedImage({
  name,
  alt,
  widths,
  sizes,
  width,
  height,
  className,
  style,
  classOnImage = false,
  loading = "lazy",
  fetchPriority = "auto",
}) {
  const largest = widths[widths.length - 1];
  const srcSet = (format) =>
    widths
      .map(
        (sourceWidth) =>
          `/images/optimized/${name}-${sourceWidth}.${format} ${sourceWidth}w`,
      )
      .join(", ");
  return (
    <picture
      className={classOnImage ? undefined : className}
      style={classOnImage ? undefined : style}
    >
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet("webp")} sizes={sizes} />
      <img
        className={classOnImage ? className : undefined}
        style={classOnImage ? style : undefined}
        src={`/images/optimized/${name}-${largest}.webp`}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}

function AnimatedNumber({ value, digits = 0 }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    const started = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min((now - started) / 360, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      {display.toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </>
  );
}

export default function OfferLanding({ data }) {
  const loaderData = useLoaderData();
  const { product, payOrigin } = data || loaderData;
  const location = useLocation();
  const firstAvailable =
    product.variants.find((variant) => variant.available) ||
    product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id || "");
  const [heroSlide, setHeroSlide] = useState(0);
  const [weeklyItems, setWeeklyItems] = useState(10);
  const [comparisonPeriod, setComparisonPeriod] = useState("year");
  const [activeActionVideo, setActiveActionVideo] = useState(0);
  const [actionVideosReady, setActionVideosReady] = useState(false);
  const galleryImages = product.images?.length
    ? product.images
    : [product.featuredImage].filter(Boolean);
  const [purchaseImage, setPurchaseImage] = useState(
    product.featuredImage ||
      galleryImages[0] ||
      "/images/hero/iron-air-shirt.png",
  );
  const discoveryCarousel = useRef(null);
  const actionVideosCarousel = useRef(null);
  const actionVideosSection = useRef(null);
  const selected =
    product.variants.find((variant) => variant.id === variantId) ||
    firstAvailable;
  const pixPrice = Number(selected?.price || 0) * (1 - OFFER_TERMS.pixDiscount);
  const installmentPrice =
    Number(selected?.price || 0) / OFFER_TERMS.installments;
  const periodMultiplier =
    comparisonPeriod === "year" ? COMPARISON_CONFIG.weeksPerYear : 1;
  const traditionalMinutes =
    weeklyItems *
    COMPARISON_CONFIG.traditionalIron.activeMinutesPerItem *
    periodMultiplier;
  const ironAirCycleMinutes =
    weeklyItems *
    COMPARISON_CONFIG.ironAir.cycleMinutesPerItem *
    periodMultiplier;
  const ironAirActiveMinutes =
    weeklyItems *
    COMPARISON_CONFIG.ironAir.activeSetupMinutesPerItem *
    periodMultiplier;
  const ironAirWatts =
    COMPARISON_CONFIG.ironAir.powerWattsByVoltage[selected?.title] || 1250;
  const traditionalEnergy =
    (COMPARISON_CONFIG.traditionalIron.powerWatts / 1000) *
    (traditionalMinutes / 60);
  const ironAirEnergy = (ironAirWatts / 1000) * (ironAirCycleMinutes / 60);
  const annualRecoveredHours =
    (weeklyItems *
      (COMPARISON_CONFIG.traditionalIron.activeMinutesPerItem -
        COMPARISON_CONFIG.ironAir.activeSetupMinutesPerItem) *
      COMPARISON_CONFIG.weeksPerYear) /
    60;
  const periodRecoveredHours =
    comparisonPeriod === "year"
      ? annualRecoveredHours
      : annualRecoveredHours / COMPARISON_CONFIG.weeksPerYear;
  useEffect(() => {
    if (!selected) return;
    window.fbq?.("track", "ViewContent", {
      content_ids: [selected.numericId],
      content_type: "product",
      value: selected.price,
      currency: "BRL",
    });
    window.gtag?.("event", "view_item", {
      currency: "BRL",
      value: selected.price,
      items: [
        {
          item_id: selected.numericId,
          item_name: product.title,
          item_variant: selected.title,
        },
      ],
    });
  }, [product.title, selected]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setHeroSlide((current) => (current + 1) % HERO_PRODUCTS.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const section = actionVideosSection.current;
    if (!section) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setActionVideosReady(true);
        observer.disconnect();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const track = actionVideosCarousel.current;
    if (!track || !actionVideosReady) return undefined;
    let scrollTimer;

    const syncVideos = () => {
      const cards = Array.from(track.querySelectorAll("article"));
      const trackRect = track.getBoundingClientRect();
      const trackCenter = trackRect.left + trackRect.width / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;

      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveActionVideo(closestIndex);
      cards.forEach((card, index) => {
        const video = card.querySelector("video");
        if (!video) return;
        card.classList.toggle("is-active", index === closestIndex);
        if (index === closestIndex) {
          video.muted = true;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    };

    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(syncVideos, 80);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncVideos);
    const initialTimer = window.setTimeout(syncVideos, 100);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearTimeout(scrollTimer);
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncVideos);
      track.querySelectorAll("video").forEach((video) => video.pause());
    };
  }, [actionVideosReady]);

  function moveHero(direction) {
    setHeroSlide(
      (current) =>
        (current + direction + HERO_PRODUCTS.length) % HERO_PRODUCTS.length,
    );
  }
  function moveDiscovery(direction) {
    discoveryCarousel.current?.scrollBy({
      left: direction * Math.min(window.innerWidth * 0.72, 520),
      behavior: "smooth",
    });
  }
  function moveActionVideos(direction) {
    const track = actionVideosCarousel.current;
    if (!track) return;
    const cards = Array.from(track.querySelectorAll("article"));
    const nextIndex = Math.max(
      0,
      Math.min(activeActionVideo + direction, cards.length - 1),
    );
    const card = cards[nextIndex];
    if (!card) return;
    const targetLeft =
      card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    track.scrollTo({ left: targetLeft, behavior: "smooth" });
  }
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
      window.fbq?.("track", "InitiateCheckout", {
        content_ids: [selected?.numericId],
        content_type: "product",
        value: selected?.price,
        currency: "BRL",
      });
      window.gtag?.("event", "begin_checkout", {
        currency: "BRL",
        value: selected?.price,
        items: [
          {
            item_id: selected?.numericId,
            item_name: product.title,
            item_variant: selected?.title,
          },
        ],
      });
    }
  }

  function goToPurchase(event) {
    event.preventDefault();
    document.querySelector("#comprar")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const BuyButton = ({ label = "QUERO MEU IRON AIR", checkout = false }) => (
    <a
      className={`offer-cta ${checkout ? "is-checkout" : ""} ${checkout && !selected?.available ? "is-disabled" : ""}`}
      href={checkout ? checkoutUrl : "#comprar"}
      onClick={checkout ? buy : goToPurchase}
      aria-disabled={checkout && !selected?.available}
    >
      {checkout && !selected?.available ? "INDISPONÍVEL NESTA VOLTAGEM" : label}
      <ArrowRight size={20} />
    </a>
  );

  return (
    <main className="offer-page">
      <header className="promo-bar">
        Frete grátis para todo Brasil. Use o cupom <strong>PIX10</strong> para
        10% OFF
      </header>
      <section className="launch-hero" aria-labelledby="launch-title">
        <div className="launch-copy">
          <span>LANÇAMENTO</span>
          <h1 id="launch-title">
            <OptimizedImage
              className="launch-logo"
              name="iron-air-logo"
              alt="Iron Air"
              widths={[400, 800]}
              sizes="(max-width: 800px) 252px, 434px"
              width={2172}
              height={724}
              loading="eager"
            />
          </h1>
          <p>O jeito de passar roupas acaba de mudar.</p>
          <strong>Sem ferro. Sem esforço. Mais tempo para você.</strong>
        </div>
        <div className="launch-products" aria-live="polite">
          {HERO_PRODUCTS.map((item, index) => {
            const offset =
              (index - heroSlide + HERO_PRODUCTS.length) % HERO_PRODUCTS.length;
            const position =
              offset === 0 ? "active" : offset === 1 ? "next" : "prev";
            const left =
              position === "active"
                ? "50%"
                : position === "next"
                  ? "calc(50% + var(--carousel-gap))"
                  : "calc(50% - var(--carousel-gap))";
            const scale = position === "active" ? 1 : 0.72;
            return (
              <OptimizedImage
                key={item.key}
                className={`launch-product launch-product-${item.key} is-${position}`}
                classOnImage
                style={{ left, transform: `translateX(-50%) scale(${scale})` }}
                name={item.image}
                alt={position === "active" ? item.label : ""}
                widths={[500, 1000]}
                sizes="(max-width: 800px) 62vw, 500px"
                width={1000}
                height={1000}
                loading={item.key === "shirt" ? "eager" : "lazy"}
                fetchPriority={item.key === "shirt" ? "high" : "low"}
              />
            );
          })}
          <button
            className="launch-arrow launch-arrow-prev"
            type="button"
            aria-label="Produto anterior"
            onClick={() => moveHero(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="launch-arrow launch-arrow-next"
            type="button"
            aria-label="Próximo produto"
            onClick={() => moveHero(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      <section className="launch-features" aria-label="Destaques do Iron Air">
        <article>
          <Wind />
          <div>
            <strong>
              TECNOLOGIA DE
              <br />
              FLUXO DE AR
            </strong>
            <p>
              Secagem uniforme
              <br />
              sem amassar
            </p>
          </div>
        </article>
        <article>
          <MousePointerClick />
          <div>
            <strong>
              PAINEL TOUCH
              <br />
              INTUITIVO
            </strong>
            <p>
              Controle fácil de
              <br />
              tempo e temperatura
            </p>
          </div>
        </article>
        <article>
          <Shirt />
          <div>
            <strong>CAMISAS E CAMISETAS</strong>
            <p>
              Do P ao XXG com
              <br />
              ajuste perfeito
            </p>
          </div>
        </article>
        <article>
          <PackageCheck />
          <div>
            <strong>
              CALÇAS PRONTAS
              <br />
              EM MINUTOS
            </strong>
            <p>
              Sem esforço,
              <br />
              sem ferro
            </p>
          </div>
        </article>
        <article>
          <Footprints />
          <div>
            <strong>
              SAPATOS SEM
              <br />
              MAU CHEIRO
            </strong>
            <p>
              Ar quente remove
              <br />a umidade
            </p>
          </div>
        </article>
      </section>

      <section className="offer-section problem discovery">
        <h2>Conheça o Iron Air.</h2>
        <p>
          A tecnologia que seca e alisa suas roupas automaticamente enquanto
          você aproveita seu tempo com o que realmente importa.
        </p>
        <div className="discovery-carousel" ref={discoveryCarousel}>
          {[
            ["iron-air-what-is", "O que é o Iron Air", 1086, 1448],
            ["iron-air-world", "Iron Air já conquistou o mundo", 1054, 1492],
            [
              "iron-air-time",
              "Faça mais enquanto o Iron Air trabalha",
              1054,
              1492,
            ],
            [
              "iron-air-technology",
              "Uma nova forma de passar roupas com Iron Air",
              1054,
              1492,
            ],
            ["iron-air-moments", "Troque tarefas por momentos", 1086, 1448],
            [
              "iron-air-safety",
              "Simples de usar e tranquilo de deixar usar",
              1086,
              1448,
            ],
            ["iron-air-versatility", "Iron Air 5 em 1", 1024, 1536],
          ].map(([name, alt, width, height], index) => (
            <article key={`${name}-${index}`}>
              <OptimizedImage
                name={name}
                alt={alt}
                widths={[360, 720]}
                sizes="(max-width: 800px) 78vw, 390px"
                width={width}
                height={height}
              />
            </article>
          ))}
        </div>
        <div className="discovery-controls">
          <button
            type="button"
            aria-label="Card anterior"
            onClick={() => moveDiscovery(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            aria-label="Próximo card"
            onClick={() => moveDiscovery(1)}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </section>

      <section className="first-impression-story">
        <p className="story-kicker">
          <span />
          ANTES DE QUALQUER PALAVRA
          <span />
        </p>
        <h2>
          Antes de ouvirem você,
          <br />
          eles já <em>viram</em> você.
        </h2>
        <div className="story-copy">
          <p>
            Você pode estar preparado para a reunião.
            <br />
            Ter a melhor proposta. A experiência certa. A resposta certa.
          </p>
          <strong>Mas a primeira impressão acontece antes de tudo isso.</strong>
          <p>
            Uma camisa amarrotada não define sua competência.
            <br />
            Mas pode transmitir desleixo justamente quando você
            <br />
            precisa transmitir confiança.
          </p>
        </div>
        <h3>NÃO DEIXE SUA ROUPA FALAR POR VOCÊ.</h3>
        <div className="story-scenarios">
          {[
            [UserRound, "ENTREVISTA"],
            [CalendarDays, "REUNIÃO"],
            [BriefcaseBusiness, "VENDA"],
            [CircleDot, "ENCONTRO"],
            [CalendarCheck, "EVENTO"],
            [Handshake, "NETWORKING"],
          ].map(([Icon, label]) => (
            <div key={label}>
              <Icon />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="story-photo">
        <OptimizedImage
          name="banner-1"
          alt="Iron Air preparando uma calça enquanto uma pessoa se arruma"
          widths={[960, 1792]}
          sizes="100vw"
          width={1792}
          height={750}
        />
      </section>
      <section className="story-ready">
        <OptimizedImage
          name="banner-2"
          alt="Camisa branca pronta para usar"
          widths={[960, 1792]}
          sizes="100vw"
          width={1792}
          height={750}
        />
        <div className="story-ready-copy">
          <h2>
            Esteja pronto.
            <br />O Iron Air
            <br />
            cuida do resto.
          </h2>
          <p className="supporting-copy">
            Tecnologia que passa, seca e higieniza suas roupas
            <br />
            com praticidade e segurança.
          </p>
          <a href="#comprar" onClick={goToPurchase}>
            CONHECER O IRON AIR
          </a>
        </div>
      </section>

      <section className="action-videos-section" ref={actionVideosSection}>
        <div className="action-videos-heading">
          <h2>Veja o Iron Air em ação</h2>
          <p>Vídeos rápidos mostrando o produto no dia a dia.</p>
        </div>
        <div className="action-videos-shell">
          <button
            className="action-video-arrow is-prev"
            type="button"
            aria-label="Vídeo anterior"
            onClick={() => moveActionVideos(-1)}
          >
            <ChevronLeft size={24} />
          </button>
          <div className="action-videos-track" ref={actionVideosCarousel}>
            {ACTION_VIDEOS.map(([src, poster], index) => (
              <article
                key={src}
                className={index === activeActionVideo ? "is-active" : ""}
                onClick={() => {
                  const track = actionVideosCarousel.current;
                  const card = track?.querySelectorAll("article")[index];
                  if (card)
                    track.scrollTo({
                      left:
                        card.offsetLeft -
                        (track.clientWidth - card.clientWidth) / 2,
                      behavior: "smooth",
                    });
                }}
              >
                <video
                  src={
                    actionVideosReady && index === activeActionVideo
                      ? src
                      : undefined
                  }
                  poster={poster}
                  playsInline
                  loop
                  muted
                  preload="none"
                  aria-label={`Iron Air em ação — vídeo ${index + 1}`}
                />
              </article>
            ))}
          </div>
          <button
            className="action-video-arrow is-next"
            type="button"
            aria-label="Próximo vídeo"
            onClick={() => moveActionVideos(1)}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </section>

      <section
        className="side-by-side-comparison"
        aria-labelledby="side-by-side-title"
      >
        <div className="side-by-side-inner">
          <h2 id="side-by-side-title">
            <span className="side-by-side-title-lead">
              O ferro precisa de você.
            </span>
            <span className="side-by-side-title-main">
              O Iron Air trabalha por você.
            </span>
          </h2>
          <div
            className="side-by-side-products"
            aria-label="Comparação visual entre ferro tradicional e Iron Air"
          >
            <figure>
              <OptimizedImage
                name="traditional-iron"
                alt="Ferro tradicional"
                widths={[400, 800]}
                sizes="(max-width: 800px) 42vw, 230px"
                width={1000}
                height={1000}
              />
              <figcaption>Ferro tradicional</figcaption>
            </figure>
            <figure>
              <OptimizedImage
                name="iron-air-shirt"
                alt="Iron Air com camisa"
                widths={[500, 1000]}
                sizes="(max-width: 800px) 48vw, 350px"
                width={1000}
                height={1000}
              />
              <figcaption>Iron Air</figcaption>
            </figure>
          </div>
          <div
            className="side-by-side-table"
            role="table"
            aria-label="Comparação entre ferro tradicional e Iron Air"
          >
            <div className="side-by-side-head" role="row">
              <span role="columnheader" />
              <span role="columnheader">— Ferro tradicional</span>
              <strong role="columnheader">Iron Air</strong>
            </div>
            {SIDE_BY_SIDE_ROWS.map(([Icon, label, traditional, ironAir]) => (
              <div className="side-by-side-row" role="row" key={label}>
                <div className="side-by-side-label" role="rowheader">
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </div>
                <span className="comparison-value is-traditional" role="cell">
                  <CircleX aria-hidden="true" />
                  <span>{traditional}</span>
                </span>
                <strong className="comparison-value is-iron-air" role="cell">
                  <CircleCheck aria-hidden="true" />
                  <span>{ironAir}</span>
                </strong>
              </div>
            ))}
          </div>
          <p className="side-by-side-closing">
            Não é um ferro melhor.
            <br />
            <strong>É outra forma de passar roupa.</strong>
          </p>
        </div>
      </section>

      <section className="offer-section comparison comparison-lab legacy-comparison">
        <h2>Ferro + tábua ou Iron Air?</h2>
        <div className="comparison-console">
          <div className="comparison-slider">
            <div>
              <label htmlFor="weekly-items">
                Quantas peças você costuma passar por semana?
              </label>
              <strong>
                <AnimatedNumber value={weeklyItems} /> peças{" "}
                <span>/ semana</span>
              </strong>
            </div>
            <input
              id="weekly-items"
              type="range"
              min="1"
              max="30"
              step="1"
              value={weeklyItems}
              onChange={(event) => setWeeklyItems(Number(event.target.value))}
              style={{
                "--range-progress": `${((weeklyItems - 1) / 29) * 100}%`,
              }}
            />
            <div className="range-marks">
              {[1, 5, 10, 15, 20, 25, 30].map((mark) => (
                <span key={mark}>{mark}</span>
              ))}
            </div>
          </div>
          <div className="period-toggle" aria-label="Período da comparação">
            <button
              type="button"
              className={comparisonPeriod === "week" ? "selected" : ""}
              onClick={() => setComparisonPeriod("week")}
            >
              POR SEMANA
            </button>
            <button
              type="button"
              className={comparisonPeriod === "year" ? "selected" : ""}
              onClick={() => setComparisonPeriod("year")}
            >
              POR ANO
            </button>
          </div>
          <div className="comparison-cards">
            <article className="method-card traditional">
              <div className="method-heading">
                <span className="method-icon">
                  <Shirt />
                </span>
                <div>
                  <small>MÉTODO TRADICIONAL</small>
                  <h3>Ferro + tábua</h3>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Tempo de funcionamento</dt>
                  <dd>
                    <AnimatedNumber
                      value={
                        comparisonPeriod === "year"
                          ? traditionalMinutes / 60
                          : traditionalMinutes
                      }
                      digits={comparisonPeriod === "year" ? 1 : 0}
                    />{" "}
                    {comparisonPeriod === "year" ? "h" : "min"}
                  </dd>
                </div>
                <div>
                  <dt>Energia estimada</dt>
                  <dd>
                    <AnimatedNumber value={traditionalEnergy} digits={1} /> kWh/
                    {comparisonPeriod === "year" ? "ano" : "semana"}
                  </dd>
                </div>
                <div className="presence">
                  <dt>Tempo que exige sua presença</dt>
                  <dd>
                    <AnimatedNumber
                      value={
                        comparisonPeriod === "year"
                          ? traditionalMinutes / 60
                          : traditionalMinutes
                      }
                      digits={comparisonPeriod === "year" ? 1 : 0}
                    />{" "}
                    {comparisonPeriod === "year" ? "horas" : "min"}
                  </dd>
                </div>
              </dl>
              <p>
                O ferro não apenas consome energia.{" "}
                <strong>Ele ocupa você.</strong>
              </p>
            </article>
            <div className="versus">VS.</div>
            <article className="method-card iron-air">
              <div className="method-heading">
                <OptimizedImage
                  name="iron-air-shirt"
                  alt=""
                  widths={[500, 1000]}
                  sizes="220px"
                  width={1000}
                  height={1000}
                />
                <div>
                  <small>TECNOLOGIA MÃOS LIVRES</small>
                  <h3>Iron Air</h3>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Tempo de funcionamento</dt>
                  <dd>
                    <AnimatedNumber
                      value={
                        comparisonPeriod === "year"
                          ? ironAirCycleMinutes / 60
                          : ironAirCycleMinutes
                      }
                      digits={comparisonPeriod === "year" ? 1 : 0}
                    />{" "}
                    {comparisonPeriod === "year" ? "h" : "min"}
                  </dd>
                </div>
                <div>
                  <dt>Energia estimada ({selected?.title})</dt>
                  <dd>
                    <AnimatedNumber value={ironAirEnergy} digits={1} /> kWh/
                    {comparisonPeriod === "year" ? "ano" : "semana"}
                  </dd>
                </div>
                <div className="presence premium">
                  <dt>Tempo que exige sua presença</dt>
                  <dd>
                    <AnimatedNumber
                      value={
                        comparisonPeriod === "year"
                          ? ironAirActiveMinutes / 60
                          : ironAirActiveMinutes
                      }
                      digits={comparisonPeriod === "year" ? 1 : 0}
                    />{" "}
                    {comparisonPeriod === "year" ? "horas" : "min"}*
                  </dd>
                </div>
              </dl>
              <p>
                Depois de ajustar a peça,{" "}
                <strong>
                  o Iron Air trabalha enquanto você faz outra coisa.
                </strong>
              </p>
            </article>
          </div>
          <div className="time-bars">
            <h3>Tempo que depende de você</h3>
            <div>
              <span>FERRO</span>
              <i>
                <b style={{ width: "100%" }} />
              </i>
              <strong>
                <AnimatedNumber
                  value={
                    comparisonPeriod === "year"
                      ? traditionalMinutes / 60
                      : traditionalMinutes
                  }
                  digits={comparisonPeriod === "year" ? 1 : 0}
                />{" "}
                {comparisonPeriod === "year" ? "h" : "min"}
              </strong>
            </div>
            <div className="iron-bar">
              <span>IRON AIR</span>
              <i>
                <b
                  style={{
                    width: `${Math.max(4, (ironAirActiveMinutes / traditionalMinutes) * 100)}%`,
                  }}
                />
              </i>
              <strong>
                <AnimatedNumber
                  value={
                    comparisonPeriod === "year"
                      ? ironAirActiveMinutes / 60
                      : ironAirActiveMinutes
                  }
                  digits={comparisonPeriod === "year" ? 1 : 0}
                />{" "}
                {comparisonPeriod === "year" ? "h" : "min"}
              </strong>
            </div>
          </div>
          <div className="comparison-result">
            <p>
              COM <AnimatedNumber value={weeklyItems} /> PEÇAS POR SEMANA...
            </p>
            <h3>
              Você pode recuperar até{" "}
              <strong>
                <AnimatedNumber value={periodRecoveredHours} digits={1} />{" "}
                {comparisonPeriod === "year"
                  ? "HORAS POR ANO"
                  : "HORAS POR SEMANA"}
              </strong>{" "}
              do seu tempo.*
            </h3>
            {comparisonPeriod === "year" ? (
              <div className="time-equivalences">
                <span>
                  <b>
                    <AnimatedNumber
                      value={annualRecoveredHours / 8}
                      digits={1}
                    />
                  </b>{" "}
                  dias úteis
                </span>
                <span>
                  <b>
                    <AnimatedNumber
                      value={annualRecoveredHours / 2}
                      digits={0}
                    />
                  </b>{" "}
                  filmes de 2 horas
                </span>
                <span>
                  <b>
                    <AnimatedNumber
                      value={annualRecoveredHours / 0.5}
                      digits={0}
                    />
                  </b>{" "}
                  cafés sem pressa
                </span>
              </div>
            ) : null}
          </div>
          <div className="comparison-impact">
            <p>O FERRO CONSOME ENERGIA.</p>
            <h3>MAS O QUE ELE MAIS CONSOME É O SEU TEMPO.</h3>
            <span>
              O Iron Air foi criado para devolver esse tempo para você.
            </span>
            <BuyButton />
          </div>
          <div className="result-copy">
            <p className="eyebrow">SEU RESULTADO</p>
            <h3>IMAGINE O QUE VOCÊ FARIA COM ESSE TEMPO DE VOLTA.</h3>
            <div>
              <span>☕ Mais manhãs sem pressa.</span>
              <span>👨‍👩‍👧 Mais tempo com quem importa.</span>
              <span>💼 Mais tempo para trabalhar.</span>
              <span>🏋️ Mais tempo para você.</span>
            </div>
            <p>
              Porque tecnologia de verdade não deveria apenas fazer uma tarefa
              melhor.
            </p>
            <strong>Deveria fazer a tarefa por você.</strong>
            <BuyButton />
          </div>
          <details className="methodology">
            <summary>Como calculamos?</summary>
            <p>
              Estimativas calculadas a partir da quantidade de peças
              selecionada, tempo médio configurado para cada método e potência
              nominal dos aparelhos. Para o Iron Air, usamos{" "}
              {selected?.title === "220V" ? "1400W" : "1250W"}; para o ferro
              tradicional, a referência editável é 1200W. O consumo e o tempo
              reais podem variar conforme tecido, umidade, configuração
              utilizada, aparelho comparado e hábitos do usuário.
            </p>
          </details>
        </div>
      </section>

      <section className="offer-section proof">
        <div className="proof-heading">
          <h2>O que dizem os clientes</h2>
          <span className="proof-score">
            ★★★★★ <b>4.8</b> <small>20</small>
          </span>
        </div>
        <div className="proof-grid">
          {[
            [
              "Roberto",
              5,
              "Comprei sem acreditar muito porque parecia aquelas coisas que prometem demais. Testei numa camisa social e me surpreendeu.",
            ],
            [
              "Sonya",
              5,
              "Tenho filho pequeno e roupa acumula. Antes era um sofrimento montar tábua e ferro. Agora coloco e vou fazendo outras coisas.",
            ],
            [
              "Gustavo",
              5,
              "Pra quem odeia passar roupa igual eu, virou rotina aqui em casa. Coloco enquanto tomo banho e a roupa já sai pronta. Só precisa pegar o jeito de prender a roupa direito.",
            ],
            [
              "Jeferson",
              4,
              "Gostei muito, passa bem as roupas, mas minha jaqueta não passou bem, acredito por ser muito grossa e ser difícil passar até no ferro tradicional.",
            ],
          ].map(([name, rating, text]) => (
            <article key={name}>
              <div className="review-stars">
                {"★".repeat(rating)}
                {"☆".repeat(5 - rating)}
              </div>
              <strong>
                {name} <span aria-label="Avaliação verificada">●</span>
              </strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="offer-section guarantee"
        aria-labelledby="guarantee-title"
      >
        <div className="guarantee-seal" aria-hidden="true">
          <strong>7</strong>
          <span>DIAS</span>
        </div>
        <div className="guarantee-copy">
          <p className="eyebrow">COMPRE COM TRANQUILIDADE</p>
          <h2 id="guarantee-title">Você tem 7 dias para decidir.</h2>
          <p>
            Receba o Iron Air, conheça o produto e veja como ele se encaixa na
            sua rotina. Se você decidir que ele não é para você, solicite a
            devolução dentro do prazo de 7 dias.
          </p>
          <small>
            Consulte as condições e o procedimento na política de devolução.
          </small>
        </div>
      </section>

      <section className="offer-section offer-box" id="comprar">
        <div className="purchase-media">
          <div className="purchase-main-image">
            <img
              src={purchaseImage}
              alt={product.title}
              width="1000"
              height="1000"
              loading="lazy"
              decoding="async"
            />
          </div>
          {galleryImages.length > 1 ? (
            <div className="purchase-gallery" aria-label="Galeria do produto">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={image === purchaseImage ? "selected" : ""}
                  onClick={() => setPurchaseImage(image)}
                  aria-label={`Ver imagem ${index + 1} de ${product.title}`}
                >
                  <img
                    src={image}
                    alt=""
                    width="160"
                    height="160"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="purchase-info">
          <p className="eyebrow">ESCOLHA SUA VOLTAGEM</p>
          <h2>{product.title}</h2>
          <div
            className="purchase-rating"
            aria-label="4,8 de 5 estrelas, 4 avaliações"
          >
            <span aria-hidden="true">★★★★★</span>
            <strong>{OFFER_TERMS.rating.toFixed(1)}</strong>
            <small>({OFFER_TERMS.reviewCount} Avaliações)</small>
          </div>
          <div className="purchase-price">
            {selected?.compareAtPrice ? (
              <del>{money(selected.compareAtPrice)}</del>
            ) : null}
            <strong>{money(pixPrice)}</strong>
            <span className="pix-caption">com 10% OFF no Pix</span>
            <p className="installments">
              ou <b>{money(selected?.price)}</b> em até{" "}
              {OFFER_TERMS.installments}x de <b>{money(installmentPrice)}</b>{" "}
              s/juros
            </p>
          </div>
          <strong className="voltage-label">Voltagem</strong>
          <div className="voltage-options">
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={variant.id === selected?.id ? "selected" : ""}
                disabled={!variant.available}
                onClick={() => setVariantId(variant.id)}
              >
                {variant.title}
                <small>
                  {variant.available ? "Disponível" : "Sem estoque"}
                </small>
              </button>
            ))}
          </div>
          <BuyButton label="COMPRAR AGORA" checkout />
          <PaymentMethods compact />
        </div>
      </section>

      <section className="offer-section faq" id="perguntas">
        <h2>Perguntas frequentes</h2>
        <div className="faq-list">
          {[
            [
              "O Iron Air funciona com todo tipo de tecido?",
              "Sim. O controle inteligente de temperatura se ajusta automaticamente e funciona com algodão, poliéster, seda, lã, malha e a maior parte dos tecidos do dia a dia.",
            ],
            [
              "Quanto tempo leva para passar uma peça?",
              "A maioria das camisas e calças fica pronta em 6 a 12 minutos. O diferencial é que você não precisa acompanhar o processo.",
            ],
            [
              "Qual a voltagem?",
              "Temos a opção de 127V (1250W) e 220V (1400W).",
            ],
            [
              "Como armazenar quando não estiver usando?",
              "Esvazie o balão, dobre o suporte e guarde em armário ou gaveta maior. O aparelho pesa cerca de 2,3kg e ocupa pouco espaço.",
            ],
            [
              "Preciso colocar a roupa seca ou molhada?",
              "O ideal é utilizar a roupa levemente úmida. Você pode colocá-la diretamente após a lavagem ou borrifar um pouco de água antes de iniciar o processo.",
            ],
            [
              "Consome muita energia?",
              "Não. O Iron Air possui eficiência energética Classe A, garantindo um consumo otimizado mesmo com alta performance.",
            ],
            [
              "Serve para qualquer tamanho?",
              "Sim. O balão ajustável atende roupas até o tamanho 3XL. Ele possui zíperes laterais que permitem aumentar ou diminuir o ajuste conforme a peça.",
            ],
            [
              "Faz barulho?",
              "O funcionamento gera um leve ruído semelhante a um ar condicionado, mas nada que incomode no ambiente.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="trust-footer">
        <div className="trust-footer-inner">
          <div className="trust-footer-main">
            <div className="trust-footer-brand">
              <OptimizedImage
                name="iron-air-logo"
                alt="Iron Air"
                widths={[400, 800]}
                sizes="150px"
                width={2172}
                height={724}
              />
              <p>
                Elevando o padrão de cuidado com roupas através de tecnologia,
                praticidade e confiança.
              </p>
              <div className="footer-socials" aria-label="Redes sociais">
                {[
                  ["instagram", "https://www.instagram.com/ironairbrasil/"],
                  [
                    "facebook",
                    "https://www.facebook.com/profile.php?id=61589217872180",
                  ],
                  ["youtube", "https://www.youtube.com/@IronAirBrasil"],
                  ["tiktok", "https://www.tiktok.com/@ironairbrasil"],
                ].map(([name, href]) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Iron Air no ${name}`}
                  >
                    <SocialIcon name={name} />
                  </a>
                ))}
              </div>
            </div>

            <div className="footer-column">
              <strong>SUPORTE</strong>
              <a href="#comprar">Comprar Iron Air</a>
              <a href="#perguntas">Perguntas frequentes</a>
              <span>Política de privacidade</span>
              <span>Termos de uso</span>
            </div>

            <div className="footer-column">
              <strong>ATENDIMENTO</strong>
              <span>Segunda a sexta · 9h às 17h</span>
              <span>Belo Horizonte, MG</span>
              <span>CNPJ: 64.158.825/0001-11</span>
            </div>
          </div>

          <div className="ecommerce-seals" aria-label="Selos da loja">
            <div className="ecommerce-seal">
              <ShieldCheck aria-hidden="true" />
              <span>
                <b>COMPRA SEGURA</b>Ambiente protegido
              </span>
            </div>
            <div className="ecommerce-seal">
              <CalendarCheck aria-hidden="true" />
              <span>
                <b>7 DIAS</b>Para solicitar devolução
              </span>
            </div>
            <div className="ecommerce-seal">
              <PackageCheck aria-hidden="true" />
              <span>
                <b>PEDIDO CONFIRMADO</b>Após aprovação do pagamento
              </span>
            </div>
            <div className="ecommerce-seal inmetro-seal">
              <span className="inmetro-mark">INMETRO</span>
              <span>
                <b>CONFORMIDADE</b>Consulte o registro do produto
              </span>
            </div>
          </div>

          <div className="trust-footer-bottom">
            <span>© 2026 IRON AIR BRASIL. Todos os direitos reservados.</span>
            <PaymentMethods />
          </div>
        </div>
      </footer>
    </main>
  );
}
