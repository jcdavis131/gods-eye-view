// The desk's three anchors: original cartoon characters, written for this
// project. Data only; nothing here is a fact about the world, and nothing an
// anchor says from this file may carry a number or a proper noun beyond the
// anchors' own names and the segment titles (lib/news/rundown.ts checks it).
//
// The anchors are fictional. They do not resemble, and must not be drawn or
// voiced to resemble, any real person, any other network's characters or any
// show or brand. Personality comes from banter and running bits, never from
// spinning a fact.
//
// Voices: Kokoro (Apache-2.0) voice ids are candidates only. N3 picks and
// confirms one per anchor by listening; until then `confirmed` stays false.

export type PersonaId = "plume" | "brack" | "ledgerly";

export interface Persona {
  id: PersonaId;
  /** Full on-air name. */
  name: string;
  /** What the viewer calls them. */
  shortName: string;
  role: "lead" | "field" | "desk";
  roleTitle: string;
  species: string;
  /** Notes for whoever draws them; original designs, no reference to any existing character. */
  design: string[];
  traits: string[];
  /** Seeds for openers and sign-offs. No numbers, no facts. */
  catchphrases: string[];
  /** How this anchor gets along with each of the others. */
  relationships: Array<{ with: PersonaId; dynamic: string }>;
  voice: { engine: "kokoro"; candidates: string[]; confirmed: false; note: string };
}

export const PERSONAS: Record<PersonaId, Persona> = {
  plume: {
    id: "plume",
    name: "Odessa Plume",
    shortName: "Odessa",
    role: "lead",
    roleTitle: "Lead anchor",
    species: "grey heron",
    design: [
      "tall slate-grey heron with a long neck and a single black crest plume that droops a little on grim stories and lifts on good ones",
      "round tortoiseshell reading glasses perched on the beak; a teal cardigan with one oversized wooden button",
      "stands on one leg behind a reed-green desk for the whole broadcast; the other foot appears only in the sign-off",
    ],
    traits: ["unflappable", "precise", "dry wit", "patient with the feeds", "fond of quiet"],
    catchphrases: ["Here's what the instruments say.", "One feed at a time.", "Steady as a reed.", "Check the source card; it's all there."],
    relationships: [
      { with: "brack", dynamic: "mentor to an eager field reporter; pretends not to be charmed by his enthusiasm" },
      { with: "ledgerly", dynamic: "two sticklers who agree so often it becomes a contest to agree first" },
    ],
    voice: { engine: "kokoro", candidates: ["bf_emma", "af_heart"], confirmed: false, note: "calm, low, unhurried" },
  },
  brack: {
    id: "brack",
    name: "Tully Brack",
    shortName: "Tully",
    role: "field",
    roleTitle: "Planet correspondent",
    species: "sea otter",
    design: [
      "chestnut sea otter in an oversized mustard rain slicker, hood up even indoors",
      "a tiny cup anemometer clipped to the hood that spins when he gets excited",
      "carries a flat river stone he uses as a clipboard; reports standing in front of a giant map wall",
    ],
    traits: ["eager", "hands-on", "a little rumpled", "protective of the facts", "easily delighted by maps"],
    catchphrases: ["Tully Brack, on the map.", "Let's get our paws on the data.", "Hold that stone.", "Back to you at the desk."],
    relationships: [
      { with: "plume", dynamic: "looks up to Odessa and keeps trying to stand on one leg like her" },
      { with: "ledgerly", dynamic: "friendly rivalry: the map wall against the desk, settled by whoever has the better chart" },
    ],
    voice: { engine: "kokoro", candidates: ["am_puck", "am_michael"], confirmed: false, note: "bright, quick, warm" },
  },
  ledgerly: {
    id: "ledgerly",
    name: "Mott Ledgerly",
    shortName: "Mott",
    role: "desk",
    roleTitle: "Money and space desk",
    species: "fennec fox",
    design: [
      "sandy fennec fox with enormous ears he calls his antennae",
      "green eyeshade visor, sleeve garters and a vest covered in embroidered mission-style patches of his own design",
      "a pencil behind each ear; a desk-sized countdown clock that only ever shows dashes",
    ],
    traits: ["careful with numbers", "loves schedules and countdowns", "gently pedantic", "warm under the visor"],
    catchphrases: ["Ears up.", "No earlier than, never exactly.", "Let's check the ledger.", "A window is not a date."],
    relationships: [
      { with: "plume", dynamic: "trades corrections with Odessa as a form of affection" },
      { with: "brack", dynamic: "teases Tully about the map wall; secretly borrows his stone" },
    ],
    voice: { engine: "kokoro", candidates: ["bm_george", "am_adam"], confirmed: false, note: "crisp, measured, a smile in it" },
  },
};

export const PERSONA_IDS = ["plume", "brack", "ledgerly"] as const satisfies readonly PersonaId[];

/**
 * Running bits for the bumpers: short exchanges with no facts in them. The
 * template writer rotates through them; the model writer may write its own in
 * the same spirit, under the same rules (no numbers, no proper nouns beyond
 * the anchors and the segment titles).
 */
export const RUNNING_BITS: Array<{ id: string; lines: Array<{ anchor: PersonaId; text: string }> }> = [
  {
    id: "one-leg",
    lines: [
      { anchor: "brack", text: "Odessa, how do you stand on one leg for a whole half hour?" },
      { anchor: "plume", text: "Practice, Tully. And not looking down." },
      { anchor: "brack", text: "I'm trying it at the map wall. I am already leaning." },
    ],
  },
  {
    id: "the-stone",
    lines: [
      { anchor: "ledgerly", text: "Tully, have you seen my notes? They were on a very flat stone." },
      { anchor: "brack", text: "That is my clipboard, Mott." },
      { anchor: "ledgerly", text: "Then my notes are on your clipboard. Ears up, everyone." },
    ],
  },
  {
    id: "countdown",
    lines: [
      { anchor: "plume", text: "Mott, your countdown clock is showing dashes again." },
      { anchor: "ledgerly", text: "It counts down to things that are no earlier than. Dashes are the honest answer." },
      { anchor: "plume", text: "Steady as a reed. And twice as honest." },
    ],
  },
  {
    id: "anemometer",
    lines: [
      { anchor: "ledgerly", text: "Tully, the little cups on your hood are spinning." },
      { anchor: "brack", text: "They spin when I see a good map. This is a very good map." },
      { anchor: "plume", text: "Hold that stone, Tully. We'll be right back." },
    ],
  },
  {
    id: "agree-first",
    lines: [
      { anchor: "plume", text: "A window is not a date." },
      { anchor: "ledgerly", text: "I was about to say that." },
      { anchor: "plume", text: "I know. That's why I said it first." },
    ],
  },
];

/** The disclosure every page and every rundown carries, in one place. */
export const DISCLOSURE = {
  fictional: "The anchors are fictional cartoon characters.",
  writer: {
    "qwen3:8b": "This script was written by a local AI model (qwen3:8b) strictly from the facts listed in each segment's source card.",
    template: "This script was written by fixed templates (the local AI was offline or its script did not pass the checks) strictly from the facts listed in each segment's source card.",
  },
  /** Said where no one rundown is in hand (the schedule, the facts). */
  scripts: "Scripts are written by a local AI model (qwen3:8b), or by fixed templates when it is offline, strictly from the facts listed in each segment's source card.",
  check: "Check the original sources before relying on anything you hear here.",
} as const;
