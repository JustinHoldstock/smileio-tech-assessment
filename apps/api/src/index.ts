import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HealthResponseSchema } from "@repo/shared";
import { Smile } from "./smile-proxy";

/**
 * Every route is mounted under `/api` so that the same paths work whether the
 * browser reaches this app directly (its own Vercel deployment) or through the
 * frontend's dev proxy / production rewrite.
 */
const app = new Hono().basePath("/api");
const smileApp = Smile;

app.use("*", logger());

/**
 * In development the Vite proxy makes requests same-origin, so CORS is a no-op.
 * In production it only matters if the frontend calls this deployment directly
 * rather than via a rewrite — `WEB_ORIGIN` keeps that explicit rather than `*`.
 */
app.use("*", (c, next) => {
  const origin = process.env["WEB_ORIGIN"];
  return cors({
    origin: origin ?? [],
    credentials: true,
  })(c, next);
});

app.get("/health", (c) => {
  return c.json(
    HealthResponseSchema.parse({
      status: "ok",
      data: {
        timestamp: new Date().toISOString(),
      }
    }),
  );
});

app.get('/customer', async (c) => {
  const customer = await Smile.getCustomer(process.env?.SMILE_CUSTOMER_ID || '');

  return c.json(
    {
      status: 'ok',
      data: {
        ...customer
      }
    }
  )
})
app.get('/rewards', async (c) => {
  const customer = await Smile.getCustomer(process.env?.SMILE_CUSTOMER_ID || '');

  return c.json(
    {
      status: 'ok',
      balance: customer.points_balance
    }
  )
});

app.get('/rewards/:id/redeem', (c) => {
  return c.json(
    {
      status: 'ok',
    }
  )
})

app.get('/challenge', (c) => {
  return c.json(
    {
      status: 'ok',
    }
  )
})

app.get('/challenge/:id/answer', (c) => {
  return c.json(
    {
      status: 'ok',
    }
  )
})

app.notFound((c) => {
  return c.json(
    { error: { code: "not_found", message: "Route not found" } },
    404,
  );
});

app.onError((err, c) => {
  // Log the real error server-side; never leak internals to the client.
  console.error(err);
  return c.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    500,
  );
});

export default app;
