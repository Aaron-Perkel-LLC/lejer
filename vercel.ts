import type { VercelConfig } from "@vercel/config/v1";

// iad1 sits next to Neon's aws-us-east-1. The hourly tick (ARCHITECTURE.md §8) is a Vercel Cron
// Job: the project is on the Pro plan, whose crons run as often as every minute (Hobby's run
// once a day, which would defeat the per-household send hour). Vercel sends
// `Authorization: Bearer $CRON_SECRET` when the project has CRON_SECRET set, which is what the
// route checks, and crons run only on Production deployments, so previews never tick the dev
// data. Minute 7 keeps it off the top of the hour.
//
// The ten-minute wake-up (lib/wake.ts; ARCHITECTURE.md §8 "Wake-ups") is a Vercel Queues topic:
// a bill action publishes one delayed `flush-queues` message, and the trigger below hands it to
// app/api/queues/flush, which has no public URL. Three deliveries, then the message is dropped:
// the hourly tick runs the same flush and stamps a persistent error on /admin. The topic is
// spelled here rather than imported (this file is loaded by Vercel's config loader, not Next);
// the `cron` verify suite checks it against WAKE_TOPIC.
export const config: VercelConfig = {
  framework: "nextjs",
  regions: ["iad1"],
  crons: [{ path: "/api/cron/tick", schedule: "7 * * * *" }],
  functions: {
    "app/api/queues/flush/route.ts": {
      experimentalTriggers: [{ type: "queue/v2beta", topic: "flush-queues", maxDeliveries: 3, retryAfterSeconds: 60 }],
    },
  },
};
