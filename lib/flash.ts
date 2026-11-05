import { redirect } from "next/navigation";
import { ActionError } from "@/lib/errors";

// Server-action outcomes travel as ?ok= / ?err= on the page they return to; <Flash> renders
// them. Plain functions (not server actions): call them from inside an action, never from a
// try block (redirect() throws). The path may carry a fragment ("/admin#people"): the query
// goes before it, so a sectioned page lands back on the section the action came from.

function withFlash(path: string, params: Record<string, string>): string {
  const [base, hash] = path.split("#", 2);
  return `${base}?${new URLSearchParams(params)}${hash ? `#${hash}` : ""}`;
}

export function done(path: string, message: string): never {
  redirect(withFlash(path, { ok: message }));
}

export function fail(path: string, message: string): never {
  redirect(withFlash(path, { err: message }));
}

/** Runs fn; an ActionError becomes ?err= on path, anything else propagates as a bug. */
export async function attempt<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) fail(path, e.message);
    throw e;
  }
}

/** A same-origin path to return to after sign-in: "/x" yes; "//host", "/\host", "x" no. */
export function safeNext(raw: unknown): string {
  const next = typeof raw === "string" ? raw : "";
  return /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : "/";
}
