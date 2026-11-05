import type { Metadata } from "next";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { readOnlyReason, requireUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { withHousehold } from "@/lib/db";
import { DEMO_PEOPLE } from "@/lib/demo";
import { hasFeature } from "@/lib/features";
import { householdPath } from "@/lib/paths";
import type { Role } from "@/lib/types";
import Link from "next/link";
import InviteDialog from "./InviteDialog";
import MemberEditDialog from "./MemberEditDialog";

export const metadata: Metadata = { title: "Members" };

interface MemberView {
  id: number;
  name: string;
  email: string;
  role: Role;
  splitsBills: boolean;
  joinedAt: Date | null;
  invitedAt: Date | null;
}

// Members: everyone in the household and their role. Everyone can read it; admins get "+ Invite"
// in the header slot, "Email everyone" on the list's rule and Edit on each row, and nobody gets
// controls while the household is read-only. Utilities, leaving and deleting live in Settings.
export default async function MembersPage({ searchParams }: PageProps<"/[household]/household">) {
  const ctx = await requireUser();
  const { ok, err } = await searchParams;
  const marked = ctx.household.deleteAfter !== null;
  const isAdmin = ctx.membership.role === "admin" && !marked;

  const members: MemberView[] = ctx.demo
    ? DEMO_PEOPLE.map((p) => ({ ...p, joinedAt: new Date(), invitedAt: null }))
    : await withHousehold(ctx, (tx) => tx<MemberView[]>`
        SELECT m.id, u.name, u.email, m.role, m.splits_bills AS "splitsBills",
               m.joined_at AS "joinedAt", m.invited_at AS "invitedAt"
        FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.household_id = app_household_id() -- memberships_read also admits my rows elsewhere
        ORDER BY m.joined_at IS NULL, u.name`);
  const joined = members.filter((m) => m.joinedAt);
  const pending = members.length - joined.length;

  const shortDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ctx.household.timezone });

  return (
    <main className="space-y-8">
      <div>
        {/* The page header: title on the left, the page's one action in the slot on its right. */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <span className="eyebrow mb-1">{ctx.household.name}</span>
            <h1 className="page-title">Members</h1>
          </div>
          {isAdmin && <InviteDialog householdName={ctx.household.name} brand={BRAND.name} />}
        </header>
        <Flash ok={ok} err={err} />
      </div>

      <section>
        <div className="mb-2 flex items-center gap-3">
          <span className="eyebrow">
            {joined.length} {joined.length === 1 ? "person" : "people"}
            {pending > 0 ? ` · ${pending} invited` : ""}
          </span>
          <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          {/* A section action: the note goes to the people listed here. */}
          {isAdmin && hasFeature(ctx.household, "bulkEmail") && (
            <Link href={householdPath(ctx.household, "/household/email")} className="btn btn-sm">
              Email everyone
            </Link>
          )}
        </div>
        <div className="panel panel-primary overflow-hidden">
          <table className="data-table table-stack table-stack-people">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {isAdmin && (
                  <th className="num">
                    <span className="sr-only">Manage</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="cell-name">
                    <span className="font-medium">{m.name}</span>
                    {m.id === ctx.membership.id && <span className="ml-1 text-ink-muted">(you)</span>}
                    <span className="block text-xs text-ink-muted">
                      {m.joinedAt ? "Joined" : `Invited ${m.invitedAt ? shortDate(m.invitedAt) : ""}, hasn't signed in`}
                      {m.splitsBills ? "" : " · doesn't split bills"}
                    </span>
                  </td>
                  <td className="cell-email text-ink-muted">{m.email}</td>
                  <td className="cell-role">
                    <span className="tag tag-open">{m.role}</span>
                  </td>
                  {isAdmin && (
                    <td className="cell-actions num">
                      <MemberEditDialog
                        member={{ id: m.id, name: m.name, email: m.email, role: m.role, splitsBills: m.splitsBills, joined: m.joinedAt !== null }}
                        householdName={ctx.household.name}
                        isSelf={m.id === ctx.membership.id}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Utilities (who fronts which bill) and leaving or deleting the household are in{" "}
          <Link href={householdPath(ctx.household, "/household/settings")} className="underline decoration-line underline-offset-2 hover:text-ink">
            Settings
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
