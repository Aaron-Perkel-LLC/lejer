import type { Metadata, Viewport } from "next";
import AppShell, { appViewport } from "@/app/components/AppShell";
import { baseMetadata } from "@/app/metadata";
import { redirect } from "next/navigation";
import { getCtx, getMyHouseholds, getSessionUser } from "@/lib/context";
import { ADMIN_PATH, isSuperadmin } from "@/lib/superadmin";

// Root layout for one household's pages, /{slug}/…, themed by that household. A root layout
// under the [household] segment re-renders when the slug changes, so moving between households
// never keeps the last one's name or theme (AppShell). Pages authorize themselves.

export const metadata: Metadata = baseMetadata;

export async function generateViewport(): Promise<Viewport> {
  return appViewport(await getCtx());
}

export default async function HouseholdLayout({ children }: LayoutProps<"/[household]">) {
  const [ctx, user, households] = await Promise.all([getCtx(), getSessionUser(), getMyHouseholds()]);
  // An operator account has no household pages. Thrown here, in the root layout, the redirect
  // goes out as a real 307: the page itself streams under loading.tsx, where a redirect() is
  // already a 200 with the redirect in the body.
  if (user && isSuperadmin(user)) redirect(ADMIN_PATH);
  return (
    <AppShell ctx={ctx} user={user} households={households}>
      {children}
    </AppShell>
  );
}
