import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  ChallengeAnswerRequestSchema,
  ChallengeResultSchema,
  HealthResponseSchema,
  RedeemRewardRequestSchema,
  RedeemRewardResultSchema,
  PointsTransactionSchema,
} from "@repo/shared";
import { Smile } from "./smile-proxy";
import { getOrCreateSessionId } from "./session";
import {
  gradeAnswer,
  issueChallenge,
  POINTS_PER_CORRECT_ANSWER,
} from "./challenge";
import { planRedemption } from "./redemption";

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
  const rewards = await Smile.getRewards();

  return c.json(
    {
      status: 'ok',
      data: rewards
    }
  )
});

/**
 * Spends points on a reward and returns the coupon Smile issued.
 *
 * The request body carries at most `pointsToSpend`. Everything the decision
 * actually rests on — price, variable range, and the customer's balance — is
 * re-read from Smile here, because anything the client sends is a UI hint that
 * may be stale, or forged.
 */
app.post('/rewards/:id/redeem', async (c) => {
  const productId = c.req.param('id');

  if (!/^\d+$/.test(productId)) {
    return c.json(
      { error: { code: 'invalid_request', message: 'Unknown reward.' } },
      400
    );
  }

  // A fixed-price redemption has nothing to send, so an absent or empty body is
  // legitimate; only a body that is present and malformed is an error.
  const rawBody = await c.req.json().catch(() => undefined);
  const parsedBody = RedeemRewardRequestSchema.safeParse(rawBody ?? {});

  c.header('Cache-Control', 'no-store');

  if (!parsedBody.success) {
    return c.json(
      {
        error: {
          code: 'invalid_request',
          message: 'pointsToSpend must be a positive whole number.'
        }
      },
      400
    );
  }

  const customerId = process.env?.SMILE_CUSTOMER_ID || '';

  const [customer, product] = await Promise.all([
    Smile.getCustomer(customerId),
    Smile.getPointsProduct(productId)
  ]);

  const check = planRedemption(
    product,
    customer.points_balance,
    parsedBody.data.pointsToSpend
  );

  if (check.status === 'rejected') {
    return c.json(
      { error: { code: check.code, message: check.message } },
      check.httpStatus
    );
  }

  let purchase;

  try {
    purchase = await Smile.purchasePointsProduct(
      customerId,
      product.id,
      check.plan.variableSpend
    );
  } catch (error) {
    // Log the detail server-side; the client gets a message that does not leak
    // Smile's response but also does not claim more than we know. A failed call
    // is *probably* a no-op, but a request that died in flight might not be.
    console.error(error);
    return c.json(
      {
        error: {
          code: 'redemption_failed',
          message:
            'We could not complete this redemption. Check your balance before trying again.'
        }
      },
      502
    );
  }

  // Re-read rather than subtracting locally: Smile is the source of truth, and
  // it is the only thing that knows what the purchase actually cost.
  const updatedCustomer = await Smile.getCustomer(customerId);
  const fulfillment = purchase.reward_fulfillment;

  return c.json({
    status: 'ok',
    data: RedeemRewardResultSchema.parse({
      coupon: {
        name: fulfillment.name,
        code: fulfillment.code ?? null,
        usageInstructions: fulfillment.usage_instructions ?? null,
        termsAndConditions: fulfillment.terms_and_conditions ?? null,
        expiresAt: fulfillment.expires_at ?? null
      },
      pointsSpent: purchase.points_spent,
      newBalance: updatedCustomer.points_balance
    })
  });
})

/**
 * How much history to pull from Smile per request. The sidebar is a glanceable
 * summary, not a full ledger, and filtering happens after the fetch — so this
 * is deliberately larger than the number of rows we expect to render.
 */
const TRANSACTION_FETCH_LIMIT = 50;

/**
 * THE redemption rule. This is the single place the "what counts as a
 * redemption" decision lives.
 *
 * Smile records spending points as a negative `points_change` and earning them
 * as a positive one, so a redemption is simply a negative change. If the
 * product decision later becomes "show all activity", change this one function
 * to `() => true`; nothing else in the codebase encodes the distinction.
 */
const isRedemption = (transaction: { points_change: number }) =>
  transaction.points_change < 0;

app.get('/transactions', async (c) => {
  const transactions = await Smile.listPointsTransactions(
    process.env?.SMILE_CUSTOMER_ID || '',
    TRANSACTION_FETCH_LIMIT
  );

  const redemptions = transactions
    .filter(isRedemption)
    .map((transaction) =>
      // SECURITY: build the client payload field by field — never spread the
      // Smile record. Smile's transactions carry a merchant-only
      // `internal_note` that must not reach a customer, and listing the
      // allowed fields explicitly means a new merchant-only field added by
      // Smile tomorrow cannot silently start crossing the network either.
      // `PointsTransactionSchema` (which has no `internal_note`) then
      // validates the result, so the wire shape is enforced, not just
      // intended.
      PointsTransactionSchema.parse({
        id: transaction.id,
        points_change: transaction.points_change,
        description: transaction.description,
        created_at: transaction.created_at
      })
    );

  return c.json(
    {
      status: 'ok',
      data: redemptions
    }
  )
})

/**
 * POST, not GET: issuing creates server-side state, and a cacheable GET would
 * hand back the same question from the browser or CDN cache.
 */
app.post('/challenge', async (c) => {
  const sessionId = getOrCreateSessionId(c);
  const result = await issueChallenge(sessionId);

  c.header('Cache-Control', 'no-store');

  if (result.status === 'issued') {
    return c.json({ status: 'ok', data: result.challenge });
  }

  c.header('Retry-After', String(result.retryAfterSeconds));
  return c.json(
    {
      error: {
        code: 'too_many_requests',
        message: `Hold on a moment — try again in ${result.retryAfterSeconds}s.`
      }
    },
    429
  );
});

app.post('/challenge/answer', async (c) => {
  const sessionId = getOrCreateSessionId(c);

  const body = await c.req.json().catch(() => null);
  const parsedBody = ChallengeAnswerRequestSchema.safeParse(body);

  c.header('Cache-Control', 'no-store');

  if (!parsedBody.success) {
    return c.json(
      { error: { code: 'invalid_request', message: 'answer must be an integer' } },
      400
    );
  }

  const graded = await gradeAnswer(sessionId, parsedBody.data.answer);

  if (graded.status === 'no_active_challenge') {
    return c.json(
      {
        error: {
          code: 'no_active_challenge',
          message: 'That question is no longer open. Grab a new one.'
        }
      },
      410
    );
  }

  if (graded.status === 'rate_limited' || graded.status === 'daily_cap_reached') {
    return c.json(
      {
        error: {
          code: 'too_many_requests',
          message: 'Too many attempts for now. Try again later.'
        }
      },
      429
    );
  }

  if (graded.status === 'incorrect') {
    return c.json({
      status: 'ok',
      data: ChallengeResultSchema.parse({
        outcome: 'incorrect',
        retryAfterSeconds: graded.retryAfterSeconds
      })
    });
  }

  const customerId = process.env?.SMILE_CUSTOMER_ID || '';

  await Smile.createPointsTransaction(
    customerId,
    POINTS_PER_CORRECT_ANSWER,
    'Answered the math question correctly'
  );

  // Re-read rather than tracking the balance ourselves: Smile is the source of
  // truth, and other activity could have moved it.
  const customer = await Smile.getCustomer(customerId);

  return c.json({
    status: 'ok',
    data: ChallengeResultSchema.parse({
      outcome: 'correct',
      pointsAwarded: POINTS_PER_CORRECT_ANSWER,
      newBalance: customer.points_balance
    })
  });
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
