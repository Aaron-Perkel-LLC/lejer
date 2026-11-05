import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { loadTour } from "@/lib/views";
import Tour from "./Tour";

export const metadata: Metadata = { title: "How it works" };

// The welcome tour (feature_welcome_tour). Only onboarding sends anyone here, the household's
// creator straight after /new; everyone else is offered it in the overview's banner until they
// finish or dismiss it, and the footer's link brings it back any time.
export default async function WelcomePage() {
  const ctx = await requireUser();
  requireFeature(ctx, "welcomeTour");
  const owners = await loadTour(ctx);
  const h = ctx.household;
  return (
    <Tour
      name={ctx.user.name}
      household={h.name}
      mode={h.mode}
      owners={owners}
      reminders={h.remindersEnabled ? { first: h.firstReminderDays, urgent: h.urgentReminderDays } : null}
      firstVisit={!ctx.membership.welcomedAt}
    />
  );
}
