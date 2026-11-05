/**
 * How long a payment receipt waits in the thanks queue (lib/thanks.ts): the undo window for a
 * misclicked check-off. Its own module, like lib/notice-delay.ts, so lib/wake.ts and client code
 * can read it without importing the queue (which needs the database).
 */
export const THANKS_DELAY_MINUTES = 10;
