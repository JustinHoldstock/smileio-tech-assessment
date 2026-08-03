import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  type ChallengeResult,
  ChallengeResultSchema,
  type MathChallenge,
  MathChallengeSchema
} from '@repo/shared';

import { ApiError, postJson } from '../../api';
import { Skeleton } from '../skeleton/skeleton.component';
import styles from './math-challenge.module.css';

interface MathChallengeParams {
  /** Called after points are awarded so the balance can be re-read. */
  onAwarded: () => void;
}

/** Tone drives the styling, so the message and its colour cannot disagree. */
type Feedback = {
  tone: 'correct' | 'wrong' | 'failed';
  message: string;
};

/**
 * Only `ApiError` messages are safe to show: those are written by our own API
 * for a customer to read ("Hold on a moment — try again in 10s"). Anything else
 * is a network failure or a Zod parse error, whose `message` is either
 * meaningless to a customer ("Failed to fetch") or an internals dump.
 */
const readableError = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export const MathChallengeCard = ({ onAwarded }: MathChallengeParams) => {
  const [challenge, setChallenge] = useState<MathChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
      // A 429 is the cooldown or rate limit talking — expected, not a failure.
      const rateLimited = error instanceof ApiError && error.status === 429;

      setFeedback({
        tone: rateLimited ? 'wrong' : 'failed',
        message: readableError(error, 'Could not load a question. Try refreshing.')
      });
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
        setFeedback({
          tone: 'correct',
          message: `Correct! +${result.pointsAwarded} points. New balance: ${result.newBalance}.`
        });
        onAwarded();
        setChallenge(null);
        void loadChallenge();
      } else {
        setFeedback({
          tone: 'wrong',
          message: 'Not quite — here comes a new question.'
        });
        setChallenge(null);
        setCooldown(result.retryAfterSeconds);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        // Expired or already answered; just get a fresh one.
        setFeedback({
          tone: 'wrong',
          message: 'That question expired. Here is another.'
        });
        void loadChallenge();
      } else {
        setFeedback({
          tone: 'failed',
          message: readableError(error, 'We could not check that answer.')
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="challenge-heading">
      <h2 className={styles.title} id="challenge-heading">
        Quick question
        <span className={styles.reward}>+50 points</span>
      </h2>
      <p className={styles.blurb}>Answer correctly to top up your balance.</p>

      {loading && (
        <div className={styles.loading} aria-busy="true" aria-label="Loading a question">
          <Skeleton width="7rem" height="2rem" radius="8px" />
          <Skeleton width="5.5rem" height="2rem" radius="8px" />
        </div>
      )}

      {!loading && challenge !== null && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <p className={styles.sum}>
            {`${challenge.left} ${challenge.operator} ${challenge.right} =`}
            <input
              className={styles.input}
              type="number"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={submitting}
              aria-label="Your answer"
            />
          </p>
          <button
            className={styles.submit}
            type="submit"
            disabled={submitting || answer.trim() === ''}
          >
            {submitting ? 'Checking…' : 'Submit'}
          </button>
        </form>
      )}

      {cooldown > 0 && (
        <p className={`${styles.feedback} ${styles.wrong}`}>
          New question in {cooldown}s…
        </p>
      )}

      {feedback !== null && (
        <p
          className={`${styles.feedback} ${styles[feedback.tone]}`}
          role={feedback.tone === 'failed' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
};
