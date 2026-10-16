// Record text, the one door to the embedder. The leak test writes a marker
// into every name, owner, address, contact, free-text and id field of real
// captured rows (it mutates real fixtures; it does not invent records) and
// checks the marker never reaches a feature's record text. The private-holding
// rows ("Blue Wing Lake Dam", "Smith Family Farm") are the existing
// label-by-id fixtures.

import { describe, expect, it } from "vitest";
import { buildDams } from "@/lib/infra/features";
import dams from "@/lib/infra/fixtures/dams-sanantonio.json";
import { recordFixtures } from "@/lib/embed/__fixtures__/records";
import { COLLECTIONS } from "./collections";
import { allCardTexts, cardText } from "./cardText";
import { DENY_FIELD, EMBED_TEXT, FIELD_LABEL, NAME_FIELDS_ALLOWED, NO_RECORD_VECTORS, RECORD_VECTOR_CARDS, embeddableField } from "./embedFields";
import { queryText, receivedRecordText, recordText, withEmbedText } from "./recordText";

const MARK = "ZZLEAK";
/** Upstream fields the leak test marks besides DENY_FIELD: names, free text and ids that must stay out of the vectors. */
const MARKED = /name|_nm$|desc|citation|owner|holder|^esmthldr$|address|contact|phone|email|^nidid$|^nris_refnum$|^epa_id$|^site_epa_id$|^fudsuniquepropertynumber$|^fudspropertyid$|^projectnumber$|^fudssiteid$|^assessmentunitidentifier$|^registry_id$|^pgm_sys_id$|^dfirm_id$|^fld_ar_id$|^objectid$|url|link/i;

const markRow = <R extends { properties: Record<string, unknown> }>(r: R): R => {
  const p = { ...r.properties };
  for (const k of Object.keys(p)) {
    if (NAME_FIELDS_ALLOWED.has(k)) continue;
    if (DENY_FIELD.test(k) || MARKED.test(k)) p[k] = `${MARK} ${String(p[k] ?? "")}`;
  }
  return { ...r, properties: p };
};

describe("record text", () => {
  it("never carries a marked name, owner, address, contact, free-text or id field into a record vector", () => {
    let checked = 0;
    for (const { card, features } of recordFixtures(markRow)) {
      expect(features.length, card).toBeGreaterThan(0);
      for (const f of features) {
        const t = receivedRecordText(f.properties);
        if (t == null) continue;
        checked++;
        expect(t.toUpperCase(), `${card} ${f.properties.id}`).not.toContain(MARK);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("gives every record-vector card's features record text from real fixtures, and never a feature's name", () => {
    for (const { card, features } of recordFixtures()) {
      expect(RECORD_VECTOR_CARDS.has(card), card).toBe(true);
      const texts = features.map((f) => receivedRecordText(f.properties));
      expect(texts.some((t) => t != null), card).toBe(true);
      for (const f of features) {
        const t = receivedRecordText(f.properties);
        if (t && f.properties.name.length > 4) expect(t, card).not.toContain(f.properties.name);
      }
    }
    expect(new Set(recordFixtures().map((r) => r.card))).toEqual(RECORD_VECTOR_CARDS);
  });

  it("reads every embedText field of a record-vector card in its builder (the label appears in some fixture's text)", () => {
    // Fields the captured fixtures happen to leave empty, so their builder line is checked by reading, not here.
    const notInFixtures: Record<string, string[]> = {
      "nwi-wetlands": [],
      "padus-units": ["Mang_Type", "Des_Tp", "State_Nm", "GAP_Sts", "IUCN_Cat"],
      "fema-nfhl-zones": ["ZONE_SUBTY", "STUDY_TYP"],
      "fuds-mrs": ["RELATIVEPRIORITY"],
    };
    for (const { card, features } of recordFixtures()) {
      const all = features.map((f) => receivedRecordText(f.properties) ?? "").join("\n");
      for (const field of EMBED_TEXT[card]) {
        if (notInFixtures[card]?.includes(field)) continue;
        expect(all, `${card} ${field}`).toContain(`${FIELD_LABEL[field]}: `);
      }
    }
  });

  it("keeps a private dam's and a private PAD-US unit's published name out, and every dam's name", () => {
    const rows = (dams as { features: Array<{ properties: Record<string, unknown> }> }).features;
    const built = buildDams(rows as never);
    const blueWing = built.find((f) => f.properties.details?.["published name"] === "Blue Wing Lake Dam");
    expect(blueWing).toBeDefined();
    expect(receivedRecordText(blueWing!.properties)).not.toMatch(/blue wing/i);
    for (const [i, f] of built.entries()) {
      const name = String(rows.find((r) => `nid:${r.properties.NIDID}` === f.properties.id)?.properties.NAME ?? `no name ${i}`);
      expect(receivedRecordText(f.properties) ?? "", name).not.toContain(name);
    }
    const padus = recordFixtures().find((r) => r.card === "padus-units")!.features[0];
    expect(padus.properties.details?.["published name"]).toBe("Smith Family Farm");
    expect(receivedRecordText(padus.properties)).not.toMatch(/smith/i);
  });

  it("is null when no field has a value, and labels each value", () => {
    expect(recordText("nid-dams", {})).toBeNull();
    expect(recordText("nid-dams", { HAZARD_POTENTIAL: "High", NAME: "Somebody Pond Dam", NID_HEIGHT: 40 })).toBe("hazard potential: High");
    expect(recordText("nid-dams", { YEAR_COMPLETED: 0 })).toBe("year completed: 0");
    expect(withEmbedText({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("refuses a query outside 2..200 characters", () => {
    expect(queryText(" a ")).toBeNull();
    expect(queryText("x".repeat(201))).toBeNull();
    expect(queryText("  wetland   habitat ")).toBe("wetland habitat");
  });
});

describe("what the catalogue lets be embedded", () => {
  it("lists every card's fields in EMBED_TEXT and the card reads them from there", () => {
    expect(Object.keys(EMBED_TEXT)).toEqual(COLLECTIONS.map((c) => c.id));
    for (const c of COLLECTIONS) expect(c.embedText, c.id).toBe(EMBED_TEXT[c.id as keyof typeof EMBED_TEXT]);
  });

  it("labels every embedText field, and lets no field end in 'name' outside the reviewed list", () => {
    for (const c of COLLECTIONS) {
      for (const f of c.embedText) {
        expect(embeddableField(f), `${c.id}: ${f}`).toBe(true);
        expect(FIELD_LABEL[f], `${c.id}: ${f}`).toBeTruthy();
        if (/name$/i.test(f)) expect(NAME_FIELDS_ALLOWED.has(f), `${c.id}: ${f}`).toBe(true);
      }
    }
    for (const bad of ["published name", "Unit_Name", "Own_Name", "assessmentunitname", "organizationname", "NAME"]) expect(embeddableField(bad), bad).toBe(false);
  });

  it("embeds no id, free-text or measured field the round's rules keep out", () => {
    const out = ["NRIS_Refnum", "assessmentunitidentifier", "assessmentunitname", "organizationname", "cas_registry_number", "DFIRM_ID", "UNIT", "FR", "fedreg", "pgm_sys_id", "registry_id", "Citation", "NICE_DESC", "SRC_RES", "NID_HEIGHT", "STATIC_BFE", "Population_Served", "Release_Count", "Open_Count", "Facility_Count"];
    for (const c of COLLECTIONS) for (const f of out) expect(c.embedText, `${c.id}: ${f}`).not.toContain(f);
  });

  it("says for every card whether its builder attaches record text, and why not", () => {
    for (const c of COLLECTIONS) {
      const has = RECORD_VECTOR_CARDS.has(c.id);
      expect(has !== c.id in NO_RECORD_VECTORS, c.id).toBe(true);
      if (has) expect(c.embedText.length, c.id).toBeGreaterThan(0);
    }
  });

  it("embeds a card's prose, never its sensitivity line, caveats or exclusions", () => {
    const texts = allCardTexts();
    expect(texts).toHaveLength(COLLECTIONS.length);
    const nid = COLLECTIONS.find((c) => c.id === "nid-dams")!;
    const t = cardText(nid);
    expect(t).toContain(nid.title);
    expect(t).toContain("Shelf: Infrastructure.");
    expect(t).not.toContain(nid.sensitivity);
    for (const x of nid.excluded) expect(t).not.toContain(x.why);
  });
});
