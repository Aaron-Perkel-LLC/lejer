import { NextResponse } from "next/server";
import { ONE_CLICK } from "@/lib/mail";
import { UNSUBSCRIBE_PATH, applyUnsubscribe, readUnsubscribe } from "@/lib/unsubscribe";

// The URL in every mutable email's List-Unsubscribe header and footer link (lib/unsubscribe.ts).
// POST is RFC 8058 one-click: the mail provider posts "List-Unsubscribe=One-Click" here with no
// cookie and expects a 2xx; the category is turned off at once, idempotently. A GET is a person
// clicking the footer link: they go to /unsubscribe, which asks before changing anything (a link
// prefetcher or a security scanner following the GET must not unsubscribe anyone). Every bad
// token gets the same 404. No session, no household URL: the token says whose mail it is.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  if (!(await readUnsubscribe(k))) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(new URL(`${UNSUBSCRIBE_PATH}?${new URLSearchParams({ k: k! })}`, url), 303);
}

export async function POST(req: Request) {
  const scope = await readUnsubscribe(new URL(req.url).searchParams.get("k"));
  if (!scope) return new NextResponse("Not found", { status: 404 });
  const body = (await req.text()).trim();
  if (body !== ONE_CLICK) return new NextResponse("Expected List-Unsubscribe=One-Click", { status: 400 });
  await applyUnsubscribe(scope);
  return new NextResponse(null, { status: 200 });
}
