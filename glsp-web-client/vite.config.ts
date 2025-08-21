import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/mcp": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mcp/, ""),
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  esbuild: {
    target: "es2020",
  },
});
