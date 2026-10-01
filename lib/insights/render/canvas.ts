// Canvas presets: the sizes a chart is drawn at and the type scale for each.
//
//   social         1080 x 1350, the portrait card (the PNG download is this
//                  SVG rasterised at 2160 wide, not a separate layout)
//   og             1200 x 630, split: a 470 px text column on the left, the
//                  plot on the right
//   inline-wide    760 wide, on document pages
//   inline-narrow  400 wide, on document pages under the phone breakpoint
//
// The two inline variants are both server-rendered and toggled by a CSS
// media query, so a page ships no JavaScript for its chart; they omit the
// headline and the brand row (the page's own heading and chrome carry them)
// and set the font through the page's CSS variable on the root element only
// (svg.ts), because next/font registers Geist under a hashed family name.
//
// Headline ladders: the largest size that fits wins; nothing fits, it throws
// (metrics.ts fitHeadline). The OG column gets its own ladder, 46/40/34 px up
// to 5 lines: the flagship title is 5 lines at 46 px in 470 px, which the
// first design's 4-line, single-size OG layout rejected.

import type { TextStyle, Weight } from "./metrics";

export type CanvasId = "social" | "og" | "inline-wide" | "inline-narrow";
export const CANVAS_IDS: CanvasId[] = ["social", "og", "inline-wide", "inline-narrow"];

export interface HeadlineStyle {
  ladder: number[];
  maxLines: number;
  lineHeight: number;
  weight: Weight;
}

export interface CanvasPreset {
  id: CanvasId;
  width: number;
  height: number;
  /** "stack": headline, plot and notes top to bottom. "split": text column left, plot right. */
  layout: "stack" | "split";
  /** Drawn inside a document page: width 100 %, font from the page, no headline, no brand row. */
  inline: boolean;
  margin: number;
  /** Width of the text column in the split layout; the full text width in the stack layout. */
  column: number;
  /** Space between the text column and the plot region (split layout). */
  columnGap: number;
  headline: HeadlineStyle | null;
  dek: TextStyle | null;
  tick: TextStyle;
  axisTitle: TextStyle;
  legend: TextStyle;
  /** Universe, source and method lines. */
  source: TextStyle;
  brand: TextStyle | null;
  permalink: TextStyle | null;
  /** Data labels, the subject's label and its note lines (placed by the chart, not the frame). */
  label: TextStyle;
  subjectLabel: TextStyle;
  subjectNote: TextStyle;
  /** Pixel scale against the 1080-wide card, for radii and stroke widths. */
  scale: number;
  /** Below this plot height the headline steps down its ladder; past the ladder, layout throws. */
  minPlot: number;
  /** Vertical rhythm, px: after the headline, after the dek, between the notes blocks. */
  gaps: { headline: number; dek: number; block: number; tick: number };
}

const R = (size: number, lineHeight = 1.3): TextStyle => ({ size, weight: 400, lineHeight });
const B = (size: number, lineHeight = 1.3): TextStyle => ({ size, weight: 700, lineHeight });
const K = (size: number, lineHeight = 1.3): TextStyle => ({ size, weight: 900, lineHeight });

export const CANVASES: Record<CanvasId, CanvasPreset> = {
  social: {
    id: "social",
    width: 1080,
    height: 1350,
    layout: "stack",
    inline: false,
    margin: 64,
    column: 1080 - 2 * 64,
    columnGap: 0,
    headline: { ladder: [60, 52, 46], maxLines: 3, lineHeight: 1.06, weight: 900 },
    dek: R(24, 32 / 24),
    tick: R(20),
    axisTitle: B(20),
    legend: R(20, 1.5),
    source: R(17, 23 / 17),
    brand: { ...K(18), letterSpacing: 3 },
    permalink: R(18),
    label: B(19, 1.15),
    subjectLabel: K(26, 1.1),
    subjectNote: B(20, 1.15),
    scale: 1,
    minPlot: 480,
    gaps: { headline: 22, dek: 36, block: 22, tick: 10 },
  },
  og: {
    id: "og",
    width: 1200,
    height: 630,
    layout: "split",
    inline: false,
    margin: 48,
    column: 470,
    columnGap: 40,
    headline: { ladder: [46, 40, 34], maxLines: 5, lineHeight: 1.06, weight: 900 },
    dek: null,
    tick: R(15),
    axisTitle: B(15),
    legend: R(15, 1.45),
    source: R(14, 18 / 14),
    brand: { ...K(14), letterSpacing: 2.5 },
    permalink: R(14),
    label: B(15, 1.15),
    subjectLabel: K(20, 1.1),
    subjectNote: B(15, 1.15),
    scale: 0.6,
    minPlot: 380,
    gaps: { headline: 20, dek: 0, block: 16, tick: 8 },
  },
  "inline-wide": {
    id: "inline-wide",
    width: 760,
    height: 640,
    layout: "stack",
    inline: true,
    margin: 20,
    column: 760 - 2 * 20,
    columnGap: 0,
    headline: null,
    dek: null,
    tick: R(13),
    axisTitle: B(13),
    legend: R(13, 1.45),
    source: R(12, 16 / 12),
    brand: null,
    permalink: null,
    label: B(13, 1.15),
    subjectLabel: K(15, 1.1),
    subjectNote: B(12, 1.15),
    scale: 0.7,
    minPlot: 380,
    gaps: { headline: 0, dek: 0, block: 14, tick: 7 },
  },
  "inline-narrow": {
    id: "inline-narrow",
    width: 400,
    height: 560,
    layout: "stack",
    inline: true,
    margin: 12,
    column: 400 - 2 * 12,
    columnGap: 0,
    headline: null,
    dek: null,
    tick: R(11),
    axisTitle: B(11),
    legend: R(11, 1.45),
    source: R(11, 15 / 11),
    brand: null,
    permalink: null,
    label: B(12, 1.15),
    subjectLabel: K(13, 1.1),
    subjectNote: B(11, 1.15),
    scale: 0.37,
    minPlot: 240,
    gaps: { headline: 0, dek: 0, block: 10, tick: 6 },
  },
};

export function canvas(id: CanvasId): CanvasPreset {
  return CANVASES[id];
}
