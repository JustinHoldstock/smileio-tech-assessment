import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_DEV_TARGET = process.env["API_DEV_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * Proxy `/api` to the backend in development so the browser sees a single
     * origin. This keeps the frontend free of any API base-URL logic and means
     * CORS never has to be relaxed for local work.
     */
    proxy: {
      "/api": {
        target: API_DEV_TARGET,
        changeOrigin: true,
      },
    },
  },
});
