import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Browser automation/debugging tools may inject their overlay as a direct child
// of <html> before React starts. Remove only that known development overlay so
// it cannot invalidate the server-rendered document during hydration.
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
