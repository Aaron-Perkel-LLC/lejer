import type { Household, Theme } from "@/lib/types";

/**
 * Every theme a household can pick (lib/theme-tokens.ts has their colors), in the order the
 * choice cards show them: sheet first, since it is the default for a new household.
 */
export const THEMES: readonly Theme[] = ["sheet", "statement", "peach", "japandi"];

/** The look a new household starts with (also the column default, 0008), and the fallback when there is no household. */
export const DEFAULT_THEME: Theme = "sheet";

/**
 * What goes on <html>: the theme, and the color scheme it may use. Only statement has a dark
 * mode; peach, japandi and sheet are light whatever the household's column says.
 */
export function themeAttrs(h: Pick<Household, "theme" | "colorScheme"> | null | undefined): { theme: Theme; scheme: "system" | "light" } {
  const theme = h?.theme ?? DEFAULT_THEME;
  return { theme, scheme: theme === "statement" ? (h?.colorScheme ?? "system") : "light" };
}
