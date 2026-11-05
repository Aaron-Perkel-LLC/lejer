import type { Metadata } from "next";
import Flash from "@/app/components/Flash";
import { readOnlyReason, requireUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { OVERDUE_EVERY_DAYS } from "@/lib/reminders";
import { localDate, localHour } from "@/lib/time";
import type { Household, ReminderRun } from "@/lib/types";
import { FEATURES, type Feature, hasFeature } from "@/lib/features";
import { settingsFormFrom } from "@/lib/settings";
import { GRACE_DAYS, REQUEST_DAYS } from "@/lib/deletion";
import { householdPath } from "@/lib/paths";
import { loadSettings } from "@/lib/views";
import LeaveOrDelete from "./LeaveOrDelete";
import SettingsForm from "./SettingsForm";
import UtilitiesSection from "./UtilitiesSection";
import { hourLabel, scheduleSentence } from "./schedule";

export const metadata: Metadata = { title: "Settings" };

// Every household setting (ARCHITECTURE.md §7). Everyone can read them; only admins get the form.
// The Utilities (bill types) come first: they are a new household's first step (nothing can be
// posted without one; the Overview and Bills link here, to #utilities), and each saves on its
// own, so they can't sit inside the form. Then the form, and last "Leave or delete", which is
// everyone's: members leave and download the CSV here too. The header slot stays empty: the form's
// Save follows you in its sticky bar, and the title's muted line says which parts save themselves.
export default async function SettingsPage({ searchParams }: PageProps<"/[household]/household/settings">) {
  const ctx = await requireUser();
  const { ok, err } = await searchParams;
  const { run, members, payerId, types, joined, lastAdmin, balance } = await loadSettings(ctx);
  const h = ctx.household;
  const writable = !readOnlyReason(ctx);
  const isAdmin = ctx.membership.role === "admin" && writable;
  const requestOpen = h.deletionRequestedAt !== null && h.deletionRequestedAt.getTime() > Date.now() - REQUEST_DAYS * 86_400_000;
  const readout = <Readout h={h} run={run} />;

  return (
    <main>
      <header className="mb-6">
        <span className="eyebrow mb-1">{h.name}</span>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-ink-muted">
          {ctx.demo ? "The demo's settings are read-only." : isAdmin ? "Utilities and the look save as you change them. Everything else saves together, with the button at the end." : "Only a household admin can change these."}
        </p>
      </header>
      <Flash ok={ok} err={err} />
      <div className="mb-8">
        <UtilitiesSection types={types} people={members} ledger={h.mode === "ledger"} canEdit={isAdmin} />
      </div>
      {isAdmin ? (
        <SettingsForm
          initial={settingsFormFrom(h, payerId)}
          context={{
            zones: Intl.supportedValuesOf("timeZone"),
            householdName: h.name,
            slug: h.slug,
            savedMode: h.mode,
            savedPayerId: payerId === null ? "" : String(payerId),
            members,
            overdueEvery: OVERDUE_EVERY_DAYS,
            readout,
          }}
        />
      ) : (
        <ReadOnly h={h} readout={readout} payer={members.find((m) => m.id === payerId)?.name ?? null} />
      )}

      {writable && (
        <div className="mt-8">
          <LeaveOrDelete
            householdName={h.name}
            exportHref={householdPath(h, "/household/export")}
            isAdmin={isAdmin}
            lastAdmin={lastAdmin}
            alone={joined <= 1}
            joinedCount={joined}
            requestOpen={requestOpen}
            balance={balance}
            graceDays={GRACE_DAYS}
            requestDays={REQUEST_DAYS}
          />
        </div>
      )}
    </main>
  );
}

function when(d: Date, timezone: string): string {
  return d.toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "What the cron last did, and when it will next send", in the household's own time. */
function nextBatch(h: Household, run: ReminderRun): string {
  if (!h.remindersEnabled) return "Off";
  if (!run.lastRunAt) return "After the first check-in";
  const today = localDate(h.timezone);
  if (run.lastSendDate && run.lastSendDate >= today) return `Tomorrow, ${hourLabel(h.sendHour)}`;
  if (localHour(h.timezone) >= h.sendHour) return "At the next check-in";
  return `Today, ${hourLabel(h.sendHour)}`;
}

function Readout({ h, run }: { h: Household; run: ReminderRun }) {
  // Times and counts read in the ledger face; the "not yet" kind of answer is plain words.
  const next = nextBatch(h, run);
  const items = [
    { label: "Last check-in", value: run.lastRunAt ? when(run.lastRunAt, h.timezone) : "Not yet", figure: !!run.lastRunAt },
    { label: "Last batch", value: run.lastSentAt ? `${when(run.lastSentAt, h.timezone)} · ${run.lastSentCount} sent` : "None yet", figure: !!run.lastSentAt },
    { label: "Next batch", value: next, figure: /\d/.test(next) },
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-line-soft pt-4 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="eyebrow mb-0.5">{i.label}</dt>
          <dd className={`text-sm ${i.figure ? "figure" : ""}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnly({ h, readout, payer }: { h: Household; readout: React.ReactNode; payer: string | null }) {
  const on = (Object.keys(FEATURES) as Feature[]).filter((k) => hasFeature(h, k));
  const groups: { title: string; rows: { label: string; value: string }[]; extra?: React.ReactNode; note?: string }[] = [
    {
      title: "Household",
      rows: [
        { label: "Name", value: h.name },
        ...(h.tagline ? [{ label: "Tagline", value: h.tagline }] : []),
        { label: "Time zone", value: h.timezone.replaceAll("_", " ") },
        { label: "Bills are split", value: h.mode === "single_payer" ? `${payer ?? "One person"} pays every bill` : "Each bill type has its own owner" },
      ],
    },
    { title: "Look", rows: [{ label: "Theme", value: h.theme === "peach" ? "Peach" : h.theme === "japandi" ? "Japandi" : h.theme === "sheet" ? "Drafting sheet" : h.colorScheme === "light" ? "Statement, always light" : "Statement, matches your device" }] },
    {
      title: "Features",
      rows: [
        { label: "Turned on", value: on.length ? on.map((k) => FEATURES[k].label).join(", ") : "None" },
        ...(h.featureRent && h.monthlyRent !== null ? [{ label: "Monthly rent", value: `$${h.monthlyRent.toFixed(2)}` }] : []),
        ...(h.featureRent && h.leaseStart && h.leaseEnd ? [{ label: "Lease", value: `${h.leaseStart} to ${h.leaseEnd}` }] : []),
      ],
    },
    {
      title: "Bills",
      rows: [
        { label: "Statement date", value: h.askBillDate ? "Asked when posting" : "The day it's posted" },
        { label: "Bills per page", value: String(h.billsPerPage) },
      ],
    },
    {
      title: "Reminders",
      rows: [{ label: "Reminder emails", value: h.remindersEnabled ? "On" : "Off" }],
      note: h.remindersEnabled
        ? scheduleSentence({ first: h.firstReminderDays, urgent: h.urgentReminderDays, hour: h.sendHour, overdueEvery: OVERDUE_EVERY_DAYS })
        : undefined,
      extra: readout,
    },
    {
      title: "Email",
      rows: [
        { label: "Inboxes show", value: `${h.fromName || h.name} via ${BRAND.name}` },
        { label: "Replies go to", value: h.replyTo ?? "Nobody set" },
        { label: "Digest copies to", value: h.digestEmail ?? "Nobody" },
      ],
    },
  ];
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.title} id={g.title.toLowerCase()} aria-labelledby={`group-${g.title}`} className="scroll-mt-6">
          <div className="mb-2 flex items-center gap-3">
            <h2 id={`group-${g.title}`} className="eyebrow">
              {g.title}
            </h2>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel space-y-4 p-5">
            <dl className="space-y-2">
              {g.rows.map((r) => (
                <div key={r.label} className="flex flex-wrap justify-between gap-x-6 gap-y-0.5">
                  <dt className="text-sm text-ink-muted">{r.label}</dt>
                  <dd className="text-sm font-medium [overflow-wrap:anywhere]">{r.value}</dd>
                </div>
              ))}
            </dl>
            {g.note && <p className="text-sm text-ink-muted">{g.note}</p>}
            {g.extra}
          </div>
        </section>
      ))}
    </div>
  );
}
