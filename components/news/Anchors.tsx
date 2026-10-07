// The three anchors, drawn procedurally in SVG from the design notes in
// lib/news/personas.ts. Original characters: a grey heron in tortoiseshell
// glasses and a teal cardigan, a sea otter in a mustard slicker with a cup
// anemometer on the hood, and a fennec fox in a green eyeshade with a pencil
// behind each ear. Nothing here is traced from or modelled on any existing
// character, person, show or brand.
//
// Each figure takes its mouth shape, whether its eyes are shut, where it is
// looking and whether it is speaking; the studio works those out from the
// clock (lib/news/anchorMotion.ts). Pure view: props in, markup out.

import type { Viseme } from "@/lib/news/anchorMotion";
import { OPENNESS } from "@/lib/news/anchorMotion";
import type { PersonaId } from "@/lib/news/personas";

export interface FigureProps {
  viseme: Viseme;
  blink: boolean;
  /** -1 left, 0 camera, 1 right (as the viewer sees it). */
  gaze: -1 | 0 | 1;
  speaking: boolean;
  /** Animate idle motion (breathing, the anemometer). Off for reduced motion. */
  animate: boolean;
}

const INK = "#11161c";
const MOUTH_DARK = "#3a1418";
const TONGUE = "#d9646f";
const TEETH = "#f4efe6";

/** A mammal's mouth at the origin, about 20 px wide, in one of the nine shapes. */
export function Mouth({ viseme, lip }: { viseme: Viseme; lip: string }) {
  const stroke = { stroke: lip, strokeWidth: 1.8, strokeLinecap: "round" as const, fill: "none" };
  let body: React.ReactNode;
  switch (viseme) {
    case "rest":
      body = <path d="M-8 0 Q0 3.2 8 0" {...stroke} />;
      break;
    case "MBP":
      body = <path d="M-8 1 L8 1" {...stroke} strokeWidth={2.6} />;
      break;
    case "AI":
      body = (
        <>
          <path d="M-9 -1 Q0 -3 9 -1 Q6 11 0 12 Q-6 11 -9 -1Z" fill={MOUTH_DARK} stroke={lip} strokeWidth={1.4} />
          <ellipse cx={0} cy={8.4} rx={4.6} ry={2.4} fill={TONGUE} />
        </>
      );
      break;
    case "E":
      body = (
        <>
          <path d="M-10 -1 Q0 -2 10 -1 Q7 6.5 0 6.5 Q-7 6.5 -10 -1Z" fill={MOUTH_DARK} stroke={lip} strokeWidth={1.4} />
          <path d="M-7 -0.6 L7 -0.6 L6.2 1.6 L-6.2 1.6Z" fill={TEETH} />
        </>
      );
      break;
    case "O":
      body = <ellipse cx={0} cy={4} rx={5.2} ry={6.2} fill={MOUTH_DARK} stroke={lip} strokeWidth={1.6} />;
      break;
    case "U":
      body = (
        <>
          <ellipse cx={0} cy={3} rx={4.6} ry={4} fill="none" stroke={lip} strokeWidth={2.4} />
          <ellipse cx={0} cy={3} rx={2.2} ry={2} fill={MOUTH_DARK} />
        </>
      );
      break;
    case "FV":
      body = (
        <>
          <path d="M-7 0 Q0 -1 7 0 Q5 5 0 5 Q-5 5 -7 0Z" fill={MOUTH_DARK} stroke={lip} strokeWidth={1.4} />
          <path d="M-5 -0.4 L5 -0.4 L4.4 2.6 L-4.4 2.6Z" fill={TEETH} />
          <path d="M-6 4.2 Q0 6.4 6 4.2" {...stroke} />
        </>
      );
      break;
    case "L":
      body = (
        <>
          <path d="M-8 -1 Q0 -2 8 -1 Q6 8 0 8.6 Q-6 8 -8 -1Z" fill={MOUTH_DARK} stroke={lip} strokeWidth={1.4} />
          <ellipse cx={0} cy={1.6} rx={3.8} ry={2} fill={TONGUE} />
        </>
      );
      break;
    case "etc":
      body = <path d="M-8 0 Q0 -1 8 0 Q5 4 0 4.2 Q-5 4 -8 0Z" fill={MOUTH_DARK} stroke={lip} strokeWidth={1.4} />;
      break;
  }
  return (
    <g className="news-mouth" data-viseme={viseme}>
      {body}
    </g>
  );
}

function Eye({ cx, cy, r, gaze, blink, iris, lid }: { cx: number; cy: number; r: number; gaze: number; blink: boolean; iris: string; lid: string }) {
  if (blink) return <path d={`M${cx - r} ${cy} Q${cx} ${cy + r * 0.55} ${cx + r} ${cy}`} stroke={lid} strokeWidth={1.8} fill="none" strokeLinecap="round" data-eye="shut" />;
  return (
    <g data-eye="open">
      <circle cx={cx} cy={cy} r={r} fill="#fbfaf6" />
      <circle cx={cx + gaze * r * 0.42} cy={cy + 0.3} r={r * 0.62} fill={iris} />
      <circle cx={cx + gaze * r * 0.42} cy={cy + 0.3} r={r * 0.32} fill={INK} />
      <circle cx={cx + gaze * r * 0.42 + r * 0.22} cy={cy - r * 0.22} r={r * 0.14} fill="#fff" />
    </g>
  );
}

// ---------------------------------------------------------------- Odessa Plume, grey heron

/** Beak parameters per shape: how far the lower mandible drops, and what shows inside. */
function beak(v: Viseme) {
  const open = OPENNESS[v];
  return { angle: open * 17, tongue: v === "L" || v === "AI", round: v === "O" || v === "U", teeth: v === "FV" || v === "E" };
}

export function Heron({ viseme, blink, gaze, animate }: FigureProps) {
  const b = beak(viseme);
  return (
    <g className={animate ? "news-breathe news-breathe-a" : undefined}>
      {/* teal cardigan with one oversized wooden button */}
      <path d="M52 262 C54 214 66 186 100 178 C134 186 146 214 148 262Z" fill="#1f7a7a" />
      <path d="M100 180 L92 262 M100 180 L108 262" stroke="#16605f" strokeWidth={3} />
      <path d="M88 182 Q100 196 112 182" fill="none" stroke="#d6dde4" strokeWidth={6} strokeLinecap="round" />
      <circle cx={100} cy={222} r={8.5} fill="#9a6a38" stroke="#6e4822" strokeWidth={2} />
      <circle cx={97.5} cy={220} r={1.3} fill="#6e4822" />
      <circle cx={102.5} cy={224} r={1.3} fill="#6e4822" />
      {/* long slate neck */}
      <g transform={`rotate(${gaze * 3} 100 178)`}>
        <path d="M100 182 C90 150 112 122 100 92" stroke="#8592a0" strokeWidth={24} fill="none" strokeLinecap="round" />
        <path d="M103 178 C96 152 112 126 104 98" stroke="#e7ecf0" strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.9} />
        {/* head */}
        <g transform={`translate(${gaze * 3} 0)`}>
          <ellipse cx={100} cy={74} rx={25} ry={21} fill="#9aa7b4" />
          <path d="M80 70 Q100 54 122 66" fill="none" stroke="#e7ecf0" strokeWidth={7} strokeLinecap="round" />
          {/* black stripe running back into the single crest plume */}
          <path d="M116 64 Q96 58 80 64 Q62 58 46 66 Q58 60 72 58" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
          <path d="M48 66 Q40 72 44 80" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <Eye cx={93} cy={74} r={5} gaze={gaze} blink={blink} iris="#e2b93b" lid="#5a6672" />
          <Eye cx={109} cy={73} r={5} gaze={gaze} blink={blink} iris="#e2b93b" lid="#5a6672" />
          {/* round tortoiseshell glasses */}
          <g fill="none" stroke="#7b4a24" strokeWidth={2.6}>
            <circle cx={93} cy={74} r={8.5} />
            <circle cx={109} cy={73} r={8.5} />
            <path d="M101.5 73.5 L100.5 73.5" />
          </g>
          <g fill="none" stroke="#b07a3e" strokeWidth={1} strokeDasharray="2 3">
            <circle cx={93} cy={74} r={8.5} />
            <circle cx={109} cy={73} r={8.5} />
          </g>
          {/* beak: the lower mandible drops with the mouth shape */}
          <g className="news-mouth" data-viseme={viseme}>
            {b.angle > 0.5 && <path d={`M118 82 L158 ${86 + b.angle * 0.9} L118 ${88 + b.angle * 0.5}Z`} fill={MOUTH_DARK} />}
            {b.tongue && b.angle > 0.5 && <path d={`M121 ${85 + b.angle * 0.2} L140 ${87 + b.angle * 0.5}`} stroke={TONGUE} strokeWidth={3} strokeLinecap="round" />}
            {b.round && <ellipse cx={124} cy={86 + b.angle * 0.3} rx={3.4} ry={2.6 + b.angle * 0.12} fill={MOUTH_DARK} />}
            <g transform={`rotate(${b.angle} 118 84)`}>
              <path d="M117 84 L160 86 L117 90Z" fill="#c98f2c" />
            </g>
            <path d="M116 78 L166 84 L116 85Z" fill="#e2a83a" />
            {b.teeth && b.angle > 0.5 && <path d="M120 85 L150 86" stroke="#f7d27a" strokeWidth={1.4} />}
          </g>
        </g>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------- Tully Brack, sea otter

export function Otter({ viseme, blink, gaze, speaking, animate }: FigureProps) {
  return (
    <g className={animate ? "news-breathe news-breathe-b" : undefined}>
      {/* mustard rain slicker */}
      <path d="M44 262 C46 210 64 176 100 172 C136 176 154 210 156 262Z" fill="#d6a21e" />
      <path d="M100 176 L100 262" stroke="#a87c12" strokeWidth={2.4} />
      {[196, 220, 244].map((y) => (
        <rect key={y} x={92} y={y} width={16} height={4} rx={2} fill="#6b4c10" />
      ))}
      {/* the flat river stone he uses as a clipboard */}
      <g transform="rotate(-8 126 222)">
        <ellipse cx={126} cy={222} rx={22} ry={13} fill="#8d969c" />
        <ellipse cx={122} cy={218} rx={13} ry={5} fill="#a6aeb4" />
        <path d="M112 224 L136 222 M114 229 L132 228" stroke="#eef1f2" strokeWidth={1.4} strokeLinecap="round" />
      </g>
      <ellipse cx={108} cy={230} rx={9} ry={7} fill="#7a4c2f" />
      <ellipse cx={140} cy={232} rx={9} ry={7} fill="#7a4c2f" />
      <g transform={`rotate(${gaze * 4} 100 150)`}>
        {/* hood up, even indoors */}
        <path d="M52 112 C50 62 76 40 100 40 C124 40 150 62 148 112 C150 150 128 166 100 166 C72 166 50 150 52 112Z" fill="#e3ad25" />
        <path d="M60 112 C60 72 80 54 100 54 C120 54 140 72 140 112" fill="none" stroke="#b78812" strokeWidth={3} />
        {/* cup anemometer clipped to the hood; spins while he talks */}
        <path d="M100 42 L100 28" stroke="#3b4248" strokeWidth={2.2} />
        <g transform="translate(100 28) scale(1 0.45)">
          <g data-spinning={animate && speaking ? "true" : "false"}>
            {animate && speaking && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite" />}
            {[0, 120, 240].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <path d="M0 0 L11 0" stroke="#3b4248" strokeWidth={1.6} />
                <circle cx={12} cy={0} r={3.4} fill="#cfd6db" stroke="#3b4248" strokeWidth={1} />
              </g>
            ))}
          </g>
        </g>
        {/* face */}
        <g transform={`translate(${gaze * 3} 0)`}>
          <circle cx={100} cy={106} r={36} fill="#8a5636" />
          <ellipse cx={100} cy={124} rx={24} ry={17} fill="#e9d3b4" />
          <ellipse cx={84} cy={93} rx={9} ry={7} fill="#a87452" opacity={0.6} />
          <ellipse cx={116} cy={93} rx={9} ry={7} fill="#a87452" opacity={0.6} />
          <Eye cx={86} cy={97} r={5.4} gaze={gaze} blink={blink} iris="#2a1a10" lid="#3d2416" />
          <Eye cx={114} cy={97} r={5.4} gaze={gaze} blink={blink} iris="#2a1a10" lid="#3d2416" />
          <path d="M93 112 Q100 107 107 112 Q104 118 100 118 Q96 118 93 112Z" fill={INK} />
          <g stroke="#f4ead8" strokeWidth={1} strokeLinecap="round">
            <path d="M80 124 L60 120 M80 128 L60 130 M120 124 L140 120 M120 128 L140 130" />
          </g>
          <g transform="translate(100 129)">
            <Mouth viseme={viseme} lip="#5a3020" />
          </g>
        </g>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------- Mott Ledgerly, fennec fox

export function Fox({ viseme, blink, gaze, animate }: FigureProps) {
  return (
    <g className={animate ? "news-breathe news-breathe-c" : undefined}>
      {/* white shirt, slate vest, sleeve garters */}
      <path d="M50 262 C52 212 68 182 100 176 C132 182 148 212 150 262Z" fill="#eef0ea" />
      <path d="M62 262 C64 222 76 196 92 186 L100 210 L108 186 C124 196 136 222 138 262Z" fill="#3e5166" />
      <rect x={52} y={222} width={14} height={6} rx={2} fill="#b8433a" />
      <rect x={134} y={222} width={14} height={6} rx={2} fill="#b8433a" />
      {/* embroidered patches of his own design */}
      <circle cx={80} cy={224} r={7} fill="#e2b14a" stroke="#f8e6b0" strokeWidth={1.4} />
      <path d="M80 219 L82 224 L80 229 L78 224Z" fill="#3e5166" />
      <rect x={113} y={214} width={13} height={13} rx={2} transform="rotate(12 119 220)" fill="#5aa38c" stroke="#d8efe6" strokeWidth={1.4} />
      <path d="M86 244 l6 -9 l6 9z" fill="#c4614a" stroke="#f3d3c8" strokeWidth={1.2} />
      <g transform={`rotate(${gaze * 4} 100 150)`}>
        {/* enormous ears he calls his antennae */}
        <path d="M78 84 L28 6 Q64 30 96 70Z" fill="#e2b676" />
        <path d="M74 76 L40 22 Q66 40 88 68Z" fill="#f4d3b3" />
        <path d="M122 84 L172 6 Q136 30 104 70Z" fill="#e2b676" />
        <path d="M126 76 L160 22 Q134 40 112 68Z" fill="#f4d3b3" />
        {/* a pencil behind each ear */}
        <g transform="rotate(-58 70 72)">
          <rect x={52} y={69} width={30} height={5} fill="#f2c230" />
          <path d="M82 69 L88 71.5 L82 74Z" fill="#e8c9a0" />
          <rect x={48} y={69} width={4} height={5} fill="#d07a8c" />
        </g>
        <g transform="rotate(58 130 72)">
          <rect x={118} y={69} width={30} height={5} fill="#f2c230" />
          <path d="M118 69 L112 71.5 L118 74Z" fill="#e8c9a0" />
          <rect x={148} y={69} width={4} height={5} fill="#d07a8c" />
        </g>
        <g transform={`translate(${gaze * 3} 0)`}>
          {/* head and cheeks */}
          <path d="M64 96 C64 70 84 60 100 60 C116 60 136 70 136 96 C136 120 118 140 100 142 C82 140 64 120 64 96Z" fill="#e7bd7f" />
          <path d="M70 108 C78 132 92 140 100 141 C108 140 122 132 130 108 C120 118 110 120 100 120 C90 120 80 118 70 108Z" fill="#fbf1e2" />
          <Eye cx={86} cy={98} r={5.6} gaze={gaze} blink={blink} iris="#4b2d14" lid="#7a5326" />
          <Eye cx={114} cy={98} r={5.6} gaze={gaze} blink={blink} iris="#4b2d14" lid="#7a5326" />
          {/* green eyeshade visor */}
          <path d="M66 86 Q100 66 134 86 L132 92 Q100 76 68 92Z" fill="#2f8f5b" />
          <path d="M64 90 Q100 74 136 90 Q140 100 128 98 Q100 88 72 98 Q60 100 64 90Z" fill="#3fae72" opacity={0.78} />
          <path d="M94 116 Q100 112 106 116 Q103 121 100 121 Q97 121 94 116Z" fill={INK} />
          <g transform="translate(100 130)">
            <Mouth viseme={viseme} lip="#6e4420" />
          </g>
        </g>
      </g>
    </g>
  );
}

export const FIGURES: Record<PersonaId, (p: FigureProps) => React.ReactNode> = { plume: Heron, brack: Otter, ledgerly: Fox };
