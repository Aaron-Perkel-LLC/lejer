// End to end over HTTP against `next start` on the build from gate 1 (`npm run build`), with
// mail forced into console mode so nothing is ever sent. Sessions are minted directly with
// SESSION_SECRET for fixture users (the login flow itself is driven once, through console mail).
// Real blobs are written under fixture households' h/{id}/ prefixes; the harness sweep deletes
// them by prefix, before the rows, on every run.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { billPdfKey, blobExists, putBillPdf } from "@/lib/blob";
import { BRAND, appUrl } from "@/lib/brand";
import { launchHeading } from "@/lib/gate";
import { householdPath } from "@/lib/paths";
import { HOUSEHOLD_COOKIE, SESSION_COOKIE, createSessionToken } from "@/lib/session";
import { signUnsubscribe } from "@/lib/unsubscribe";
import { type Fixture, RUN, type Results, type Sql, addMember, email, makeHousehold } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const PDF = new TextEncoder().encode(`%PDF-1.4\n% verify ${RUN}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

// The server runs on a fixed port in its own process group, recorded in a pidfile. A verify run
// that dies without cleaning up (SIGKILL, a crash) leaves it running; the next run kills that
// group and frees the port before starting its own. Only processes that are ours are killed:
// the recorded group, or a `next` process still listening on the port.
const PIDFILE = path.join(ROOT, ".verify", "server.json");
const PORT = Number(process.env.VERIFY_PORT ?? 4317);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listeners(port: number): number[] {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch {
    return []; // lsof exits 1 when nothing listens
  }
}

const commandOf = (pid: number) => {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

async function killGroup(pid: number): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-pid, signal); // the whole group: next and its server child
    } catch {}
    for (let i = 0; i < 25 && alive(pid); i++) await sleep(100);
    if (!alive(pid)) return;
  }
}

/** Kills a server a previous run left behind and makes sure the port is free. */
async function clearStaleServer(port: number): Promise<string | null> {
  let note: string | null = null;
  if (existsSync(PIDFILE)) {
    const stale = JSON.parse(readFileSync(PIDFILE, "utf8")) as { pid: number; port: number };
    if (alive(stale.pid)) {
      await killGroup(stale.pid);
      note = `killed stale verify server (pid ${stale.pid}, port ${stale.port})`;
    }
    rmSync(PIDFILE, { force: true });
  }
  for (const pid of listeners(port)) {
    const cmd = commandOf(pid);
    if (!/\bnext\b|next-server/.test(cmd)) throw new Error(`port ${port} is taken by something that isn't ours (pid ${pid}: ${cmd}); set VERIFY_PORT`);
    await killGroup(pid);
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
    note = `${note ? `${note}; ` : ""}freed port ${port} from pid ${pid}`;
  }
  for (let i = 0; i < 25 && listeners(port).length; i++) await sleep(100);
  if (listeners(port).length) throw new Error(`port ${port} is still in use`);
  return note;
}

class Server {
  private proc!: ChildProcess;
  log = "";
  constructor(readonly port: number) {}
  get base() {
    return `http://127.0.0.1:${this.port}`;
  }
  /** `extra` overrides the env for this server (the launch gate, the superadmin list). */
  async start(extra: Record<string, string> = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(this.port), RESEND_API_KEY: "", VERCEL: "", APP_DEV_USER: "", APP_DEV_HOUSEHOLD: "", LAUNCH_GATE: "", SIGNIN_ALLOWLIST: "", SUPERADMIN_EMAILS: "", ...extra, NODE_ENV: "production" };
    delete env.VERCEL_ENV;
    this.proc = spawn(path.join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(this.port), "-H", "127.0.0.1"], { cwd: ROOT, env, detached: true });
    mkdirSync(path.dirname(PIDFILE), { recursive: true });
    writeFileSync(PIDFILE, JSON.stringify({ pid: this.proc.pid, port: this.port, startedAt: new Date().toISOString() }));
    this.proc.stdout!.on("data", (c) => (this.log += c));
    this.proc.stderr!.on("data", (c) => (this.log += c));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${this.base}/login`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`next start did not come up:\n${this.log}`);
  }
  async stop() {
    if (this.proc?.pid) await killGroup(this.proc.pid);
    rmSync(PIDFILE, { force: true });
  }
}

/** Newest mtime under the directories the build compiles. */
function newestSource(): number {
  const walk = (p: string): number => {
    const st = statSync(p);
    if (!st.isDirectory()) return /\.(tsx?|css)$/.test(p) ? st.mtimeMs : 0;
    return Math.max(0, ...readdirSync(p).map((f) => walk(path.join(p, f))));
  };
  return Math.max(...["app", "lib", "emails", "proxy.ts", "instrumentation.ts", "next.config.ts"].map((d) => walk(path.join(ROOT, d))));
}

function actionIds(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, ".next/server/server-reference-manifest.json"), "utf8"));
  const ids = new Map<string, string>();
  for (const [id, v] of Object.entries<{ exportedName?: string; filename?: string }>(manifest.node)) {
    if (v.exportedName) ids.set(`${v.filename}#${v.exportedName}`, id);
  }
  return ids;
}

export async function http(r: Results, { owner }: { owner: Sql }) {
  r.section("http: build and server");
  const buildId = path.join(ROOT, ".next/BUILD_ID");
  if (!existsSync(buildId)) throw new Error("no production build: run `npm run build` (gate 1) first");
  const stale = newestSource() > statSync(buildId).mtimeMs;
  r.check("the production build is newer than every source file", !stale, "run `npm run build` (gate 1) first");
  if (stale) return;
  const ids = actionIds();
  const id = (file: string, name: string) => {
    const v = ids.get(`${file}#${name}`);
    if (!v) throw new Error(`action ${file}#${name} not in the build; rebuild`);
    return v;
  };

  const cleared = await clearStaleServer(PORT);
  if (cleared) console.log(`(${cleared})`);
  const server = new Server(PORT);
  await server.start();
  try {
    await suite(r, owner, server, id);
  } finally {
    await server.stop();
  }

  // The same build with the launch gate on: a second server, its allowlist naming a fixture
  // admin and one fresh address (lib/gate.ts; ARCHITECTURE.md §5 "Launch gate").
  const g = await makeHousehold(owner, "hg", "ledger");
  const [{ adminEmail }] = await owner<{ adminEmail: string }[]>`SELECT email AS "adminEmail" FROM users WHERE id = ${g.admin.userId}`;
  const allowed = email("gated-ok");
  // The operator: a users row and no membership (lib/superadmin.ts: operator-only accounts).
  const operatorEmail = email("operator");
  const [{ id: operatorId }] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${operatorEmail}, 'Operator') RETURNING id`;
  const gated = new Server(PORT);
  await gated.start({ LAUNCH_GATE: "on", SIGNIN_ALLOWLIST: ` ${adminEmail.toUpperCase()}, ${allowed}, ${operatorEmail} `, SUPERADMIN_EMAILS: operatorEmail });
  try {
    await gatedSuite(r, owner, gated, id, g, { adminEmail, allowed, operator: { email: operatorEmail, id: operatorId } });
  } finally {
    await gated.stop();
  }
}

async function gatedSuite(r: Results, owner: Sql, server: Server, id: (file: string, name: string) => string, g: Fixture, who: { adminEmail: string; allowed: string; operator: { email: string; id: number } }) {
  const base = server.base;
  const cookieFor = async (uid: number) => `${SESSION_COOKIE}=${await createSessionToken(uid)}`;
  const get = (p: string, cookie?: string) => fetch(base + p, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const page = async (p: string, cookie: string) => {
    const x = await get(p, cookie);
    return { status: x.status, html: await x.text(), robots: x.headers.get("x-robots-tag") };
  };
  const formPost = (pg: string, actionId: string, fields: Record<string, string | string[]>, cookie: string) => {
    const fd = new FormData();
    fd.set(`$ACTION_ID_${actionId}`, "");
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
    return fetch(base + pg, { method: "POST", body: fd, headers: { cookie, origin: base }, redirect: "manual" });
  };
  const loc = (res: Response) => new URL(res.headers.get("location") ?? "/", base);
  const G = (p = "") => householdPath(g, p);
  const gAdmin = await cookieFor(g.admin.userId);
  const gMember = await cookieFor(g.member.userId);

  r.section("http: launch gate (LAUNCH_GATE=on)");
  let pg = await page("/", "");
  r.check("/ is the coming-soon page, in the site's look", pg.status === 200 && pg.html.includes("Coming soon") && pg.html.includes(launchHeading()) && pg.html.includes("data-site") && pg.html.includes(`mailto:${BRAND.contactEmail}`), pg.status);
  r.check("…with the noindex header and meta tag", pg.robots === "noindex, nofollow" && /<meta name="robots" content="noindex, nofollow"/.test(pg.html), { robots: pg.robots });
  r.check("…and no demo, no page links, no sign-up form", !pg.html.includes('href="/demo"') && !pg.html.includes("How it works") && !pg.html.includes("New or returning"), pg.html.length);
  r.check("…but Sign in and the legal line (Contact, Privacy)", pg.html.includes('href="/login"') && pg.html.includes('href="/privacy"') && pg.html.includes(BRAND.legalName));
  for (const p of ["/about", "/how-it-works", "/demo", "/demo/bills"]) {
    const res = await get(p);
    r.check(`${p} → / while gated`, res.status === 307 && loc(res).pathname === "/" && res.headers.get("x-robots-tag") === "noindex, nofollow", res.status);
  }
  for (const p of ["/login", "/privacy"]) {
    pg = await page(p, "");
    r.check(`${p} stays open while gated`, pg.status === 200 && pg.robots === "noindex, nofollow", pg.status);
  }
  // Crawlable, so the noindex is seen: a Disallow would hide it and leave linked URLs indexable.
  const robotsTxt = await (await get("/robots.txt")).text();
  r.check("robots.txt allows crawling (noindex does the gating) and names the sitemap", /Allow: \//.test(robotsTxt) && !/Disallow/.test(robotsTxt) && robotsTxt.includes(`Sitemap: ${appUrl("/sitemap.xml")}`), robotsTxt);
  const gatedMap = await get("/sitemap.xml");
  const gatedMapXml = await gatedMap.text();
  r.check("…and sitemap.xml is public and lists nothing while gated", gatedMap.status === 200 && gatedMapXml.includes("<urlset") && !gatedMapXml.includes("<loc>"), gatedMap.status);
  // Safari's bookmarks and Favorites ask for the root icon URLs, not the <link> tags.
  for (const p of ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"]) {
    const res = await get(p);
    r.check(`${p} is a PNG, signed out and gated`, res.status === 200 && res.headers.get("content-type") === "image/png", `${res.status} ${res.headers.get("content-type")}`);
  }
  pg = await page("/", gAdmin);
  r.check("signed in, / is still coming soon, with Open your household", pg.status === 200 && pg.html.includes("Coming soon") && pg.html.includes("Open your household") && pg.html.includes(`href="${G()}"`), pg.status);
  pg = await page(G(), gAdmin);
  r.check("…and the household itself works, noindexed", pg.status === 200 && pg.html.includes("Gas") && pg.robots === "noindex, nofollow", pg.status);
  const res401 = await get(G("/bills"));
  r.check("signed out, a household URL still goes to /login", res401.status === 307 && loc(res401).pathname === "/login");

  r.section("http: /admin for the operator (an operator-only account)");
  const op = await cookieFor(who.operator.id);
  pg = await page("/admin", op);
  r.check("the operator sees the households by name and slug, with counts", pg.status === 200 && pg.html.includes("Verify HG") && pg.html.includes(g.slug) && pg.html.includes("Operator"), pg.status);
  r.check("…and the people by name and address, the operator marked as such", pg.html.includes(who.adminEmail) && pg.html.includes(who.operator.email) && pg.html.includes(">operator<"));
  r.check("…but no amount or statement path anywhere on the page", !pg.html.includes("80.00") && !pg.html.includes("40.00") && !/h\/\d+\/(bills|documents)/.test(pg.html.replace(/href="[^"]*"/g, "")));
  r.check("…noindexed", /<meta name="robots" content="noindex, nofollow"/.test(pg.html));
  r.check("…under the minimal header: wordmark, Admin, Sign out; no household links", pg.html.includes("Sign out") && pg.html.includes(">Admin<") && !pg.html.includes("Your households") && !pg.html.includes("Open your household") && !pg.html.includes('href="/households"'));
  pg = await page("/admin", gAdmin);
  r.check("a household admin (not on the list) → 404", pg.status === 404 && pg.html.includes("no page at this address"), pg.status);
  pg = await page("/admin", gMember);
  r.check("a member → 404", pg.status === 404, pg.status);
  const resAdminOut = await get("/admin");
  r.check("signed out → /login", resAdminOut.status === 307 && loc(resAdminOut).pathname === "/login");
  for (const p of ["/new", "/households", G(), G("/bills"), "/login"]) {
    const x = await get(p, op);
    r.check(`operator at ${p} → /admin`, x.status === 307 && loc(x).pathname === "/admin", `${x.status} ${x.headers.get("location")}`);
  }
  pg = await page("/", op);
  r.check("the home page's header offers the operator Admin, not a household", pg.html.includes('href="/admin"') && !pg.html.includes("Open your household"));
  // A pending invite for the operator's address is never accepted.
  await owner`INSERT INTO memberships (household_id, user_id, role, joined_at) VALUES (${g.id}, ${who.operator.id}, 'member', NULL)`;
  const joined = async () => (await owner<{ j: Date | null }[]>`SELECT joined_at AS j FROM memberships WHERE household_id = ${g.id} AND user_id = ${who.operator.id}`)[0]?.j ?? null;
  const resPending = await get(G(), op);
  r.check("with a pending invite, the household URL still → /admin and the invite stays unaccepted", resPending.status === 307 && loc(resPending).pathname === "/admin" && (await joined()) === null);
  const hCount = async () => (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM households`)[0].n;
  const hBefore = await hCount();
  const resNew = await formPost("/new", id("app/(app)/new/actions.ts", "createHouseholdAction"), { name: "Op", householdName: `Op house ${RUN}`, mode: "ledger", theme: "sheet", timezone: "UTC" }, op);
  r.check("creating a household as the operator → /admin, nothing created", resNew.status === 303 && loc(resNew).pathname === "/admin" && (await hCount()) === hBefore, `${resNew.status} ${resNew.headers.get("location")}`);
  const resInviteOp = await formPost(G("/household"), id("app/(household)/[household]/household/actions.ts", "inviteMember"), { name: "Op", email: who.operator.email.toUpperCase(), role: "member" }, gAdmin);
  r.check("inviting the operator's address is refused plainly", (loc(resInviteOp).searchParams.get("err") ?? "").includes("runs the site"), loc(resInviteOp).search);
  pg = await page("/households", gAdmin);
  r.check("(control) a normal user still opens /households", pg.status === 200 && pg.html.includes("Verify HG"), pg.status);

  r.section("http: unsubscribe (no session, a signed token)");
  const uScope = { householdId: g.id, membershipId: g.member.membershipId, category: "reminders" as const };
  const uTok = await signUnsubscribe(uScope);
  const mutedNow = async () => (await owner<{ m: string[] }[]>`SELECT muted_kinds AS m FROM memberships WHERE id = ${g.member.membershipId}`)[0].m;
  let ures = await get(`/api/unsubscribe?k=${uTok}`);
  r.check("GET the header URL → the page, nothing changed", ures.status === 303 && loc(ures).pathname === "/unsubscribe" && loc(ures).searchParams.get("k") === uTok && (await mutedNow()).length === 0, `${ures.status} ${ures.headers.get("location")}`);
  pg = await page(`/unsubscribe?k=${uTok}`, "");
  const plain = (html: string) => html.replaceAll("<!-- -->", "");
  r.check("the page asks, naming the household and the kind, signed out", pg.status === 200 && plain(pg.html).includes("Stop payment reminders from Verify HG?") && pg.html.includes("Unsubscribe"), pg.status);
  pg = await page("/unsubscribe?k=nope", "");
  r.check("a bad token: a plain explanation, not a 404 page", pg.status === 200 && pg.html.includes("doesn&#x27;t work any more"), pg.status);
  ures = await fetch(`${base}/api/unsubscribe?k=${uTok}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
  r.check("one-click POST (RFC 8058) → 200 and reminders are off", ures.status === 200 && (await mutedNow()).join() === "reminders", ures.status);
  ures = await fetch(`${base}/api/unsubscribe?k=${uTok}`, { method: "POST", body: "something-else" });
  r.check("…a POST without the one-click body → 400", ures.status === 400, ures.status);
  ures = await fetch(`${base}/api/unsubscribe?k=nope`, { method: "POST", body: "List-Unsubscribe=One-Click" });
  r.check("…a bad token → 404", ures.status === 404, ures.status);
  const uTok2 = await signUnsubscribe({ ...uScope, category: "notices" });
  ures = await formPost(`/unsubscribe?k=${uTok2}`, id("app/(site)/unsubscribe/actions.ts", "unsubscribeAction"), { k: uTok2 }, "");
  r.check("the page's button → done, notices off too", ures.status === 303 && loc(ures).searchParams.get("done") === "1" && (await mutedNow()).sort().join() === "notices,reminders", `${ures.status} ${ures.headers.get("location")}`);
  pg = await page(`/unsubscribe?k=${uTok2}&done=1`, "");
  r.check("…and says so", pg.status === 200 && plain(pg.html).includes("won&#x27;t get bill notices from Verify HG"), pg.status);
  ures = await formPost("/account", id("app/(app)/account/actions.ts", "updateMailPrefs"), { householdId: String(g.id), on: ["reminders", "notices", "thanks", "notes"] }, gMember);
  r.check("the account page turns them back on", ures.status === 303 && (loc(ures).searchParams.get("ok") ?? "").includes("saved") && (await mutedNow()).length === 0, loc(ures).search);

  r.section("http: /admin's writes");
  const adminAction = (name: string, fields: Record<string, string>, cookie: string) => formPost("/admin", id("app/(app)/admin/actions.ts", name), fields, cookie);
  const victim = await addMember(owner, g, "hg-victim");
  const victimEmail = email("hg-victim");
  let res = await adminAction("deleteUserAction", { id: String(victim.userId), confirm: victimEmail }, gAdmin);
  r.check("a household admin posting a delete → not found, nothing deleted", res.status === 404 && (await owner`SELECT 1 FROM users WHERE id = ${victim.userId}`).length === 1, res.status);
  res = await adminAction("deleteUserAction", { id: String(victim.userId), confirm: "wrong@verify.invalid" }, op);
  r.check("the operator with the wrong address → ?err=, nothing deleted", res.status === 303 && (loc(res).searchParams.get("err") ?? "").includes("exactly as shown") && (await owner`SELECT 1 FROM users WHERE id = ${victim.userId}`).length === 1, loc(res).search);
  res = await adminAction("deleteUserAction", { id: String(victim.userId), confirm: victimEmail }, op);
  r.check("…and with the right one → ?ok=, the account gone", res.status === 303 && (loc(res).searchParams.get("ok") ?? "").startsWith(`Deleted ${victimEmail}`) && (await owner`SELECT 1 FROM users WHERE id = ${victim.userId}`).length === 0, loc(res).search);
  const doomed = await makeHousehold(owner, "hd");
  res = await adminAction("deleteHouseholdAction", { id: String(doomed.id), confirm: doomed.slug }, gAdmin);
  r.check("a household admin posting a household delete → not found", res.status === 404 && (await owner`SELECT 1 FROM households WHERE id = ${doomed.id}`).length === 1, res.status);
  res = await adminAction("deleteHouseholdAction", { id: String(doomed.id), confirm: doomed.slug }, op);
  r.check("the operator with the slug → ?ok=, the household gone", res.status === 303 && (loc(res).searchParams.get("ok") ?? "").startsWith("Deleted Verify HD") && (await owner`SELECT 1 FROM households WHERE id = ${doomed.id}`).length === 0, loc(res).search);

  r.section("http: /admin's email (the operator's note)");
  const noteAction = id("app/(app)/admin/actions.ts", "sendOperatorNoteAction");
  const note = (intent: string, audience: string, extra: Record<string, string | string[]> = {}) => ({ intent, audience, subject: `Note ${RUN}`, body: "Hello.\n\nSecond paragraph.", linkLabel: "", linkUrl: "", replyTo: "", ...extra });
  const [{ memberEmail }] = await owner<{ memberEmail: string }[]>`SELECT email AS "memberEmail" FROM users WHERE id = ${g.member.userId}`;
  const notesSince = (from: number) => server.log.slice(from).match(/\[mail:console\] operator_note to [^:]+/g) ?? [];
  let logAt = server.log.length;
  res = await formPost("/admin", noteAction, note("send", "everyone"), gAdmin);
  r.check("a household admin posting the note → not found, nothing sent", res.status === 404 && notesSince(logAt).length === 0, res.status);
  res = await formPost("/admin", noteAction, note("preview", "everyone"), op);
  r.check("the operator's preview → ?ok=, one copy to the operator, with the updates unsubscribe link", res.status === 303 && (loc(res).searchParams.get("ok") ?? "").startsWith("Sent you a copy") && notesSince(logAt).join() === `[mail:console] operator_note to ${who.operator.email}` && server.log.slice(logAt).includes("/api/unsubscribe?k=") && server.log.slice(logAt).includes("Hi Operator,"), loc(res).search);
  logAt = server.log.length;
  res = await formPost("/admin", noteAction, note("send", "households", { household: String(g.id) }), op);
  const went = notesSince(logAt);
  r.check("send to a ticked household → ?ok= naming the count, one copy per joined member, none to the pending operator seat", res.status === 303 && (loc(res).searchParams.get("ok") ?? "").startsWith("Sent to 2 people") && went.length === 2 && went.some((l) => l.endsWith(who.adminEmail)) && went.some((l) => l.endsWith(memberEmail)) && !went.some((l) => l.endsWith(who.operator.email)), { ok: loc(res).search, went });
  logAt = server.log.length;
  res = await formPost("/admin", noteAction, note("send", "households", { household: String(g.id), subject: "" }), op);
  r.check("no subject → ?err=, nothing sent", res.status === 303 && (loc(res).searchParams.get("err") ?? "").includes("Add a subject") && notesSince(logAt).length === 0, loc(res).search);
  res = await formPost("/admin", noteAction, note("later", "everyone"), op);
  r.check("an unknown intent → ?err=", res.status === 303 && (loc(res).searchParams.get("err") ?? "").includes("Choose Send"), loc(res).search);
  const userMuted = async () => (await owner<{ m: string[] }[]>`SELECT muted_kinds AS m FROM users WHERE id = ${g.member.userId}`)[0].m;
  const sitePrefs = id("app/(app)/account/actions.ts", "updateSiteMailPrefs");
  res = await formPost("/account", sitePrefs, {}, gMember);
  r.check("the account page's unticked \"Updates\" box → users.muted_kinds", res.status === 303 && (loc(res).searchParams.get("ok") ?? "").includes("saved") && (await userMuted()).join() === "updates", loc(res).search);
  logAt = server.log.length;
  res = await formPost("/admin", noteAction, note("send", "users", { user: String(g.member.userId) }), op);
  r.check("a note to that one person → refused as nobody to email, nothing sent", res.status === 303 && (loc(res).searchParams.get("err") ?? "").includes("Nobody to email") && notesSince(logAt).length === 0, loc(res).search);
  pg = await page("/admin", op);
  r.check("the page marks them \"updates off\" and shows the compose form with its four audiences and the people pick list, the operator's box disabled", pg.html.includes(">updates off<") && pg.html.includes('id="compose"') && pg.html.includes('value="households"') && pg.html.includes('value="waitlist"') && new RegExp(`<input[^>]*name="user" value="${g.member.userId}"`).test(pg.html) && new RegExp(`<input(?=[^>]*disabled="")[^>]*name="user" value="${who.operator.id}"`).test(pg.html), pg.status);
  // The waitlist's take-me-off link (0018): the page asks, the one-click POST deletes the row.
  const wEmail = email("hg-wait");
  await owner`INSERT INTO waitlist (email) VALUES (${wEmail})`;
  const wTok = await signUnsubscribe({ waitlistEmail: wEmail, category: "waitlist" });
  pg = await page(`/unsubscribe?k=${wTok}`, "");
  r.check("a waitlist token's page asks to take the address off the list, signed out", pg.status === 200 && plain(pg.html).includes(`Take ${wEmail} off the waitlist?`) && pg.html.includes("Take me off the list"), pg.status);
  const wres = await fetch(`${base}/api/unsubscribe?k=${wTok}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
  r.check("one-click POST on it → 200 and the row is gone", wres.status === 200 && (await owner`SELECT 1 FROM waitlist WHERE email = ${wEmail}`).length === 0, wres.status);
  pg = await page(`/unsubscribe?k=${wTok}`, "");
  r.check("…and the page then says they're not on the list", pg.status === 200 && pg.html.includes("not on the list"), pg.status);
  pg = await page("/account", gMember);
  r.check("/account shows the box unticked", plain(pg.html).includes(`Email from ${BRAND.name}`) && /name="on" value="updates"(?![^>]*checked)/.test(pg.html), pg.status);
  res = await formPost("/account", sitePrefs, { on: "updates" }, gMember);
  r.check("…and ticking it turns updates back on", res.status === 303 && (await userMuted()).length === 0);

  r.section("http: launch gate: sign-in and invites");
  const loginForm = (actionName: string, fields: Record<string, string>) => formPost("/login", id("app/(site)/login/actions.ts", actionName), fields, "");
  const stranger = email("gated-no");
  const codes = async (e: string) => (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM login_codes WHERE email = ${e}`)[0].n;
  const logBefore = (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM email_log WHERE kind = 'login_code'`)[0].n;
  res = await loginForm("requestCode", { email: stranger, next: "/" });
  r.check("an address off the list → not-open, back on the email step", loc(res).searchParams.get("err") === "not-open" && !loc(res).searchParams.has("step"), loc(res).search);
  r.check("…no code minted, no email_log row", (await codes(stranger)) === 0 && (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM email_log WHERE kind = 'login_code'`)[0].n === logBefore);
  r.check("…and nothing printed by console mail", !server.log.includes(stranger));
  pg = await page(`/login?err=not-open&email=${encodeURIComponent(stranger)}`, "");
  r.check("the refusal reads neutrally", pg.html.includes(`${BRAND.name} isn&#x27;t open yet.`), pg.status);
  res = await loginForm("submitCode", { email: stranger, code: "123456", next: "/" });
  r.check("submitting a code for an address off the list → not-open", loc(res).searchParams.get("err") === "not-open", loc(res).search);
  res = await loginForm("requestCode", { email: who.allowed.toUpperCase(), next: "/" });
  r.check("an allowlisted address (any case, list padded with spaces) → the code step", loc(res).searchParams.get("step") === "code" && (await codes(who.allowed)) === 1, loc(res).search);

  const invite = (e: string) => formPost(G("/household"), id("app/(household)/[household]/household/actions.ts", "inviteMember"), { name: "Gate", email: e, role: "member", splitsBills: "on" }, gAdmin);
  const members = async () => (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM memberships WHERE household_id = ${g.id}`)[0].n;
  const before = await members();
  res = await invite(stranger);
  r.check("inviting an address off the list → refused, no membership", (loc(res).searchParams.get("err") ?? "").includes("isn't open yet") && (await members()) === before, loc(res).search);
  res = await invite(who.allowed);
  r.check("inviting an allowlisted address → ok", (loc(res).searchParams.get("ok") ?? "").startsWith("Invited") && (await members()) === before + 1, loc(res).search);
  res = await formPost(G("/household"), id("app/(household)/[household]/household/actions.ts", "inviteMember"), { name: "Gate", email: stranger, role: "member" }, gMember);
  r.check("(control) a member can't invite at all", (loc(res).searchParams.get("err") ?? "").includes("admin") || res.status >= 400, loc(res).search);

  r.section("http: launch gate: an operator signs in and lands on /admin");
  res = await loginForm("requestCode", { email: who.operator.email, next: G() });
  r.check("the operator is allowlisted → the code step", loc(res).searchParams.get("step") === "code", loc(res).search);
  let opCode = "";
  for (let i = 0; i < 25 && !opCode; i++) {
    opCode = new RegExp(`\\[mail:console\\] login_code to ${who.operator.email.replace(/[.]/g, "\\.")}: (\\d{6})`).exec(server.log)?.[1] ?? "";
    if (!opCode) await new Promise((x) => setTimeout(x, 200));
  }
  r.check("the code was printed", opCode.length === 6);
  res = await loginForm("submitCode", { email: who.operator.email, code: opCode, next: G() });
  r.check("verified → /admin, ignoring next=, with a session", (res.headers.get("location") ?? "").endsWith("/admin") && (res.headers.get("set-cookie") ?? "").startsWith(`${SESSION_COOKIE}=`), res.headers.get("location"));
  r.check("…and the pending invite is still not accepted", (await joined()) === null);
}

async function suite(r: Results, owner: Sql, server: Server, id: (file: string, name: string) => string) {
  const base = server.base;
  const cookieFor = async (uid: number) => `${SESSION_COOKIE}=${await createSessionToken(uid)}`;
  const get = (p: string, cookie?: string) => fetch(base + p, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  /** A no-JS form post to a plain `action={fn}` form (an array is a checkbox group). */
  const formPost = (page: string, actionId: string, fields: Record<string, string | string[]>, cookie: string) => {
    const fd = new FormData();
    fd.set(`$ACTION_ID_${actionId}`, "");
    for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
    return fetch(base + page, { method: "POST", body: fd, headers: { cookie, origin: base }, redirect: "manual" });
  };
  /** The client's own action call (encodeReply): JSON args, or [state, FormData] as _1_ fields. */
  const callAction = (page: string, actionId: string, args: unknown[] | { state: unknown; form: FormData }, cookie: string) => {
    let body: string | FormData;
    if (Array.isArray(args)) body = JSON.stringify(args);
    else {
      // Same order as React's encodeReply: the referenced fields first, the root "0" last (the
      // server decodes as the stream arrives, so a root that comes first sees an empty form).
      body = new FormData();
      for (const [k, v] of args.form.entries()) body.append(`_1_${k}`, v);
      body.set("0", JSON.stringify([args.state, "$K1"]));
    }
    return fetch(base + page, { method: "POST", body, headers: { cookie, origin: base, "next-action": actionId, accept: "text/x-component" }, redirect: "manual" });
  };
  const err = (res: Response) => new URL(res.headers.get("location") ?? "/", base).searchParams.get("err") ?? "";
  const ok = (res: Response) => new URL(res.headers.get("location") ?? "/", base).searchParams.get("ok") ?? "";

  // Fixtures: two ledger households with documents on.
  const a = await makeHousehold(owner, "ha", "ledger");
  const b = await makeHousehold(owner, "hb", "ledger");
  await owner`UPDATE households SET feature_documents = true WHERE id IN (${a.id}, ${b.id})`;
  /** Paths inside each fixture household: its pages live under its slug (lib/paths.ts). */
  const A = (p = "") => householdPath(a, p);
  const B = (p = "") => householdPath(b, p);
  const aAdmin = await cookieFor(a.admin.userId);
  const aMember = await cookieFor(a.member.userId);
  const bAdmin = await cookieFor(b.admin.userId);

  r.section("http: /files");
  const keyA = billPdfKey(a.id, "Gas", "2030-01-01", a.billId);
  const keyB = billPdfKey(b.id, "Gas", "2030-01-01", b.billId);
  await putBillPdf(keyA, new Blob([PDF]));
  await putBillPdf(keyB, new Blob([PDF]));
  await owner`UPDATE bills SET pdf_path = ${keyA} WHERE id = ${a.billId}`;
  await owner`UPDATE bills SET pdf_path = ${keyB} WHERE id = ${b.billId}`;
  let res = await get(`/files/${keyA}`, aAdmin);
  const bytes = new Uint8Array(await res.arrayBuffer());
  r.check("own household's PDF streams (200, application/pdf)", res.status === 200 && res.headers.get("content-type") === "application/pdf", res.status);
  r.check("…byte for byte, with nosniff and private caching",
    bytes.length === PDF.length && bytes.every((x, i) => x === PDF[i]) && res.headers.get("x-content-type-options") === "nosniff" && /private/.test(res.headers.get("cache-control") ?? ""));
  res = await get(`/files/${keyA}`, aMember);
  r.check("a member of the household can read it too", res.status === 200);
  res = await get(`/files/${keyB}`, aAdmin);
  r.check("valid session, another household's key → refused", res.status === 404, res.status);
  res = await get(`/files/${keyB}`, bAdmin);
  r.check("…while B's own admin gets it (control)", res.status === 200, res.status);
  res = await get(`/files/${keyA}`, bAdmin);
  r.check("…and B can't read A's", res.status === 404, res.status);
  res = await get(`/files/h/${a.id}/bills/2030/gas/0101-999999.pdf`, aAdmin);
  r.check("own prefix, not recorded → 404", res.status === 404, res.status);
  res = await get(`/files/h/${a.id}/..%2F${b.id}/bills/2030/gas/0101-${b.billId}.pdf`, aAdmin);
  r.check("encoded ../ toward another household → refused", res.status === 404 || res.status === 400, res.status);
  res = await get(`/files/h/${a.id}/documents/evil.svg`, aAdmin);
  r.check("SVG → 404", res.status === 404, res.status);
  res = await get(`/files/${keyA}`);
  r.check("no session → sent to /login", res.status === 307 && (res.headers.get("location") ?? "").includes("/login"), res.status);
  res = await get(`/files/${keyA}`, bAdmin + `; ${HOUSEHOLD_COOKIE}=${a.slug}`);
  r.check("the last-household cookie grants nothing (B's admin, A's key) → 404", res.status === 404, res.status);

  r.section("http: posting bills over the wire (useActionState protocol)");
  const addBill = id("app/(household)/[household]/bills/actions.ts", "addBill");
  const billForm = (typeId: number, amount: string, withPdf: Uint8Array | string | null) => {
    const f = new FormData();
    f.set("typeId", String(typeId));
    f.set("amount", amount);
    f.set("dueDate", "2030-02-01");
    if (withPdf) f.set("pdf", new Blob([withPdf as BlobPart], { type: "application/pdf" }), "ViewExternalBill.pdf");
    return f;
  };
  const count = async (hid: number) => (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM bills WHERE household_id = ${hid}`)[0].n;
  let before = await count(a.id);
  res = await callAction(A("/bills"), addBill, { state: { errors: [] }, form: billForm(a.typeId, "50.00", null) }, aMember);
  let text = await res.text();
  r.check("ledger member posting for someone else's type → refused with the reason", text.includes("You can only post bills and mark payments for bill types you own"), text.slice(0, 200));
  r.check("…and no bill was created", (await count(a.id)) === before);
  res = await callAction(A("/bills"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", PDF) }, aMember);
  await res.text();
  const [posted] = await owner<{ id: number; pdf: string | null; per: string; addedBy: number }[]>`
    SELECT id, pdf_path AS pdf, per_person_cost AS per, added_by_id AS "addedBy" FROM bills
    WHERE household_id = ${a.id} AND type_id = ${a.memberTypeId} ORDER BY id DESC LIMIT 1`;
  r.check("member posts for their own type (redirect back to /bills?ok=)", (res.headers.get("x-action-redirect") ?? "").startsWith(A("/bills?ok=")), res.headers.get("x-action-redirect"));
  r.check("…stored with the poster and a 25.00 share", posted && posted.addedBy === a.member.membershipId && Number(posted.per) === 25, posted);
  r.check("…its PDF under h/{id}/bills/{year}/water/{MMDD}-{billId}.pdf", !!posted?.pdf && new RegExp(`^h/${a.id}/bills/\\d{4}/water/\\d{4}-${posted.id}\\.pdf$`).test(posted.pdf), posted?.pdf);
  res = await get(`/files/${posted.pdf}`, aAdmin);
  r.check("…and the uploaded PDF is served back", res.status === 200 && (await res.arrayBuffer()).byteLength === PDF.length);
  before = await count(a.id);
  res = await callAction(A("/bills"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "50.00", "not a pdf at all") }, aMember);
  text = await res.text();
  r.check("a non-PDF upload is refused", text.includes("isn't a PDF") && (await count(a.id)) === before);
  res = await callAction(A("/bills"), addBill, { state: { errors: [] }, form: billForm(a.memberTypeId, "12.345", null) }, aMember);
  r.check("a malformed amount is refused", (await res.text()).includes("Enter the amount"));
  const [queued] = await owner<{ kind: string | null; queued: boolean }[]>`
    SELECT notice_kind AS kind, notice_queued_at IS NOT NULL AS queued FROM bills WHERE id = ${posted.id}`;
  r.check("posting queues the new-bill email instead of sending it", queued?.kind === "new" && queued.queued && !/new_bill to /.test(server.log), queued);

  r.section("http: marking payments over the wire");
  const setPaidAction = id("app/(household)/[household]/bills/actions.ts", "setPaidAction");
  res = await callAction(A("/bills"), setPaidAction, [a.billId, a.member.membershipId, true], aMember);
  text = await res.text();
  r.check("member marking a payment on someone else's type → refused", text.includes("types you own") && text.includes('"ok":false'), text.slice(0, 160));
  const [{ paid: stillUnpaid }] = await owner<{ paid: boolean }[]>`SELECT paid_at IS NOT NULL AS paid FROM bill_debts WHERE bill_id = ${a.billId}`;
  r.check("…and the row is untouched", stillUnpaid === false);
  res = await callAction(A("/bills"), setPaidAction, [a.billId, a.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("admin marks it paid → bill status paid", text.includes('"ok":true') && text.includes('"status":"paid"'), text.slice(0, 160));
  // The payer's own check-off (0017): the owner's own box over the wire, and on the page.
  await owner`UPDATE households SET feature_owner_checkoff = true WHERE id = ${a.id}`;
  res = await callAction(A("/bills"), setPaidAction, [a.billId, a.admin.membershipId, false], aAdmin);
  text = await res.text();
  r.check("with the payer's check-off on, unticking the owner's own box reopens the bill", text.includes('"ok":true') && text.includes('"status":"unpaid"'), text.slice(0, 160));
  const ocHtml = await (await fetch(server.base + A("/bills"), { headers: { cookie: aAdmin }, redirect: "manual" })).text();
  r.check("…and the bills page offers them \"You paid the provider\" under Payments", ocHtml.includes("You paid the provider") && ocHtml.includes(">Payments<"), ocHtml.length);
  res = await callAction(A("/bills"), setPaidAction, [a.billId, a.admin.membershipId, true], aAdmin);
  text = await res.text();
  r.check("…ticking it settles the bill again", text.includes('"status":"paid"'), text.slice(0, 160));
  await owner`UPDATE households SET feature_owner_checkoff = false WHERE id = ${a.id}`;
  res = await callAction(A("/bills"), setPaidAction, [b.billId, b.member.membershipId, true], aAdmin);
  text = await res.text();
  r.check("an admin of A can't touch B's bill (RLS hides it)", text.includes('"ok":false') && text.includes("no longer exists"), text.slice(0, 160));

  r.section("http: other bill and household actions");
  res = await formPost(A("/bills"), id("app/(household)/[household]/bills/actions.ts", "sendReminder"), { billId: String(b.billId) }, aAdmin);
  r.check("reminder for another household's bill → refused", err(res).includes("no longer exists"), err(res));
  res = await formPost(A("/household"), id("app/(household)/[household]/household/actions.ts", "saveBillTypeAction"), { name: "Nope", emoji: "❌", processingFee: "0" }, aMember);
  r.check("member adding a bill type → refused", res.status >= 400 || err(res) !== "", res.status);
  res = await formPost(A("/household"), id("app/(household)/[household]/household/actions.ts", "removeBillTypeAction"), { typeId: String(a.typeId) }, aAdmin);
  r.check("removing a type with bills → friendly refusal", err(res).includes("on record"), err(res));
  const roomie = await addMember(owner, a, `ha-roomie-${RUN}`);
  const lateBill = await owner<{ id: number }[]>`SELECT id FROM bills WHERE id = ${posted.id}`;
  res = await callAction(A("/bills"), setPaidAction, [lateBill[0].id, roomie.membershipId, true], aAdmin);
  r.check("someone who joined after a bill can't be marked on it", (await res.text()).includes("doesn't owe"));

  r.section("http: editing and deleting a bill over the wire");
  const editBill = id("app/(household)/[household]/bills/actions.ts", "editBill");
  const deleteBill = id("app/(household)/[household]/bills/actions.ts", "deleteBillAction");
  const editForm = (amount: string) => {
    const f = billForm(a.memberTypeId, amount, null);
    f.set("billId", String(posted.id));
    return f;
  };
  res = await callAction(A("/bills"), editBill, { state: { errors: [] }, form: editForm("60.00") }, aMember);
  await res.text();
  const [edited] = await owner<{ per: string; kind: string }[]>`SELECT per_person_cost AS per, notice_kind AS kind FROM bills WHERE id = ${posted.id}`;
  r.check("the bill's owner edits it (redirect back with ?ok=, 60.00 → 30.00 each, email still queued)",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/bills?ok=")) && Number(edited.per) === 30 && edited.kind === "new", { redirect: res.headers.get("x-action-redirect"), edited });
  const [{ n: roomieRows }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM bill_debts WHERE bill_id = ${posted.id} AND person_id = ${roomie.membershipId}`;
  r.check("…and the member who joined after the post still isn't a debtor", roomieRows === 0);
  res = await callAction(B("/bills"), editBill, { state: { errors: [] }, form: editForm("60.00") }, bAdmin);
  r.check("someone from another household can't edit it", (await res.text()).includes("no longer exists"));
  res = await callAction(A("/bills"), editBill, { state: { errors: [] }, form: editForm("60.00") }, bAdmin);
  r.check("…nor by posting to its household's URL instead (not a member: refused)", (await res.text()).includes("Sign in to edit bills"));
  res = await callAction(A("/bills"), setPaidAction, [posted.id, a.admin.membershipId, true], aMember);
  await res.text();
  res = await callAction(A("/bills"), editBill, { state: { errors: [] }, form: editForm("70.00") }, aMember);
  r.check("once someone is marked paid, an edit is refused inline", (await res.text()).includes("already been marked paid"));
  res = await formPost(A("/bills"), deleteBill, { billId: String(posted.id) }, aMember);
  r.check("…and so is a delete", err(res).includes("already been marked paid"), err(res));
  res = await callAction(A("/bills"), setPaidAction, [posted.id, a.admin.membershipId, false], aMember);
  await res.text();
  res = await formPost(A("/bills"), deleteBill, { billId: String(posted.id) }, aMember);
  const gone = (await owner`SELECT 1 FROM bills WHERE id = ${posted.id}`).length === 0;
  r.check("unchecked again, the owner deletes it (nobody had been emailed)", gone && ok(res).includes("Nobody had been emailed"), ok(res));
  r.check("…and its PDF is gone from Blob", (await blobExists(posted.pdf!)) === null);
  res = await get(A("/bills"), aAdmin);
  text = await res.text();
  r.check("the bills page speaks one status vocabulary (no Settled / Open)", !/>(Settled|Open)</.test(text) && />(Paid|Unpaid)</.test(text));

  r.section("http: the house ledger is gross, with a settling hint");
  const n = await makeHousehold(owner, "hn", "ledger"); // the fixture bill: the member owes the admin 40.00 on Gas
  const N = (p = "") => householdPath(n, p);
  const [water] = await owner<{ id: number }[]>`
    INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner, shares, owner_share)
    VALUES (${n.id}, ${n.memberTypeId}, current_date - 3, current_date + 12, 30.00, 15.00, ${n.member.membershipId}, ${n.member.membershipId}, true, 2, true) RETURNING id`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${n.id}, ${water.id}, ${n.admin.membershipId})`;
  text = (await (await get(N(), await cookieFor(n.admin.userId))).text()).replaceAll("<!-- -->", "");
  r.check("both directions show as recorded ($40.00 owed to the admin, $15.00 owed by them), never $25.00 as a row",
    text.includes("$40.00") && text.includes("$15.00") && !/figure font-semibold">\$25\.00/.test(text), text.match(/house ledger[\s\S]{0,1500}/)?.[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300));
  r.check("…and the net only in the hint: \"Member hn pays you $25.00 and you both check off each other's bills\"",
    /Settling at once\? Member hn pays you[\s\S]{0,80}\$25\.00[\s\S]{0,40}and you both check off each other(&#x27;|')s bills/.test(text));
  await owner`UPDATE bill_debts SET paid_at = now() WHERE bill_id = ${water.id}`;
  text = (await (await get(N(), await cookieFor(n.admin.userId))).text()).replaceAll("<!-- -->", "");
  r.check("owing nothing, an owner's Next due is the soonest bill owed to them, and who hasn't paid",
    /Next due[\s\S]{0,400}Gas · Member hn hasn(&#x27;|')t paid you/.test(text), text.match(/Next due[\s\S]{0,600}/)?.[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160));
  text = await (await get(N("/household"), await cookieFor(n.admin.userId))).text();
  r.check("member controls open the shared dialog (no <details> disclosure), named for the member",
    !/<summary[^>]*>Edit</.test(text) && text.includes('aria-label="Edit Member hn"') && /<dialog[^>]*class="dialog/.test(text));

  r.section("http: document upload tokens");
  const tokenReq = (pathname: string, cookie?: string) =>
    fetch(`${base}/api/documents/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart: false } }),
    });
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`);
  r.check("anonymous → 401", res.status === 401, res.status);
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`, aMember);
  r.check("member → 401", res.status === 401, res.status);
  res = await tokenReq(`h/${b.id}/documents/lease.pdf`, aAdmin);
  r.check("A's admin asking for B's prefix → 401 (the key's household decides, and they aren't its admin)", res.status === 401, res.status);
  res = await tokenReq(`h/${a.id}/bills/2030/gas/0101-1.pdf`, aAdmin);
  r.check("admin asking for a bill key → 400", res.status === 400, res.status);
  res = await tokenReq(`h/${a.id}/documents/lease.pdf`, aAdmin);
  const tok = (await res.json()) as { clientToken?: string };
  r.check("admin, own documents prefix → client token", res.status === 200 && typeof tok.clientToken === "string", res.status);

  r.section("http: pages");
  const page = async (p: string, cookie: string) => {
    const x = await get(p, cookie);
    return { status: x.status, html: (await x.text()).replaceAll("<!-- -->", "") };
  };
  let pg = await page(A(), aMember);
  r.check("dashboard renders for a member with their balance", pg.status === 200 && pg.html.includes("You owe") && pg.html.includes("The house ledger"), pg.status);
  pg = await page(A("/bills"), aMember);
  r.check("the bills page renders for a member (read-only checkboxes on others' bills)", pg.status === 200 && pg.html.includes("Paid back") && pg.html.includes("disabled"), pg.status);
  pg = await page(A("/household"), aAdmin);
  r.check("the Members page puts + Invite in the header slot and Email everyone nowhere (bulk email off)", pg.status === 200 && pg.html.includes("+ Invite") && !pg.html.includes("Email everyone"));
  pg = await page(A("/household/settings"), aAdmin);
  r.check("Settings shows the Utilities with owners (ledger)", pg.status === 200 && pg.html.includes("Utilities") && pg.html.includes("Owner (pays the provider)") && pg.html.includes("+ Add utility"));
  pg = await page(A("/household/settings"), aMember);
  r.check("…a member reads them without the controls, and still gets Leave or delete", pg.html.includes("Utilities") && !pg.html.includes("+ Add utility") && pg.html.includes("Leave household"));
  pg = await page(A("/documents"), aAdmin);
  r.check("documents page renders when the feature is on", pg.status === 200 && pg.html.includes("Documents"));
  await owner`UPDATE households SET feature_documents = false WHERE id = ${a.id}`;
  pg = await page(A("/documents"), aAdmin);
  // Under the root loading.tsx the page streams, so notFound() can't change the already-sent
  // 200; what matters is that the not-found UI renders instead of the documents.
  r.check("…and renders not-found when it's off", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("The lease, insurance"), pg.status);
  pg = await page("/demo", "");
  r.check("/demo: the demo dashboard renders from memory, no cookie needed", pg.status === 200 && pg.html.includes("Demo House") && pg.html.includes("The house ledger"));
  r.check("…with its links inside /demo", pg.html.includes('href="/demo/bills"'));
  pg = await page("/demo/bills", aMember);
  r.check("…and a signed-in visitor sees the demo there too, not their own household", pg.html.includes('class="wordmark">Demo House<') && !pg.html.includes('class="wordmark">Verify HA<'));

  r.section("http: the site flow (household URLs)");
  pg = await page("/", aMember);
  r.check("signed in, / is still the public home page", pg.status === 200 && pg.html.includes("data-site") && !pg.html.includes("The house ledger"), pg.status);
  r.check("…whose header opens the household", pg.html.includes(`href="${A()}"`) && pg.html.includes("Open your household"));
  pg = await page("/", "");
  r.check("signed out, / offers Sign in and the demo", pg.html.includes('href="/login"') && pg.html.includes('href="/demo"') && !pg.html.includes("Open your household"));
  r.check("…and its form says Sign in, with the one-line code hint", pg.html.includes("New or returning, we&#x27;ll email you a 6-digit code.") && !pg.html.includes("Email me a code"));
  r.check("…and the footer carries the legal line: Contact (mailto) and Privacy", pg.html.includes(`href="mailto:${BRAND.contactEmail}"`) && pg.html.includes('href="/privacy"') && pg.html.includes(BRAND.legalName));
  pg = await page(A(), aMember);
  r.check("a household page's footer carries the same legal line", pg.html.includes(`href="mailto:${BRAND.contactEmail}"`) && pg.html.includes('href="/privacy"') && pg.html.includes(BRAND.legalName));
  r.section("http: /admin without an operator list");
  pg = await page("/admin", aAdmin);
  r.check("SUPERADMIN_EMAILS unset: /admin is not found for a household admin (404, the not-found page)", pg.status === 404 && pg.html.includes("no page at this address"), pg.status);
  res = await get("/admin");
  r.check("signed out, /admin → /login like any page", res.status === 307 && (res.headers.get("location") ?? "").includes("/login"), res.status);

  res = await get("/", "");
  r.check("open (no gate): no noindex header, /about is 200", res.headers.get("x-robots-tag") === null && (await get("/about", "")).status === 200);
  r.check("…and robots.txt allows", /Allow: \//.test(await (await get("/robots.txt")).text()));
  res = await get("/sitemap.xml", "");
  const mapXml = await res.text();
  r.check("…and sitemap.xml lists the public pages, absolute, and no household", res.status === 200 && ["/", "/how-it-works", "/about", "/demo", "/privacy"].every((p) => mapXml.includes(`<loc>${appUrl(p)}</loc>`)) && !mapXml.includes(A()), res.status);
  pg = await page("/about?ok=x", "");
  r.check("…and a public page's canonical and og:url are its own path, query dropped", pg.html.includes(`<link rel="canonical" href="${appUrl("/about")}"/>`) && pg.html.includes(`<meta property="og:url" content="${appUrl("/about")}"/>`));
  pg = await page("/privacy", "");
  r.check("/privacy is public, in the site's look, and names the legal entity", pg.status === 200 && pg.html.includes("data-site") && pg.html.includes(`${BRAND.name} is a trade name of ${BRAND.legalName}.`), pg.status);
  pg = await page("/login", "");
  r.check("/login says the same", pg.html.includes("New or returning, we&#x27;ll email you a 6-digit code.") && !pg.html.includes("Email me a code"));
  res = await get("/login", aMember);
  r.check("Sign in while signed in → straight to the household", res.status === 307 && new URL(res.headers.get("location") ?? "", base).pathname === A(), res.headers.get("location"));
  // Someone in both fixture households; not a splitter, so no later bill math moves.
  const both = await addMember(owner, b, `hab-both-${RUN}`, { splits: false });
  await owner`INSERT INTO memberships (household_id, user_id, role, splits_bills, joined_at) VALUES (${a.id}, ${both.userId}, 'member', false, now())`;
  const bothCookie = await cookieFor(both.userId);
  res = await get("/login", `${bothCookie}; ${HOUSEHOLD_COOKIE}=${b.slug}`);
  r.check("…in two households, to the one opened last", new URL(res.headers.get("location") ?? "", base).pathname === B(), res.headers.get("location"));
  res = await get(`/login?next=${encodeURIComponent(A("/bills"))}`, bothCookie);
  r.check("…or to next= when given", new URL(res.headers.get("location") ?? "", base).pathname === A("/bills"), res.headers.get("location"));
  pg = await page(A(), bothCookie);
  const pgB = await page(B(), bothCookie);
  r.check("one session, two households, each at its own URL with its own name", pg.html.includes('class="wordmark">Verify HA<') && pgB.html.includes('class="wordmark">Verify HB<'));
  r.check("…and the switcher links to each household's URL", pg.html.includes(`href="${B()}"`) && pgB.html.includes(`href="${A()}"`));
  pg = await page(B(), aMember);
  r.check("a household you're not in → not found, nothing of it shown", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Verify HB"), pg.status);
  pg = await page(B("/bills"), aMember);
  r.check("…on every page of it", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Verify HB"), pg.status);
  res = await get(A(), "");
  r.check("signed out, a household URL → /login?next= that URL", res.status === 307 && (res.headers.get("location") ?? "").endsWith(`/login?next=${encodeURIComponent(A())}`), res.headers.get("location"));
  pg = await page("/households", bothCookie);
  r.check("/households links every household by its URL", pg.html.includes(`href="${A()}"`) && pg.html.includes(`href="${B()}"`));
  r.check("…in the public site's look, not a household theme", pg.html.includes("data-site") && !pg.html.includes("data-theme="));
  pg = await page("/login", "");
  r.check("/login is on the public site's root (its look, not a household theme)", pg.status === 200 && pg.html.includes("data-site") && !pg.html.includes("data-theme="), pg.status);
  pg = await page(`/login?step=code&email=${encodeURIComponent(`x-${RUN}@verify.invalid`)}`, "");
  r.check("…the code step too", pg.html.includes("data-site") && pg.html.includes('"one-time-code"'));

  r.section("http: the household nav and the old portal URLs");
  const linksIn = (html: string) => new Set([...html.matchAll(/href="(\/[a-z0-9/-]*)"/g)].map((m) => m[1]));
  pg = await page(A(), aMember);
  const navLinks = linksIn(pg.html);
  r.check("nav: Overview, Bills, Household, Settings; no Portal", navLinks.has(A("/bills")) && navLinks.has(A("/household")) && navLinks.has(A("/household/settings")) && !navLinks.has(A("/portal")) && pg.html.includes(">Overview<"), [...navLinks]);
  pg = await page(A("/household/settings"), aMember);
  const currentLinks = new Set([...pg.html.matchAll(/<a aria-current="page"[^>]*href="([^"]*)"/g)].map((m) => m[1]));
  r.check("…on /household/settings the Settings link is current and Household is not", currentLinks.has(A("/household/settings")) && !currentLinks.has(A("/household")), [...currentLinks]);
  pg = await page(A(), aMember);
  r.check("…and the person's own pages in the name menu", navLinks.has("/account") && navLinks.has("/households") && pg.html.includes("Sign out"));
  pg = await page("/account", aMember);
  r.check("outside a household: no section links, the wordmark goes back to it", !linksIn(pg.html).has(A("/bills")) && pg.html.includes(`href="${A()}"`));
  for (const [from, to] of [["/portal", "/bills"], ["/portal?page=2", "/bills?page=2"], ["/portal/household", "/household"], ["/portal/settings?ok=x", "/household/settings?ok=x"], ["/portal/email", "/household/email"]]) {
    res = await get(A(from), "");
    const loc = res.headers.get("location") ?? "";
    r.check(`old ${from} → ${to}, before the sign-in check`, (res.status === 307 || res.status === 308) && new URL(loc, base).pathname + new URL(loc, base).search === A(to), { status: res.status, loc });
  }

  r.section("http: the cron endpoint's lock");
  // Only the refusals go over the wire: an authorized tick would run every household in the
  // database, seed ones included. The authorized path is covered at the library level (cron).
  res = await fetch(`${base}/api/cron/tick`);
  r.check("no Authorization header → 401", res.status === 401, res.status);
  res = await fetch(`${base}/api/cron/tick`, { headers: { authorization: "Bearer not-the-secret" } });
  r.check("wrong secret → 401", res.status === 401, res.status);
  res = await fetch(`${base}/api/cron/tick`, { headers: { authorization: `Basic ${process.env.CRON_SECRET ?? ""}` } });
  r.check("the right secret under the wrong scheme → 401", res.status === 401, res.status);

  r.section("http: the wake-up consumer (app/api/queues/flush)");
  // On Vercel the route has no public URL; here it is reachable, so the SDK's own parsing is the
  // check: a request that isn't a queue callback never reaches the handler.
  const flushLogAt = server.log.length;
  res = await fetch(`${base}/api/queues/flush`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ householdId: 1 }) });
  r.check("a plain JSON POST → 400, the handler never ran", res.status === 400 && !server.log.slice(flushLogAt).includes("queues/flush:"), { status: res.status, body: await res.text() });
  res = await fetch(`${base}/api/queues/flush`, { method: "POST", headers: { "content-type": "application/json", "ce-type": "com.vercel.queue.v2beta", "ce-id": "x", "ce-source": "x", "ce-specversion": "1.0" }, body: JSON.stringify({ householdId: 1 }) });
  r.check("…a hand-rolled CloudEvent envelope too", res.status >= 400 && !server.log.slice(flushLogAt).includes("queues/flush:"), { status: res.status, body: await res.text() });
  res = await fetch(`${base}/api/queues/flush`);
  r.check("GET → 405", res.status === 405, res.status);

  r.section("http: settings");
  const saveSettings = id("app/(household)/[household]/household/settings/actions.ts", "saveSettingsAction");
  const settingsForm = (over: Record<string, string> = {}) => {
    const f = new FormData();
    const fields: Record<string, string> = {
      name: "Verify HA", tagline: "", mode: "ledger", theme: "statement", colorScheme: "system", billsPerPage: "10", feature_thanks: "on",
      remindersEnabled: "on", sendHour: "8", firstReminderDays: "5", urgentReminderDays: "2", timezone: "America/Chicago", fromName: "Oak Crew", replyTo: "", digestEmail: "",
      ...over,
    };
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  pg = await page(A("/household/settings"), aMember);
  r.check("a member sees settings read-only", pg.status === 200 && pg.html.includes("Only a household admin can change these") && !pg.html.includes("Save settings"), pg.status);
  pg = await page(A("/household/settings"), aAdmin);
  r.check("an admin gets the form, with the schedule in plain words", pg.status === 200 && pg.html.includes("Save settings") && pg.html.includes("Once it&#x27;s late, one every 3 days"), pg.status);
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm() }, aMember);
  text = await res.text();
  r.check("member saving settings → refused", text.includes("Only a household admin can do that"), text.slice(0, 200));
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ urgentReminderDays: "6", digestEmail: "nope@" }) }, aAdmin);
  text = await res.text();
  r.check("bad values → every error inline, what was typed echoed back", text.includes("after the heads-up") && text.includes("digest address") && text.includes("nope@"), text.slice(0, 300));
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ digestEmail: "Digest@Verify.Invalid" }) }, aAdmin);
  await res.text();
  const [saved] = await owner<{ tz: string; hour: number; first: number; digest: string; fromName: string }[]>`
    SELECT timezone AS tz, send_hour AS hour, first_reminder_days AS first, digest_email::text AS digest, from_name AS "fromName" FROM households WHERE id = ${a.id}`;
  r.check("admin saves → redirect with ?ok=, values stored (email normalized)",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/household/settings?ok=")) && saved.tz === "America/Chicago" && saved.hour === 8 && saved.first === 5 && saved.digest === "digest@verify.invalid" && saved.fromName === "Oak Crew", saved);

  r.section("http: bulk email");
  const bulk = id("app/(household)/[household]/household/email/actions.ts", "sendBulkEmailAction");
  const bulkForm = (subject: string, body: string) => {
    const f = new FormData();
    f.set("subject", subject);
    f.set("body", body);
    return f;
  };
  await owner`UPDATE households SET digest_email = NULL WHERE id = ${a.id}`;
  pg = await page(A("/household/email"), aAdmin);
  r.check("feature off → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Goes to"), pg.status);
  await owner`UPDATE households SET feature_bulk_email = true WHERE id = ${a.id}`;
  await addMember(owner, a, `ha-invitee-${RUN}`, { joined: false });
  // Streamed under loading.tsx, a redirect() arrives as a 200 carrying the target, not a 307.
  pg = await page(A("/household/email"), aMember);
  r.check("a member is sent to /no-access", pg.html.includes(A("/no-access")) && !pg.html.includes("Goes to"), pg.status);
  pg = await page(A("/household/email"), aAdmin);
  r.check("the admin sees who it goes to (and who it doesn't)", pg.status === 200 && pg.html.includes("Goes to") && pg.html.includes(`Not to ha-invitee-${RUN}`), pg.status);
  res = await callAction(A("/household/email"), bulk, { state: { errors: [] }, form: bulkForm("", "") }, aAdmin);
  text = await res.text();
  r.check("empty subject and message → both errors inline", text.includes("Add a subject") && text.includes("Write the message"), text.slice(0, 200));
  res = await callAction(A("/household/email"), bulk, { state: { errors: [] }, form: bulkForm("Hi", "Hello") }, aMember);
  r.check("a member sending → refused", (await res.text()).includes("Only a household admin can do that"));
  const logBefore = server.log.length;
  res = await callAction(A("/household/email"), bulk, { state: { errors: [] }, form: bulkForm(`Note ${RUN}`, "Rent's due Friday.") }, aAdmin);
  await res.text();
  const sentLog = server.log.slice(logBefore);
  r.check("admin sends → ?ok=, one custom email per joined member, none to the invitee",
    (res.headers.get("x-action-redirect") ?? "").startsWith(A("/household/email?ok=")) && (sentLog.match(/\[mail:console\] custom to /g) ?? []).length >= 2 && !sentLog.includes(`ha-invitee-${RUN}`),
    res.headers.get("x-action-redirect"));

  r.section("http: sign-in flow (console mail)");
  const fresh = email("signup");
  const loginForm = (actionName: string, fields: Record<string, string>) => formPost("/login", id("app/(site)/login/actions.ts", actionName), fields, "");
  res = await loginForm("requestCode", { email: fresh.toUpperCase(), next: "/" });
  r.check("code requested (unknown email welcome)", (res.headers.get("location") ?? "").includes("step=code"), res.headers.get("location"));
  let code = "";
  for (let i = 0; i < 25 && !code; i++) {
    code = new RegExp(`\\[mail:console\\] login_code to ${fresh.replace(/[.]/g, "\\.")}: (\\d{6})`).exec(server.log)?.[1] ?? "";
    if (!code) await new Promise((x) => setTimeout(x, 200));
  }
  r.check("the code was printed, not sent", code.length === 6);
  res = await loginForm("submitCode", { email: fresh, code, next: "/" });
  const setCookie = res.headers.get("set-cookie") ?? "";
  r.check("verified → session cookie and onboarding at /new", setCookie.startsWith(`${SESSION_COOKIE}=`) && (res.headers.get("location") ?? "").endsWith("/new"), res.headers.get("location"));
  const [{ n: created }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE email = ${fresh}`;
  r.check("the users row exists only after verifying", created === 1);

  // ---------------------------------------------------------------------------------------------
  r.section("http: the calendar feed (/cal.ics?k=)");
  const tokenOf = async (membershipId: number) => (await owner<{ k: string }[]>`SELECT calendar_token AS k FROM memberships WHERE id = ${membershipId}`)[0]?.k;
  const feed = async (k: string) => {
    const x = await fetch(`${base}/cal.ics?k=${encodeURIComponent(k)}`, { redirect: "manual" });
    return { status: x.status, type: x.headers.get("content-type") ?? "", cache: x.headers.get("cache-control") ?? "", body: await x.text() };
  };
  const kA = (await tokenOf(a.member.membershipId))!;
  let cal = await feed(kA);
  r.check("a member's token, no cookie → their household's feed", cal.status === 200 && cal.type.startsWith("text/calendar") && cal.body.startsWith("BEGIN:VCALENDAR\r\n"), cal.status);
  r.check("…cached by the client only, never a shared cache", /private/.test(cal.cache) && !/public|s-maxage/.test(cal.cache), cal.cache);
  const aBills = (await owner<{ id: number }[]>`SELECT id FROM bills WHERE household_id = ${a.id}`).map((x) => x.id);
  const bBills = (await owner<{ id: number }[]>`SELECT id FROM bills WHERE household_id = ${b.id}`).map((x) => x.id);
  r.check("…every bill of that household, and nothing from another", aBills.every((i) => cal.body.includes(`UID:bill-${i}@`)) && !bBills.some((i) => cal.body.includes(`UID:bill-${i}@`)), { aBills, bBills });
  const empty = (x: { status: number; body: string }) => x.status === 404 && x.body === "";
  r.check("no token → 404, empty", empty(await feed("")));
  r.check("a malformed token → 404, empty", empty(await feed("not-a-token")));
  r.check("a well-formed token nobody holds → 404, empty", empty(await feed("A".repeat(43))));
  r.check("another household's member's token → only their household", (await feed((await tokenOf(b.member.membershipId))!)).body.includes(`UID:bill-${b.billId}@`));

  const resetAction = id("app/(app)/account/actions.ts", "resetCalendarLink");
  res = await formPost("/account", resetAction, { householdId: String(b.id) }, aMember);
  r.check("resetting a calendar link in a household you're not in → refused", err(res) !== "" && (await tokenOf(a.member.membershipId)) === kA, err(res));
  res = await formPost("/account", resetAction, { householdId: String(a.id) }, aMember);
  const kA2 = (await tokenOf(a.member.membershipId))!;
  r.check("reset my calendar link → ?ok= and a new token", res.status === 303 && (res.headers.get("location") ?? "").includes("ok=") && kA2 !== kA, res.status);
  r.check("…the old link returns nothing", empty(await feed(kA)));
  r.check("…the new one works", (await feed(kA2)).status === 200);
  r.check("…and the admin's link is untouched", (await feed((await tokenOf(a.admin.membershipId))!)).status === 200);
  const leaver = await addMember(owner, a, `ha-leaver-${RUN}`);
  const kLeaver = (await tokenOf(leaver.membershipId))!;
  r.check("a member's feed works while they're in the household", (await feed(kLeaver)).status === 200);
  await owner`DELETE FROM memberships WHERE id = ${leaver.membershipId}`;
  r.check("…and returns nothing once they're removed", empty(await feed(kLeaver)));
  pg = await page("/account", aMember);
  r.check("/account shows the subscribe buttons and the current link", pg.html.includes("webcal://") && pg.html.includes(encodeURIComponent(kA2)) && pg.html.includes("Reset my calendar link"));
  r.check("…in the public site's look, with a way to sign out", pg.html.includes("data-site") && !pg.html.includes("data-theme=") && pg.html.includes("Sign out"));
  pg = await page("/new", aMember);
  r.check("/new (onboarding) is in the site's look too", pg.status === 200 && pg.html.includes("data-site") && !pg.html.includes("data-theme=") && pg.html.includes("Create household"), pg.status);

  r.section("http: onboarding picks utilities, then sends the creator to the tour");
  // A real /new post: the column default (0010) turns the tour on, createHousehold() leaves the
  // creator's welcomed_at NULL, and the action redirects to the tour. Gas keeps its emoji with a
  // fee, Water's emoji is cleared, Electric and Internet are unchecked (their fields still post).
  const [founder] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${email("hfounder")}, 'Founder') RETURNING id`;
  const founderCookie = await cookieFor(founder.id);
  const createHh = id("app/(app)/new/actions.ts", "createHouseholdAction");
  const onboard = { name: "Founder", householdName: `verify-${RUN}-onboard`, mode: "single_payer", theme: "sheet", timezone: "UTC" };
  res = await formPost("/new", createHh, { ...onboard, utilities: ["gas", "water"], emoji_gas: "🔥", fee_gas: "abc", emoji_water: "" }, founderCookie);
  const [{ n: refusedMade }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM households WHERE slug = ${onboard.householdName}`;
  r.check("a bad processing fee comes back to /new with the reason, and makes nothing", res.status === 303 && (res.headers.get("location") ?? "").startsWith("/new?err=") && refusedMade === 0, res.headers.get("location"));
  res = await formPost("/new", createHh, {
    ...onboard, utilities: ["gas", "water"],
    emoji_gas: "🔥", fee_gas: "1.50", emoji_electric: "⚡", fee_electric: "9", emoji_internet: "🌐", fee_internet: "0", emoji_water: "", fee_water: "",
  }, founderCookie);
  const [made] = await owner<{ id: number; slug: string; tour: boolean; welcomed: Date | null; mid: number }[]>`
    SELECT h.id, h.slug, h.feature_welcome_tour AS tour, m.welcomed_at AS welcomed, m.id AS mid
    FROM households h JOIN memberships m ON m.household_id = h.id AND m.user_id = ${founder.id}
    WHERE h.slug = ${onboard.householdName}`;
  r.check("a household made through /new has the tour on, and its creator hasn't seen it", res.status === 303 && !!made && made.tour && made.welcomed === null, made ?? res.status);
  if (made) {
    const M = (p = "") => householdPath(made, p);
    r.check("…and the creator is sent straight to the tour", res.headers.get("location") === M("/welcome"), res.headers.get("location"));
    const types = await owner<{ name: string; emoji: string | null; fee: number; ownerId: number }[]>`
      SELECT name, emoji, processing_fee::float8 AS fee, owner_id AS "ownerId" FROM bill_types WHERE household_id = ${made.id} ORDER BY name`;
    r.check("only the checked utilities exist, each owned by the creator, with its emoji (or none) and fee",
      JSON.stringify(types) === JSON.stringify([{ name: "Gas", emoji: "🔥", fee: 1.5, ownerId: made.mid }, { name: "Water", emoji: null, fee: 0, ownerId: made.mid }]), types);
    pg = await page(M("/welcome"), founderCookie);
    r.check("the tour opens on the household's own utilities, with no blank where Water's emoji would be",
      pg.status === 200 && pg.html.includes("Step 1 of") && /animation-delay:[^"]*"><span class="text-2xl" aria-hidden="true">🔥<\/span><span class="eyebrow">Gas</.test(pg.html) && /animation-delay:[^"]*"><span class="eyebrow">Water</.test(pg.html), pg.html.match(/.{0,120}>Water<.{0,50}/)?.[0]);
    pg = await page(M(), founderCookie);
    r.check("an overview opened before finishing still offers the tour in the banner", pg.status === 200 && pg.html.includes("Take the 30-second tour") && linksIn(pg.html).has(M("/welcome")), pg.status);
    r.check("…with utilities picked, no \"First step\", but a \"Next step\" to invite roommates",
      !pg.html.includes("First step") && pg.html.includes("Next step") && linksIn(pg.html).has(M("/household")));
    res = await formPost(M("/welcome"), id("app/(household)/[household]/welcome/actions.ts", "finishWelcome"), {}, founderCookie);
    const [{ w: finished }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${made.mid}`;
    r.check("finishing or skipping the tour lands on the overview and records it", res.status === 303 && res.headers.get("location") === M() && finished !== null, res.headers.get("location"));
    pg = await page(M("/bills"), founderCookie);
    r.check("…and the footer links \"How this works\" on other pages", pg.html.includes("How this works") && linksIn(pg.html).has(M("/welcome")));

    // A utility with no emoji renders as its name alone everywhere it appears: no "null", no
    // placeholder, no leading space. Water's bill is owed to the creator by an invited roommate.
    const roomie = await addMember(owner, made, `hroomie-${RUN}`);
    const [wb] = await owner<{ id: number }[]>`
      INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner, shares, owner_share)
      SELECT ${made.id}, id, current_date - 2, current_date + 9, 40.00, 20.00, ${made.mid}, ${made.mid}, true, 2, true
      FROM bill_types WHERE household_id = ${made.id} AND name = 'Water' RETURNING id`;
    await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${made.id}, ${wb.id}, ${roomie.membershipId})`;
    // The label element holds exactly "Water"; "null", "undefined" or a space right before the
    // name inside any element would be the stray (prose like "Edit Water" sits after a word).
    const strays = (html: string) => html.match(/>(\s|null|undefined)+Water</g);
    const label = (html: string, el: RegExp) => el.test(html) && !strays(html);
    pg = await page(M(), founderCookie);
    r.check("overview: \"Water\" with no emoji and no gap, Next step gone once someone's invited", pg.html.includes("Owed to you") && label(pg.html, /class="font-medium">Water<\/div>/) && !pg.html.includes("Next step"), strays(pg.html));
    pg = await page(M("/bills"), founderCookie);
    r.check("bills: the same", label(pg.html, /class="font-medium">Water<\/div>/), strays(pg.html));
    pg = await page(M("/household/settings"), founderCookie);
    r.check("settings: Water bare, Gas with its emoji", label(pg.html, /cell-type font-medium">Water<\/td>/) && /cell-type font-medium">🔥 Gas<\/td>/.test(pg.html), strays(pg.html));
    r.check("…and the add dialog's emoji field is empty with an \"Optional, e.g.\" placeholder", (() => { const f = pg.html.match(/<input[^>]*name="emoji"[^>]*>/)?.[0] ?? ""; return /placeholder="Optional, e\.g\. [^"]+"/.test(f) && /value=""/.test(f); })(), pg.html.match(/<input[^>]*name="emoji"[^>]*>/)?.[0]);
    await owner`UPDATE households SET feature_trends = true WHERE id = ${made.id}`;
    pg = await page(M("/trends"), founderCookie);
    r.check("trends: the totals row is bare too", pg.status === 200 && label(pg.html, /cell-type font-medium">Water<\/td>/), strays(pg.html) ?? pg.html.match(/.{0,80}Water.{0,30}/)?.[0]);
    const k = (await owner<{ k: string }[]>`SELECT calendar_token AS k FROM memberships WHERE id = ${made.mid}`)[0].k;
    const ics = await (await fetch(`${base}/cal.ics?k=${encodeURIComponent(k)}`)).text();
    r.check("calendar feed: SUMMARY starts with the name", /\r\nSUMMARY:Water due/.test(ics), ics.match(/SUMMARY:[^\r]*/)?.[0]);
    await owner`DELETE FROM households WHERE id = ${made.id}`;
  }

  pg = await page(A(), aMember);
  r.check("the dashboard has Apple and Google subscribe buttons for the viewer's own link", pg.html.includes(`webcal://`) && pg.html.includes("calendar.google.com/calendar/r?cid=") && pg.html.includes(encodeURIComponent(kA2)) && !pg.html.includes(encodeURIComponent((await tokenOf(a.admin.membershipId))!)));

  // ---------------------------------------------------------------------------------------------
  r.section("http: disabled features are hidden and refused");
  await owner`UPDATE households SET feature_trends = false, feature_documents = false, feature_bulk_email = false, feature_welcome_tour = false WHERE id = ${a.id}`;
  pg = await page(A(), aAdmin);
  let nav = linksIn(pg.html);
  r.check("all off: no Trends or Docs in the nav, no tour link in the footer", !nav.has(A("/trends")) && !nav.has(A("/documents")) && !nav.has(A("/welcome")), [...nav]);
  pg = await page(A("/household"), aAdmin);
  r.check("…and no Email button on Household", !linksIn(pg.html).has(A("/household/email")));
  pg = await page(A("/trends"), aAdmin);
  r.check("/trends → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Totals by bill type"), pg.status);
  res = await get(A("/trends/csv"), aAdmin);
  r.check("/trends/csv → 404", res.status === 404, res.status);
  pg = await page(A("/welcome"), aMember);
  r.check("/welcome → not found", (pg.status === 404 || pg.html.includes("could not be found")) && !pg.html.includes("Step 1 of"), pg.status);
  const finish = id("app/(household)/[household]/welcome/actions.ts", "finishWelcome");
  await owner`UPDATE memberships SET welcomed_at = NULL WHERE id = ${a.member.membershipId}`;
  res = await formPost(A("/welcome"), finish, {}, aMember);
  let [{ w }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${a.member.membershipId}`;
  r.check("finishing the tour while it's off records nothing", w === null, res.status);

  await owner`UPDATE households SET feature_trends = true, feature_documents = true, feature_bulk_email = true, feature_welcome_tour = true WHERE id = ${a.id}`;
  pg = await page(A(), aAdmin);
  nav = linksIn(pg.html);
  r.check("all on: Trends and Docs in the nav, the tour in the footer", nav.has(A("/trends")) && nav.has(A("/documents")) && nav.has(A("/welcome")), [...nav]);
  pg = await page(A("/household"), aAdmin);
  r.check("…and the Email button for an admin", linksIn(pg.html).has(A("/household/email")));
  pg = await page(A("/trends"), aMember);
  r.check("/trends renders the chart and the totals", pg.status === 200 && pg.html.includes("Totals by bill type") && pg.html.includes("Download CSV"), pg.status);
  res = await get(A("/trends/csv"), aMember);
  text = await res.text();
  r.check("/trends/csv: a CSV attachment, one column per type", res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("text/csv") && /attachment/.test(res.headers.get("content-disposition") ?? "") && text.startsWith("Month,Gas,Water,Total"), text.slice(0, 80));
  res = await get(A("/trends/csv"));
  r.check("…and not without a session", res.status !== 200, res.status);

  r.section("http: the welcome tour");
  const offer = "Take the 30-second tour";
  pg = await page(A(), aMember);
  r.check("a member who hasn't seen it lands on the overview, not the tour", pg.status === 200 && pg.html.includes("The house ledger") && !pg.html.includes("Step 1 of"), pg.status);
  r.check("…which offers the tour in a banner linking to it", pg.html.includes(offer) && linksIn(pg.html).has(A("/welcome")));
  pg = await page(A("/bills"), aMember);
  r.check("…and other pages open straight through, without the banner", pg.status === 200 && pg.html.includes("Bills") && !pg.html.includes(offer) && !pg.html.includes("Step 1 of"), pg.status);
  pg = await page(A("/welcome"), aMember);
  r.check("ledger households hear about owners", pg.status === 200 && pg.html.includes("Every bill has an owner") && pg.html.includes("Step 1 of"));
  res = await formPost(A("/welcome"), finish, {}, aMember);
  [{ w }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${a.member.membershipId}`;
  r.check("finishing records it and opens the overview", w !== null && res.status === 303 && (res.headers.get("location") ?? "").endsWith(A()), res.status);
  pg = await page(A(), aMember);
  r.check("…which no longer offers the tour", pg.html.includes("The house ledger") && !pg.html.includes(offer));
  await owner`UPDATE memberships SET welcomed_at = NULL WHERE id = ${a.member.membershipId}`;
  res = await formPost(A(), finish, {}, aMember);
  [{ w }] = await owner<{ w: Date | null }[]>`SELECT welcomed_at AS w FROM memberships WHERE id = ${a.member.membershipId}`;
  r.check("dismissing the banner from the overview records it too", w !== null && res.status === 303 && (res.headers.get("location") ?? "").endsWith(A()), res.status);
  pg = await page(A(), aMember);
  r.check("…and the banner is gone, while the footer still links the tour", !pg.html.includes(offer) && linksIn(pg.html).has(A("/welcome")));
  await owner`UPDATE memberships SET welcomed_at = NULL WHERE id = ${a.member.membershipId}`;
  await owner`UPDATE households SET feature_welcome_tour = false WHERE id = ${a.id}`;
  pg = await page(A(), aMember);
  r.check("with the tour off, nobody is offered it", pg.html.includes("The house ledger") && !pg.html.includes(offer));
  await owner`UPDATE households SET feature_welcome_tour = true WHERE id = ${a.id}`;
  await owner`UPDATE memberships SET welcomed_at = now() WHERE id = ${a.member.membershipId}`;
  await owner`UPDATE households SET mode = 'single_payer' WHERE id = ${a.id}`;
  pg = await page(A("/welcome"), aMember);
  r.check("single-payer households hear about the payer instead", pg.html.includes("One person pays every bill") && !pg.html.includes("Every bill has an owner"));
  await owner`UPDATE households SET mode = 'ledger' WHERE id = ${a.id}`;

  r.section("http: theme");
  pg = await page(A(), aMember);
  r.check("statement by default: data-theme and the household's scheme on <html>", /<html[^>]*data-theme="statement"[^>]*data-color-scheme="system"/.test(pg.html));
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "peach", colorScheme: "system" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("an admin saves peach → every member's next page is peach, light", /<html[^>]*data-theme="peach"[^>]*data-color-scheme="light"/.test(pg.html), pg.html.match(/<html[^>]*>/)?.[0]);
  r.check("…with the awning and the peach page color in the browser chrome", pg.html.includes('class="awning"') && pg.html.includes('name="theme-color" content="#faf3e7"'));
  r.check("…while the peach faces stay unpreloaded (only the default theme's ledger face is)", (pg.html.match(/rel="preload"[^>]*as="font"/g) ?? []).length <= 1);
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "japandi", colorScheme: "system" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("an admin saves japandi → every member's next page is japandi, light", /<html[^>]*data-theme="japandi"[^>]*data-color-scheme="light"/.test(pg.html), pg.html.match(/<html[^>]*>/)?.[0]);
  r.check("…with the noren's element and the linen page color in the browser chrome", pg.html.includes('class="awning"') && pg.html.includes('name="theme-color" content="#f0ece4"'));
  r.check("…and still only the default theme's ledger face preloaded", (pg.html.match(/rel="preload"[^>]*as="font"/g) ?? []).length <= 1);
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "sheet", colorScheme: "system" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("an admin saves sheet → every member's next page is the drafting sheet, light", /<html[^>]*data-theme="sheet"[^>]*data-color-scheme="light"/.test(pg.html) && pg.html.includes('name="theme-color" content="#f3f5f4"'), pg.html.match(/<html[^>]*>/)?.[0]);
  // The household template renders <ThemeSync theme scheme>; its props ride in the RSC payload.
  r.check("…and the template carries the theme for the client (ThemeSync props in the payload)", /\\"theme\\":\\"sheet\\",\\"scheme\\":\\"light\\"/.test(pg.html));
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ theme: "statement", colorScheme: "light" }) }, aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("…and back to statement, always light", /<html[^>]*data-theme="statement"[^>]*data-color-scheme="light"/.test(pg.html));

  // The Look group saves on its own, as a direct call with the two values (no form, no redirect).
  const saveLook = id("app/(household)/[household]/household/settings/actions.ts", "saveLookAction");
  res = await callAction(A("/household/settings"), saveLook, ["japandi", "system"], aAdmin);
  let body = await res.text();
  pg = await page(A(), aMember);
  r.check("an admin picks japandi in the Look group → saved on its own, every member's next page is japandi", res.status === 200 && body.includes('"ok":true') && /<html[^>]*data-theme="japandi"/.test(pg.html), { status: res.status, html: pg.html.match(/<html[^>]*>/)?.[0] });
  res = await callAction(A("/household/settings"), saveLook, ["peach", "light"], aMember);
  body = await res.text();
  r.check("a member picking a look is refused (an error, not a save)", res.status === 200 && body.includes('"ok":false') && /admin/.test(body) && !body.includes('"ok":true'), body.slice(0, 300));
  res = await callAction(A("/household/settings"), saveLook, ["neon", "light"], aAdmin);
  body = await res.text();
  r.check("an unknown theme is refused", body.includes('"ok":false') && /Pick a theme/.test(body), body.slice(0, 300));
  res = await callAction(A("/household/settings"), saveLook, ["statement", "light"], aAdmin);
  await res.text();
  pg = await page(A(), aMember);
  r.check("…and the look action puts it back to statement, always light", /<html[^>]*data-theme="statement"[^>]*data-color-scheme="light"/.test(pg.html));

  r.section("http: mode switch over the wire");
  res = await callAction(A("/household/settings"), saveSettings, { state: { errors: [] }, form: settingsForm({ mode: "single_payer", payerId: String(a.admin.membershipId) }) }, aAdmin);
  await res.text();
  const [{ mode }] = await owner<{ mode: string }[]>`SELECT mode FROM households WHERE id = ${a.id}`;
  const typeOwners = await owner<{ o: number }[]>`SELECT owner_id AS o FROM bill_types WHERE household_id = ${a.id}`;
  r.check("admin switches to single payer → mode saved, every type owned by the payer", mode === "single_payer" && typeOwners.every((t) => t.o === a.admin.membershipId) && (res.headers.get("x-action-redirect") ?? "").includes("ok="), { mode, typeOwners });
  pg = await page(A("/household/settings"), aAdmin);
  r.check("…and the owner column is gone from the Utilities", pg.html.includes("Utilities") && !pg.html.includes("Owner (pays the provider)"));

  r.section("http: deleting a household by vote, read-only, undo, leave");
  const hh = "app/(household)/[household]/household/actions.ts";
  const c = await makeHousehold(owner, "hc", "ledger");
  const C = (p = "") => householdPath(c, p);
  const cAdmin = await cookieFor(c.admin.userId);
  const cMember = await cookieFor(c.member.userId);
  const marked = async () => (await owner<{ d: Date | null; q: Date | null }[]>`SELECT delete_after AS d, deletion_requested_at AS q FROM households WHERE id = ${c.id}`)[0];
  pg = await page(C("/household/settings"), cAdmin);
  r.check("Settings ends with Leave or delete, with the CSV", pg.html.includes("Leave or delete") && pg.html.includes(C("/household/export")));
  res = await formPost(C("/household"), id(hh, "requestDeletionAction"), {}, cAdmin);
  r.check("an admin asks everyone → ok, request open", ok(res).includes("Asked everyone") && (await marked()).q !== null, ok(res) || err(res));
  pg = await page(C("/bills"), cMember);
  r.check("every page shows the banner, with Approve for a member who hasn't", pg.html.includes("asked to delete") && pg.html.includes("Approve"));
  res = await formPost(C("/household"), id(hh, "approveDeletionAction"), {}, bAdmin);
  r.check("a non-member's approve is refused and changes nothing", (res.status >= 400 || err(res) !== "") && (await marked()).d === null, res.status);
  res = await formPost(C("/household"), id(hh, "approveDeletionAction"), {}, cMember);
  r.check("the member approves → everyone has, so it's marked", ok(res).includes("Everyone approved") && (await marked()).d !== null, ok(res) || err(res));
  pg = await page(C("/bills"), cAdmin);
  r.check("the banner says when, and offers the admin Undo", pg.html.includes("will be deleted on") && pg.html.includes("Undo deletion"));
  res = await formPost(C("/household"), id(hh, "saveBillTypeAction"), { name: "Nope", emoji: "❌", processingFee: "0" }, cAdmin);
  r.check("while marked, a form action comes back read-only", err(res).includes("being deleted"), err(res));
  res = await callAction(C("/bills"), setPaidAction, [c.billId, c.member.membershipId, true], cAdmin);
  text = await res.text();
  r.check("…and so does a payment checkbox", text.includes('"ok":false') && text.includes("being deleted"), text.slice(0, 200));
  res = await get(C("/household/export"), cMember);
  text = await res.text();
  r.check("the CSV still downloads, one row per share", res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("text/csv") && text.startsWith("Bill,Type,") && text.includes(",Gas,"), text.slice(0, 120));
  res = await formPost(C("/household"), id(hh, "undoDeletionAction"), {}, bAdmin);
  r.check("a non-member's undo is refused and it stays marked", (res.status >= 400 || err(res) !== "") && (await marked()).d !== null, res.status);
  res = await formPost(C("/household"), id(hh, "undoDeletionAction"), {}, cMember);
  r.check("a member's undo is refused", err(res).includes("admin") && (await marked()).d !== null, err(res));
  res = await formPost(C("/household"), id(hh, "undoDeletionAction"), {}, cAdmin);
  r.check("the admin's undo → back to normal", ok(res).includes("no longer being deleted") && (await marked()).d === null, ok(res) || err(res));
  res = await formPost(C("/household"), id(hh, "leaveAction"), {}, cAdmin);
  r.check("the last admin can't leave", err(res).includes("last admin"), err(res));
  res = await formPost(C("/household"), id(hh, "leaveAction"), {}, cMember);
  const [{ n: stillIn }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM memberships WHERE id = ${c.member.membershipId}`;
  r.check("a member leaves → /households, membership gone", (res.headers.get("location") ?? "").startsWith("/households?ok=") && stillIn === 0, res.headers.get("location"));
  pg = await page(C("/household"), cMember);
  r.check("…and the household is not found for them afterwards", !pg.html.includes("Leave or delete") && !pg.html.includes(c.slug + "/bills"), pg.status);
}
