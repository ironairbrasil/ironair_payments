// Keep attribution collection immediate; schedule only the heavier pixel SDK.
// This bootstrap runs independently of React hydration.
export const offerPixelBootstrap = `
(function () {
  window.pixelId = "6aa1c3454dbf28bfd8efb9a4";
  function loadPixel() {
    var src = "https://cdn.utmify.com.br/scripts/pixel/pixel.js";
    if (document.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }
  function schedulePixel() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(loadPixel, { timeout: 1000 });
    } else {
      window.setTimeout(loadPixel, 0);
    }
  }
  if (document.readyState === "complete") schedulePixel();
  else window.addEventListener("load", schedulePixel, { once: true });
})();
`;
