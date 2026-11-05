"use client";

import CopyField from "@/app/components/CopyField";
import { count, fmtWhen } from "./format";
import type { WaitlistDto } from "./types";

/**
 * The coming-soon page's sign-ups (0015), and who has had the launch note (0018). The note is
 * written in the Email section with the waitlist as its audience; this is the list and a way
 * to copy the addresses out.
 */
export default function WaitlistSection({ waitlist, onCompose }: { waitlist: WaitlistDto[]; onCompose: () => void }) {
  const waiting = waitlist.filter((w) => w.notifiedAt === null);
  const told = waitlist.length - waiting.length;
  if (waitlist.length === 0) return <p className="s-prose">Nobody has joined the waitlist.</p>;
  return (
    <div className="s-admin-stack">
      <div className="s-admin-actions">
        <button type="button" className="s-btn s-btn-sm" onClick={onCompose} disabled={waiting.length === 0}>
          {waiting.length === 0 ? "Everyone has been told" : `Write to the ${count(waiting.length, "address", "addresses")} waiting`}
        </button>
        <span className="s-hint">
          {told === 0 ? "The launch note hasn't gone out yet." : `${count(told, "address has", "addresses have")} had the launch note${waiting.length ? `; ${waiting.length} still waiting` : ""}.`}
        </span>
      </div>
      <CopyField
        id="waitlist-all"
        label={waiting.length > 0 && waiting.length < waitlist.length ? "Addresses still waiting, comma-separated" : "Every address, comma-separated"}
        value={(waiting.length > 0 ? waiting : waitlist).map((w) => w.email).join(", ")}
        labelClass="s-label"
        inputClass="s-input s-mono s-input-sm"
        buttonClass="s-btn s-btn-line s-btn-sm"
      />
      <table className="s-table">
        <thead>
          <tr>
            <th scope="col">Address</th>
            <th scope="col">Joined</th>
            <th scope="col">Told</th>
          </tr>
        </thead>
        <tbody>
          {waitlist.map((w) => (
            <tr key={w.email}>
              <td className="s-mono">{w.email}</td>
              <td className="s-mono s-nowrap">{fmtWhen(w.createdAt)}</td>
              <td className="s-mono s-nowrap">{w.notifiedAt ? fmtWhen(w.notifiedAt) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
