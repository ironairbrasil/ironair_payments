const isOffer =
  window.location.hostname === "oferta.ironair.com.br" ||
  new URLSearchParams(window.location.search).get("surface") === "offer";

if (!isOffer) {
  import("./hydrate.client");
} else {
  const events = ["pointerdown", "keydown", "touchstart", "scroll"];
  let timer;

  const hydrate = () => {
    events.forEach((eventName) =>
      window.removeEventListener(eventName, hydrate),
    );
    window.clearTimeout(timer);
    import("./hydrate.client");
  };

  events.forEach((eventName) =>
    window.addEventListener(eventName, hydrate, {
      once: true,
      passive: true,
    }),
  );
  timer = window.setTimeout(hydrate, 30000);
}
