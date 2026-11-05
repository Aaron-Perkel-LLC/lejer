import { BRAND } from "@/lib/brand";

// notFound() on the pages outside a household (/admin for anyone not the operator, and the
// rest of app/(app)): the same copy as app/global-not-found.tsx, inside SiteShell. A real 404
// status: this root has no loading.tsx to stream under.
export default function NotFound() {
  return (
    <main className="s-wrap">
      <div className="s-page-head">
        <p className="s-key">404</p>
        <h1 className="s-h1">There&apos;s no page at this address.</h1>
        <p className="s-lede">It may have moved, or the link has a typo.</p>
        <p className="s-demo-link s-404-actions">
          <a className="s-btn" href="/">
            Back to your household
          </a>
          <a className="s-link" href="/about">
            About {BRAND.name}
          </a>
        </p>
      </div>
    </main>
  );
}
