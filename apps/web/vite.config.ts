import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_DEV_TARGET = process.env["API_DEV_TARGET"] ?? "http://localhost:3000";

/**
 * Proxy `/api` to the local backend so the browser sees a single origin. This
 * keeps the frontend free of any API base-URL logic and means CORS never has to
 * be relaxed for local work.
 *
 * This is the local counterpart to the rewrite in `vercel.json`, which does the
 * same job in production. Vite never reads `vercel.json`, and Vercel never reads
 * this file — they are independent configs that deliberately agree on `/api`.
 */
const proxy = {
  "/api": {
    target: API_DEV_TARGET,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  // `vite preview` serves the production bundle and needs the proxy too,
  // otherwise checking a real build locally 404s on every API call.
  preview: { port: 4173, proxy },
});
