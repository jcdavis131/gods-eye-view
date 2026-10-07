// What the studio reads from /api/news (app/api/news/route.ts), as the
// browser receives it. Types only: the page imports no server code.

import type { Fact } from "@/lib/news/facts";
import type { Rundown } from "@/lib/news/rundown";
import type { SegmentId, SlotStatus } from "@/lib/news/schedule";
import type { WireItem } from "@/lib/news/wire";

export interface RundownData {
  rundown: Rundown;
  chosen: "qwen3:8b" | "template";
  rejected: string[];
  disclosure: { fictional: string; writer: string; check: string };
  /** Every fact a line or a source card in the rundown cites. */
  facts: Fact[];
}

export interface WireOutletStatus {
  id: string;
  outlet: string;
  ok: boolean;
  items?: number;
  error?: string;
}

export interface WireData {
  items: WireItem[];
  outlets: WireOutletStatus[];
}

export interface ScheduleSlot {
  segment: { id: SegmentId; title: string };
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  facts: number;
  note?: string;
}

export interface ScheduleData {
  serverNow: string;
  slots: ScheduleSlot[];
}

export type { Fact, Rundown, WireItem };
