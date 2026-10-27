import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * The landing page ships a static hero (see scripts/build-shell.ts). On "/", the app bundle is requested
 * right after that hero's first paint instead of competing with it for bandwidth; every other route
 * loads the bundle immediately, as usual. Build-only.
 */
function loadAppAfterShellPaint(): Plugin {
  return {
    name: "windfall:load-after-shell-paint",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const entry = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
        if (!entry) return html;
        const preloads = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)].map((m) => m[1]);
        const loader = `<script>(function(){var s=${JSON.stringify(entry[1])},p=${JSON.stringify(preloads)};function go(){p.forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=h;document.head.appendChild(l)});var e=document.createElement("script");e.type="module";e.crossOrigin="";e.src=s;document.head.appendChild(e)}if(window.__wfShell)requestAnimationFrame(function(){setTimeout(go,0)});else go()})();</script>`;
        return html
          .replace(entry[0], "")
          .replace(/\s*<link rel="modulepreload" crossorigin href="[^"]+">/g, "")
          .replace("</body>", `  ${loader}\n  </body>`);
      },
    },
  };
}

// https://vite.dev/config/ — a static SPA: Cloudflare hosts dist/, Firebase provides auth + data.
export default defineConfig({
  plugins: [react(), tailwindcss(), loadAppAfterShellPaint()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
    cssMinify: true,
  },
});
