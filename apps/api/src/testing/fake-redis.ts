/**
 * In-memory stand-in for the Upstash client, covering only the commands this
 * codebase actually uses.
 *
 * Time is a settable field rather than `Date.now()` so expiry can be tested
 * without sleeping — a test that waits five minutes for a challenge to lapse is
 * a test nobody runs.
 *
 * KNOWN LIMITATION: `eval` does not interpret Lua. It recognises the two
 * scripts by content and reimplements their semantics in TypeScript, so these
 * tests prove the surrounding logic is correct *given* those semantics — they
 * cannot catch a bug in the Lua itself. Both scripts were verified against a
 * real Upstash instance separately.
 */

interface Entry {
  value: string;
  /** Epoch ms, or null when the key has no TTL. */
  expiresAt: number | null;
}

export class FakeRedis {
  private store = new Map<string, Entry>();

  /** Advanced by tests instead of waiting. */
  now = 1_000_000;

  /** Moves the clock forward, expiring anything whose TTL has passed. */
  advanceSeconds(seconds: number): void {
    this.now += seconds * 1000;
  }

  private read(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean },
  ): Promise<"OK" | null> {
    if (options?.nx === true && this.read(key) !== undefined) return null;

    this.store.set(key, {
      value: typeof value === "string" ? value : JSON.stringify(value),
      expiresAt: options?.ex === undefined ? null : this.now + options.ex * 1000,
    });

    return "OK";
  }

  async getdel(key: string): Promise<string | null> {
    const entry = this.read(key);
    this.store.delete(key);
    return entry?.value ?? null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.read(key)?.value ?? 0) + 1;
    const existing = this.store.get(key);

    this.store.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? null,
    });

    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.read(key);
    if (entry === undefined) return 0;

    entry.expiresAt = this.now + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.read(key);
    if (entry === undefined) return -2;
    if (entry.expiresAt === null) return -1;

    return Math.ceil((entry.expiresAt - this.now) / 1000);
  }

  async eval(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    const key = keys[0];
    if (key === undefined) throw new Error("eval called without a key");

    // Challenge get-or-create.
    if (script.includes("if existing then")) {
      const existing = await this.get(key);
      if (existing !== null) return existing;

      const [payload, ttl] = args;
      if (payload === undefined || ttl === undefined) {
        throw new Error("get-or-create called without payload and ttl");
      }

      await this.set(key, payload, { ex: Number(ttl) });
      return payload;
    }

    // Lock release, guarded by an ownership token.
    if (script.includes("DEL")) {
      const [token] = args;
      if ((await this.get(key)) !== token) return 0;

      await this.del(key);
      return 1;
    }

    throw new Error("FakeRedis.eval: unrecognised script");
  }
}
