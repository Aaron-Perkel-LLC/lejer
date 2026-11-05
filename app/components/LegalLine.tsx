import Link from "next/link";
import { BRAND } from "@/lib/brand";

// The legal line every footer ends with: "{name} · © {year} {legal name} · Contact · Privacy".
// Site and app footers both render it (SiteShell, AppShell) and dress it through the two class
// props, since the site has its own `s-*` classes and the app uses utilities.
export default function LegalLine({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const sep = <span aria-hidden="true"> · </span>;
  return (
    <p className={className}>
      <span>{BRAND.name}</span>
      {sep}
      <span>
        © {new Date().getFullYear()}{" "}
        <a className={linkClassName} href={BRAND.legalUrl}>
          {BRAND.legalName}
        </a>
      </span>
      {sep}
      <a className={linkClassName} href={`mailto:${BRAND.contactEmail}`}>
        Contact
      </a>
      {sep}
      <Link className={linkClassName} href="/privacy">
        Privacy
      </Link>
    </p>
  );
}
