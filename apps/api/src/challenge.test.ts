/**
 * The math challenge is the security-sensitive part of this app, so these tests
 * are written around the properties that make it safe rather than around the
 * implementation:
 *
 *   - you cannot reroll a question you have been given
 *   - you cannot answer the same question twice, right or wrong
 *   - the answer never crosses the network
 *   - abuse is bounded even if you defeat every soft control
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeRedis } from "./testing/fake-redis.js";

// Hoisted so the module mock below can close over it before `challenge.js` is
// imported; the instance itself is replaced per test.
const state = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("./redis.js", () => ({ redis: () => state.client }));

const { gradeAnswer, issueChallenge, POINTS_PER_CORRECT_ANSWER } = await import(
  "./challenge.js"
);

const SESSION = "session-a";

let redis: FakeRedis;

beforeEach(() => {
  redis = new FakeRedis();
  state.client = redis;
});

/** Reads the answer out of Redis — the only place it is ever allowed to exist. */
async function storedAnswer(sessionId = SESSION): Promise<number> {
  const raw = await redis.get(`challenge:${sessionId}`);
  if (raw === null) throw new Error("no challenge stored");

  return JSON.parse(raw).answer;
}

async function issueAndAnswerCorrectly(sessionId: string) {
  await issueChallenge(sessionId);
  return gradeAnswer(sessionId, await storedAnswer(sessionId));
}

describe("issuing", () => {
  it("never includes the answer in what the client receives", async () => {
    const outcome = await issueChallenge(SESSION);

    expect(outcome.status).toBe("issued");
    if (outcome.status !== "issued") return;

    /*
     * Asserted as an exact key set rather than "does not contain the answer":
     * the answer is a small integer, and searching the serialised payload for
     * it matches by coincidence inside the id or the timestamp. Pinning the
     * whole shape says the real thing — these five fields cross the network and
     * nothing else does — and fails if a future change adds a sixth.
     */
    expect(Object.keys(outcome.challenge).sort()).toEqual([
      "expiresAt",
      "id",
      "left",
      "operator",
      "right",
    ]);

    // And the answer really is being kept somewhere the client cannot see.
    expect(await storedAnswer()).toBeTypeOf("number");
  });

  it("returns the SAME question when asked again, so it cannot be rerolled", async () => {
    const first = await issueChallenge(SESSION);
    const second = await issueChallenge(SESSION);

    expect(first.status).toBe("issued");
    expect(second.status).toBe("issued");
    if (first.status !== "issued" || second.status !== "issued") return;

    expect(second.challenge).toEqual(first.challenge);
  });

  it("issues a new question once the old one has expired", async () => {
    const first = await issueChallenge(SESSION);
    redis.advanceSeconds(301);
    const second = await issueChallenge(SESSION);

    if (first.status !== "issued" || second.status !== "issued") {
      throw new Error("expected both to be issued");
    }

    expect(second.challenge.id).not.toBe(first.challenge.id);
  });

  it("keeps sessions independent", async () => {
    const a = await issueChallenge("session-a");
    const b = await issueChallenge("session-b");

    if (a.status !== "issued" || b.status !== "issued") {
      throw new Error("expected both to be issued");
    }

    expect(a.challenge.id).not.toBe(b.challenge.id);
  });
});

describe("grading", () => {
  it("accepts the correct answer", async () => {
    await issueChallenge(SESSION);

    expect(await gradeAnswer(SESSION, await storedAnswer())).toEqual({
      status: "correct",
    });
  });

  it("rejects an answer when nothing is outstanding", async () => {
    expect(await gradeAnswer(SESSION, 4)).toEqual({
      status: "no_active_challenge",
    });
  });

  it("rejects an answer after the question has expired", async () => {
    await issueChallenge(SESSION);
    const answer = await storedAnswer();

    redis.advanceSeconds(301);

    expect(await gradeAnswer(SESSION, answer)).toEqual({
      status: "no_active_challenge",
    });
  });

  it("will not let one session answer another's question", async () => {
    await issueChallenge("session-a");
    const answer = await storedAnswer("session-a");

    expect(await gradeAnswer("session-b", answer)).toEqual({
      status: "no_active_challenge",
    });
  });
});

describe("replay", () => {
  it("cannot award twice for one correct answer", async () => {
    await issueChallenge(SESSION);
    const answer = await storedAnswer();

    expect(await gradeAnswer(SESSION, answer)).toEqual({ status: "correct" });
    // The same submission, replayed verbatim.
    expect(await gradeAnswer(SESSION, answer)).toEqual({
      status: "no_active_challenge",
    });
  });
});

describe("brute force", () => {
  it("burns the question on a wrong answer, so it cannot be guessed at twice", async () => {
    await issueChallenge(SESSION);
    const answer = await storedAnswer();

    const wrong = await gradeAnswer(SESSION, answer + 1);
    expect(wrong.status).toBe("incorrect");

    // The correct answer, submitted immediately after — there is nothing left.
    expect(await gradeAnswer(SESSION, answer)).toEqual({
      status: "no_active_challenge",
    });
  });

  it("makes guess-and-reroll cost real time via a cooldown", async () => {
    await issueChallenge(SESSION);
    await gradeAnswer(SESSION, (await storedAnswer()) + 1);

    const blocked = await issueChallenge(SESSION);
    expect(blocked.status).toBe("cooling_down");

    redis.advanceSeconds(11);
    expect((await issueChallenge(SESSION)).status).toBe("issued");
  });

  it("walking the whole answer space still yields nothing without a fresh question", async () => {
    await issueChallenge(SESSION);
    const answer = await storedAnswer();

    // First guess consumes it; every later guess finds nothing, including the
    // one that happens to be right.
    const outcomes = [];
    for (let guess = 2; guess <= 40; guess += 1) {
      outcomes.push((await gradeAnswer(SESSION, guess)).status);
    }

    expect(outcomes.filter((status) => status === "correct")).toHaveLength(0);
    expect(outcomes[0]).toBe(answer === 2 ? "correct" : "incorrect");
  });
});

describe("limits", () => {
  it("rate limits a session that keeps asking for questions", async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 25; attempt += 1) {
      statuses.push((await issueChallenge(SESSION)).status);
    }

    expect(statuses).toContain("rate_limited");
  });

  it("caps awards per day even across fresh sessions", async () => {
    // A new session each time, so per-session rate limits never bite — this is
    // the backstop that holds when the soft controls are defeated.
    const outcomes = [];
    for (let attempt = 0; attempt < 22; attempt += 1) {
      outcomes.push((await issueAndAnswerCorrectly(`session-${attempt}`)).status);
    }

    expect(outcomes.filter((status) => status === "correct")).toHaveLength(20);
    expect(outcomes.at(-1)).toBe("daily_cap_reached");
  });
});

describe("award value", () => {
  it("is the 50 points the brief specifies", () => {
    expect(POINTS_PER_CORRECT_ANSWER).toBe(50);
  });
});
