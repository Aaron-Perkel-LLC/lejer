import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";
import { THANKS_DELAY_MINUTES } from "@/lib/thanks-delay";

// The ten-minute wake-up (ARCHITECTURE.md §8 "Wake-ups", decided 2026-10-22). Both queues
// (lib/notices.ts, lib/thanks.ts) hold mail for a window and are flushed by the hourly tick and
// by bill mutations, so with nothing else happening in a household its new-bill email could wait
// up to ~70 minutes. A faster cron is out (Neon's CU budget, §10), so a bill action that leaves
// something queued publishes ONE Vercel Queues message with the window as its delay; the private
// consumer (app/api/queues/flush) flushes that household when it arrives. The tick stays the
// fallback: a lost message costs the old wait, never the email.
//
// Off Vercel this is a no-op: local dev and verify never publish (a `vercel env pull` leaves an
// OIDC token in .env.local, and the SDK pins messages to VERCEL_DEPLOYMENT_ID anyway). Every
// failure is caught: scheduling runs in after(), and a nudge that fails must never fail the action.

export const WAKE_TOPIC = "flush-queues";

/** The message: which household to flush. The flush itself decides what has waited long enough. */
export interface WakeMessage {
  householdId: number;
}

export interface WakeOptions {
  delaySeconds: number;
  retentionSeconds: number;
  idempotencyKey: string;
}

export type WakeSender = (topic: string, body: WakeMessage, opts: WakeOptions) => Promise<unknown>;

/**
 * Seconds until the wake-up. A minute past the longer window, because the idempotency key is
 * per minute (`wakeKey`): several posts inside one minute collapse into one message, which must
 * still land after the last of them has waited its full window.
 */
export const WAKE_DELAY_SECONDS = Math.max(NOTICE_DELAY_MINUTES, THANKS_DELAY_MINUTES) * 60 + 60;

/** An hour: long past the delay, short enough that a stale nudge never outlives its day. */
export const WAKE_RETENTION_SECONDS = 3600;

export function wakeKey(householdId: number, now: Date): string {
  return `h${householdId}:${Math.floor(now.getTime() / 60_000)}`;
}

/** True on a Vercel deployment (production or preview), where the SDK can publish and consume. */
export const onVercel = (env: NodeJS.ProcessEnv = process.env): boolean => env.VERCEL === "1";

/** Where the topic lives: the function's own region (vercel.ts pins everything to iad1). */
export const WAKE_REGION = "iad1";

async function defaultSender(topic: string, body: WakeMessage, opts: WakeOptions): Promise<unknown> {
  const { QueueClient } = await import("@vercel/queue");
  return new QueueClient({ region: WAKE_REGION }).send(topic, body, opts);
}

/**
 * Publishes the household's wake-up. "skipped" off Vercel, "failed" (logged) when the publish
 * throws; neither ever throws.
 */
export async function scheduleFlush(
  householdId: number,
  opts: { now?: Date; send?: WakeSender; env?: NodeJS.ProcessEnv } = {},
): Promise<"scheduled" | "skipped" | "failed"> {
  if (!onVercel(opts.env)) return "skipped";
  const now = opts.now ?? new Date();
  try {
    await (opts.send ?? defaultSender)(WAKE_TOPIC, { householdId }, {
      delaySeconds: WAKE_DELAY_SECONDS,
      retentionSeconds: WAKE_RETENTION_SECONDS,
      idempotencyKey: wakeKey(householdId, now),
    });
    return "scheduled";
  } catch (e) {
    console.error(`wake: couldn't schedule household ${householdId}'s flush:`, e);
    return "failed";
  }
}
