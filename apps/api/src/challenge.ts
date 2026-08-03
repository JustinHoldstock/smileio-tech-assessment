/**
 * Math challenge state.
 *
 * The design goal is that a client has exactly ONE outstanding question at a
 * time, and must answer it (or wait for it to expire) before receiving another.
 * Two properties do the work:
 *
 *   1. Issuing is get-or-create, not create. Asking again while a question is
 *      pending returns the same question, so refreshing the page cannot reroll
 *      it and a client cannot stockpile questions.
 *   2. Grading destroys the question atomically BEFORE comparing the answer, so
 *      a wrong guess burns it too. That is what stops the small answer space
 *      from being walked, and stops a correct submission being replayed.
 *
 * The answer is never sent to the client and never leaves this module.
 */

import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type { MathChallenge } from "@repo/shared";
import { redis } from "./redis.js";

const CHALLENGE_TTL_SECONDS = 300;
const WRONG_ANSWER_COOLDOWN_SECONDS = 10;
const DAILY_AWARD_CAP = 20;

export const POINTS_PER_CORRECT_ANSWER = 50;

const ISSUE_LIMIT = { limit: 20, windowSeconds: 60 };
const ANSWER_LIMIT = { limit: 20, windowSeconds: 60 };

const StoredChallengeSchema = z.object({
  id: z.string().uuid(),
  left: z.number().int(),
  right: z.number().int(),
  operator: z.enum(["+", "-"]),
  answer: z.number().int(),
  expiresAt: z.string().datetime(),
});

type StoredChallenge = z.infer<typeof StoredChallengeSchema>;

export type IssueOutcome =
  | { status: "issued"; challenge: MathChallenge }
  | { status: "cooling_down"; retryAfterSeconds: number }
  | { status: "rate_limited"; retryAfterSeconds: number };

export type GradeOutcome =
  | { status: "correct" }
  | { status: "incorrect"; retryAfterSeconds: number }
  | { status: "no_active_challenge" }
  | { status: "daily_cap_reached" }
  | { status: "rate_limited"; retryAfterSeconds: number };

const challengeKey = (sessionId: string) => `challenge:${sessionId}`;
const cooldownKey = (sessionId: string) => `cooldown:${sessionId}`;
const dailyAwardKey = () => `awards:${new Date().toISOString().slice(0, 10)}`;

/**
 * Returns the pending challenge if there is one, otherwise stores and returns a
 * new one. Atomic, so concurrent requests cannot each create a challenge and
 * clobber one another.
 */
const GET_OR_CREATE = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return existing
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return ARGV[1]
`;

export async function issueChallenge(sessionId: string): Promise<IssueOutcome> {
  const rate = await hitRateLimit(
    `rl:issue:${sessionId}`,
    ISSUE_LIMIT.limit,
    ISSUE_LIMIT.windowSeconds,
  );

  if (!rate.allowed) {
    return { status: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds };
  }

  // A wrong answer starts a short cooldown, so guess-and-reroll costs real time.
  const cooldown = await redis().ttl(cooldownKey(sessionId));
  if (cooldown > 0) {
    return { status: "cooling_down", retryAfterSeconds: cooldown };
  }

  const candidate = generateChallenge();

  const raw = await redis().eval(
    GET_OR_CREATE,
    [challengeKey(sessionId)],
    [JSON.stringify(candidate), String(CHALLENGE_TTL_SECONDS)],
  );

  // Whoever won the race, both callers read back the same stored value.
  const stored = parseStored(raw) ?? candidate;

  return { status: "issued", challenge: toPublicChallenge(stored) };
}

export async function gradeAnswer(
  sessionId: string,
  submittedAnswer: number,
): Promise<GradeOutcome> {
  const rate = await hitRateLimit(
    `rl:answer:${sessionId}`,
    ANSWER_LIMIT.limit,
    ANSWER_LIMIT.windowSeconds,
  );

  if (!rate.allowed) {
    return { status: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds };
  }

  // Read and destroy in one atomic operation, before grading. A replayed
  // submission, a second guess at the same question, and a forged request all
  // land here and find nothing.
  const stored = parseStored(await redis().getdel(challengeKey(sessionId)));

  if (stored === null) {
    return { status: "no_active_challenge" };
  }

  if (submittedAnswer !== stored.answer) {
    await redis().set(cooldownKey(sessionId), "1", {
      ex: WRONG_ANSWER_COOLDOWN_SECONDS,
    });

    return {
      status: "incorrect",
      retryAfterSeconds: WRONG_ANSWER_COOLDOWN_SECONDS,
    };
  }

  // The hard bound. With no auth there is no durable identity, so the session
  // slot and rate limits only shape behaviour — this is what caps exposure.
  if (!(await reserveDailyAward())) {
    return { status: "daily_cap_reached" };
  }

  return { status: "correct" };
}

function generateChallenge(): StoredChallenge {
  const operator = randomInt(0, 2) === 0 ? "+" : "-";
  const a = randomInt(1, 21);
  const b = randomInt(1, 21);

  // Order the operands for subtraction so the answer is never negative.
  const left = operator === "-" && b > a ? b : a;
  const right = operator === "-" && b > a ? a : b;
  const answer = operator === "+" ? left + right : left - right;

  return {
    id: randomUUID(),
    left,
    right,
    operator,
    answer,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString(),
  };
}

/** Strips the answer. The only shape that may cross the network. */
function toPublicChallenge(stored: StoredChallenge): MathChallenge {
  return {
    id: stored.id,
    left: stored.left,
    right: stored.right,
    operator: stored.operator,
    expiresAt: stored.expiresAt,
  };
}

/** Upstash may hand back either a JSON string or an already-parsed object. */
function parseStored(raw: unknown): StoredChallenge | null {
  if (raw === null || raw === undefined) return null;

  let value: unknown = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const parsed = StoredChallengeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function reserveDailyAward(): Promise<boolean> {
  const key = dailyAwardKey();
  const count = await redis().incr(key);

  if (count === 1) {
    // Comfortably past midnight UTC; the key name changes daily regardless.
    await redis().expire(key, 60 * 60 * 48);
  }

  return count <= DAILY_AWARD_CAP;
}

/**
 * Fixed-window limiter. Allows a burst across a window boundary, which is fine
 * here: it is a coarse throttle layered under the single-slot and daily-cap
 * rules, not the primary control.
 */
async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const count = await redis().incr(key);

  if (count === 1) {
    await redis().expire(key, windowSeconds);
  }

  if (count > limit) {
    const ttl = await redis().ttl(key);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
