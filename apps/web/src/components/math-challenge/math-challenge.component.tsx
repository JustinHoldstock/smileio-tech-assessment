import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  type ChallengeResult,
  ChallengeResultSchema,
  type MathChallenge,
  MathChallengeSchema
} from '@repo/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface MathChallengeParams {
  /** Called after points are awarded so the balance can be re-read. */
  onAwarded: () => void;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function postJson<T>(
  path: string,
  parse: (value: unknown) => T,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    // The session cookie is what ties us to our outstanding question.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return parse(json?.data);
}

export const MathChallengeCard = ({ onAwarded }: MathChallengeParams) => {
  const [challenge, setChallenge] = useState<MathChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Guards against React 18 StrictMode double-invoking the mount effect, which
  // would otherwise fire two challenge requests on every load.
  const requested = useRef(false);

  const loadChallenge = useCallback(async () => {
    setLoading(true);

    try {
      setChallenge(await postJson('/api/challenge', MathChallengeSchema.parse));
      setAnswer('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setFeedback(error.message);
      } else {
        setFeedback(
          error instanceof Error ? error.message : 'Could not load a question.'
        );
      }
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void loadChallenge();
  }, [loadChallenge]);

  // Tick the cooldown down, then fetch a fresh question automatically.
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => {
      const next = cooldown - 1;
      setCooldown(next);
      if (next === 0) void loadChallenge();
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldown, loadChallenge]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || challenge === null || answer.trim() === '') return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await postJson<ChallengeResult>(
        '/api/challenge/answer',
        ChallengeResultSchema.parse,
        { answer: Number(answer) }
      );

      if (result.outcome === 'correct') {
        setFeedback(
          `Correct! +${result.pointsAwarded} points. New balance: ${result.newBalance}.`
        );
        onAwarded();
        setChallenge(null);
        void loadChallenge();
      } else {
        setFeedback('Not quite — here comes a new question.');
        setChallenge(null);
        setCooldown(result.retryAfterSeconds);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        // Expired or already answered; just get a fresh one.
        setFeedback('That question expired. Here is another.');
        void loadChallenge();
      } else {
        setFeedback(
          error instanceof Error ? error.message : 'Something went wrong.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ border: 'solid grey', borderRadius: '8px', padding: '8px', marginBottom: '16px' }}>
      <h2 style={{ marginTop: '2px', marginBottom: '2px' }}>Earn 50 points</h2>
      <p>Answer the question to top up your balance.</p>

      {loading && <p>Loading a question…</p>}

      {!loading && challenge !== null && (
        <form onSubmit={handleSubmit}>
          <label>
            {`${challenge.left} ${challenge.operator} ${challenge.right} = `}
            <input
              type="number"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={submitting}
              style={{ width: '5rem', marginRight: '6px' }}
              aria-label="Your answer"
            />
          </label>
          <button type="submit" disabled={submitting || answer.trim() === ''}>
            {submitting ? 'Checking…' : 'Submit'}
          </button>
        </form>
      )}

      {cooldown > 0 && <p>New question in {cooldown}s…</p>}

      {feedback !== null && <p>{feedback}</p>}
    </div>
  );
};
