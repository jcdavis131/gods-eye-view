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
import { sportsLayer } from "./sports";
import { constructsLayer } from "./constructs";
import { fieldLayer } from "./field";

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
  sportsLayer,
  constructsLayer,
  fieldLayer,
];

export const LAYER_BY_ID: Partial<Record<LayerId, LayerDefinition>> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);
