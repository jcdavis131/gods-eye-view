// Keyless natural-language parser for the browser Web Speech path.
// Deliberately small and regex-based: it maps a transcript to one command
// from lib/voice/commands.ts. Anything it cannot parse is reported back.

import { resolveLayer } from "./commands";

export interface Intent {
  command: string;
  args: Record<string, unknown>;
}

const LAYER_WORDS =
  "aircraft|airplanes|planes|flights|flight|jets|ships|ship|vessels|boats|satellites|satellite|sats|earthquakes|quakes|seismic|cameras|webcams|cctv|traffic|cars|launches|rockets|rocket|water quality|satellite water|stream gauges|water|rivers|river|lakes|lake|reservoirs|reservoir|gauges|floods|flooding|hydrology|groundwater|aquifers|aquifer|wells|drought|turbidity|sediment|trade|ports|port|harbours|harbors|shipping|borders|border crossings|crossings|commerce|jobs|employment|wages|business|economy|real estate|housing|home values|homes|rents|property values|property";

const num = (s: string) => {
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100,
  };
  const n = Number(s);
  return Number.isFinite(n) ? n : (words[s.toLowerCase()] ?? NaN);
};

export function parseIntent(raw: string): Intent | null {
  const t = raw.trim().toLowerCase().replace(/[.,!?]+$/g, "");
  if (!t) return null;
  let m: RegExpMatchArray | null;

  if (/^(stop|release|unfollow|stop following|stop tracking)/.test(t)) {
    return { command: "follow_selected", args: { on: false } };
  }
  if (/^(follow|track|lock on|lock)( it| this| that| the selected| selection)?$/.test(t)) {
    return { command: "follow_selected", args: { on: true } };
  }
  if (/^(go live|live|back to live|live mode|return to now|now)$/.test(t)) {
    return { command: "set_time", args: { live: true } };
  }
  if ((m = t.match(/^(?:rewind|go back|back)\s+(\w+)\s+(minute|minutes|hour|hours)/))) {
    const n = num(m[1]);
    if (Number.isFinite(n)) return { command: "set_time", args: { offset_minutes: -(m[2].startsWith("hour") ? n * 60 : n) } };
  }
  if ((m = t.match(/^(?:fast forward|forward|skip ahead|ahead|jump ahead)\s+(\w+)\s+(minute|minutes|hour|hours)/))) {
    const n = num(m[1]);
    if (Number.isFinite(n)) return { command: "set_time", args: { offset_minutes: m[2].startsWith("hour") ? n * 60 : n } };
  }
  if (/^(home|zoom out|overview|show (me )?(the )?(whole )?(earth|globe|world|planet)|pull back)/.test(t)) {
    return { command: "home_view", args: {} };
  }
  // "start the tour", "take me on the tour", "explore lake mead"
  if (/^(?:start|begin|play|take)(?: me on)?(?: the)? (?:water |market |trade )?tour$/.test(t)) {
    return { command: "explore_preset", args: { tour: true } };
  }
  if ((m = t.match(/^(?:explore|preset|jump to preset)\s+(.+)$/))) {
    return { command: "explore_preset", args: { preset: m[1].trim() } };
  }
  // "water report", "water report for san antonio", "how is the water in austin"
  if ((m = t.match(/^(?:water report|water status|how(?:'s| is) the water|is the water (?:ok|safe))(?:\s+(?:for|in|near|around|over|at)\s+(.+))?$/))) {
    return { command: "water_report", args: { place: m[1]?.trim() || undefined } };
  }
  // "market report", "market report for austin", "home values in denver", "how is the economy in tulsa"
  if ((m = t.match(/^(?:market report|housing market|housing report|home values|property values|how(?:'s| is) the (?:economy|market|housing|job market))(?:\s+(?:for|in|near|around|over|at)\s+(.+))?$/))) {
    return { command: "market_report", args: { place: m[1]?.trim() || undefined } };
  }
  if (/^(where am i|what am i looking at|describe|status|report|sitrep)/.test(t)) {
    return { command: "describe_view", args: {} };
  }

  // "show me flights over austin", "turn on ships", "hide satellites"
  const layerRe = new RegExp(
    `^(?:(show|display|turn on|enable|put up|bring up|hide|turn off|disable|remove|clear)\\s+(?:me\\s+)?(?:the\\s+|all\\s+)?)(${LAYER_WORDS})(?:\\s+(?:over|around|near|in|above|at|for)\\s+(.+))?$`,
  );
  if ((m = t.match(layerRe))) {
    const verb = m[1];
    const on = !/hide|off|disable|remove|clear/.test(verb);
    const layer = resolveLayer(m[2]);
    if (layer) return { command: "show_layer", args: { layer, on, place: m[3]?.trim() || undefined } };
  }

  // "find flight ual123", "track ship ever given", "follow the iss", "locate n12345"
  if ((m = t.match(/^(find|search for|search|locate|look for|track|follow|lock on to|lock onto)\s+(?:the\s+)?(?:flight|plane|aircraft|ship|vessel|satellite|sat|camera)?\s*(.+)$/))) {
    const follow = /track|follow|lock/.test(m[1]);
    return { command: "find_object", args: { query: m[2].trim(), follow } };
  }

  // "go to austin", "fly to tokyo", "take me to the panama canal", "zoom in on paris"
  if ((m = t.match(/^(?:go to|fly to|take me to|jump to|move to|look at|zoom (?:in )?(?:to|on)|center on|centre on|show me)\s+(.+?)(?:\s+at\s+(\w+)\s*(?:km|kilometers|kilometres))?$/))) {
    const alt = m[2] ? num(m[2]) : undefined;
    return { command: "fly_to_place", args: { place: m[1].trim(), altitude_km: Number.isFinite(alt ?? NaN) ? alt : undefined } };
  }

  return null;
}
