import type { Metadata } from "next";
import Link from "next/link";
import Flash from "@/app/components/Flash";
import { getMyHouseholds, requireMemberUser } from "@/lib/context";
import { householdPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Your households" };

// Every household you're in, each at its own URL. Opening a pending invite accepts it (getCtx).
// In the public site's look (SiteShell): this page belongs to no household. Leaving a household
// lands here, with its ?ok= message.
export default async function HouseholdsPage({ searchParams }: PageProps<"/households">) {
  const { ok, err } = await searchParams;
  const user = await requireMemberUser();
  const households = await getMyHouseholds();

  return (
    <main className="s-wrap s-account">
      <span className="s-key">{user.email}</span>
      <h1 className="s-h1">Your households</h1>
      <Flash ok={ok} err={err} site />

      {households.length === 0 ? (
        <p className="s-lede">You aren&apos;t in a household yet.</p>
      ) : (
        <ul className="s-list">
          {households.map((h) => (
            <li key={h.id}>
              <div>
                <span className="s-list-name">{h.name}</span>
                <span className="s-list-meta">
                  <span className="s-mono">{householdPath(h)}</span> · {h.role}
                  {h.joinedAt ? "" : " · new invite"}
                </span>
              </div>
              <Link className="s-btn s-btn-sm s-btn-line" href={householdPath(h)}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Link href="/new" className="s-btn">
          Start a new household
        </Link>
      </p>
    </main>
  );
}
