// Registry of every data layer. Adding a layer = writing lib/layers/<name>.ts
// and listing it here (plus a style in lib/globe/styles.ts).

import type { LayerDefinition, LayerId } from "./types";
import { aircraftLayer } from "./aircraft";
import { satellitesLayer } from "./satellites";
import { shipsLayer } from "./ships";
import { earthquakesLayer } from "./earthquakes";
import { camerasLayer } from "./cameras";
import { trafficLayer } from "./traffic";
import { launchesLayer } from "./launches";
import { waterLayer } from "./water";
import { groundwaterLayer } from "./groundwater";
import { turbidityLayer } from "./turbidity";
import { tradeLayer } from "./trade";
import { commerceLayer } from "./commerce";
import { realestateLayer } from "./realestate";
import { companiesLayer } from "./companies";
import { banksLayer } from "./banks";
import { spendingLayer } from "./spending";
import { occupationsLayer } from "./occupations";
import { weatherLayer } from "./weather";
import { wildfireLayer } from "./wildfire";
import { firesLayer } from "./fires";
import { hazardsLayer } from "./hazards";
import { floodLayer } from "./flood";
import { wetlandsLayer } from "./wetlands";
import { publiclandsLayer } from "./publiclands";
import { TERRAIN_LAYERS } from "./terrain";
import { INFRA_LAYERS } from "./infra";
import { airqualityLayer } from "./airquality";
import { AIRNOW_ENABLED } from "@/lib/air/airnow";
import { eventsLayer } from "./events";
import { sportsLayer } from "./sports";
import { constructsLayer } from "./constructs";
import { fieldLayer } from "./field";
import { alertsLayer } from "./alerts";

export const LAYERS: LayerDefinition[] = [
  aircraftLayer,
  shipsLayer,
  satellitesLayer,
  earthquakesLayer,
  camerasLayer,
  trafficLayer,
  launchesLayer,
  waterLayer,
  groundwaterLayer,
  turbidityLayer,
  tradeLayer,
  commerceLayer,
  realestateLayer,
  companiesLayer,
  banksLayer,
  spendingLayer,
  occupationsLayer,
  weatherLayer,
  wildfireLayer,
  firesLayer,
  hazardsLayer,
  floodLayer,
  wetlandsLayer,
  publiclandsLayer,
  ...TERRAIN_LAYERS,
  ...INFRA_LAYERS,
  // Off until the operator decides on AirNow's data-user form (lib/air/airnow.ts).
  ...(AIRNOW_ENABLED ? [airqualityLayer] : []),
  eventsLayer,
  sportsLayer,
  constructsLayer,
  fieldLayer,
  alertsLayer,
];

export const LAYER_BY_ID: Partial<Record<LayerId, LayerDefinition>> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);
