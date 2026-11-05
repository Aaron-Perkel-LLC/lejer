import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import { householdPath } from "@/lib/paths";
import type { Household } from "@/lib/types";
import { finishWelcome } from "./actions";

/**
 * The overview's offer of the tour to a member who hasn't taken it (feature_welcome_tour,
 * `welcomed_at` NULL). The tour never interrupts a member: whoever arrives from an email, an invite
 * or the nav lands where they were going, and this strip stays until they finish the tour or
 * dismiss it, both stamping `welcomed_at` through `finishWelcome`. Only a household's creator is
 * sent to the tour, once, straight from /new.
 */
export default function WelcomeBanner({ household }: { household: Household }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-(--radius-md) border border-line-soft bg-accent-soft px-4 py-3 text-sm">
      <Link className="font-semibold underline decoration-line underline-offset-2 hover:decoration-ink" href={householdPath(household, "/welcome")}>
        New to {household.name}? Take the 30-second tour →
      </Link>
      <form action={finishWelcome}>
        <SubmitButton className="cursor-pointer text-ink-muted underline underline-offset-2 hover:text-ink" pendingLabel="Dismissing…">
          Dismiss
        </SubmitButton>
      </form>
    </div>
  );
}
