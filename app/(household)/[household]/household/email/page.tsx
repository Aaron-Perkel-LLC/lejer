import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Flash from "@/app/components/Flash";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { nameList } from "@/emails/Shell";
import { householdPath } from "@/lib/paths";
import { nextUtcMidnight } from "@/lib/time";
import { loadBulkEmail } from "@/lib/views";
import BulkEmailForm from "./BulkEmailForm";

export const metadata: Metadata = { title: "Email everyone" };

// Bulk email (feature_bulk_email): an admin's note to everyone who has signed in.
export default async function BulkEmailPage({ searchParams }: PageProps<"/[household]/household/email">) {
  const ctx = await requireAdmin();
  if (!ctx.household.featureBulkEmail) notFound();
  const { ok, err } = await searchParams;
  const { joined, pending, muted, fits } = await loadBulkEmail(ctx);
  const retryAfter = `${nextUtcMidnight(ctx.household.timezone).local} (${ctx.household.timezone.replaceAll("_", " ")} time)`;

  return (
    <main>
      <header className="mb-6">
        <Link href={householdPath(ctx.household, "/household")} className="mb-2 inline-block text-sm text-ink-muted no-underline hover:text-ink">
          ← Members
        </Link>
        <span className="eyebrow mb-1">{ctx.household.name}</span>
        <h1 className="page-title">Email everyone</h1>
      </header>
      <Flash ok={ok} err={err} />
      <p className="mb-4 max-w-[65ch] text-sm text-ink-muted">
        {joined.length === 0
          ? "Nobody has signed in yet, so there's no one to email."
          : `Goes to ${nameList(joined.map((j) => j.name))}.`}
        {pending.length > 0 && ` Not to ${nameList(pending)}, who ${pending.length === 1 ? "hasn't" : "haven't"} signed in yet.`}
        {muted.length > 0 && ` Not to ${nameList(muted)}, who ${muted.length === 1 ? "has" : "have"} unsubscribed from these notes.`}
      </p>
      <BulkEmailForm count={joined.length} fits={fits} retryAfter={retryAfter} />
    </main>
  );
}
