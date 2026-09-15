import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const codexOverlay = document.getElementById("codex-agent-overlay-root");
if (codexOverlay?.parentElement === document.documentElement) {
  codexOverlay.remove();
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
