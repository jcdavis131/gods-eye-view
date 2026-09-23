// Registry of every public source the app relays. Add here first; refer by id
// everywhere else so a citation is always spelled the same way.
import type { SourceRef } from "./types";

export const SOURCES = {
  "bls-oews": { id: "bls-oews", name: "Occupational Employment and Wage Statistics", publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/oes/", license: "public domain" },
  "bls-qcew": { id: "bls-qcew", name: "Quarterly Census of Employment and Wages", publisher: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/cew/", license: "public domain" },
  "zillow-zhvi": { id: "zillow-zhvi", name: "Zillow Home Value Index (ZHVI)", publisher: "Zillow Research", url: "https://www.zillow.com/research/data/", license: "free for public use with attribution" },
  "zillow-zori": { id: "zillow-zori", name: "Zillow Observed Rent Index (ZORI)", publisher: "Zillow Research", url: "https://www.zillow.com/research/data/", license: "free for public use with attribution" },
  fred: { id: "fred", name: "FRED Economic Data", publisher: "Federal Reserve Bank of St. Louis", url: "https://fred.stlouisfed.org/", license: "FRED terms; series from their original publishers" },
  "bts-border": { id: "bts-border", name: "Border Crossing Entry Data", publisher: "U.S. Bureau of Transportation Statistics", url: "https://data.bts.gov/", license: "public domain" },
  "bts-ports": { id: "bts-ports", name: "Port Performance Freight Statistics", publisher: "U.S. Bureau of Transportation Statistics", url: "https://data.bts.gov/", license: "public domain" },
  "bts-supply-chain": { id: "bts-supply-chain", name: "Supply Chain and Freight Indicators", publisher: "U.S. Bureau of Transportation Statistics", url: "https://data.bts.gov/", license: "public domain" },
  "nga-wpi": { id: "nga-wpi", name: "World Port Index (Pub 150)", publisher: "National Geospatial-Intelligence Agency", url: "https://msi.nga.mil/Publications/WPI", license: "public domain" },
  "worldbank-wdi": { id: "worldbank-wdi", name: "World Development Indicators", publisher: "World Bank", url: "https://data.worldbank.org/", license: "CC BY 4.0" },
  "worldbank-wits": { id: "worldbank-wits", name: "WITS TradeStats", publisher: "World Bank", url: "https://wits.worldbank.org/", license: "CC BY 4.0" },
  "census-tigerweb": { id: "census-tigerweb", name: "TIGERweb", publisher: "U.S. Census Bureau", url: "https://tigerweb.geo.census.gov/", license: "public domain" },
  "usgs-water": { id: "usgs-water", name: "USGS Water Data API", publisher: "U.S. Geological Survey", url: "https://api.waterdata.usgs.gov/", license: "public domain" },
  "usgs-stat": { id: "usgs-stat", name: "USGS Water Data Statistics API (daily streamflow percentiles)", publisher: "U.S. Geological Survey", url: "https://api.waterdata.usgs.gov/statistics/v0/", license: "public domain" },
  "noaa-nwps": { id: "noaa-nwps", name: "National Water Prediction Service", publisher: "NOAA National Weather Service", url: "https://api.water.noaa.gov/", license: "public domain" },
  twdb: { id: "twdb", name: "Water Data for Texas reservoirs", publisher: "Texas Water Development Board", url: "https://www.waterdatafortexas.org/reservoirs", license: "public" },
  usdm: { id: "usdm", name: "U.S. Drought Monitor", publisher: "National Drought Mitigation Center, USDA, NOAA", url: "https://droughtmonitor.unl.edu/", license: "public with attribution" },
  "usgs-earthquakes": { id: "usgs-earthquakes", name: "Earthquake Hazards Program feeds", publisher: "U.S. Geological Survey", url: "https://earthquake.usgs.gov/", license: "public domain" },
  "adsb-lol": { id: "adsb-lol", name: "adsb.lol ADS-B feed", publisher: "adsb.lol", url: "https://adsb.lol/", license: "ODbL" },
  opensky: { id: "opensky", name: "OpenSky Network", publisher: "OpenSky Network", url: "https://opensky-network.org/", license: "OpenSky terms (non-commercial)" },
  digitraffic: { id: "digitraffic", name: "Marine traffic AIS", publisher: "Fintraffic / Digitraffic", url: "https://www.digitraffic.fi/en/marine-traffic/", license: "CC BY 4.0" },
  aisstream: { id: "aisstream", name: "AISStream", publisher: "AISStream.io", url: "https://aisstream.io/", license: "free key; AISStream terms" },
  celestrak: { id: "celestrak", name: "GP element sets", publisher: "CelesTrak", url: "https://celestrak.org/", license: "CelesTrak terms" },
  "sec-edgar": { id: "sec-edgar", name: "EDGAR company filings and XBRL APIs", publisher: "U.S. Securities and Exchange Commission", url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces", license: "public domain; fair-access policy (10 req/s, User-Agent)" },
  "fdic-bankfind": { id: "fdic-bankfind", name: "BankFind Suite API", publisher: "Federal Deposit Insurance Corporation", url: "https://banks.data.fdic.gov/docs/", license: "public domain" },
  usaspending: { id: "usaspending", name: "USAspending API", publisher: "U.S. Department of the Treasury", url: "https://api.usaspending.gov/", license: "public domain" },
  "census-zcta-county": { id: "census-zcta-county", name: "ZCTA to county relationship file (2020)", publisher: "U.S. Census Bureau", url: "https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html", license: "public domain" },
  "sentinel-2": { id: "sentinel-2", name: "Copernicus Sentinel-2 L2A", publisher: "ESA via Element 84 Earth Search", url: "https://earth-search.aws.element84.com/v1", license: "free and open (Copernicus)" },
  "natural-earth": { id: "natural-earth", name: "Natural Earth 1:110m cultural vectors", publisher: "Natural Earth", url: "https://www.naturalearthdata.com/", license: "public domain" },
  "usgs-wbd": { id: "usgs-wbd", name: "Watershed Boundary Dataset", publisher: "U.S. Geological Survey", url: "https://www.usgs.gov/national-hydrography/watershed-boundary-dataset", license: "public domain" },
  "epa-ecoregions": { id: "epa-ecoregions", name: "Level III and IV Ecoregions of the United States", publisher: "U.S. Environmental Protection Agency", url: "https://www.epa.gov/eco-research/ecoregions", license: "public domain" },
  "fema-nfhl": { id: "fema-nfhl", name: "National Flood Hazard Layer", publisher: "Federal Emergency Management Agency", url: "https://www.fema.gov/flood-maps/national-flood-hazard-layer", license: "public domain" },
  "nws-api": { id: "nws-api", name: "api.weather.gov points and zones", publisher: "NOAA National Weather Service", url: "https://www.weather.gov/documentation/services-web-api", license: "public domain" },
  "usgs-epqs": { id: "usgs-epqs", name: "Elevation Point Query Service (3DEP)", publisher: "U.S. Geological Survey", url: "https://apps.nationalmap.gov/epqs/", license: "public domain" },
  "federal-regions": { id: "federal-regions", name: "Federal regional office and Reserve district lists", publisher: "EPA, FEMA, Federal Reserve System", url: "https://www.federalreserve.gov/aboutthefed/federal-reserve-system.htm", license: "public domain" },
  "gev-snapshot": { id: "gev-snapshot", name: "Embedding Atlas feed snapshots", publisher: "Embedding Atlas", url: "https://github.com/jcdavis131/gods-eye-view", license: "MIT; derived counts of public feeds" },
} as const satisfies Record<string, SourceRef>;

export type SourceId = keyof typeof SOURCES;

export function source(id: SourceId): SourceRef {
  return SOURCES[id];
}
