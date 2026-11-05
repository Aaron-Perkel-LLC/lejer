import { QueueClient } from "@vercel/queue";
import { flushHousehold } from "@/lib/cron";
import { WAKE_REGION, type WakeMessage } from "@/lib/wake";

// The ten-minute wake-up's consumer (lib/wake.ts; ARCHITECTURE.md §8 "Wake-ups"). Vercel
// invokes it with each `flush-queues` message once its delay has passed (the trigger is in
// vercel.ts), and nothing else can: a queue consumer has no public URL. The work is idempotent
// and on the real clock, so a redelivery, or a duplicate from two posts in one minute, sends
// nothing a flush hasn't already sent. A message that keeps failing is acknowledged after three
// tries: the hourly tick runs the same flush and stamps the error where /admin shows it.

export const maxDuration = 60;

// The region named so the SDK never guesses it (it warned at build time); same as the sender's.
const { handleCallback } = new QueueClient({ region: WAKE_REGION });

export const POST = handleCallback<WakeMessage>(
  async (message) => {
    const id = Number(message?.householdId);
    if (!Number.isInteger(id) || id <= 0) {
      console.error("queues/flush: malformed message", message);
      return; // acknowledged: redelivering it can't help
    }
    const out = await flushHousehold(id);
    console.log(`queues/flush: household ${id}: ${out.skipped ?? `thanks ${out.thanks.sent}/${out.thanks.failed}, notices ${out.notices.sent}/${out.notices.failed}`}`);
  },
  { retry: (_error, meta) => (meta.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 60 }) },
);
