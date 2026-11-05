import type { Metadata, Viewport } from "next";
import { getSessionUser, homePath } from "@/lib/context";
import { baseMetadata } from "@/app/metadata";
import SiteShell from "./SiteShell";

// The public site's root layout (lib/site.ts): "/" is this site for everyone, with
// /how-it-works, /about and /login, so the home page's sign-up form carries on into the code
// step in one look. The shell itself is SiteShell, shared with app/(app)'s root.
export const metadata: Metadata = baseMetadata;

export const viewport: Viewport = {
  themeColor: "#f3f5f4",
  colorScheme: "light",
  viewportFit: "cover", // the safe-area rule on body, globals.css
};

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <SiteShell user={user} home={user ? await homePath(user) : null}>
      {children}
    </SiteShell>
  );
}
