// npm run promo: regenerates every promo image into promo/out/ (gitignored).
//
// 1. Starts `next dev` on PROMO_PORT (4319) with the launch gate and the login bypass off,
//    unless PROMO_URL names a running deployment (a preview: set
//    VERCEL_AUTOMATION_BYPASS_SECRET to get past Vercel Authentication).
// 2. Captures the /demo household (in memory, sample names only) in the sheet theme, the
//    default for a new household: the overview on a desktop and a phone, and Bills on a phone.
// 3. Writes each canvas as HTML (promo/out/html/) on the site's own stylesheet and faces, and
//    renders it to PNG at its exact pixel size with Playwright.
// 4. Assembles promo/out/posts/: one folder per post (posts.ts) with its images, caption and alt text.
// 5. Writes promo/out/index.html, a contact sheet of the set and the posts.
//
// Not part of the app build: tsconfig excludes promo/, and nothing under app/ imports it.

import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { BRAND } from "@/lib/brand";
import { CAROUSELS, HEADLINE, LANES, SCREENS, STAGES, type Stage, type Util } from "./copy";
import { altText, POSTS, type Post } from "./posts";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(import.meta.dirname, "out");
const HTML = path.join(OUT, "html");
const SHOTS = path.join(OUT, "shots");
const PORT = Number(process.env.PROMO_PORT || 4319);
const BASE = (process.env.PROMO_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const href = (abs: string) => pathToFileURL(abs).href;

// ---------- Drawing pieces ----------

/** The site's locate code: color, dash and name travel together (DESIGN.md, Public Site). */
const LOCATE: Record<Util, { name: string; color: string; dash: number[] }> = {
  electric: { name: "Electric", color: "var(--electric)", dash: [13, 3, 3, 3] },
  gas: { name: "Gas", color: "var(--gas)", dash: [9, 5] },
  water: { name: "Water", color: "var(--water)", dash: [1.5, 4.5] },
  wifi: { name: "Wifi", color: "var(--wifi)", dash: [15, 3, 1.5, 3, 1.5, 3] },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (n: number) => `$${n.toFixed(2)}`;

/** A figure with its dollar sign set small and raised, so the digits carry the size. */
function figure(text: string, size: number): string {
  const body = text.startsWith("$") ? `<span class="p-cur">$</span>${esc(text.slice(1))}` : esc(text);
  return `<div class="p-figure" style="font-size:${size}px">${body}</div>`;
}

const CHECK = `<svg viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="var(--sheet-hi)" stroke-width="2.2"/></svg>`;

/** A utility lane: its dashed line across the width, its name and total written on it. */
function lane(util: Util, label: string | null, { height, stroke, font }: { height: number; stroke: number; font: number }): string {
  const l = LOCATE[util];
  const k = stroke * 0.85;
  return `<div class="p-lane" style="height:${height}px">
    <svg><line x1="0" x2="100%" y1="50%" y2="50%" stroke="${l.color}" stroke-width="${stroke}" stroke-dasharray="${l.dash.map((d) => d * k).join(" ")}"/></svg>
    ${label === null ? "" : `<span class="p-lane-label" style="font-size:${font}px">${esc(label)}</span>`}
  </div>`;
}

interface ChipOpts {
  util?: Util;
  figure: string;
  caption: string;
  size: number;
  caption_px: number;
  pad: [number, number];
  owner?: boolean;
  struck?: boolean;
  /** No drawn box (the owner's chip is not a toggle, nor is a price). */
  bare?: boolean;
  row?: boolean;
}

/** A share chip, as on the site's plan; the owner's is ruled in its bill's color. */
function chip(o: ChipOpts): string {
  const border = o.owner && o.util ? `border-color:${LOCATE[o.util].color};` : "";
  const box = o.bare || o.owner ? "" : `<span class="p-box${o.struck ? " is-checked" : ""}">${o.struck ? CHECK : ""}</span>`;
  const caption = `<div class="p-caption" style="font-size:${o.caption_px}px">${box}<span>${esc(o.caption)}</span></div>`;
  const layout = o.row
    ? `display:flex;align-items:center;justify-content:space-between;gap:28px;`
    : `display:flex;flex-direction:column;gap:${Math.round(o.size * 0.16)}px;`;
  return `<div class="p-chip${o.owner ? " is-owner" : ""}${o.struck ? " p-struck" : ""}" style="${border}${layout}padding:${o.pad[0]}px ${o.pad[1]}px">
    ${figure(o.figure, o.size)}${caption}
  </div>`;
}

/**
 * A lane with a chip under it and the drop between them: a splitter's drop is dashed in the
 * line's color and ends in a circle; the owner's is solid and heavier and ends in an ink square.
 */
function laneRow(util: Util, label: string, chipHtml: string, o: { lane: number; stroke: number; font: number; gap: number; x: number; owner?: boolean }): string {
  const l = LOCATE[util];
  const k = o.stroke * 0.85;
  const top = o.lane / 2;
  const h = o.lane / 2 + o.gap;
  const w = o.owner ? o.stroke * 1.8 : o.stroke;
  const term = o.owner
    ? `<rect x="${-o.stroke * 2.2}" y="${-o.stroke * 2.2}" width="${o.stroke * 4.4}" height="${o.stroke * 4.4}" fill="var(--ink)"/>`
    : `<circle r="${o.stroke * 1.7}" fill="${l.color}" stroke="var(--ink)" stroke-width="${o.stroke * 0.6}"/>`;
  const drop = `<svg class="p-drop" style="left:${o.x}px;top:${top}px;width:1px;height:${h}px">
    <line x1="0" x2="0" y1="0" y2="${h}" stroke="${l.color}" stroke-width="${w}" ${o.owner ? "" : `stroke-dasharray="${l.dash.map((d) => d * k).join(" ")}"`}/>
    ${term}
  </svg>`;
  return `<div style="position:relative">
    ${lane(util, label, { height: o.lane, stroke: o.stroke, font: o.font })}
    <div style="height:${o.gap}px"></div>
    ${chipHtml}
    ${drop}
  </div>`;
}

const bar = (wordmark: number, right: string, rightPx: number, pad: number) => `<div class="p-bar" style="padding-bottom:${pad}px">
  <span class="p-wordmark" style="font-size:${wordmark}px">${esc(BRAND.name)}</span>
  <span class="p-key" style="font-size:${rightPx}px">${right}</span>
</div>`;

const ARROW = (w: number) =>
  `<svg class="p-arrow" width="${w}" height="${Math.round(w * 0.55)}" viewBox="0 0 18 10" fill="none"><path d="M0 5h16M12 1l4 4-4 4" stroke="currentColor" stroke-width="1.6"/></svg>`;

// ---------- Canvases ----------

interface Canvas {
  /** Its path under promo/out/, without .png: "soon/ig-post". */
  name: string;
  width: number;
  height: number;
  label: string;
  body: string;
  /** Phones run off the canvas's edge on purpose; skip the overflow warning. */
  bleed?: boolean;
}

const STAGE_TITLE: Record<Stage, string> = { soon: "Coming soon", launch: "Launch" };

/** The four bills as lanes, each dropping into Robin's chip for it. */
function lanesStack(o: { size: number; caption: number; lane: number; stroke: number; font: number; gap: number; between: number }): string {
  return `<div style="display:flex;flex-direction:column;gap:${o.between}px">
    ${LANES.map((b) =>
      laneRow(
        b.util,
        `${b.name} ${money(b.total)}`,
        chip({ util: b.util, figure: money(b.figure), caption: b.caption, size: o.size, caption_px: o.caption, pad: [18, 26], owner: b.owner, row: true }),
        { lane: o.lane, stroke: o.stroke, font: o.font, gap: o.gap, x: 40, owner: b.owner },
      ),
    ).join("")}
  </div>`;
}

/** The rule and line at a canvas's foot: the stage's line on the left, the domain on the right. */
function foot(stage: Stage, px: number, domainPx: number, pad: number, top: number): string {
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:${top}px;border-top:3px solid var(--ink);padding-top:${pad}px">
    <span style="font-size:${px}px;color:var(--ink-2)">${esc(STAGES[stage].foot)}</span>
    <span class="p-mono" style="font-size:${domainPx}px;font-weight:600;font-stretch:87.5%">${esc(BRAND.domain)}</span>
  </div>`;
}

function lanesPost(stage: Stage): Canvas {
  return {
    name: `${stage}/ig-post`,
    width: 1080,
    height: 1350,
    label: `Instagram feed · ${STAGE_TITLE[stage]}`,
    body: `<div class="p" style="width:1080px;height:1350px;padding:56px 72px 60px">
      ${bar(52, esc(STAGES[stage].key), 22, 26)}
      <h1 class="p-h1" style="font-size:72px;margin-top:48px;max-width:920px">${esc(HEADLINE)}</h1>
      <div style="margin-top:auto">${lanesStack({ size: 104, caption: 25, lane: 34, stroke: 4, font: 20, gap: 14, between: 22 })}</div>
      ${foot(stage, 24, 26, 22, 40)}
    </div>`,
  };
}

function lanesStory(stage: Stage): Canvas {
  // Instagram lays its own UI over the top ~220px and bottom ~280px; nothing that matters sits there.
  return {
    name: `${stage}/ig-story`,
    width: 1080,
    height: 1920,
    label: `Instagram story · ${STAGE_TITLE[stage]}`,
    body: `<div class="p" style="width:1080px;height:1920px;padding:220px 76px 280px">
      ${bar(60, esc(STAGES[stage].key), 24, 28)}
      <h1 class="p-h1" style="font-size:88px;margin-top:52px">${esc(HEADLINE)}</h1>
      <div style="margin-top:auto">${lanesStack({ size: 112, caption: 27, lane: 36, stroke: 4.5, font: 21, gap: 12, between: 20 })}</div>
      ${foot(stage, 26, 30, 24, 44)}
    </div>`,
  };
}

function linkedInChips(stage: Stage): Canvas {
  const [electric, , , wifi] = LANES;
  const row = (b: (typeof LANES)[number]) =>
    laneRow(
      b.util,
      `${b.name} ${money(b.total)}`,
      chip({ util: b.util, figure: money(b.figure), caption: b.caption, size: 96, caption_px: 20, pad: [16, 22], owner: b.owner }),
      { lane: 30, stroke: 3.5, font: 17, gap: 12, x: 34, owner: b.owner },
    );
  return {
    name: `${stage}/linkedin`,
    width: 1200,
    height: 627,
    label: `LinkedIn · ${STAGE_TITLE[stage]}, shares`,
    body: `<div class="p" style="width:1200px;height:627px;padding:44px 56px;flex-direction:row;gap:56px">
      <div style="flex:1;display:flex;flex-direction:column;min-width:0">
        ${bar(40, esc(STAGES[stage].key), 17, 20)}
        <h1 class="p-h1" style="font-size:54px;margin-top:36px">${esc(HEADLINE)}</h1>
        <p class="p-lede" style="font-size:20px;margin-top:20px;max-width:520px">${esc(STAGES[stage].lede)}</p>
        <div style="margin-top:auto">${foot(stage, 17, 19, 16, 0)}</div>
      </div>
      <div style="width:470px;display:flex;flex-direction:column;justify-content:center;gap:30px">
        ${row(electric)}${row(wifi)}
      </div>
    </div>`,
  };
}

/** A drawn phone around a capture: the frame draws the status bar, the capture is the screen below it. */
function phone(file: string, o: { zoom: number; top?: number; left?: number; z?: number }): string {
  const pos = o.left === undefined ? `margin-top:${o.top ?? 0}px` : `position:absolute;left:${o.left}px;top:${o.top ?? 0}px;z-index:${o.z ?? 0}`;
  return `<div class="p-phone" style="width:400px;zoom:${o.zoom};${pos}"><div class="p-phone-status"><span>9:41</span></div><img src="${href(path.join(SHOTS, file))}" alt=""></div>`;
}

/** LinkedIn's landscape image: the pitch on the left, two phones rising off the bottom edge on the right. */
function linkedInPhones(stage: Stage): Canvas {
  return {
    name: `${stage}/linkedin-phones`,
    width: 1200,
    height: 627,
    bleed: true,
    label: `LinkedIn · ${STAGE_TITLE[stage]}, phones`,
    body: `<div class="p" style="width:1200px;height:627px;padding:44px 0 44px 56px;flex-direction:row;gap:40px">
      <div style="width:560px;flex:none;display:flex;flex-direction:column">
        ${bar(40, esc(STAGES[stage].key), 17, 20)}
        <h1 class="p-h1" style="font-size:54px;margin-top:36px">${esc(HEADLINE)}</h1>
        <p class="p-lede" style="font-size:21px;margin-top:20px;max-width:520px">${esc(STAGES[stage].lede)}</p>
        <div style="margin-top:auto">${foot(stage, 17, 19, 16, 0)}</div>
      </div>
      <div style="position:relative;flex:1">
        ${phone("overview-phone.png", { zoom: 0.62, left: 30, top: 38 })}
        ${phone("bills-phone.png", { zoom: 0.62, left: 330, top: 128 })}
      </div>
    </div>`,
  };
}

/** The portrait phones piece (Instagram feed or LinkedIn, both take 1080×1350), the phones running off the bottom. */
function phonesPortrait(stage: Stage): Canvas {
  const soon = stage === "soon";
  const key = soon ? STAGES.soon.key : SCREENS.phones.key;
  const title = soon ? HEADLINE : SCREENS.phones.title;
  return {
    name: `${stage}/phones`,
    width: 1080,
    height: 1350,
    bleed: true,
    label: `Instagram feed or LinkedIn · ${STAGE_TITLE[stage]}, phones`,
    body: `<div class="p" style="width:1080px;height:1350px;padding:56px 72px 0">
      ${bar(44, soon ? esc(BRAND.domain) : "Sample household", 20, 24)}
      <div class="p-key" style="font-size:22px;margin-top:44px;color:var(--ink-2)">${esc(key)}</div>
      <h2 class="p-h1" style="font-size:60px;margin-top:14px">${esc(title)}</h2>
      <p class="p-lede" style="font-size:28px;margin-top:18px;max-width:880px">${esc(STAGES[stage].lede)}</p>
      <div style="display:flex;align-items:flex-start;justify-content:center;gap:56px;margin-top:auto;margin-bottom:-80px;padding-top:36px">
        ${phone("overview-phone.png", { zoom: 1.04 })}${phone("bills-phone.png", { zoom: 1.04, top: 64 })}
      </div>
    </div>`,
  };
}

/** A story with one big phone rising from the bottom (Instagram's reply bar covers the cut). */
function phoneStory(stage: Stage): Canvas {
  return {
    name: `${stage}/ig-story-phone`,
    width: 1080,
    height: 1920,
    bleed: true,
    label: `Instagram story · ${STAGE_TITLE[stage]}, phone`,
    body: `<div class="p" style="width:1080px;height:1920px;padding:220px 76px 0">
      ${bar(60, esc(STAGES[stage].key), 24, 28)}
      <h1 class="p-h1" style="font-size:84px;margin-top:52px">${esc(HEADLINE)}</h1>
      <p class="p-lede" style="font-size:32px;margin-top:26px;max-width:900px">${esc(STAGES[stage].lede)}</p>
      <div style="display:flex;justify-content:center;margin-top:auto;margin-bottom:-150px;padding-top:48px">${phone("overview-phone.png", { zoom: 1.55 })}</div>
    </div>`,
  };
}

/**
 * The carousel's figure size: as large as the chip's width allows, so every slide's figure
 * fills it. Martian Mono at 75% width advances about 0.575em a glyph; the sign is set at 0.6em.
 */
function figureSize(text: string): number {
  const glyphs = text.replace("$", "").length + (text.startsWith("$") ? 0.6 : 0);
  return Math.min(300, Math.floor(850 / (glyphs * 0.575)));
}

function carousel(stage: Stage): Canvas[] {
  const slides = CAROUSELS[stage];
  return slides.map((s, i) => {
    const n = slides.length;
    const last = i === n - 1;
    const utils = s.util === undefined ? [] : Array.isArray(s.util) ? s.util : [s.util];
    const c = chip({
      util: utils.at(-1),
      figure: s.figure,
      caption: s.sub,
      size: figureSize(s.figure),
      caption_px: 30,
      pad: [26, 34],
      struck: s.mark === "paid",
      owner: s.mark === "owner",
      bare: s.mark === undefined,
    });
    let art: string;
    if (utils.length === 0) art = c;
    else {
      const end = utils.at(-1)!;
      const above = utils.slice(0, -1).map((u) => lane(u, LOCATE[u].name, { height: 34, stroke: 4, font: 19 })).join("");
      art = `<div style="display:flex;flex-direction:column;gap:6px">${above}${laneRow(end, LOCATE[end].name, c, { lane: 34, stroke: 4, font: 19, gap: 18, x: 46, owner: s.mark === "owner" })}</div>`;
    }
    const footer = last
      ? `<span class="p-mono" style="font-size:30px;font-weight:600;font-stretch:87.5%">${esc(BRAND.domain)}</span><span style="font-size:24px;font-weight:650;display:inline-flex;align-items:center;gap:12px">${esc(STAGES[stage].cta)} ${ARROW(30)}</span>`
      : `<span class="p-mono" style="font-size:24px;font-weight:600;font-stretch:87.5%">${esc(BRAND.domain)}</span><span style="font-size:24px;font-weight:650;display:inline-flex;align-items:center;gap:12px">Swipe ${ARROW(30)}</span>`;
    return {
      name: `${stage}/ig-carousel-${i + 1}`,
      width: 1080,
      height: 1350,
      label: `Instagram carousel · ${STAGE_TITLE[stage]} · ${i + 1} of ${n}`,
      body: `<div class="p" style="width:1080px;height:1350px;padding:56px 72px 60px">
        ${bar(44, `${i + 1} / ${n}`, 22, 24)}
        <div class="p-key" style="font-size:24px;margin-top:64px;color:var(--ink-2)">${esc(s.key)}</div>
        <div style="margin:auto 0">${art}</div>
        <h2 class="p-h1" style="font-size:64px;max-width:900px">${esc(s.title)}</h2>
        <p class="p-lede" style="font-size:31px;margin-top:22px;max-width:880px">${esc(s.body)}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:44px;border-top:3px solid var(--ink);padding-top:22px">${footer}</div>
      </div>`,
    };
  });
}

function screenOverview(): Canvas {
  return {
    name: "launch/overview",
    width: 1080,
    height: 1350,
    label: "Instagram feed or LinkedIn · Launch, the overview on a desktop",
    body: `<div class="p" style="width:1080px;height:1350px;padding:56px 72px 60px">
      ${bar(44, "Sample household", 20, 24)}
      <div class="p-key" style="font-size:22px;margin-top:48px;color:var(--ink-2)">${esc(SCREENS.overview.key)}</div>
      <h2 class="p-h1" style="font-size:56px;margin-top:14px">${esc(SCREENS.overview.title)}</h2>
      <div class="p-browser" style="margin-top:40px;flex:1;min-height:0">
        <div class="p-browser-bar"><span class="p-browser-dots"><i></i><i></i><i></i></span><span class="p-browser-url">${esc(BRAND.domain)}/demo</span></div>
        <div style="flex:1;min-height:0;overflow:hidden"><img src="${href(path.join(SHOTS, "overview-desktop.png"))}" alt=""></div>
      </div>
    </div>`,
  };
}

function profile(dark: boolean): Canvas {
  const fg = dark ? "var(--sheet-hi)" : "var(--ink)";
  const bg = dark ? "var(--ink)" : "var(--sheet)";
  // Instagram crops to a circle and shows it as small as 32px: one word, big, centered, and
  // the ledger's double rule under it; no grid (it turns to noise at that size).
  return {
    name: dark ? "profile/ig-profile" : "profile/ig-profile-light",
    width: 1080,
    height: 1080,
    label: dark ? "Instagram profile mark" : "Instagram profile mark · light",
    body: `<div class="p" style="width:1080px;height:1080px;background:${bg};background-image:none;align-items:center;justify-content:center;color:${fg}">
      <span class="p-wordmark" style="font-size:262px;margin-top:-30px">${esc(BRAND.name)}</span>
      <div style="display:flex;flex-direction:column;gap:16px;margin-top:40px;width:640px">
        <div style="height:16px;background:${fg}"></div><div style="height:16px;background:${fg}"></div>
      </div>
    </div>`,
  };
}

function page(c: Canvas): string {
  return `<!doctype html>
<html lang="en" data-site>
<head>
<meta charset="utf-8">
<title>${esc(c.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=block">
<link rel="stylesheet" href="${href(path.join(ROOT, "app", "(site)", "site.css"))}">
<link rel="stylesheet" href="${href(path.join(import.meta.dirname, "promo.css"))}">
</head>
<body class="site" style="min-height:0;width:${c.width}px;height:${c.height}px">${c.body}</body>
</html>`;
}

// ---------- Capturing the app ----------

async function startServer(): Promise<ChildProcess | null> {
  if (process.env.PROMO_URL) return null;
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: ROOT,
    // The demo is public and in memory; keep the gate and the login bypass off whatever .env.local says.
    env: { ...process.env, LAUNCH_GATE: "", APP_DEV_USER: "", APP_DEV_HOUSEHOLD: "", NEXT_TELEMETRY_DISABLED: "1" },
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/demo`)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopServer(child);
  throw new Error(`next dev never answered on ${BASE}/demo`);
}

function stopServer(child: ChildProcess | null) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function prepare(p: Page) {
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} *{animation:none!important;transition:none!important}" });
  await p.evaluate(async () => {
    const html = document.documentElement;
    html.dataset.theme = "sheet";
    html.dataset.colorScheme = "light";
    // The demo's own chrome: its banner and the visitor's Sign in. The promo labels the
    // household as a sample instead.
    for (const el of document.querySelectorAll("body > div")) if (el.textContent?.includes("demo household")) el.remove();
    for (const a of document.querySelectorAll("a")) if (a.textContent?.trim() === "Sign in") a.remove();
    await document.fonts.ready;
  });
  await p.waitForTimeout(400);
}

async function capture(browser: Browser) {
  const headers: Record<string, string> = {};
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const shots: [string, string, number, number, number][] = [
    ["overview-desktop.png", "/demo", 1060, 1000, 2],
    ["overview-phone.png", "/demo", 390, 797, 3],
    ["bills-phone.png", "/demo/bills", 390, 797, 3],
  ];
  for (const [file, route, width, height, dpr] of shots) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, extraHTTPHeaders: headers });
    const p = await ctx.newPage();
    await p.goto(BASE + route, { waitUntil: "networkidle" });
    await prepare(p);
    await p.screenshot({ path: path.join(SHOTS, file) });
    await ctx.close();
    console.log(`  captured ${file}`);
  }
}

// ---------- Rendering ----------

async function render(browser: Browser, canvases: Canvas[]) {
  for (const c of canvases) {
    const file = path.join(HTML, `${c.name.replace("/", "-")}.html`);
    mkdirSync(path.dirname(path.join(OUT, c.name)), { recursive: true });
    writeFileSync(file, page(c));
    const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(href(file), { waitUntil: "networkidle" });
    const faces = await p.evaluate(async () => {
      // Ask for both faces outright, so a canvas that sets no mono still proves the faces resolve.
      await Promise.all([document.fonts.load("800 40px Archivo"), document.fonts.load("600 40px 'Martian Mono'")]);
      await document.fonts.ready;
      const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
      return { archivo: loaded.includes("Archivo"), martian: loaded.includes("Martian Mono") };
    });
    if (!faces.archivo || !faces.martian) throw new Error(`${c.name}: fonts did not load (${JSON.stringify(faces)}); is fonts.googleapis.com reachable?`);
    const overflow = await p.evaluate(() => {
      const root = document.querySelector(".p")!;
      return root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1;
    });
    if (overflow && !c.bleed) console.warn(`  warning: ${c.name} overflows its canvas`);
    await p.screenshot({ path: path.join(OUT, `${c.name}.png`) });
    await ctx.close();
    console.log(`  rendered ${c.name}.png (${c.width}×${c.height})`);
  }
}

// ---------- Posts ----------

const POSTS_DIR = path.join(OUT, "posts");
const postDir = (p: Post) => path.join(POSTS_DIR, p.platform, p.slug);
/** An image's file name in its post folder: its order, then where it came from. */
const postImage = (name: string, i: number) => `${i + 1}-${name.split("/")[1]}.png`;

async function writePosts(browser: Browser, canvases: Canvas[]) {
  const known = new Map(canvases.map((c) => [c.name, c]));
  for (const post of POSTS) {
    const dir = postDir(post);
    mkdirSync(dir, { recursive: true });
    post.images.forEach((name, i) => {
      if (!known.has(name)) throw new Error(`posts.ts: ${post.slug} names ${name}, which no canvas renders`);
      copyFileSync(path.join(OUT, `${name}.png`), path.join(dir, postImage(name, i)));
    });
    if (post.caption) writeFileSync(path.join(dir, "caption.txt"), post.caption + "\n");
    writeFileSync(path.join(dir, "alt-text.txt"), post.images.map((name, i) => `${postImage(name, i)}: ${altText(name)}`).join("\n\n") + "\n");
    if (post.notes) writeFileSync(path.join(dir, "notes.txt"), post.notes + "\n");
    if (post.pdf) {
      // One page per image at the image's own size, for LinkedIn's document carousel.
      const first = known.get(post.images[0])!;
      const pages = post.images.map((name) => `<img src="${href(path.join(OUT, `${name}.png`))}" style="display:block;width:${first.width}px;height:${first.height}px;break-after:page">`).join("");
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      const file = path.join(HTML, `${post.platform}-${post.slug}-pdf.html`);
      writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${first.width}px ${first.height}px;margin:0}html,body{margin:0}</style></head><body>${pages}</body></html>`);
      await p.goto(href(file), { waitUntil: "load" });
      await p.pdf({ path: path.join(dir, "carousel.pdf"), width: `${first.width}px`, height: `${first.height}px`, printBackground: true, pageRanges: `1-${post.images.length}` });
      await ctx.close();
      writeFileSync(path.join(dir, "pdf-title.txt"), post.pdf.title + "\n");
    }
    console.log(`  post ${post.platform}/${post.slug} (${post.images.length} image${post.images.length === 1 ? "" : "s"}${post.pdf ? " + pdf" : ""})`);
  }
}

function contactSheet(canvases: Canvas[]): string {
  const card = (c: Canvas) => `<figure><img src="${c.name}.png" width="${c.width}" height="${c.height}" alt="${esc(c.label)}"><figcaption><b>${esc(c.label)}</b><span>${c.name}.png · ${c.width}×${c.height}</span></figcaption></figure>`;
  const group = (title: string, items: Canvas[]) => `<h2>${title}</h2><div class="grid">${items.map(card).join("")}</div>`;
  const of = (dir: string, carousels: boolean) => canvases.filter((c) => c.name.startsWith(`${dir}/`) && c.name.includes("carousel") === carousels);
  const avatars = of("profile", false)
    .map((c) => [180, 110, 56, 32].map((s) => `<img class="av" src="${c.name}.png" width="${s}" height="${s}" alt="">`).join(""))
    .join("<br>");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Promo set</title><style>
    body{margin:0;padding:32px 24px 64px;background:#e9ebea;color:#111315;font:15px/1.5 system-ui,sans-serif}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:40px 0 12px;text-transform:uppercase;letter-spacing:.06em}
    .grid{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
    figure{margin:0;width:340px}figure img{display:block;width:100%;height:auto;border:1px solid rgba(17,19,21,.25)}
    figcaption{display:flex;flex-direction:column;font-size:13px;margin-top:6px}figcaption span{color:#4a5056}
    .av{border-radius:50%;margin:0 12px 12px 0;vertical-align:middle;border:1px solid rgba(17,19,21,.25)}
    .post{background:#fbfcfb;border:1px solid rgba(17,19,21,.25);padding:16px 18px;margin:0 0 16px;max-width:900px}
    .post h3{margin:0 0 10px;font-size:14px;font-family:ui-monospace,monospace}
    .thumbs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.thumbs img{height:140px;border:1px solid rgba(17,19,21,.25)}
    .pdf{font-size:13px;color:#4a5056}.post pre{white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:12px 0 0}
    .notes{font-size:13px;color:#4a5056;margin:10px 0 0}
  </style></head><body>
    <h1>Promo set</h1><p>Regenerate with <code>npm run promo</code>. Every image is in promo/out/ at full size.</p>
    ${group("Coming soon: posts, stories, LinkedIn", of("soon", false))}
    ${group("Coming soon: carousel", of("soon", true))}
    ${group("Launch: posts, stories, LinkedIn", of("launch", false))}
    ${group("Launch: carousel", of("launch", true))}
    ${group("Profile mark", of("profile", false))}
    <h2 id="posts">Posts (promo/out/posts/)</h2>
    ${POSTS.map((p) => `<section class="post"><h3>${p.platform} / ${p.slug}</h3><div class="thumbs">${p.images.map((n, i) => `<img src="posts/${p.platform}/${p.slug}/${postImage(n, i)}" alt="">`).join("")}${p.pdf ? `<span class="pdf">+ carousel.pdf</span>` : ""}</div>${p.caption ? `<pre>${esc(p.caption)}</pre>` : ""}${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ""}</section>`).join("")}
    <h2>Profile mark at Instagram's sizes</h2><div>${avatars}</div>
  </body></html>`;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(HTML, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    console.log(`promo: capturing ${BASE}/demo`);
    const server = await startServer();
    try {
      await capture(browser);
    } finally {
      stopServer(server);
    }
    const stage = (st: Stage) => [lanesPost(st), phonesPortrait(st), lanesStory(st), phoneStory(st), linkedInPhones(st), linkedInChips(st), ...carousel(st)];
    const canvases = [...stage("soon"), ...stage("launch"), screenOverview(), profile(true), profile(false)];
    console.log("promo: rendering");
    await render(browser, canvases);
    console.log("promo: assembling posts");
    await writePosts(browser, canvases);
    writeFileSync(path.join(OUT, "index.html"), contactSheet(canvases));
    console.log(`promo: ${canvases.length} images in ${path.relative(ROOT, OUT)}/ (contact sheet: index.html)`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
