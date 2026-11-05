/**
 * Renders the ?ok= / ?err= message a server action redirected back with (lib/flash.ts), in the
 * household theme's flash panel or, with `site`, the public site's inked note (site.css).
 */
export default function Flash({ ok, err, site = false }: { ok?: string | string[]; err?: string | string[]; site?: boolean }) {
  const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const error = pick(err);
  const success = pick(ok);
  if (error) return <div className={site ? "s-alert" : "flash flash-err"} role="alert">{error}</div>;
  if (success) return <div className={site ? "s-notice" : "flash flash-ok"} role="status">{success}</div>;
  return null;
}
