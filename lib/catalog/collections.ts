// The catalogue: one card per curated collection the globe draws or the
// dossiers read. eye is a library; each layer is one or more collections, and
// each collection says what a record is, where it comes from, what it covers,
// how current it is (and where that was read), what is left out and why, and
// what may be searched or embedded.
//
// This module adds only that. It never copies a source's name, publisher or
// licence (those live in lib/provenance/sources.ts, referenced by id), never a
// layer's label (lib/layers), and never an op's schema (public/openapi.json,
// referenced as "route?op=x"). Counts are from returnCountOnly probes on the
// date given, never estimated; freshness is what the upstream says about
// itself, with the field it was read from.
//
// Served at /api/catalog and listed at /catalog. Pure and static: no network.

import type { LayerId } from "@/lib/layers/types";
import type { SourceId } from "@/lib/provenance/sources";
import { WAYBACK_CAPTURE_CAVEAT, WAYBACK_CAVEAT } from "@/lib/terrain/wayback";
import { TOPO_CAVEAT } from "@/lib/terrain/topo";
import { IMPAIRED_CAVEAT } from "@/lib/water/impaired";
import { CWS_CAVEAT, PFAS_CAVEAT } from "@/lib/water/pfas";
import { NMFS_CAVEAT, RANGES_CAVEAT } from "@/lib/land/features";
import { TRI_CAVEAT } from "@/lib/permits/tri";
import { NPL_CAVEAT } from "@/lib/permits/npl";
import { FUDS_CAVEAT } from "@/lib/permits/fuds";
import { UST_CAVEAT } from "@/lib/permits/ust";

export interface Exclusion {
  what: string;
  why: string;
}

export interface Collection {
  /** Stable id, kebab-case, e.g. "nrhp-listed". Never reused. */
  id: string;
  title: string;
  /** The layer that draws it. A dossier-only collection still names the layer whose click shows it. */
  layer: LayerId;
  /** Upstreams, by id in SOURCES; name, publisher and licence come from there. */
  sources: SourceId[];
  /** One paragraph: what the collection holds. */
  what: string;
  /** What one record means and does not mean. */
  recordIs: string;
  coverage: {
    spatial: string;
    /** null when the collection is a current-state snapshot. */
    temporal: string | null;
    /** From a returnCountOnly (or equivalent) probe, never estimated; null when not counted. */
    count: { value: number; of: string; countedOn: string } | null;
  };
  freshness: {
    /** What the upstream says about its own currency. */
    statement: string;
    /** The field or document it was read from. */
    readFrom: string;
    /** When it was read, ISO date. Not a live claim. */
    recordedOn: string;
  };
  excluded: Exclusion[];
  caveats: string[];
  /** Fields that identify a record and may be searched; never a name that can be a person's. */
  searchable: string[];
  /** Fields safe to embed as record text (the embedding step). Never addresses, contacts or person-name fields. */
  embedText: string[];
  /** Ops that serve it, as "route?op=x"; each must be in public/openapi.json. */
  ops: string[];
  /** Sensitive-location and personal-data handling. */
  sensitivity: string;
  /** Curation round it entered. */
  round: 1 | 2 | 3;
}

/** Which shelf a layer's collections sit on (the /catalog page's grouping). */
export const SHELVES: Array<{ id: string; title: string; layers: LayerId[] }> = [
  { id: "land", title: "Land and heritage", layers: ["wetlands", "historic", "flood", "publiclands"] },
  { id: "species", title: "Species", layers: ["crithab"] },
  { id: "water", title: "Water quality", layers: ["impaired", "pfas"] },
  { id: "contaminants", title: "Contaminants", layers: ["contaminants", "ust"] },
  { id: "imagery", title: "Imagery and maps", layers: ["wayback", "topo"] },
  { id: "infrastructure", title: "Infrastructure", layers: ["dams"] },
];

const R1 = "2026-10-12";
const R2 = "2026-10-13";
const R3 = "2026-10-15";

export const COLLECTIONS: readonly Collection[] = [
  // ------------------------------------------------------------ round 1: land and heritage
  {
    id: "nwi-wetlands",
    title: "National Wetlands Inventory polygons",
    layer: "wetlands",
    sources: ["usfws-nwi"],
    what: "USFWS's map of wetland and deepwater habitat, one polygon per mapped unit, each with its Cowardin code decoded locally into its system, subsystem, class and water regime names and the year of the imagery it was drawn from (NWI Data_Source).",
    recordIs: "A habitat polygon mapped from aerial imagery of a given year. It is not a jurisdictional (Clean Water Act) delineation and does not say the area is wet today.",
    coverage: { spatial: "United States and territories; polygons below 10 km camera height, 500 per request (NWI's maxRecordCount)", temporal: "imagery years vary by quad, often decades old", count: null },
    freshness: { statement: "Each polygon carries the year of the imagery it was mapped from; the service does not publish an edit date.", readFrom: "Data_Source MapServer layer 3 (Image Year); Wetlands layer 0 ?f=json has no editingInfo", recordedOn: R2 },
    excluded: [
      { what: "jurisdictional status", why: "NWI is a habitat inventory, not a delineation; nothing here says what a regulator would decide" },
      { what: "guessed names for unknown codes", why: "a code the table does not answer leaves the names null" },
    ],
    caveats: ["A habitat inventory mapped from imagery that can be decades old, not a jurisdictional (Clean Water Act) delineation."],
    searchable: [],
    embedText: ["ATTRIBUTE", "WETLAND_TYPE", "SYSTEM_NAME", "CLASS_NAME", "WATER_REGIME_NAME"],
    ops: ["land?op=wetlands"],
    sensitivity: "Habitat polygons only; no ownership or personal data.",
    round: 1,
  },
  {
    id: "nwi-wetlands-raster",
    title: "National Wetlands Inventory raster (zoomed out)",
    layer: "wetlands",
    sources: ["usfws-nwi"],
    what: "NWI's national generalised raster, about 100 m pixels in eight wetland types, drawn above 10 km where the polygons are not loaded. The legend is the raster's own attribute table.",
    recordIs: "A pixel class at about 100 m: a picture of where NWI maps wetland types at that scale.",
    coverage: { spatial: "United States and territories; above 10 km camera height", temporal: null, count: null },
    freshness: { statement: "Pinned to service version v5 by name.", readFrom: "service name Wetlands_Raster_v5", recordedOn: R1 },
    excluded: [
      { what: "small wetlands", why: "lost at 100 m pixels" },
      { what: "a click answer on the raster", why: "raster identify is deferred; below 10 km the polygons answer" },
    ],
    caveats: ["Above 10 km the map is NWI's national ~100 m generalised raster, eight classes. Small wetlands can be missing at that scale."],
    searchable: [],
    embedText: [],
    ops: ["terrain?op=products"],
    sensitivity: "A picture of habitat classes; no personal data.",
    round: 1,
  },
  {
    id: "nrhp-listed",
    title: "National Register of Historic Places, listed properties",
    layer: "historic",
    sources: ["nps-nrhp"],
    what: "Properties listed on the National Register as NPS publishes them in its public, non-restricted spatial data: points for every listing it maps, and boundaries for districts and sites, each with its NRIS reference number, resource type, NHL flag, listing date and National Archives nomination link.",
    recordIs: "A listing on the National Register: a property NPS has listed, at the location NPS publishes. Absence is not absence on the ground.",
    coverage: { spatial: "United States; points below 25 km, boundaries below 10 km, 2,000 per layer and box", temporal: null, count: { value: 73928, of: "listed points (layer 0), restricted addresses excluded; 22,855 listed boundaries on layer 1", countedOn: R1 } },
    freshness: { statement: "The service publishes no edit date; NPS describes it as its current public, non-restricted spatial data.", readFrom: "nrhp_locations MapServer ?f=json (no editingInfo; serviceDescription)", recordedOn: R2 },
    excluded: [
      { what: "removed listings (648) and listings with no status (60)", why: "the layer shows what is listed, as STATUS='Listed'" },
      { what: "boundaries whose Address reads \"Address Restricted\" (3 listed)", why: "NPS marks their location restricted; filtered in the query, Address never requested" },
      { what: "archaeological sites whose locations are withheld under NHPA s.304 / ARPA", why: "NPS does not publish them in this service, and eye does not seek them elsewhere (no SHPO files, DINAA, tDAR or mirrors)" },
      { what: "street addresses", why: "never requested" },
    ],
    caveats: [
      "Only National Register properties that NPS publishes as non-restricted. Archaeological sites withheld under NHPA s.304 / ARPA are not in this source and are not shown. Absence on the map does not mean no resource is present. Not a substitute for Section 106 consultation or a SHPO file search.",
      "Property names can include a person's name, as NPS lists them, and are not searchable.",
    ],
    searchable: ["NRIS_Refnum"],
    embedText: ["NRIS_Refnum", "ResType", "Is_NHL", "CertDate", "City", "County", "State"],
    ops: ["land?op=historic"],
    sensitivity: "Agency-published, non-restricted listings only; restricted-address records are filtered out; property names (RESNAME) can be a person's and are never searched or embedded.",
    round: 1,
  },
  // ------------------------------------------------------------ round 1: species
  {
    id: "fws-crithab",
    title: "USFWS designated critical habitat, final and proposed",
    layer: "crithab",
    sources: ["usfws-crithab"],
    what: "ESA critical habitat designations under the U.S. Fish and Wildlife Service, one polygon set per species and rule, final and proposed, drawn from FWS's own tile caches and answered at a click from its FeatureServer: species, listing status, Final or Proposed, Federal Register rule and publication date.",
    recordIs: "A regulatory designation under the Endangered Species Act. It is not species range or occurrence, and FWS says the GIS file is not the legal boundary (the Federal Register rule and 50 CFR 17 are).",
    coverage: { spatial: "United States and territories, FWS-lead species", temporal: null, count: { value: 803, of: "final per-species designations (layer 0); 70 proposed (layer 2)", countedOn: R2 } },
    freshness: { statement: "FWS last edited the final layer on 2026-08-31.", readFrom: "USFWS_Critical_Habitat FeatureServer layer 0 editingInfo.lastEditDate", recordedOn: R2 },
    excluded: [
      { what: "occurrence points of any kind (GBIF, iNaturalist, NatureServe)", why: "precise locations of sensitive species are not shown; only agency regulatory polygons" },
      { what: "species images", why: "fws.gov/disclaimer: images can be copyrighted" },
      { what: "unitname, effectdate, accuracy", why: "FWS fills them with its placeholder \"Please check current species specific shapefile\"" },
    ],
    caveats: ["Many listed species have no designation, and a polygon does not mean the species is present. Proposed designations are always labelled as proposed. Marine and anadromous species are in the NOAA Fisheries card."],
    searchable: [],
    embedText: ["comname", "sciname", "listing_status", "status", "fedreg", "pubdate"],
    ops: ["land?op=crithab"],
    sensitivity: "Agency-published regulatory polygons only; no occurrence points.",
    round: 1,
  },
  {
    id: "nmfs-crithab",
    title: "NOAA Fisheries designated critical habitat (marine and anadromous species)",
    layer: "crithab",
    sources: ["noaa-nmfs-crithab"],
    what: "ESA critical habitat for species under NOAA Fisheries (whales, sea turtles, corals, salmon and steelhead, and others), drawn from NOAA's MapServer /export over FWS's caches and answered at a click: polygons containing the point (layer 226) and river and stream lines within about 200 m (layer 2), with listing status, Final or Proposed, unit, Federal Register rule, eCFR section and dates.",
    recordIs: "A regulatory designation under the Endangered Species Act, as NOAA maps it. Not range or occurrence; the eCFR text is the legal boundary.",
    coverage: { spatial: "US waters and the rivers and streams of anadromous species", temporal: "rules published to 2025-07-15 (polygons); to 2017-08-17 (lines)", count: { value: 2117, of: "polygons in layer 226; 59,888 lines in layer 2", countedOn: R2 } },
    freshness: { statement: "The polygon layer is named 20230502 but holds rules to July 2025 (Indo-Pacific corals, Nassau grouper, proposed Rice's whale and six proposed green sea turtle DPSs); the line layer's latest PUBDATE is 8/17/2017.", readFrom: "layer names and PUBDATE maxima", recordedOn: R2 },
    excluded: [
      { what: "NOAA's OPR folder", why: "answers 499 Token Required" },
      { what: "EPA's Critical_Habitat FeatureServer copy", why: "it disagreed with NOAA at the Seattle point (no bocaccio)" },
      { what: "occurrence and sighting data of any kind", why: "only agency regulatory polygons and lines" },
    ],
    caveats: [NMFS_CAVEAT],
    searchable: [],
    embedText: ["COMNAME", "SCIENAME", "LISTSTATUS", "CHSTATUS", "UNIT", "FR", "PUBDATE", "HABTYPE"],
    ops: ["land?op=crithab"],
    sensitivity: "Agency-published regulatory polygons and lines only; no occurrence points.",
    round: 2,
  },
  {
    id: "opp-ranges",
    title: "Listed species ranges (EPA OPP, USFWS and NOAA)",
    layer: "crithab",
    sources: ["epa-opp-ranges"],
    what: "ESA listed and proposed species ranges as USFWS and NOAA Fisheries delineate them, published by EPA's Office of Pesticide Programs for Section 7 work. A click with Critical habitat on lists the species whose range covers the point, grouped by status, with taxonomic group, lead agency, range date and ECOS page. The polygons are never drawn.",
    recordIs: "A range: where a species could occur. Not presence, not habitat, not a sighting.",
    coverage: { spatial: "United States and its waters", temporal: null, count: { value: 12293, of: "diced range polygons in layer 3", countedOn: R2 } },
    freshness: { statement: "EPA last edited the layer's data on 2026-10-11; each species carries its own range date (2014-2026 at the points checked).", readFrom: "Species_Ranges FeatureServer layer 3 editingInfo.dataLastEditDate; Range_Shapefile_Last_Updated", recordedOn: R2 },
    excluded: [
      { what: "drawing the range polygons", why: "the answer is a list, so it does not suggest where a species is" },
      { what: "Office_Name and Address_City (FWS field offices)", why: "they add nothing to the question" },
      { what: "occurrence points (GBIF, iNaturalist, NatureServe)", why: "precise locations of sensitive species are not shown" },
    ],
    caveats: [RANGES_CAVEAT],
    searchable: [],
    embedText: ["Common_Name", "Scientific_Name", "ESA_Listing_Status", "Entity_Description", "Lead_Agency", "Taxonomic_Group"],
    ops: ["land?op=crithab"],
    sensitivity: "Agency-published coarse ranges only, never drawn; no occurrence points.",
    round: 2,
  },
  // ------------------------------------------------------------ round 2: water quality
  {
    id: "attains-impaired",
    title: "Impaired waters (EPA ATTAINS, 303(d))",
    layer: "impaired",
    sources: ["epa-attains"],
    what: "Assessment units that states, territories and tribes report to EPA as impaired (isimpaired = 'Y'): Integrated Report category 4 and 5 stream reaches (lines) and lakes, estuaries and watersheds (areas), each with its category, 303(d) listing, TMDL, reporting cycle, overall status, EPA action status and How's My Waterway page.",
    recordIs: "A state's report that a whole assessment unit is impaired, for one reporting cycle. A regulatory listing, not a measured value at a point.",
    coverage: { spatial: "United States, states, territories and tribes that report to ATTAINS; below 10 km, 2,000 per layer and box", temporal: "reporting cycles 2022-2026 (they differ by state)", count: { value: 150218, of: "impaired line records (layer 1); 32,061 impaired area records (layer 2)", countedOn: R2 } },
    freshness: { statement: "EPA last edited the line layer's data on 2026-09-02; 81,709 of the 150,218 impaired line records are a state's submittal EPA has not acted on yet.", readFrom: "ATTAINS_Assessment FeatureServer layer 1 editingInfo.dataLastEditDate; cyclestatus counts by statistics query", recordedOn: R2 },
    excluded: [
      { what: "waters not reported impaired, including waters never assessed", why: "the layer shows listings; absence is not a finding that a water is clean" },
      { what: "the per-cause columns (mercury, PCBs, pathogens, nutrients, PFAS and about 35 more)", why: "deferred to a dossier follow-up" },
      { what: "a zoomed-out picture above 10 km", why: "EPA's gispub /export answered 504 on 3 of 5 calls when probed from this box (2026-10-13); recheck from Vercel" },
    ],
    caveats: [IMPAIRED_CAVEAT],
    searchable: ["assessmentunitidentifier"],
    embedText: ["assessmentunitidentifier", "assessmentunitname", "state", "organizationname", "reportingcycle", "ircategory", "on303dlist", "hastmdl", "cyclestatus"],
    ops: ["water?op=impaired"],
    sensitivity: "Agency regulatory listings of water bodies; no personal data.",
    round: 2,
  },
  {
    id: "ucmr5-pfas",
    title: "PFAS in public drinking water (EPA UCMR 5)",
    layer: "pfas",
    sources: ["epa-ucmr5-pat"],
    what: "UCMR 5 PFAS results per public water system, as EPA's PFAS Analytic Tools publish them: for each system serving a box and each of 29 PFAS, the highest single result at or above the minimum reporting level in ng/L, how many results reached it and how many results there were; or that the system was sampled with none at or above it, was not in UCMR 5, or is unknown this time. Systems are found by their service areas first (cws-service-areas), then by EPA's estimated location.",
    recordIs: "A water system's UCMR 5 results for one PFAS: samples taken where treated water enters the distribution system, 2023-2025. Not a tap, not current water quality, and not compared with any health limit.",
    coverage: { spatial: "United States and territories, public water systems in UCMR 5; below 25 km (service areas below 10 km)", temporal: "UCMR 5 sampling, 2023-2025", count: { value: 1978735, of: "UCMR 5 rows in PAT layer 1 (38,562 at or above the reporting level); 221,831 UCMR 3 rows are not used", countedOn: R3 } },
    freshness: { statement: "EPA last edited the layer's data on 2026-10-13 (03:16 UTC).", readFrom: "PFAS_Analytic_Tools_Layers FeatureServer/1 ?f=json editingInfo.dataLastEditDate", recordedOn: R3 },
    excluded: [
      { what: "Hazard Index rows", why: "53,408 rows with a null value and date; excluded by the request (Result_At_or_Above_UCMR_MRL IS NOT NULL)" },
      { what: "Result_Above_HBSL and any health-limit comparison", why: "the flag is never Yes on UCMR 5 rows, and no threshold has been read from a live EPA source" },
      { what: "UCMR 3 rows (2013-2015)", why: "different analytes and reporting levels; deferred" },
      { what: "facility and sample-point names and ids", why: "never requested; a result is shown per system" },
      { what: "an average", why: "the value shown is the highest single result" },
      { what: "a system placed at a guessed point", why: "a system with no service area and no estimated location (3,011 UCMR 5 rows have no geolocation method) is listed as not drawn" },
    ],
    caveats: [PFAS_CAVEAT],
    searchable: ["F_PWS_ID"],
    embedText: ["Contaminant", "State", "Population_Served", "Result_At_or_Above_UCMR_MRL", "UCMR_Geolocation_Method"],
    ops: ["water?op=pfas"],
    sensitivity: "Per water system, never per tap or well; the non-community layer (which carries a parcel number) is not used. PWS_Name can be an apartment complex, a nursing home or a rental park: it is shown in the record and on the label only, never searched or embedded. The layer has no contact fields.",
    round: 3,
  },
  {
    id: "cws-service-areas",
    title: "Community water system service areas (EPA)",
    layer: "pfas",
    sources: ["epa-cws-boundaries"],
    what: "EPA's Community Water System service-area boundaries, the geography UCMR 5 results are drawn on below 10 km: each with its PWSID, population served and category, service-area type, whether the boundary comes from the system or state or is modelled by EPA, its original data provider, and the system's ECHO report.",
    recordIs: "The area a community water system serves, as its state or the system mapped it or as EPA modelled it. Not a pipe network, and not a statement that every address inside is served.",
    coverage: { spatial: "United States and territories, community water systems; below 10 km, 2,000 per box, simplified on the server", temporal: null, count: { value: 44615, of: "community water system polygons: 25,375 sourced from the system or state, 19,240 modelled by EPA", countedOn: R3 } },
    freshness: { statement: "EPA last edited the layer's data on 2026-05-29.", readFrom: "Water_System_Boundaries FeatureServer/0 ?f=json editingInfo.dataLastEditDate", recordedOn: R3 },
    excluded: [
      { what: "transient and non-transient non-community systems' polygons", why: "that layer carries a parcel number; deferred, and PAT's estimated location places those systems" },
      { what: "Model_Method, Verification_Status and Confirmed", why: "answered empty when probed; not requested" },
    ],
    caveats: [CWS_CAVEAT],
    searchable: ["PWSID"],
    embedText: ["Pop_Cat_5", "Service_Area_Type", "Symbology_Field", "Primacy_Agency", "Data_Provider_Type"],
    ops: ["water?op=pfas"],
    sensitivity: "Utility service areas; no contact fields. PWS_Name is not searched or embedded.",
    round: 3,
  },
  // ------------------------------------------------------------ round 1: contaminants
  {
    id: "emef-sems",
    title: "Superfund sites (EPA EMEF, SEMS)",
    layer: "contaminants",
    sources: ["epa-emef"],
    what: "Superfund sites as EPA's Envirofacts EMEF map service publishes them (layer 0, program system SEMS), each with its EPA program id, FRS registry id and EPA facility page.",
    recordIs: "A Superfund program listing at EPA's facility coordinates. A regulatory status, not a finding of contamination at the point.",
    coverage: { spatial: "United States; below 25 km, 1,000 per program and box", temporal: null, count: { value: 1374, of: "points in EMEF efpoints layer 0 (SEMS)", countedOn: R2 } },
    freshness: { statement: "The map service publishes no edit date; EPA links its metadata record from the layer description.", readFrom: "EMEF efpoints MapServer layer 0 ?f=json (no editingInfo)", recordedOn: R2 },
    excluded: [
      { what: "location_address, postal_code and every contact field", why: "never requested" },
      { what: "site boundaries and NPL status", why: "not in this layer: boundaries are drawn from EPA's boundary layer (npl-boundaries) and status and dates are joined from the NPL list by EPA ID (npl-status)" },
      { what: "sites deleted from the NPL and Superfund sites never listed", why: "not in this layer: its 1,374 points are exactly the current NPL (1,337 final, 37 proposed), joined by EPA ID on 2026-10-15" },
    ],
    caveats: [
      "EPA's Superfund (SEMS) site layer is the current National Priorities List: on 2026-10-15 every one of its 1,374 points was on EPA's NPL list by EPA ID, 1,337 final and 37 proposed. The 466 sites deleted from the NPL, and Superfund sites never listed, are not in it.",
    ],
    searchable: ["registry_id", "pgm_sys_id"],
    embedText: ["pgm_sys_acrnm", "pgm_sys_id", "registry_id"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Federal regulatory records; no address or contact field is requested. The facility name (primary_name) can be a person's or a street address and is never searched or embedded.",
    round: 1,
  },
  {
    id: "emef-tri",
    title: "Toxics Release Inventory reporters (EPA EMEF)",
    layer: "contaminants",
    sources: ["epa-emef"],
    what: "Facilities that report to the Toxics Release Inventory, as EMEF layer 1 publishes them, with the TRI facility id (TRIFID), FRS registry id and EPA facility page.",
    recordIs: "A TRI reporter: a facility that filed with TRI. The listing alone says nothing about how much was released.",
    coverage: { spatial: "United States; below 25 km, 1,000 per program and box", temporal: null, count: { value: 64501, of: "points in EMEF efpoints layer 1 (TRI)", countedOn: R2 } },
    freshness: { statement: "The map service publishes no edit date.", readFrom: "EMEF efpoints MapServer layer 1 ?f=json (no editingInfo)", recordedOn: R2 },
    excluded: [{ what: "location_address and every contact field", why: "never requested" }],
    caveats: ["A listing is a regulatory status, not a finding of contamination at the point."],
    searchable: ["registry_id", "pgm_sys_id"],
    embedText: ["pgm_sys_acrnm", "pgm_sys_id", "registry_id"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Federal regulatory records; no address or contact field is requested; the facility name is never searched or embedded.",
    round: 1,
  },
  {
    id: "emef-rcra",
    title: "RCRA hazardous-waste handlers (EPA EMEF, RCRAInfo)",
    layer: "contaminants",
    sources: ["epa-emef"],
    what: "Handlers of hazardous waste registered in RCRAInfo, as EMEF layer 4 publishes them.",
    recordIs: "A RCRA handler registration: a regulatory status, not a finding of contamination.",
    coverage: { spatial: "United States; below 25 km, 1,000 per box (RCRA is dense: 3,001 in a 0.4 by 0.25 degree Houston box)", temporal: null, count: { value: 1552273, of: "points in EMEF efpoints layer 4 (RCRAInfo)", countedOn: R2 } },
    freshness: { statement: "The map service publishes no edit date.", readFrom: "EMEF efpoints MapServer layer 4 ?f=json (no editingInfo)", recordedOn: R2 },
    excluded: [
      { what: "location_address and every contact field", why: "never requested" },
      { what: "EMEF water (layer 2) and air (layer 3) facilities", why: "the Environmental permits layer already draws them from ECHO" },
      { what: "handlers past the first 1,000 in a box", why: "the cap keeps the answer bounded; the coverage note says when it was hit" },
    ],
    caveats: ["A listing is a regulatory status, not a finding of contamination at the point."],
    searchable: ["registry_id", "pgm_sys_id"],
    embedText: ["pgm_sys_acrnm", "pgm_sys_id", "registry_id"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Federal regulatory records; no address or contact field is requested; the facility name is never searched or embedded.",
    round: 1,
  },
  {
    id: "emef-acres",
    title: "Brownfields properties (EPA EMEF, ACRES)",
    layer: "contaminants",
    sources: ["epa-emef"],
    what: "Brownfields properties in EPA's ACRES system, as EMEF layer 5 publishes them.",
    recordIs: "A Brownfields property record: a property in an EPA grant program, not a finding of contamination.",
    coverage: { spatial: "United States; below 25 km, 1,000 per box", temporal: null, count: { value: 44445, of: "points in EMEF efpoints layer 5 (ACRES)", countedOn: R2 } },
    freshness: { statement: "The map service publishes no edit date.", readFrom: "EMEF efpoints MapServer layer 5 ?f=json (no editingInfo)", recordedOn: R2 },
    excluded: [{ what: "location_address and every contact field", why: "never requested; a Brownfields property's EPA name is often its street address, so it is never searched" }],
    caveats: ["A listing is a regulatory status, not a finding of contamination at the point."],
    searchable: ["registry_id", "pgm_sys_id"],
    embedText: ["pgm_sys_acrnm", "pgm_sys_id", "registry_id"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Federal regulatory records; no address or contact field is requested; the property name can be an address and is never searched or embedded.",
    round: 1,
  },
  {
    id: "tri-releases",
    title: "Toxics Release Inventory reported releases (EPA)",
    layer: "contaminants",
    sources: ["epa-tri"],
    what: "What a TRI facility reported releasing on site in a reporting year, by chemical and medium (stack and fugitive air, surface water, underground injection, landfills, surface impoundments, land treatment), in its reported units and estimation basis, with the chemicals it certified on Form A. Asked from a TRI listing's record; never drawn.",
    recordIs: "One Form R release line: a facility's own report of a quantity to one medium for one chemical and year. Not exposure, not concentration, not a measurement by EPA.",
    coverage: { spatial: "TRI reporting facilities in the United States", temporal: "reporting years 1987 onward; the newest complete year is two behind the calendar (2024 answered, 2025 returned no rows on 2026-10-13)", count: null },
    freshness: { statement: "Envirofacts serves the TRI tables as filed; a year's data completes about two years later.", readFrom: "Envirofacts dmapservice TRI tables (2025 empty, 2024 populated, 2026-10-13)", recordedOn: R2 },
    excluded: [
      { what: "the certifying official's name, title and signature, and every public and technical contact name, phone, extension and email", why: "sent by Envirofacts on every row; dropped by allowlist before anything is cached or returned" },
      { what: "TRI's own facility coordinates", why: "pref_longitude is stored unsigned; the map point stays EMEF's" },
      { what: "totals across units", why: "pounds and grams (dioxins) are never added" },
      { what: "range reports and 'NA' lines in totals", why: "a range is not a number, and NA is not zero" },
      { what: "off-site transfers and waste management quantities", why: "this collection is on-site releases (tri_release_qty) only" },
    ],
    caveats: [TRI_CAVEAT],
    searchable: [],
    embedText: ["cas_chem_name", "cas_registry_number", "environmental_medium", "unit_of_measure", "reporting_year"],
    ops: ["permits?op=tri"],
    sensitivity: "Federal regulatory records kept by allowlist; no person's name, phone or email leaves the parser.",
    round: 2,
  },
  {
    id: "npl-boundaries",
    title: "Superfund site boundaries (EPA)",
    layer: "contaminants",
    sources: ["epa-npl-boundaries"],
    what: "Superfund site boundary polygons as EPA regions map them, harvested into EPA_GEO's national layer: site areas, ground boundaries, operable-unit outlines and extents of contamination, each with its EPA ID, NPL status decoded from the layer's own domain, federal-facility flag, EPA program as published, city, county, state and EPA site page, and the site's NPL list row joined by EPA ID (npl-status). Drawn below 10 km, coloured by NPL status.",
    recordIs: "One mapped feature of a Superfund site: a regulatory area as an EPA region drew it. Not a contamination footprint. A site can have several overlapping features; they are not merged, and each says how many its site has.",
    coverage: { spatial: "United States; below 10 km, 2,000 per box, simplified on the server to 0.0005 degrees (about 50 m)", temporal: null, count: { value: 2113, of: "polygons in the Superfund program filter, for 1,907 EPA IDs (2,114 in the layer)", countedOn: R3 } },
    freshness: { statement: "EPA last edited the layer's data on 2026-10-15; the service describes it as harvested weekly from regional datasets.", readFrom: "FAC_Superfund_Site_Boundaries_EPA_Public FeatureServer/0 ?f=json editingInfo.dataLastEditDate (2026-10-15 16:23 UTC) and the service description", recordedOn: R3 },
    excluded: [
      { what: "EPA staff contact name, email and phone; street address, address comment and ZIP", why: "never requested" },
      { what: "SITE_FEATURE_NAME and SITE_FEATURE_DESCRIPTION", why: "free text, not reviewed" },
      { what: "GIS_AREA and its units", why: "the units mix acres, square miles, 'Miles' and null" },
      { what: "one 'Michigan LUST' polygon", why: "a state tank-program record in a Superfund layer; the program filter (EPA_PROGRAM null or Superfund*) leaves it out" },
      { what: "a decoded EPA_PROGRAM", why: "its live values (Superfund, Superfund Remedial, Superfund Removal, Superfund Site Assessment) do not match the field's own code list, so it is passed through as published" },
    ],
    caveats: [NPL_CAVEAT],
    searchable: ["EPA_ID"],
    embedText: ["NPL_STATUS_CODE", "FEDERAL_FACILITY_DETER_CODE", "EPA_PROGRAM", "SITE_FEATURE_TYPE", "COUNTY", "STATE_CODE"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Agency regulatory records. EPA staff contacts and the street address are never requested. SITE_NAME is shown in the record and on the label, never searched or embedded: a site can be named for a person or a business.",
    round: 3,
  },
  {
    id: "npl-status",
    title: "National Priorities List status (EPA)",
    layer: "contaminants",
    sources: ["epa-npl-status"],
    what: "EPA's NPL list: each site's status (final, proposed, deleted), Hazard Ranking System score, proposal, listing, construction-completion, intent-to-delete and deletion dates, partial deletion, and its Federal Register notices and site progress profile. Joined by EPA ID to every Superfund point and boundary in a box, never by the box itself (a site's point can sit outside a box its polygon enters). Read in the record; not drawn on its own.",
    recordIs: "A site's row on the NPL list. A site with no row is shown as not on EPA's NPL status list, which is not a finding that it is clean; a list that did not answer is shown as unknown.",
    coverage: { spatial: "United States", temporal: "listings from 1983", count: { value: 1840, of: "sites: 1,337 final, 37 proposed, 466 deleted", countedOn: R3 } },
    freshness: { statement: "EPA last edited the list's data on 2026-09-30.", readFrom: "Superfund NPL Sites with Status Information FeatureServer/0 ?f=json editingInfo.dataLastEditDate", recordedOn: R3 },
    excluded: [
      { what: "the HTML of the notice and profile fields", why: "only the anchor's text and an https epa.gov link are kept" },
      { what: "City, County and the narrative fields", why: "the boundary carries the place; the narratives are not reviewed" },
    ],
    caveats: ["Dates are as EPA's list gives them (MM/DD/YYYY, shown as ISO dates); a missing or unreadable date is left out, never guessed."],
    searchable: ["Site_EPA_ID"],
    embedText: ["Status", "Proposed_Date", "Listing_Date", "Construction_Completion_Date", "Deletion_Date"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Federal regulatory list; no personal data is requested. Site_Name is not searched or embedded.",
    round: 3,
  },
  {
    id: "fuds-properties",
    title: "Formerly Used Defense Sites: properties (USACE FUDS)",
    layer: "contaminants",
    sources: ["usace-fuds"],
    what: "Properties the Department of Defense once used and USACE is responsible for investigating and cleaning up, as USACE's FY2024 FUDS inventory publishes them: every property as a point (layer 1) and, below 10 km, the property's boundary where USACE has drawn one (layer 4), each with its FUDS property number, status, eligibility, county, state, closest city, USACE district, data year, FUDS portal page and its cleanup projects (fuds-projects).",
    recordIs: "A property in the FUDS program. A program status, not a finding of contamination at the point; a property with no projects was found to need none or is not eligible.",
    coverage: { spatial: "United States and its territories; points below 25 km, boundaries below 10 km, 1,000 per layer and box", temporal: "FY2024 data", count: { value: 10123, of: "property points (layer 1); 3,003 property boundaries (layer 4)", countedOn: R3 } },
    freshness: { statement: "USACE updated the item on 2026-10-07; the layers carry FY2024 data (FISCALYEAR 2024 on every row checked) and USACE calls it preliminary.", readFrom: "item 3f8354667d5b4b1b8ad7a6e00c3cf3b1 (sharing/rest modified) and FeatureServer/1 and 4 ?f=json editingInfo.dataLastEditDate (2026-10-07)", recordedOn: R3 },
    excluded: [
      { what: "CURRENTOWNER", why: "free text holding private individuals' names, P.O. boxes and phone numbers; never requested" },
      { what: "FEATUREDESCRIPTION", why: "unreviewed narratives; never requested" },
      { what: "a property's point where its boundary is drawn", why: "one property, one symbol (27 of 126 points in the NJ/NY test box)" },
      { what: "a guessed fiscal year or status", why: "FISCALYEAR is text on one layer and a number on the other and is read strictly; the two STATUS vocabularies map to one enum, and an unknown value is null" },
    ],
    caveats: [FUDS_CAVEAT],
    searchable: ["FUDSUNIQUEPROPERTYNUMBER"],
    embedText: ["STATUS", "ELIGIBILITY", "COUNTY", "STATE", "USACEDISTRICT", "FISCALYEAR"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Agency-published DoD cleanup records. The owner and narrative fields stay at the source. Property names (FEATURENAME, DODFORMERLYUSEDDEFENSESITENAME) can carry a private surname (13 names on layer 1 contain 'PROPERTY', e.g. 'BARTLETT PROPERTY (WURTSMITH AIR FORCE BASE)'); they are shown in the record and on the label, never searched or embedded.",
    round: 3,
  },
  {
    id: "fuds-projects",
    title: "Formerly Used Defense Sites: cleanup projects (USACE FUDS)",
    layer: "contaminants",
    sources: ["usace-fuds"],
    what: "The cleanup projects on each FUDS property (layer 2): project number, restoration category (military munitions, hazardous, toxic and radioactive waste, containerized, building demolition and debris removal, potentially responsible party), program (IRP or MMRP), status, remedy-in-place, response-complete and closeout dates, risk value, USACE's cost-to-complete estimate and any overlapping federal land. Listed in their property's record; not drawn.",
    recordIs: "One environmental restoration project on a FUDS property, as USACE tracks it. A date after today is USACE's planned date and is marked so.",
    coverage: { spatial: "United States and its territories; the projects of the properties drawn in a box", temporal: "FY2024 data", count: { value: 5584, of: "projects (layer 2)", countedOn: R3 } },
    freshness: { statement: "USACE updated the item on 2026-10-07; the layers carry FY2024 data (FISCALYEAR 2024 on every row checked) and USACE calls it preliminary.", readFrom: "item 3f8354667d5b4b1b8ad7a6e00c3cf3b1 (sharing/rest modified) and FeatureServer/2 ?f=json editingInfo.dataLastEditDate (2026-10-07)", recordedOn: R3 },
    excluded: [
      { what: "a cost to complete of 0 on a project that is not complete", why: "not an estimate; shown as 'not given' (3 such projects nationally on 2026-10-15). A 0 on a completed project is kept" },
      { what: "a project whose property is not drawn in the box", why: "one site, one symbol: projects are listed under their property" },
      { what: "the project's own point", why: "not drawn; the property carries it" },
    ],
    caveats: ["Costs are USACE's estimates to complete, in dollars as published; dates after today are planned."],
    searchable: ["FUDSPROPERTYID", "PROJECTNUMBER"],
    embedText: ["ENVRESTORATIONCATEGORY", "DERPPROGRAM", "PROJECTSTATUS", "RISKVALUEMRSPP", "OVERLAPPINGFEDERALLANDAGENCY"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Agency-published DoD cleanup records. ENVRESTORATIONPROJECTNAME and DODFORMERLYUSEDDEFENSESITENAME are shown in the record only, never searched or embedded.",
    round: 3,
  },
  {
    id: "fuds-mrs",
    title: "Formerly Used Defense Sites: munitions response sites (USACE FUDS)",
    layer: "contaminants",
    sources: ["usace-fuds"],
    what: "Munitions Response Site polygons on FUDS properties (layer 3), with property number, site id, project number, status, program and relative priority. Drawn below 10 km, dashed.",
    recordIs: "Where munitions may be present on a former defense property, as USACE maps it. Not a confirmed hazard footprint.",
    coverage: { spatial: "United States and its territories; below 10 km, 1,000 per box", temporal: "FY2024 data", count: { value: 1682, of: "munitions response site polygons (layer 3); relative priority is null on 1,661", countedOn: R3 } },
    freshness: { statement: "USACE updated the item on 2026-10-07; the layers carry FY2024 data (FISCALYEAR 2024 on every row checked) and USACE calls it preliminary.", readFrom: "item 3f8354667d5b4b1b8ad7a6e00c3cf3b1 (sharing/rest modified) and FeatureServer/3 ?f=json editingInfo.dataLastEditDate (2026-10-07)", recordedOn: R3 },
    excluded: [
      { what: "FEATUREDESCRIPTION and OFFICIALSITENAME", why: "never requested" },
      { what: "a relative priority where USACE gives none", why: "shown as 'not given', never ranked" },
    ],
    caveats: ["A munitions response site marks where munitions may be present, not a confirmed hazard footprint. USACE publishes these polygons; they are shown to help people avoid hazards, with that caveat."],
    searchable: ["PROJECTNUMBER", "FUDSPROPERTYID"],
    embedText: ["PROJECTSTATUS", "DERPPROGRAM", "RELATIVEPRIORITY"],
    ops: ["permits?op=contaminants"],
    sensitivity: "Agency-published DoD cleanup records; FEATURENAME is shown in the record and on the label only.",
    round: 3,
  },
  {
    id: "ust-releases-county",
    title: "Leaking underground storage tank releases by county (EPA UST Finder)",
    layer: "ust",
    sources: ["epa-ust-finder"],
    what: "EPA UST Finder's county counts of reported leaking underground storage tank (LUST) releases: total, open, and no further action, with the county's population as the layer gives it. Drawn as county outlines filled by open releases.",
    recordIs: "A county's count of reported tank leaks in state records as of 2018-2021. A release is a reported leak; 'no further action' is the state's closure, not proof that no contamination remains. A snapshot, not current status.",
    coverage: { spatial: "United States, by county; between 50 and 1,500 km, a 4 degree box", temporal: "state records as of 2018-2021; tribal records to October 2025", count: { value: 3220, of: "counties; their release counts sum to 530,062 of UST Finder's 530,798 release points (736 are in no county row)", countedOn: R3 } },
    freshness: { statement: "The service describes itself as a national composite as of 2018-2021, tribal data to October 2025; EPA last edited this layer's data on 2026-02-13.", readFrom: "UST_Finder_Feature_Layer_2eb FeatureServer ?f=json serviceDescription, and layer 3 ?f=json editingInfo.dataLastEditDate", recordedOn: R3 },
    excluded: [
      { what: "individual release and facility sites (UST Finder layers 0 and 1)", why: "many are private homes ('%RESIDENCE%' matches 4,615 releases) and no field marks a residential site reliably; county counts carry no location below the county" },
      { what: "an 'unknown status' count by subtraction", why: "13,179 releases nationally have an unknown status, yet some counties sum exactly; the arithmetic is not trustworthy, so nothing is derived" },
      { what: "a per-capita rate", why: "not computed; the layer's population is shown as given" },
    ],
    caveats: [UST_CAVEAT],
    searchable: ["County"],
    embedText: ["County", "State", "Release_Count", "Open_Count", "No_Further_Action_Count"],
    ops: ["permits?op=ust"],
    sensitivity: "County aggregates only. No site, name or address is requested.",
    round: 3,
  },
  {
    id: "ust-facilities-county",
    title: "Underground storage tank facilities by county (EPA UST Finder)",
    layer: "ust",
    sources: ["epa-ust-finder"],
    what: "EPA UST Finder's county counts of UST facilities and tanks (open, closed, temporarily out of service), joined to the release counties by county name and state; the county layers carry no FIPS code.",
    recordIs: "A county's count of tank facilities and tanks in state records as of 2018-2021. A snapshot, not current status.",
    coverage: { spatial: "United States, by county; with the release counties", temporal: "state records as of 2018-2021", count: { value: 3220, of: "counties; their facility counts sum to 741,447 of UST Finder's 742,844 facility points", countedOn: R3 } },
    freshness: { statement: "The service describes itself as a national composite as of 2018-2021, tribal data to October 2025; EPA last edited this layer's data on 2026-02-13.", readFrom: "UST_Finder_Feature_Layer_2eb FeatureServer ?f=json serviceDescription, and layer 2 ?f=json editingInfo.dataLastEditDate", recordedOn: R3 },
    excluded: [
      { what: "a FIPS join", why: "the layers have no FIPS code; the name join leaves a non-matching or non-unique county unjoined and says so (all 57 counties joined in the Gulf Coast test box, 2026-10-15)" },
      { what: "facility names and addresses", why: "never requested; county counts only" },
    ],
    caveats: [UST_CAVEAT],
    searchable: [],
    embedText: ["State", "Facility_Count", "Open_USTs", "Closed_USTs", "TOS_USTs"],
    ops: ["permits?op=ust"],
    sensitivity: "County aggregates only. The NAME field here is the county's name; it is not embedded under that field name (the deny list keeps any bare NAME out).",
    round: 3,
  },
  // ------------------------------------------------------------ round 3: backfill, shipped layers
  {
    id: "fema-nfhl-zones",
    title: "Flood hazard zones (FEMA National Flood Hazard Layer)",
    layer: "flood",
    sources: ["fema-nfhl"],
    what: "FEMA's regulatory flood hazard zones (NFHL layer 28) in a box below 5 km: zone and subtype with FEMA's own meaning, whether the ground is in the special flood hazard area, the static base flood elevation where FEMA published one, depth and its units and datum, and the FIRM study it comes from (DFIRM_ID, study type). Under the zones, FEMA's own rendering of the same layer as a picture.",
    recordIs: "A flood hazard zone on FEMA's regulatory map (FIRM): the 1% annual-chance floodplain and others. Not a forecast, and the absence of a zone is not a finding of no flood risk.",
    coverage: { spatial: "United States, where FEMA has digital flood maps; below 5 km in a ~9 km box", temporal: "each zone's effective FIRM study (by DFIRM_ID)", count: null },
    freshness: { statement: "FEMA's map service publishes no edit date; each zone carries the FIRM study it comes from (DFIRM_ID). Not counted nationally: counts over the full extent are slow (a 0.02 degree San Antonio box answered 47 zones).", readFrom: "NFHL MapServer/28 ?f=json (no editingInfo, empty copyright and description)", recordedOn: R3 },
    excluded: [
      { what: "effective dates per panel", why: "not requested; the zone's FIRM study id is shown instead" },
      { what: "preliminary and pending maps", why: "not in layer 28" },
      { what: "a base flood elevation of -9999", why: "FEMA's 'none' sentinel; dropped, never shown as a number" },
    ],
    caveats: [
      "A regulatory flood map (FIRM), not a forecast: it says nothing about whether anything is flooding now.",
      "The absence of a zone is not a finding of no flood risk: FEMA has not mapped everywhere, and zone D means no FEMA analysis.",
    ],
    searchable: ["FLD_ZONE", "FLD_AR_ID"],
    embedText: ["FLD_ZONE", "ZONE_SUBTY", "SFHA_TF", "STATIC_BFE", "STUDY_TYP", "DFIRM_ID"],
    ops: ["land?op=flood"],
    sensitivity: "Regulatory map polygons; no ownership or personal data.",
    round: 3,
  },
  {
    id: "padus-units",
    title: "Protected areas and public lands (USGS PAD-US 4.1)",
    layer: "publiclands",
    sources: ["usgs-padus"],
    what: "USGS's Protected Areas Database (PAD-US 4.1, Manager Name service) in the four categories the route asks for, fee lands, easements, designations and proclamation boundaries: each unit's owner and owner type, local owner, manager and manager type, designation, GAP status, IUCN category, public access, acres and year established, and for easements the holder and holder type, decoded with the service's own domains.",
    recordIs: "A protected-area unit as PAD-US publishes it. Public access is PAD-US's code, not permission to enter; land inside a proclamation boundary is not all public; an easement's owner keeps the land.",
    coverage: { spatial: "United States; below 250 km (the 600 largest units when zoomed out past 60 km)", temporal: "PAD-US 4.1 (2025)", count: { value: 647844, of: "units in the Fee, Easement, Designation and Proclamation categories", countedOn: R3 } },
    freshness: { statement: "USGS last edited the service's data on 2025-06-04; the service cites PAD-US 4.1 (doi:10.5066/P96WBCHS).", readFrom: "PADUS4_1ManagerName FeatureServer/0 ?f=json editingInfo.dataLastEditDate and copyrightText", recordedOn: R3 },
    excluded: [
      { what: "the Marine and Other categories", why: "not asked by the route" },
      { what: "Loc_Own, Own_Name and EsmtHldr as search keys or record text", why: "an owner or easement holder can be a private person; shown as PAD-US publishes them, never searched or embedded" },
    ],
    caveats: [
      "Public access is PAD-US's code for each unit; it is not permission to enter.",
      "The land inside a proclamation boundary is not all public, and an easement's owner keeps the land (the holder has the rights the easement grants).",
    ],
    searchable: ["Unit_Nm", "Loc_Nm"], // not on privately owned units (Own_Type PVT)
    embedText: ["Category", "Own_Type", "Mang_Type", "Des_Tp", "State_Nm", "Pub_Access", "GAP_Sts", "IUCN_Cat"],
    ops: ["land?op=publiclands"],
    sensitivity: "Ownership is shown as PAD-US publishes it (a federal inventory); what stays out is the search from an owner or easement holder to its holdings. A privately owned unit (Own_Type PVT) is often named for a family, so it is labelled by PAD-US id and its published name is shown in the record but never searched.",
    round: 3,
  },
  {
    id: "nid-dams",
    title: "Dams (USACE National Inventory of Dams)",
    layer: "dams",
    sources: ["usace-nid"],
    what: "Dams in USACE's National Inventory of Dams public service: NID id, hazard potential with its meaning, the regulator's condition assessment and its date, purposes, dam type, height, storage, surface and drainage area, year completed, river, county, state, owner type, emergency action plan, operational status and the record's update date.",
    recordIs: "A dam as NID lists it. Hazard potential is the damage a failure would cause downstream, not the dam's condition or how likely it is to fail.",
    coverage: { spatial: "United States", temporal: null, count: { value: 92628, of: "dams in NID's public service (layer 0)", countedOn: R3 } },
    freshness: { statement: "NID's public service publishes no edit date; each dam carries the date its record was updated (DATA_UPDATED).", readFrom: "National_Inventory_of_Dams_Public_Service FeatureServer/0 ?f=json (no editingInfo)", recordedOn: R3 },
    excluded: [
      { what: "owner and representative names (CONG_REPRESNTATIVE, OTHER_NAMES, FORMER_NAMES, DESIGNER_NAMES and the owner names)", why: "never requested" },
      { what: "a condition where the regulator published none", why: "left out, never guessed" },
    ],
    caveats: [
      "Hazard potential is the damage a failure would cause downstream (High: loss of life likely), not the dam's condition and not how likely it is to fail.",
      "Condition assessments are the regulating agency's, with the date it assessed; many dams have none published.",
    ],
    searchable: ["NIDID"],
    embedText: ["PRIMARY_PURPOSE", "PRIMARY_DAM_TYPE", "NID_HEIGHT", "HAZARD_POTENTIAL", "CONDITION_ASSESSMENT", "STATE", "YEAR_COMPLETED"],
    ops: ["infra?op=dams"],
    sensitivity: "Public infrastructure records; no owner or representative name is requested. NAME is not embedded. A privately owned dam can be named for its owner ('<Surname> Pond Dam'), so it is labelled by NID id and its published name is shown in the record but never searched; other dams keep their name as the label.",
    round: 3,
  },
  // ------------------------------------------------------------ round 1: imagery
  {
    id: "esri-wayback",
    title: "World Imagery Wayback releases",
    layer: "wayback",
    sources: ["esri-wayback"],
    what: "Every published release of Esri World Imagery since 2014-02-20, each its own tile set, picked by release date; the release index comes from Esri's waybackconfig.json.",
    recordIs: "A release: the basemap as Esri published it on that date. A release date is not a capture date.",
    coverage: { spatial: "Worldwide", temporal: "releases 2014-02-20 to 2026-09-24", count: { value: 197, of: "dated releases in waybackconfig.json", countedOn: R1 } },
    freshness: { statement: "The newest release in the index was 2026-09-24.", readFrom: "waybackconfig.json itemTitle (Wayback YYYY-MM-DD)", recordedOn: R1 },
    excluded: [
      { what: "tile proxying, caching or export", why: "the item's licence: not intended to be used to export tiles for offline; tiles load from Esri in the browser" },
      { what: "imagery before 2014 as a release", why: "Wayback starts at 2014-02-20 (older captures inside a release are dated by the capture-date collection)" },
    ],
    caveats: [WAYBACK_CAVEAT],
    searchable: [],
    embedText: [],
    ops: ["terrain?op=wayback"],
    sensitivity: "Imagery as Esri publishes it; nothing is stored here.",
    round: 1,
  },
  {
    id: "wayback-capture",
    title: "World Imagery Wayback capture dates",
    layer: "wayback",
    sources: ["esri-wayback-metadata"],
    what: "Esri's per-release imagery metadata: for each Wayback release, polygons saying which capture each region of that release came from, in 14 resolution bands, with the capture date, resolution, accuracy, provider and Esri's collection name. A click on Wayback imagery reads it at the point for the release drawn and the zoom it is drawn at.",
    recordIs: "A capture: when and by whom the pixels in that release were taken, as Esri records it. A point can sit on more than one capture.",
    coverage: { spatial: "Worldwide, where Esri publishes metadata (some areas have none)", temporal: "captures back to 2002 in the 2014-02-20 release, e.g. 2010-10-26 at San Francisco", count: { value: 197, of: "releases whose index entry names a metadata service on metadata.maptiles.arcgis.com", countedOn: R2 } },
    freshness: { statement: "A release's metadata is fixed when the release is published; new releases bring new services.", readFrom: "waybackconfig.json metadataLayerUrl, one MapServer per release", recordedOn: R2 },
    excluded: [
      { what: "a single 'best' capture per point", why: "rows tie on DrawOrder (two 2010 captures at 90 in the 2014 release at San Francisco), so every row is shown" },
      { what: "a guessed date where Esri lists none", why: "no metadata answers 'Esri lists no capture date here'" },
      { what: "metadata URLs from the caller", why: "the route reads them from Esri's index by release id" },
    ],
    caveats: [WAYBACK_CAPTURE_CAVEAT],
    searchable: [],
    embedText: ["SRC_DATE", "SRC_RES", "NICE_NAME", "NICE_DESC"],
    ops: ["terrain?op=waybackdate"],
    sensitivity: "Imagery provenance only; no personal data.",
    round: 2,
  },
  {
    id: "usgs-htmc",
    title: "USGS historical topographic maps, 1879-2006",
    layer: "topo",
    sources: ["usgs-htmc"],
    what: "Every scale and edition of the topographic map USGS published, scanned (the Historical Topographic Map Collection), drawn one edition year at a time from Esri's HTMC ImageServer; a click lists the sheets at the point with their USGS citation, and their GeoPDF and GeoTIFF from USGS TNM Access matched by scan id.",
    recordIs: "A sheet: one edition of one USGS quadrangle as published. The edition year (DateCurrent) is when USGS revised the map, not a survey date; parts of a sheet can be decades older.",
    coverage: { spatial: "United States and territories; tiles draw from about level 11 (about 10 km or closer)", temporal: "editions 1879-2006 (DateCurrent minimum and maximum)", count: { value: 181008, of: "sheets in the ImageServer (Category=1)", countedOn: R2 } },
    freshness: { statement: "A closed collection: USGS's historical series ends in 2006, and the service describes it as all scales and all editions published since the program began.", readFrom: "ImageServer ?f=json description; DateCurrent max statistic (2006)", recordedOn: R2 },
    excluded: [
      { what: "the HTMC's own GeoPDF links (Download_GeoPDF)", why: "their host, ims.er.usgs.gov, no longer resolves (2026-10-13); the GeoPDF and GeoTIFF come from TNM instead" },
      { what: "a year the view centre has no sheet for, in the picker", why: "a year with no sheet under a tile draws blank" },
      { what: "tiles coarser than level 11", why: "a sheet draws only finer than its MaxPS; a 20 km tile came back blank" },
    ],
    caveats: [TOPO_CAVEAT],
    searchable: [],
    embedText: ["Map_Name", "Map_Scale", "DateCurrent", "Imprint_Year", "Survey_Year", "Citation"],
    ops: ["terrain?op=topo"],
    sensitivity: "Published federal maps; no personal data. Sheet names are place names.",
    round: 2,
  },
];

/** One collection by id. */
export function collection(id: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/** A layer's collections, in catalogue order. */
export function collectionsForLayer(layer: LayerId): Collection[] {
  return COLLECTIONS.filter((c) => c.layer === layer);
}

/** Layers with at least one collection. */
export function catalogued(): LayerId[] {
  return [...new Set(COLLECTIONS.map((c) => c.layer))];
}

/** "land?op=historic" -> { route: "/api/land", op: "historic" }; null when malformed. */
export function parseOpRef(ref: string): { route: string; op: string } | null {
  const m = ref.match(/^([a-z]+)\?op=([a-z][a-z-]*)$/);
  return m ? { route: `/api/${m[1]}`, op: m[2] } : null;
}

/**
 * Field names that must never be searchable or embedded: addresses, contacts, owners,
 * certifiers, free-text descriptions, and names that can be a person's (NRHP RESNAME, EPA
 * primary_name and SITE_NAME, UST Name, a water system's PWS_Name, USACE's FUDS property,
 * site and project names, PAD-US Loc_Own).
 */
export const DENY_FIELD =
  /address|street|zip|postal|contact|phone|email|owner|certif|^primary_name$|^resname$|^name$|^site_name$|^pws_name$|^featurename$|^dodformerlyuseddefensesitename$|^envrestorationprojectname$|^officialsitename$|^featuredescription$|^site_feature_description$|^loc_own$/i;
