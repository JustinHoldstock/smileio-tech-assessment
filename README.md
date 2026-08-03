# Smile Rewards

A standalone web app showcasing a Shopify store's rewards program, powered by the
[Smile.io Backend API](https://dev.smile.io/api/introduction).

**Live:** https://smileio-tech-assessment-web.vercel.app/

Customers can see their points balance, browse and redeem rewards for a coupon
code, review what they have redeemed before, and earn 50 points by answering a
randomised math question.

---

## Tech stack

| | |
| --- | --- |
| **Monorepo** | npm workspaces |
| **Frontend** | Vite + React 19 + TypeScript, CSS Modules |
| **Backend** | Hono on Vercel Functions, TypeScript |
| **Contract** | Zod schemas shared between both, types inferred from them |
| **State** | Upstash Redis (HTTP) — no relational database |
| **Tests** | Vitest |
| **Hosting** | Two Vercel projects from one repository |

```
apps/
  web/        React app. Never talks to Smile directly.
  api/        Hono API. The only thing holding the Smile key.
packages/
  shared/     Zod schemas + inferred types: the contract between the two.
```

---

## Running locally

Requires Node 20+.

```bash
npm install
```

Copy the environment templates and fill them in:

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
```

`apps/api/.env` needs:

| Variable | Where it comes from |
| --- | --- |
| `SMILE_API_KEY` | Smile Admin → your private API key |
| `SMILE_API_BASE_URL` | `https://api.smile.io/v1` |
| `SMILE_CUSTOMER_ID` | `GET /v1/customers?email=…`, the `id` field |
| `UPSTASH_REDIS_REST_URL` | Upstash console → **REST** credentials |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → **REST** credentials |

Use Upstash's **REST** URL and token, not the `redis://` connection string —
the client speaks HTTP.

Then:

```bash
npm run dev
```

- Frontend — http://localhost:5173
- Backend — http://localhost:3000/api/health

| Command | |
| --- | --- |
| `npm run dev` | Runs `shared` (watch), `api` and `web` together |
| `npm run build` | Builds every workspace in dependency order |
| `npm run test` | Runs the test suite |
| `npm run typecheck` | Type-checks every workspace |

---

## Architecture

```
browser ──► /api/*  ──►  Hono backend  ──►  api.smile.io
                          (holds SMILE_API_KEY)
```

The frontend never calls Smile. The API key authenticates as the entire store,
so keeping the backend a separate deployable makes that boundary structural
rather than a convention someone has to remember — there is no code path by
which the client bundle could import it.

The API exposes only the operations this app performs, not a pass-through proxy:

| Endpoint | |
| --- | --- |
| `GET /api/customer` | Balance and profile |
| `GET /api/rewards` | Redemption options |
| `POST /api/rewards/:id/redeem` | Spend points, return the coupon |
| `GET /api/transactions` | Past redemptions |
| `POST /api/challenge` | Issue the current math question |
| `POST /api/challenge/answer` | Grade it and award points |

That matters: a proxy forwarding arbitrary requests would keep the key secret
while handing the browser the *capability* of a store-wide credential.

In development Vite proxies `/api` to the backend; in production
`apps/web/vercel.json` rewrites it to the API deployment. Either way the browser
stays same-origin, so there is no CORS and the session cookie works.

---

## Security considerations

### The math question

The feature is easy to get wrong in three ways, and all three are closed:

1. **Answer computed client-side** → the answer is generated server-side, stored
   in Redis, and never appears in a response.
2. **Replaying a correct submission** → grading destroys the question with an
   atomic `GETDEL` *before* comparing the answer.
3. **Brute-forcing a small answer space** → a wrong guess consumes the question
   too, so each attempt costs a fresh one.

A client also holds exactly one outstanding question at a time. Issuing is
get-or-create via a Lua script, so asking again returns the *same* question —
refreshing cannot reroll it and questions cannot be stockpiled.

Layered behind that, in order of how much each actually holds:

| Control | What it does |
| --- | --- |
| Session cookie | The one-question-at-a-time slot. Resettable by clearing cookies. |
| Rate limits + a 10s cooldown after a wrong answer | Makes cycling sessions slow rather than free. |
| Global daily award cap | The only hard bound. |

The honest framing: the brief does not require auth, so there is no durable
identity to attribute usage to. The first two layers shape behaviour; the third
bounds the loss.

### Redemption

Redeeming is check-then-act — read the balance, decide it is affordable, spend.
Two concurrent requests would both read the pre-purchase balance and both
succeed, and Smile has no idempotency key to catch it. A Redis lock keyed on
customer + product wraps the whole read-check-purchase window, so concurrent
requests get a `409`. Release uses an ownership token, so a request that
outlives its own TTL cannot free a lock someone else has since taken.

The server re-reads the price, the variable range and the balance from Smile on
every redemption. Anything the client sends is a UI hint.

### Data handling

Smile's transactions carry `internal_note`, which is merchant-only. It is
stripped in the API layer, not hidden in the component: the shared schema does
not declare it, the route maps field by field rather than spreading the record,
and the outgoing shape is validated. A merchant-only field Smile adds tomorrow
cannot ride along either.

No secret is ever exposed to the client. Verified by scanning the production
bundle for the API key, the customer id and both Upstash values.

---

## Testing

```bash
npm run test
```

38 tests covering the security-sensitive logic — the challenge lifecycle,
redemption rules and the lock. They are written around the properties that make
the app safe (a question cannot be rerolled; a correct answer cannot be
replayed; a wrong answer burns the question) rather than around the
implementation.

Redis is faked in memory with a settable clock, so expiry and cooldown are
tested without sleeping.

---

## Trade-offs

Deliberate choices, given this is an MVP:

- **No relational database.** Challenges, locks and rate-limit counters are all
  TTL-based key-value data, so Redis alone is sufficient and simpler.
- **Redemption fails closed if Redis is unreachable.** An availability cost
  taken knowingly: for an operation that spends something real, failing is
  better than proceeding unguarded.
- **The sidebar fetches one page of 50 transactions**, no cursor pagination. Fine
  for a glanceable summary; it would need pagination for a full ledger.
- **`useRequest` fetches on mount only.** After a redemption the sidebar is
  remounted via its `key` rather than the hook growing a dependency array.
- **Preview deployments point at the production backend**, since the rewrite
  destination is a fixed URL. Vercel's Related Projects is the production answer.
- **Rate limiting is per session and per fixed window.** With real auth this
  would key on the authenticated customer and use a sliding window.

### Two things worth knowing about the Smile API

Both cost real debugging time and are documented at the call sites:

- **Request body wrapping is inconsistent.** `POST /points_transactions` wraps
  the body in `points_transaction`; `POST /points_products/{id}/purchase` does
  not. Getting it wrong returns `403` on one endpoint and `400` on the other —
  neither of which suggests a malformed body.
- **The published docs omit request wrappers**, so they cannot be trusted on
  this point.
