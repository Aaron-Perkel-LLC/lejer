"use client";

import { useEffect } from "react";

/**
 * Keeps <html data-theme data-color-scheme> in step with the household after a client
 * navigation. The root layout sets them on the first load but is not re-rendered by a client
 * navigation, so saving a new theme in Settings (a server action that redirects back) left the
 * old one on <html> until a full load. The household template renders this on every
 * navigation with the household's current values; the trends chart watches the attribute.
 */
export default function ThemeSync({ theme, scheme }: { theme: string; scheme: string }) {
  useEffect(() => {
    const el = document.documentElement;
    if (el.dataset.theme !== theme) el.dataset.theme = theme;
    if (el.dataset.colorScheme !== scheme) el.dataset.colorScheme = scheme;
  }, [theme, scheme]);
  return null;
}
