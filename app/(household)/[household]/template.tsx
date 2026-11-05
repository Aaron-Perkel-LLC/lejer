import ThemeSync from "@/app/components/ThemeSync";
import { getCtx } from "@/lib/context";
import { themeAttrs } from "@/lib/theme";

// Re-rendered on every navigation (a layout is not), so the theme on <html> follows a
// Settings save without a full load. getCtx() is cached per request: no extra query.
export default async function HouseholdTemplate({ children }: { children: React.ReactNode }) {
  const { theme, scheme } = themeAttrs((await getCtx())?.household);
  return (
    <>
      <ThemeSync theme={theme} scheme={scheme} />
      {children}
    </>
  );
}
