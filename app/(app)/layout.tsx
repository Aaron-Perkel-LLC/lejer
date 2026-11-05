import type { Metadata, Viewport } from "next";
import SiteShell from "@/app/(site)/SiteShell";
import { baseMetadata } from "@/app/metadata";
import { getSessionUser, homeHousehold, homePath } from "@/lib/context";
import { isSuperadmin } from "@/lib/superadmin";

// Root layout for the pages outside any household: /account, /households, /new. They wear the
// public site's look (SiteShell, like /login), not a household theme: there is no household
// here to take one from. Household pages have their own root at app/(household)/[household]
// (AppShell), and crossing between the two is a full page load. Someone who came from a
// household gets a way straight back that names it ("← 7 Oak Lane") in place of the site's page
// links and its "Open your household" button.
export const metadata: Metadata = baseMetadata;

export const viewport: Viewport = {
  themeColor: "#f3f5f4",
  colorScheme: "light",
  viewportFit: "cover", // the safe-area rule on body, globals.css
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const back = user ? await homeHousehold(user) : null;
  const operator = !!user && isSuperadmin(user);
  return (
    <SiteShell user={user} home={user ? await homePath(user) : null} back={back} operator={operator}>
      {children}
    </SiteShell>
  );
}
