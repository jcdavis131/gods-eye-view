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

export const LAYERS: LayerDefinition[] = [
  aircraftLayer,
  shipsLayer,
  satellitesLayer,
  earthquakesLayer,
  camerasLayer,
  trafficLayer,
  launchesLayer,
];

export const LAYER_BY_ID: Partial<Record<LayerId, LayerDefinition>> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);
