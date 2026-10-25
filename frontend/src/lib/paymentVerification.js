/**
 * Payment verification helpers for the checkout page.
 *
 * The poller only ever reads the status of an existing payment attempt. It
 * never submits a checkout, never starts a payment and never creates another
 * attempt, so a retry can not produce a second order or deduct stock twice.
 *
 * A payment outcome is only ever reported as paid or failed when the backend
 * reports a recorded state. Every other answer, including a network problem,
 * stays inconclusive.
 */

export const PAYMENT_POLL_INTERVAL_MS = 3000;
export const PAYMENT_POLL_MAX_DURATION_MS = 60000;

export const PAYMENT_ATTEMPT_STATE = {
  PAID: "paid",
  FAILED: "failed",
  PENDING: "pending",
  INCONCLUSIVE: "inconclusive",
};

export const PAYMENT_INCONCLUSIVE_REASON = {
  UNREACHABLE: "unreachable",
  NOT_AUTHORISED: "not_authorised",
  NOT_FOUND: "not_found",
  UNREADABLE: "unreadable",
  LIMIT_REACHED: "limit_reached",
};

const FINAL_STATES = [PAYMENT_ATTEMPT_STATE.PAID, PAYMENT_ATTEMPT_STATE.FAILED];

/**
 * Turns an attempt status response into a customer safe state.
 *
 * A response that cannot be read is inconclusive, never a failure.
 */
export const classifyPaymentAttempt = (response) => {
  const status = response?.status ?? 0;

  if (!response || status === 0) {
    return {
      state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
      reason: PAYMENT_INCONCLUSIVE_REASON.UNREACHABLE,
    };
  }

  if (status === 401 || status === 403) {
    return {
      state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
      reason: PAYMENT_INCONCLUSIVE_REASON.NOT_AUTHORISED,
    };
  }

  if (status === 404) {
    return {
      state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
      reason: PAYMENT_INCONCLUSIVE_REASON.NOT_FOUND,
    };
  }

  if (status !== 200 || response?.data?.success !== true) {
    return {
      state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
      reason: PAYMENT_INCONCLUSIVE_REASON.UNREADABLE,
    };
  }

  const attempt = response.data.attempt || null;
  // The backend reports the effective recorded state. The attempt record is
  // used as the fallback for a response that does not carry it.
  const attemptStatus = response.data.status || attempt?.status;

  if (attemptStatus === PAYMENT_ATTEMPT_STATE.PAID) {
    return {
      state: PAYMENT_ATTEMPT_STATE.PAID,
      attempt,
      order: response.data.order || null,
      simulatedTimeout:
        response.data.simulatedTimeout === true ||
        attempt?.simulatedTimeout === true,
    };
  }

  if (attemptStatus === PAYMENT_ATTEMPT_STATE.FAILED) {
    return {
      state: PAYMENT_ATTEMPT_STATE.FAILED,
      attempt,
      order: response.data.order || null,
    };
  }

  // An attempt that is still pending or still unknown stays pending, because
  // the outcome can still be resolved.
  return {
    state: PAYMENT_ATTEMPT_STATE.PENDING,
    attempt,
    order: response.data.order || null,
  };
};

/**
 * A small poller for one payment attempt.
 *
 * It stops when the outcome becomes final, when the maximum duration is
 * reached, or when it is stopped explicitly. Checks never overlap.
 */
export const createPaymentPoller = ({
  check,
  onUpdate,
  intervalMs = PAYMENT_POLL_INTERVAL_MS,
  maxDurationMs = PAYMENT_POLL_MAX_DURATION_MS,
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (handle) => clearTimeout(handle),
} = {}) => {
  let timer = null;
  let startedAt = null;
  let running = false;
  let inFlight = null;
  let finished = false;
  let stopped = false;
  let limitReached = false;

  const clearTimer = () => {
    if (timer) {
      cancel(timer);
      timer = null;
    }
  };

  /**
   * Stops the poller for good. It is used when the view goes away.
   */
  const stop = () => {
    stopped = true;
    clearTimer();
  };

  const publish = (result) => {
    if (stopped) {
      return;
    }

    onUpdate(result);
  };

  const runCheck = async ({ manual = false } = {}) => {
    if (stopped || finished) {
      return null;
    }

    // A check that is already running is never started twice.
    if (running) {
      return inFlight;
    }

    running = true;

    const promise = (async () => {
      let result;

      try {
        result = classifyPaymentAttempt(await check());
      } catch {
        result = {
          state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
          reason: PAYMENT_INCONCLUSIVE_REASON.UNREACHABLE,
        };
      }

      running = false;

      if (stopped) {
        return result;
      }

      publish(result);

      if (FINAL_STATES.includes(result.state)) {
        finished = true;
        clearTimer();

        return result;
      }

      if (startedAt === null) {
        startedAt = now();
      }

      // A manual check re-arms the automatic polling window, because the
      // customer explicitly asked for another check.
      if (manual) {
        startedAt = now();
        limitReached = false;
      } else if (now() - startedAt >= maxDurationMs) {
        limitReached = true;
        clearTimer();

        publish({
          state: PAYMENT_ATTEMPT_STATE.INCONCLUSIVE,
          reason: PAYMENT_INCONCLUSIVE_REASON.LIMIT_REACHED,
        });

        return result;
      }

      clearTimer();
      timer = schedule(() => {
        runCheck().catch(() => { });
      }, intervalMs);

      return result;
    })();

    inFlight = promise;

    return promise;
  };

  const start = () => {
    if (stopped || finished || startedAt !== null) {
      return;
    }

    startedAt = now();
    timer = schedule(() => {
      runCheck().catch(() => { });
    }, 0);
  };

  /**
   * A manual check of the same attempt. It never submits a checkout and never
   * starts a payment. It also works after the automatic polling limit was
   * reached, so the customer can always ask again.
   */
  const checkNow = async () => {
    if (stopped || finished) {
      return null;
    }

    if (running && inFlight) {
      await inFlight;
    }

    if (stopped || finished) {
      return null;
    }

    return runCheck({ manual: true });
  };

  return {
    start,
    stop,
    checkNow,
    isRunning: () => !stopped && !finished,
    isLimitReached: () => limitReached,
    getStartedAt: () => startedAt,
  };
};
