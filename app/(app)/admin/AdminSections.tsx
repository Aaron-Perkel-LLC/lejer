"use client";

import { useCallback, useEffect, useState } from "react";
import Flash from "@/app/components/Flash";
import ComposeForm from "./ComposeForm";
import HouseholdsTable from "./HouseholdsTable";
import MailLog from "./MailLog";
import Overview from "./Overview";
import PeopleTable, { unreachable } from "./PeopleTable";
import WaitlistSection from "./WaitlistSection";
import { count, num } from "./format";
import {
  type Audience,
  type BudgetDto,
  type FailureDto,
  type FormAction,
  type HouseholdDto,
  type MailKindDto,
  type PersonDto,
  type Picks,
  SECTION_LABEL,
  SECTIONS,
  type Section,
  type TotalsDto,
  type WaitlistDto,
  type WeekDto,
} from "./types";

// The admin page's sections, one shown at a time: a list beside the content on a desktop, one
// picker on a phone, so it never reads as a second site nav. The open section lives in the
// hash (#people, #households:7 flashes that row, #email:waitlist opens the compose form on the
// waitlist), so links from Overview, the flash redirects after an action and a reload all land
// where the operator was. Every section is in the page, hidden, so a plain fetch of the page
// (verify's http suite, a reader without JavaScript) still carries all of it.

interface Props {
  now: string;
  totals: TotalsDto;
  households: HouseholdDto[];
  people: PersonDto[];
  waitlist: WaitlistDto[];
  today: MailKindDto[];
  failures: FailureDto[];
  weekly: WeekDto[];
  budget: BudgetDto;
  failureDays: number;
  contactEmail: string;
  flash: { ok?: string; err?: string };
  actions: { deleteHousehold: FormAction; deleteUser: FormAction; sendNote: FormAction };
}

const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v);
const isAudience = (v: string): v is Audience => ["everyone", "households", "users", "waitlist"].includes(v);

export default function AdminSections(p: Props) {
  const [section, setSection] = useState<Section>("overview");
  const [focus, setFocus] = useState<{ section: Section; id: number; n: number } | null>(null);
  const [audience, setAudience] = useState<Audience>("everyone");
  const [picks, setPicks] = useState<Picks>({ households: [], users: [] });

  useEffect(() => {
    const read = () => {
      const [raw, arg] = window.location.hash.slice(1).split(":");
      if (!isSection(raw)) return;
      setSection(raw);
      if ((raw === "households" || raw === "people") && arg) setFocus({ section: raw, id: Number(arg), n: Date.now() });
      else setFocus(null);
      if (raw === "email" && arg && isAudience(arg)) setAudience(arg);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = useCallback((s: Section, arg?: string) => {
    setSection(s);
    setFocus(null);
    history.replaceState(history.state, "", `#${s}${arg ? `:${arg}` : ""}`);
    window.scrollTo({ top: 0 });
  }, []);

  const pick = (kind: "households" | "users", id: number) =>
    setPicks((prev) => ({ ...prev, [kind]: prev[kind].includes(id) ? prev[kind].filter((x) => x !== id) : [...prev[kind], id] }));
  const emailHousehold = (id: number) => {
    setPicks((prev) => (prev.households.includes(id) ? prev : { ...prev, households: [...prev.households, id] }));
    setAudience("households");
    go("email");
  };
  const emailPerson = (id: number) => {
    setPicks((prev) => (prev.users.includes(id) ? prev : { ...prev, users: [...prev.users, id] }));
    setAudience("users");
    go("email");
  };

  const waiting = p.waitlist.filter((w) => w.notifiedAt === null).length;
  const reachable = p.people.filter((x) => unreachable(x) === null).length;
  const counts: Record<Section, string> = {
    overview: "",
    households: num(p.households.length),
    people: num(p.people.length),
    email: p.budget.today ? num(p.budget.today) : "",
    waitlist: p.waitlist.length ? num(p.waitlist.length) : "",
  };
  const summary: Record<Section, string> = {
    overview: "How the service is doing, and what needs a look.",
    households: `${count(p.households.length, "household")} · ${num(p.totals.membershipsJoined)} joined, ${num(p.totals.membershipsPending)} invited.`,
    people: `${count(p.people.length, "account")} · ${count(reachable, "person", "people")} can be emailed from here.`,
    email: "A note about the service, sent from the contact address with your reply address on it.",
    waitlist:
      p.waitlist.length === 0
        ? "Addresses left on the coming-soon page."
        : `${count(p.waitlist.length, "address", "addresses")} from the coming-soon page · ${waiting === 0 ? "everyone has had the launch note" : `${num(waiting)} waiting for the launch note`}.`,
  };

  const content: Record<Section, React.ReactNode> = {
    overview: <Overview totals={p.totals} households={p.households} today={p.today} failures={p.failures} weekly={p.weekly} budget={p.budget} failureDays={p.failureDays} now={p.now} />,
    households: <HouseholdsTable households={p.households} focus={focus?.section === "households" ? focus : null} now={p.now} onEmail={emailHousehold} deleteAction={p.actions.deleteHousehold} />,
    people: <PeopleTable people={p.people} focus={focus?.section === "people" ? focus : null} onEmail={emailPerson} deleteAction={p.actions.deleteUser} />,
    email: (
      <div className="s-admin-stack">
        <ComposeForm
          action={p.actions.sendNote}
          people={p.people.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            households: u.seats.filter((s) => s.joined).map((s) => s.householdId),
            pending: u.seats.filter((s) => !s.joined).map((s) => s.householdId),
            operator: u.operator,
            mutedUpdates: u.mutedUpdates,
          }))}
          households={p.households.map((h) => ({ id: h.id, name: h.name, joinedCount: h.joinedCount }))}
          waitlist={{ waiting, told: p.waitlist.length - waiting }}
          audience={audience}
          onAudience={setAudience}
          picks={picks}
          onPick={pick}
          budget={p.budget}
          contactEmail={p.contactEmail}
        />
        <MailLog today={p.today} failures={p.failures} failureDays={p.failureDays} budget={p.budget} />
      </div>
    ),
    waitlist: <WaitlistSection waitlist={p.waitlist} onCompose={() => go("email", "waitlist")} />,
  };

  return (
    <div className="s-admin-grid">
      <nav className="s-admin-nav" aria-label="Admin sections">
        <label className="s-admin-nav-phone">
          <span className="sr-only">Section</span>
          <select className="s-input s-input-sm" value={section} onChange={(e) => go(e.target.value as Section)}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
                {counts[s] ? ` (${counts[s]})` : ""}
              </option>
            ))}
          </select>
        </label>
        <ul className="s-admin-nav-list">
          {SECTIONS.map((s) => (
            <li key={s}>
              <button type="button" aria-current={section === s ? "true" : undefined} onClick={() => go(s)}>
                <span>{SECTION_LABEL[s]}</span>
                {counts[s] && <span className="s-admin-nav-count s-mono">{counts[s]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="s-admin-main">
        {SECTIONS.map((s) => (
          <section key={s} className="s-admin-section" aria-labelledby={`section-${s}`} hidden={section !== s}>
            <div className="s-admin-section-top">
              <h2 className="s-admin-h2" id={`section-${s}`}>
                {SECTION_LABEL[s]}
              </h2>
              <p className="s-hint">{summary[s]}</p>
            </div>
            {section === s && <Flash ok={p.flash.ok} err={p.flash.err} site />}
            {content[s]}
          </section>
        ))}
      </div>
    </div>
  );
}
