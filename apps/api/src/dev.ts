/**
 * Local development server.
 *
 * On Vercel the default export from `src/index.ts` is served directly and this
 * file is never used — it exists so `npm run dev` works without the Vercel CLI.
 */

import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, ({ port: boundPort }) => {
  console.log(`api listening on http://localhost:${boundPort}/api`);
});
