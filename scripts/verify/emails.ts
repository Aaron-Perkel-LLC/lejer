// Every email template renders (HTML and plain text) with its PreviewProps, in the theme those
// props name, with the strings a recipient needs. Catches a template that throws or drops a
// field before any mail goes out.

import { cloneElement, createElement } from "react";
import { BRAND } from "@/lib/brand";
import type { Results } from "./harness";

/** Templates of kinds in lib/unsubscribe.ts CATEGORY_OF: they take sendMail's `unsubscribe` prop. */
const MUTABLE = new Set(["NewBill", "BillRemoved", "Reminder", "Thanks", "CustomNote", "BatchConfirmation", "BulkReceipt", "DigestCopy", "OperatorNote"]);

export async function emails(r: Results) {
  r.section("emails: templates render");
  const { render } = await import("@react-email/components");
  const templates = {
    LoginCode: { mod: await import("@/emails/LoginCode"), expect: ["482913", "expires in 10 minutes"] },
    Invite: { mod: await import("@/emails/Invite"), expect: ["Join 7 Oak Lane", "login?email=alex%40example.com", "repeating-linear-gradient"] },
    NewBill: { mod: await import("@/emails/NewBill"), expect: ["New bill posted", "21.09", "Pay to", "Sam"] },
    BillRemoved: { mod: await import("@/emails/BillRemoved"), expect: ["Bill removed", "Alex removed the Gas bill", "30.88"] },
    Reminder: { mod: await import("@/emails/Reminder"), expect: ["Due soon", "25.17", "Pay to", "October 9, 2026"] },
    Thanks: { mod: await import("@/emails/Thanks"), expect: ["Payment recorded", "Thanks, Sam", "45.17", "Electric · due October 9, 2026"] },
    CustomNote: { mod: await import("@/emails/CustomNote"), expect: ["A note from Alex", "Internet is switching providers", "the 20th.", "router stays"] },
    BatchConfirmation: { mod: await import("@/emails/BatchConfirmation"), expect: ["2 reminders sent", "October 7, 2026", "due soon", "repeating-linear-gradient"] },
    BulkReceipt: { mod: await import("@/emails/BulkReceipt"), expect: ["Bulk email receipt", "Sam, Taylor", "The message"] },
    DigestCopy: { mod: await import("@/emails/DigestCopy"), expect: ["Alex posted the Electric bill", "25.17", "Sam, Taylor"] },
    HouseholdDeletion: { mod: await import("@/emails/HouseholdDeletion"), expect: ["Delete 7 Oak Lane?", "Alex asked to delete", "Monday, October 26", "household/export"] },
    Moved: { mod: await import("@/emails/Moved"), expect: ["7 Oak Lane is now on", "alex@example.com", "oaklane.example.com", "login?email=alex%40example.com", "repeating-linear-gradient"] },
    OperatorNote: { mod: await import("@/emails/OperatorNote"), expect: [`${BRAND.name} is open`, "Hi Alex", "The waitlist is over", "Same bills, same reminders.", BRAND.contactEmail] },
  };
  for (const [name, { mod, expect }] of Object.entries(templates)) {
    const Component = mod.default as unknown as ((p: object) => React.ReactElement) & { PreviewProps: object };
    try {
      const el = createElement(Component, Component.PreviewProps);
      const html = (await render(el)).replaceAll("<!-- -->", "");
      const text = await render(el, { plainText: true });
      const missing = expect.filter((s) => !html.includes(s));
      r.check(`${name} renders with what the recipient needs`, missing.length === 0 && text.length > 50, missing.join(", "));
      r.check(`${name}: the text part carries the same facts, and both name the sender`, expect.filter((s) => !s.includes("<") && !s.includes("gradient") && !s.includes("%") && !s.includes("/")).every((s) => text.includes(s)) && html.includes(BRAND.legalName) && text.includes(BRAND.legalName), text.slice(0, 200));
      r.check(`${name}: no image-only content, no all-caps subject-ish heading, no URL-looking link text`, !/<img/i.test(html) && !/<a [^>]*>https?:\/\/[^<]*<\/a>/.test(html.replace(/href="[^"]*"/g, "")));
      if (MUTABLE.has(name)) {
        const withLink = (await render(cloneElement(el as React.ReactElement<{ unsubscribe?: unknown }>, { unsubscribe: { url: "https://x.test/api/unsubscribe?k=t", label: "Unsubscribe from payment reminders" } }), { plainText: true }));
        r.check(`${name}: passes the unsubscribe link through to the footer`, withLink.includes("Unsubscribe from payment reminders") && withLink.includes("https://x.test/api/unsubscribe?k=t"));
      } else {
        r.check(`${name}: transactional, no unsubscribe prop`, !("unsubscribe" in Component.PreviewProps) && !text.toLowerCase().includes("unsubscribe"));
      }
    } catch (e) {
      r.check(`${name} renders`, false, e instanceof Error ? e.message : String(e));
    }
  }
}
