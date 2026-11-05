import type { Metadata } from "next";
import { type AdminHousehold, FAILURE_DAYS, loadAdmin } from "@/lib/admin";
import { BRAND } from "@/lib/brand";
import { requireSuperadmin } from "@/lib/superadmin";
import { deleteHouseholdAction, deleteUserAction, sendOperatorNoteAction } from "./actions";
import AdminSections from "./AdminSections";
import { count, fmtDate } from "./format";
import type { HouseholdDto, PersonDto, WaitlistDto } from "./types";

// The operator's page (ARCHITECTURE.md §4 "Cross-household reads for the operator"), in
// sections (AdminSections.tsx): an overview of the service and what needs attention, every
// household and every person as sortable tables whose rows open to their facts and their
// delete, the compose form for a note about the service with its audience picked in place and
// the mail log beneath it, and the launch waitlist. Everything is loaded once here
// (lib/admin.ts) and handed to the sections as plain data; the three writes are the actions in
// actions.ts. Nothing is a link into a household: the operator isn't a member, and the page
// shows no amounts or statements.

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

function deletionState(h: AdminHousehold): string | null {
  if (h.deleteAfter) return `deleting on ${fmtDate(iso(h.deleteAfter))}`;
  if (h.deletionRequestedAt) return `deletion requested ${fmtDate(iso(h.deletionRequestedAt))}`;
  return null;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireSuperadmin();
  const { ok, err } = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const now = new Date();
  const v = await loadAdmin(user, now);

  const households: HouseholdDto[] = v.households.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    mode: h.mode,
    theme: h.theme,
    createdAt: iso(h.createdAt)!,
    lastActivity: iso(h.lastActivity)!,
    memberCount: h.memberCount,
    joinedCount: h.joinedCount,
    billCount: h.billCount,
    remindersEnabled: h.remindersEnabled,
    deletion: deletionState(h),
    lastRunAt: iso(h.lastRunAt),
    lastTickOutcome: h.lastTickOutcome,
    lastSentAt: iso(h.lastSentAt),
    lastSentCount: h.lastSentCount,
    members: v.membersByHousehold.get(h.id) ?? [],
  }));
  const people: PersonDto[] = v.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: iso(u.createdAt)!,
    operator: u.operator,
    mutedUpdates: u.mutedUpdates,
    seats: u.memberships.map((m) => ({ householdId: m.householdId, householdName: m.householdName, slug: m.slug, role: m.role, joined: m.joinedAt !== null })),
  }));
  const waitlist: WaitlistDto[] = v.waitlist.map((w) => ({ email: w.email, createdAt: iso(w.createdAt)!, notifiedAt: iso(w.notifiedAt) }));

  return (
    <main className="s-wrap s-admin">
      <header className="s-admin-head">
        <h1 className="s-h1">Admin</h1>
        <p className="s-lede">
          {BRAND.name} has {count(v.totals.households, "household")}, {count(v.totals.users, "person", "people")} and {count(v.totals.bills, "bill")} on record.
        </p>
      </header>
      <AdminSections
        now={now.toISOString()}
        totals={v.totals}
        households={households}
        people={people}
        waitlist={waitlist}
        today={v.today}
        failures={v.failures.map((f) => ({ sentAt: iso(f.sentAt)!, kind: f.kind, householdName: f.householdName }))}
        weekly={v.weekly}
        budget={v.budget}
        failureDays={FAILURE_DAYS}
        contactEmail={BRAND.contactEmail}
        flash={{ ok: one(ok), err: one(err) }}
        actions={{ deleteHousehold: deleteHouseholdAction, deleteUser: deleteUserAction, sendNote: sendOperatorNoteAction }}
      />
    </main>
  );
}
