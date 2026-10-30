import "./ui/manager.css";
import "./style.css";
import "./ui/extras.css";
import "./ui/race.css";
import "./ui/competitions.css";
import { Game } from "./core/Game.js";
import { cleanupAuthRedirectUrl, createSupabaseClient } from "./multiplayer/supabase.js";

// OAuth popup handler. When the Google consent finishes, Supabase redirects the
// popup window back to this same app (the redirectTo set during login). We then
// finalize the session inside the popup and tell the opener (the main preview
// tab) to pick it up, then close. Keeping the main tab alive — instead of doing
// a full-page redirect — is what prevents the callback from landing on a
// recycled/dead e2b sandbox URL ("Sandbox not found").
const isOAuthPopup =
  !!window.opener &&
  /(^|[#&?])(code|access_token|error|error_code)=/.test(
    window.location.search + window.location.hash,
  );

if (isOAuthPopup) {
  const loading = document.getElementById("boot-loading");
  if (loading) {
    loading.textContent = "Concluindo login…";
  }
  (async () => {
    try {
      const client = await createSupabaseClient();
      if (client) {
        // Triggers detectSessionInUrl processing; PKCE ?code= is exchanged and
        // stored in localStorage (shared with the opener tab).
        await client.auth.getSession();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      cleanupAuthRedirectUrl();
    } catch {
      // The opener tab re-checks storage on its own; nothing else to do here.
    } finally {
      try {
        window.opener.postMessage(
          { type: "apex-oauth-complete" },
          window.location.origin,
        );
      } catch {}
      setTimeout(() => window.close(), 50);
    }
  })();
} else {
  // Keep the original synchronous Game creation; assets/shader readiness is async.
  (async () => {
    const loading = document.getElementById("boot-loading");
    try {
      const game = new Game();
      if (new URLSearchParams(location.search).has("test")) window.__game = game;
      await game.world.ready;
      loading?.remove();
      if (game.world.assetErrors.length)
        game.ui.toast(
          "Alguns recursos não carregaram. Verifique a conexão e recarregue; detalhes no console.",
        );
    } catch (error) {
      console.error("Falha na preparação do jogo", error);
      loading.replaceChildren();
      const text = document.createElement("p");
      text.textContent =
        "Não foi possível preparar o jogo. Verifique WebGL/aceleração gráfica e o carregamento dos recursos.";
      const retry = document.createElement("button");
      retry.textContent = "TENTAR NOVAMENTE";
      retry.onclick = () => location.reload();
      loading.append(text, retry);
    }
  })();
}
