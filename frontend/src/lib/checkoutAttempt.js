/**
 * Checkout attempt identity.
 *
 * The checkout id is the idempotency key the backend uses to reject a
 * repeated submission of the same checkout. It therefore has to stay the same
 * while the basket is unchanged, and change when the basket changes, so a
 * retry can never turn into a second order.
 */

export const buildCartFingerprint = (items) =>
  JSON.stringify(
    (Array.isArray(items) ? items : [])
      .map((item) => [item?.productId ?? null, item?.quantity ?? null])
      .sort((first, second) => (first[0] < second[0] ? -1 : first[0] > second[0] ? 1 : 0))
  );

/**
 * Returns the checkout id to use for this submission, minting a new one only
 * when the basket differs from the previous attempt.
 */
export const resolveCheckoutAttempt = (current, fingerprint) => {
  const previous = current && typeof current === "object" ? current : null;

  if (previous?.id && previous.fingerprint === fingerprint) {
    return previous;
  }

  return {
    id: globalThis.crypto.randomUUID(),
    fingerprint,
  };
};
