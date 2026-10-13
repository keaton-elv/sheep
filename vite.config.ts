import { defineConfig } from "vite";

const WORKER = "http://localhost:8787";

export default defineConfig({
  root: "src/client",
  base: "/sheep/",
  publicDir: "public",
  build: {
    // dist/client is the Worker's asset directory; nesting under /sheep makes URLs line up.
    outDir: "../../dist/client/sheep",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      // `npm run dev:worker` serves the API; the Worker checks Origin, so rewrite it.
      "/sheep/api": {
        target: WORKER,
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (req) => req.getHeader("origin") && req.setHeader("origin", WORKER));
          proxy.on("proxyReqWs", (req) => req.getHeader("origin") && req.setHeader("origin", WORKER));
        },
      },
    },
  },
});
