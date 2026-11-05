import { BRAND } from "@/lib/brand";
import { launchHeading } from "@/lib/gate";
import Waitlist from "./Waitlist";

// "/" while the launch gate is on (lib/gate.ts): calm, no demo, one form (the waitlist). The heading
// names launch day (LAUNCH_DATE) until it has passed. The header still carries Sign in / Open your
// household for the people on the allowlist.
export default function ComingSoon() {
  return (
    <main className="s-wrap s-login">
      <span className="s-key">Coming soon</span>
      <h1 className="s-h1">{launchHeading()}</h1>
      <p className="s-lede">
        A calm way to split the bills you share with the people you live with: every bill on the record, everyone&apos;s
        share in plain sight, nobody chasing anyone. Free, with no ads, and it never moves money.
      </p>
      <Waitlist />
      <p className="s-hint">
        Questions?{" "}
        <a className="s-link" href={`mailto:${BRAND.contactEmail}`}>
          {BRAND.contactEmail}
        </a>
      </p>
    </main>
  );
}
