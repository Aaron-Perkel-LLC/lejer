"use server";

import { headers } from "next/headers";
import { withUser } from "@/lib/db";
import { hashIp, normalizeEmail } from "@/lib/login-codes";

export type WaitlistState = { ok: boolean; message: string } | null;

// The coming-soon page's waitlist form. Writes one row (a repeat is a no-op)
// and sends nothing, so it costs none of the Resend budget.
export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email || email.length > 254) return { ok: false, message: "That doesn't look like an email address." };
  const ipHash = hashIp((await headers()).get("x-forwarded-for"));
  await withUser(null, (tx) => tx`INSERT INTO waitlist (email, ip_hash) VALUES (${email}, ${ipHash}) ON CONFLICT (email) DO NOTHING`);
  return { ok: true, message: "We'll send one note when it opens, and nothing else." };
}
