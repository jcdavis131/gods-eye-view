// Upstream endpoint sweep: finds every upstream service the app hard-codes and asks each one
// whether it still answers. Read-only, keyless, one request per endpoint (plus one retry).
//
//   node scripts/endpoint-sweep.mjs            probe, print a table, exit 1 on a newly dead upstream
//   node scripts/endpoint-sweep.mjs --list     list what would be probed, probe nothing
//
// Why it exists: USFWS retired Wetlands_Raster_v5 and the zoomed-out wetlands layer drew nothing
// for days (fixed in #86). ArcGIS answers a dead service with HTTP 200 and {"error":{...}}, so a
// status check alone passes it. This sweep reads the body:
// - an ArcGIS service is asked for its root with ?f=json, and an "error" body is DEAD;
// - a tile template is filled with one tile over Kansas, and the body must be an image;
// - templates with runtime parts (`${...}`) are listed as not probed.
//
// Only a DEAD answer seen twice (20 s apart) that is not in endpoint-sweep.known.json fails the
// run. A network error is a warning, not a failure: shared runners and CloudFront's IPv6 path
// both reset connections now and then (lib/server/net.ts), so this resolves IPv4 first too.

import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT_RE =
  /"https:\/\/[^"`]*(?:\{[a-zA-Z]+\}|\/(?:Map|Image|Feature)Server|\/tile\/)[^"`]*"|`https:\/\/[^`]*\{[a-zA-Z]+\}[^`]*`/g;

// z6 x14 y24 is a web-mercator tile over Kansas; the projected box is about 100 km across there.
const TILE = { z: "6", x: "14", y: "24", s: "a" };
const BOX = { westProjected: "-10950000", southProjected: "4650000", eastProjected: "-10850000", northProjected: "4750000" };

/** Every endpoint literal in one source file's text, as written. */
export function findEndpoints(text) {
  return [...text.matchAll(ENDPOINT_RE)].map((m) => m[0].slice(1, -1));
}

/**
 * What to request for one endpoint literal: the ArcGIS service root, a filled tile, or null
 * (not probed) with the reason.
 */
export function probeTarget(literal) {
  const ags = literal.match(/^(https:\/\/[^?#]*?\/(?:MapServer|ImageServer|FeatureServer))(\/\d+)?/);
  if (ags && !ags[0].includes("${")) return { kind: "arcgis", url: `${ags[1]}${ags[2] ?? ""}?f=json` };
  if (literal.includes("${")) return { kind: null, why: "runtime parts" };
  if (!/\{[a-zA-Z]+\}/.test(literal)) return { kind: null, why: "not a service or a template (a page link)" };
  let url = literal;
  for (const [k, v] of Object.entries({ ...TILE, ...BOX })) url = url.replaceAll(`{${k}}`, v);
  if (/\{[a-zA-Z]+\}/.test(url)) return { kind: null, why: `unfilled ${url.match(/\{[a-zA-Z]+\}/)[0]}` };
  return { kind: "tile", url };
}

/**
 * The verdict for one response. OK, DEAD (the publisher says the thing is gone or broken),
 * ODD (answered, but not with what we ask for) or EMPTY (a tile server's "no tile here").
 */
export function classify(kind, status, contentType, body) {
  if (kind === "arcgis") {
    let j = null;
    try {
      j = JSON.parse(body.toString("utf8"));
    } catch {
      /* not JSON */
    }
    if (status >= 400) return { verdict: "DEAD", detail: `HTTP ${status}` };
    if (!j) return { verdict: "ODD", detail: `HTTP ${status}, not JSON (${contentType})` };
    if (j.error) return { verdict: "DEAD", detail: `HTTP ${status} with error ${j.error.code}: ${j.error.message}` };
    return { verdict: "OK", detail: String(j.name ?? j.mapName ?? j.currentVersion ?? "json") };
  }
  const hex = body.subarray(0, 4).toString("hex");
  const image = hex === "89504e47" ? "png" : hex.startsWith("ffd8ff") ? "jpeg" : body.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
  if (status < 400 && image) return { verdict: "OK", detail: `${image} ${body.length} B` };
  if (status < 400 && /protobuf|pbf|mvt|octet-stream/.test(contentType)) return { verdict: "OK", detail: `${contentType} ${body.length} B` };
  if (status === 404 && body.length === 0) return { verdict: "EMPTY", detail: "404 with no body (no tile here)" };
  if (status >= 400) return { verdict: "DEAD", detail: `HTTP ${status} ${contentType}` };
  return { verdict: "ODD", detail: `HTTP ${status} ${contentType}, not an image` };
}

/** The known-outage entry an endpoint falls under, if any. */
export function knownOutage(url, known) {
  return known.find((k) => url.includes(k.match)) ?? null;
}

async function fetchOnce(target) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const r = await fetch(target.url, {
      headers: { "user-agent": "gods-eye-view endpoint sweep (read-only health check)" },
      signal: ac.signal,
      redirect: "follow",
    });
    const body = Buffer.from(await r.arrayBuffer());
    return classify(target.kind, r.status, r.headers.get("content-type") ?? "", body);
  } catch (e) {
    const why = e?.name === "AbortError" ? "timeout 30 s" : (e?.cause?.code ?? e?.message ?? String(e));
    return { verdict: "ERR", detail: why };
  } finally {
    clearTimeout(timer);
  }
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== "node_modules" && !ent.name.startsWith(".")) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

async function main() {
  dns.setDefaultResultOrder("ipv4first");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const known = JSON.parse(fs.readFileSync(path.join(root, "scripts", "endpoint-sweep.known.json"), "utf8")).outages;

  const targets = new Map();
  const notProbed = [];
  for (const file of [...walk(path.join(root, "lib")), ...walk(path.join(root, "app"))]) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const literal of findEndpoints(fs.readFileSync(file, "utf8"))) {
      const t = probeTarget(literal);
      if (!t.kind) {
        notProbed.push({ rel, literal, why: t.why });
        continue;
      }
      if (!targets.has(t.url)) targets.set(t.url, { ...t, files: new Set() });
      targets.get(t.url).files.add(rel);
    }
  }
  const list = [...targets.values()];
  if (process.argv.includes("--list")) {
    for (const t of list) console.log(`${t.kind.padEnd(6)} ${t.url}`);
    console.log(`\n${list.length} to probe, ${notProbed.length} not probed`);
    return;
  }

  const results = [];
  for (let i = 0; i < list.length; i += 4) {
    results.push(...(await Promise.all(list.slice(i, i + 4).map(async (t) => ({ ...t, ...(await fetchOnce(t)) })))));
  }
  // One retry, one at a time, for anything that did not answer OK.
  const again = results.filter((r) => r.verdict === "DEAD" || r.verdict === "ERR");
  if (again.length) await new Promise((r) => setTimeout(r, 20_000));
  for (const r of again) {
    const second = await fetchOnce(r);
    if (second.verdict === "OK" || second.verdict === "EMPTY") Object.assign(r, second, { detail: `${second.detail} (first try failed)` });
    else if (second.verdict === r.verdict) r.detail = `${second.detail} (twice)`;
    else Object.assign(r, second);
  }

  const newlyDead = [];
  const lines = [];
  for (const r of results.sort((a, b) => a.verdict.localeCompare(b.verdict))) {
    const k = knownOutage(r.url, known);
    let tag = r.verdict;
    if (r.verdict === "DEAD" && k) tag = "KNOWN";
    else if (r.verdict === "DEAD") newlyDead.push(r);
    else if (k && r.verdict === "OK") tag = "BACK";
    lines.push(`${tag.padEnd(5)} ${r.kind.padEnd(6)} ${r.url}\n      ${r.detail}${k ? ` | known outage since ${k.since}: ${k.note}` : ""}  [${[...r.files].join(", ")}]`);
  }
  console.log(lines.join("\n"));
  const count = {};
  for (const r of results) count[r.verdict] = (count[r.verdict] ?? 0) + 1;
  const back = results.filter((r) => r.verdict === "OK" && knownOutage(r.url, known));
  const summary = [
    `Probed ${results.length} upstream endpoints (${notProbed.length} more have runtime parts and are not probed).`,
    `Verdicts: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    newlyDead.length ? `NEWLY DEAD (fails the run): ${newlyDead.map((r) => r.url).join(" ; ")}` : "No newly dead upstream.",
    back.length ? `Back up (remove from endpoint-sweep.known.json): ${back.map((r) => r.url).join(" ; ")}` : "",
  ].filter(Boolean);
  console.log(`\n${summary.join("\n")}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Endpoint sweep\n\n${summary.map((s) => `- ${s}`).join("\n")}\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  }
  if (newlyDead.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
