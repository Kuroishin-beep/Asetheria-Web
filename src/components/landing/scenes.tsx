"use client";

import { motion } from "motion/react";
import { still, useParallax, useScene } from "@/components/landing/use-scene";
import { cn } from "@/lib/utils";

/**
 * The landing page's scenes: original vector art in the theme's own colours,
 * so they follow light and dark with no extra work. They set a mood (misty
 * peaks and a long road; a green hill with a round door and a warm window; a
 * harbour of white columns under a lighthouse; a map that unrolls) and borrow
 * nothing from any book or film. All of it is decoration: hidden from assistive
 * technology, motion only on transform and opacity, loops only while on
 * screen, and nothing moves at all when the visitor prefers reduced motion.
 */

const frame = "relative overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/10";
const loop = { repeat: Infinity, ease: "easeInOut", repeatType: "reverse" } as const;

/** Deterministic points, so server and client draw the same sky. */
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 197 + 61) % 1180 + 10, y: (i * 89 + 23) % 250 + 12, r: 0.9 + ((i * 7) % 5) * 0.35, d: (i % 7) * 0.5 }));
const FIREFLIES = Array.from({ length: 14 }, (_, i) => ({ x: 130 + ((i * 211) % 900), y: 250 + ((i * 97) % 220), d: (i % 6) * 0.7, dx: (i % 2 ? 1 : -1) * (14 + (i % 4) * 6) }));

type Star = (typeof STARS)[number];

/**
 * Stars that twinkle as two groups, not one animation each: every animated
 * element costs frame time on a slow phone, a group costs one.
 */
function Twinkle({ stars, on, low, high }: { stars: Star[]; on: boolean; low: number; high: number }) {
  return (
    <>
      {[0, 1].map((g) => (
        <motion.g key={g} animate={on ? { opacity: [low, high, low] } : { opacity: 0.4 }} transition={still(on, { duration: 3.4 + g * 1.7, repeat: Infinity, ease: "easeInOut", delay: g * 0.9 })}>
          {stars.filter((_, i) => i % 2 === g).map((s) => (
            <circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} className="fill-foreground" />
          ))}
        </motion.g>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. The road at dawn: layered peaks, a rising sun, drifting mist, a long road
// ---------------------------------------------------------------------------

export function RoadAtDawn() {
  const { ref, reduced, motionOn, inView, progress } = useScene();
  const sunStyle = { y: useParallax(progress, 46, reduced) };
  const farStyle = { y: useParallax(progress, 16, reduced) };
  const midStyle = { y: useParallax(progress, 30, reduced) };
  const nearStyle = { y: useParallax(progress, 52, reduced) };
  return (
    <div ref={ref} className={frame} data-scene="road">
      <svg viewBox="0 0 1200 560" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="sky-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--card)" />
            <stop offset="0.65" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--muted)" />
          </linearGradient>
        </defs>
        <rect width="1200" height="560" fill="url(#sky-road)" />
        {STARS.slice(0, 22).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} className="fill-foreground" opacity={0.28} />
        ))}
        <motion.g style={sunStyle}>
          <circle cx="820" cy="250" r="86" className="fill-primary" opacity={0.22} />
          <circle cx="820" cy="250" r="52" className="fill-primary" opacity={0.85} />
        </motion.g>
        <motion.g style={farStyle}>
          <path d="M0 330 L110 250 L190 300 L300 205 L420 310 L520 235 L640 320 L760 225 L880 300 L1000 215 L1100 290 L1200 245 L1200 560 L0 560 Z" className="fill-chart-5" opacity={0.22} />
        </motion.g>
        <motion.g style={midStyle}>
          <path d="M0 380 L90 320 L170 360 L290 280 L400 372 L520 300 L640 380 L770 292 L880 372 L1010 300 L1200 390 L1200 560 L0 560 Z" className="fill-chart-5" opacity={0.42} />
        </motion.g>
        {[
          { cx: 260, cy: 392, rx: 360, ry: 24, dx: 34 },
          { cx: 900, cy: 430, rx: 420, ry: 28, dx: -40 },
          { cx: 560, cy: 470, rx: 480, ry: 22, dx: 26 },
        ].map((m, i) => (
          <motion.ellipse key={i} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} className="fill-foreground" opacity={0.07} animate={motionOn ? { x: [-m.dx, m.dx] } : { x: 0 }} transition={still(motionOn, { duration: 16 + i * 4, ...loop })} />
        ))}
        <motion.g style={nearStyle}>
          <path d="M0 450 L120 395 L230 440 L360 370 L470 450 L600 400 L720 460 L860 390 L990 455 L1100 410 L1200 460 L1200 560 L0 560 Z" className="fill-chart-5" opacity={0.7} />
          <path d="M0 500 C 200 470 380 520 600 490 C 820 460 1000 510 1200 480 L1200 560 L0 560 Z" className="fill-background" />
          <motion.path
            d="M610 560 C 560 520 690 500 640 470 C 590 440 700 424 660 398"
            className="stroke-primary"
            fill="none"
            strokeWidth={9}
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: reduced || inView ? 1 : 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          />
        </motion.g>
        {[0, 1].map((i) => (
          <motion.path key={i} d={`M0 ${150 + i * 34} q 9 -9 18 0 q 9 -9 18 0`} className="stroke-foreground" fill="none" strokeWidth={2} strokeLinecap="round" opacity={0.5} animate={motionOn ? { x: [-60, 1260] } : { x: 300 + i * 220 }} transition={still(motionOn, { duration: 34 + i * 7, repeat: Infinity, ease: "linear", delay: i * 4 })} />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. The hearth hills: a round door in a green hill, a warm window, smoke, fireflies
// ---------------------------------------------------------------------------

export function HearthHills() {
  const { ref, reduced, motionOn, progress } = useScene();
  const backStyle = { y: useParallax(progress, 20, reduced) };
  const hillStyle = { y: useParallax(progress, 38, reduced) };
  return (
    <div ref={ref} className={frame} data-scene="hearth">
      <svg viewBox="0 0 1200 560" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="sky-hearth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--muted)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
          <radialGradient id="glow-hearth" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="560" fill="url(#sky-hearth)" />
        <Twinkle stars={STARS.slice(22)} on={motionOn} low={0.15} high={0.7} />
        <motion.g style={backStyle}>
          <path d="M0 400 C 150 330 300 350 460 390 C 640 430 820 340 1000 370 C 1100 388 1160 380 1200 372 L1200 560 L0 560 Z" className="fill-chart-2" opacity={0.35} />
        </motion.g>
        <motion.g style={hillStyle}>
          <path d="M120 560 C 140 400 330 300 560 300 C 790 300 980 400 1010 560 Z" className="fill-chart-2" opacity={0.85} />
          <ellipse cx="560" cy="430" rx="190" ry="130" fill="url(#glow-hearth)" />
          <circle cx="560" cy="430" r="86" className="fill-chart-5" />
          <circle cx="560" cy="430" r="72" className="fill-primary" />
          <circle cx="560" cy="430" r="58" className="fill-background" opacity={0.35} />
          <circle cx="590" cy="432" r="7" className="fill-chart-4" />
          <rect x="396" y="388" width="46" height="56" rx="23" className="fill-primary" opacity={0.9} />
          <rect x="400" y="392" width="38" height="48" rx="19" className="fill-card" opacity={0.25} />
          <rect x="676" y="300" width="22" height="46" className="fill-chart-5" />
          {[0, 1].map((i) => (
            <motion.circle key={i} cx={687} cy={296} r={8 + i * 3} className="fill-foreground" initial={{ opacity: 0 }} animate={motionOn ? { y: [0, -80 - i * 14], x: [0, 14 + i * 8], opacity: [0.5, 0] } : { y: -16 - i * 14, opacity: 0.22 }} transition={still(motionOn, { duration: 5 + i, repeat: Infinity, ease: "easeOut", delay: i * 1.6 })} />
          ))}
          <path d="M560 502 C 540 530 500 540 470 560 L650 560 C 620 540 580 530 560 502 Z" className="fill-accent" opacity={0.9} />
        </motion.g>
        {[{ x: 150, h: 120 }, { x: 960, h: 150 }, { x: 1060, h: 100 }].map((t, i) => (
          <g key={i}>
            <rect x={t.x - 4} y={560 - t.h * 0.4} width="8" height={t.h * 0.4} className="fill-chart-5" />
            <path d={`M${t.x} ${560 - t.h} l 36 ${t.h * 0.7} h -72 z`} className="fill-chart-2" opacity={0.95} />
          </g>
        ))}
        {FIREFLIES.slice(0, 6).map((f, i) => (
          <motion.circle key={i} cx={f.x} cy={f.y} r={3} className="fill-primary" initial={{ opacity: 0 }} animate={motionOn ? { x: [0, f.dx, 0], y: [0, -18, 0], opacity: [0, 1, 0] } : { opacity: 0.55 }} transition={still(motionOn, { duration: 6 + (i % 5), repeat: Infinity, delay: f.d })} />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. The sea-gate: columns, a lighthouse, rolling waves, a trident in the stars
// ---------------------------------------------------------------------------

const TRIDENT = [
  [880, 70, 880, 170],
  [850, 70, 850, 110],
  [910, 70, 910, 110],
  [850, 110, 910, 110],
  [880, 170, 880, 200],
];

export function SeaGate() {
  const { ref, reduced, motionOn, progress } = useScene();
  const columnsStyle = { y: useParallax(progress, 24, reduced) };
  const seaStyle = { y: useParallax(progress, 40, reduced) };
  return (
    <div ref={ref} className={frame} data-scene="seagate">
      <svg viewBox="0 0 1200 560" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="sky-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--card)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <rect width="1200" height="560" fill="url(#sky-sea)" />
        <Twinkle stars={STARS} on={motionOn} low={0.2} high={0.8} />
        {TRIDENT.map(([x1, y1, x2, y2], i) => (
          <motion.line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-primary" strokeWidth={2.2} strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: reduced || motionOn ? 1 : 0.6 }} transition={{ duration: 1.8, delay: i * 0.25 }} />
        ))}
        {[[850, 70], [910, 70], [880, 70], [880, 170]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4.5} className="fill-primary" />
        ))}
        <motion.g style={columnsStyle}>
          <polygon points="150,250 380,250 265,196" className="fill-chart-5" opacity={0.85} />
          <rect x="150" y="250" width="230" height="16" className="fill-chart-5" opacity={0.9} />
          {[170, 218, 266, 314, 352].map((x) => (
            <g key={x}>
              <rect x={x} y="266" width="18" height="150" className="fill-foreground" opacity={0.78} />
              <rect x={x - 5} y="266" width="28" height="9" className="fill-foreground" opacity={0.9} />
              <rect x={x - 5} y="408" width="28" height="9" className="fill-foreground" opacity={0.9} />
            </g>
          ))}
          <rect x="140" y="416" width="250" height="14" className="fill-chart-5" />
        </motion.g>
        <g>
          <polygon points="1030,430 1062,430 1052,250 1040,250" className="fill-foreground" opacity={0.85} />
          <rect x="1030" y="320" width="32" height="14" className="fill-chart-4" />
          <rect x="1026" y="236" width="40" height="16" className="fill-chart-5" />
          <circle cx="1046" cy="226" r="11" className="fill-primary" />
          <motion.polygon
            points="1046,226 1210,170 1210,282"
            className="fill-primary"
            style={{ originX: 0, originY: 0.5 }}
            animate={motionOn ? { opacity: [0.04, 0.34, 0.04], rotate: [-8, 8, -8] } : { opacity: 0.16, rotate: 0 }}
            transition={still(motionOn, { duration: 7, repeat: Infinity, ease: "easeInOut" })}
          />
        </g>
        <motion.g style={seaStyle}>
          <rect x="0" y="420" width="1200" height="140" className="fill-chart-5" opacity={0.55} />
          {[0, 1, 2, 3].map((i) => (
            <motion.path
              key={i}
              d={`M-100 ${440 + i * 28} q 50 -22 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0`}
              className="stroke-foreground"
              fill="none"
              strokeWidth={2.4}
              opacity={0.22 + i * 0.07}
              animate={motionOn ? { x: i % 2 ? [-50, 0] : [0, -50] } : { x: 0 }}
              transition={still(motionOn, { duration: 6 + i * 1.5, repeat: Infinity, ease: "linear" })}
            />
          ))}
        </motion.g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. The map unrolls: parchment, an invented coast, a dotted route to an X
// ---------------------------------------------------------------------------

export function MapUnrolls() {
  const { ref, reduced, inView } = useScene();
  const open = reduced || inView;
  return (
    <div ref={ref} className={cn(frame, "bg-muted")} data-scene="map">
      <svg viewBox="0 0 1200 520" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <motion.g initial={reduced ? false : { scaleY: 0.15, opacity: 0 }} animate={open ? { scaleY: 1, opacity: 1 } : { scaleY: 0.15, opacity: 0 }} transition={{ duration: 1.1, ease: "easeOut" }} style={{ originX: 0.5, originY: 0.5 }}>
          <path d="M60 60 L1140 50 L1150 470 L50 462 Z" className="fill-card" />
          <path d="M60 60 L1140 50 L1150 470 L50 462 Z" fill="none" className="stroke-border" strokeWidth={3} />
          <path d="M150 300 C 200 190 330 150 430 190 C 520 226 560 150 660 160 C 790 172 800 270 900 290 C 1000 310 1060 260 1040 340 C 1020 410 880 400 780 380 C 680 360 620 430 500 410 C 380 390 250 440 190 380 C 160 350 140 330 150 300 Z" className="fill-chart-2" opacity={0.35} />
          <path d="M150 300 C 200 190 330 150 430 190 C 520 226 560 150 660 160 C 790 172 800 270 900 290 C 1000 310 1060 260 1040 340 C 1020 410 880 400 780 380 C 680 360 620 430 500 410 C 380 390 250 440 190 380 C 160 350 140 330 150 300 Z" fill="none" className="stroke-chart-5" strokeWidth={3} />
          {[[320, 230], [470, 260], [600, 220], [740, 250], [860, 330]].map(([x, y], i) => (
            <path key={i} d={`M${x - 16} ${y + 12} L${x} ${y - 16} L${x + 16} ${y + 12} Z`} className="fill-chart-5" opacity={0.7} />
          ))}
          <motion.path d="M250 350 C 340 320 400 300 470 330 C 560 366 640 300 720 290 C 800 280 860 310 900 330" fill="none" className="stroke-primary" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 12" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: open ? 1 : 0 }} transition={{ duration: 3.2, delay: 0.9, ease: "easeInOut" }} />
          <motion.g initial={reduced ? false : { opacity: 0, scale: 0.4 }} animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }} transition={{ delay: 4, duration: 0.5 }} style={{ originX: "900px", originY: "330px" }}>
            <path d="M884 314 L916 346 M916 314 L884 346" className="stroke-chart-4" strokeWidth={7} strokeLinecap="round" />
          </motion.g>
          <g className="fill-chart-5" opacity={0.65}>
            <circle cx="1060" cy="120" r="34" fill="none" className="stroke-chart-5" strokeWidth={2} />
            <path d="M1060 90 L1066 120 L1060 150 L1054 120 Z" />
            <path d="M1030 120 L1060 114 L1090 120 L1060 126 Z" />
          </g>
        </motion.g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. The empires' banners: a cloth on a pole that stirs in a breeze
// ---------------------------------------------------------------------------

type Emblem = "imperium-invicta" | "hellenoria" | "acheaoria";
const BANNER_FILL: Record<Emblem, string> = { "imperium-invicta": "fill-chart-4", hellenoria: "fill-chart-2", acheaoria: "fill-chart-1" };

export function EmpireBanner({ emblem }: { emblem: Emblem }) {
  const { ref, motionOn } = useScene();
  return (
    <div ref={ref} className="mx-auto w-28" data-banner={emblem}>
      <svg viewBox="0 0 120 150" className="block h-auto w-full" aria-hidden="true" focusable="false">
        <rect x="14" y="8" width="5" height="138" rx="2" className="fill-chart-5" />
        <circle cx="16.5" cy="8" r="6" className="fill-primary" />
        <motion.g style={{ originX: "19px", originY: "30px" }} animate={motionOn ? { skewY: [-3.5, 3.5], scaleX: [1, 0.96] } : { skewY: 0, scaleX: 1 }} transition={still(motionOn, { duration: 3.2, ...loop })}>
          <path d="M19 22 L108 22 L108 112 L63 96 L19 112 Z" className={BANNER_FILL[emblem]} />
          {emblem === "imperium-invicta" && (
            <g className="fill-card" opacity={0.92}>
              <rect x="46" y="44" width="7" height="42" />
              <rect x="64" y="44" width="7" height="42" />
              <rect x="82" y="44" width="7" height="42" />
              <rect x="40" y="38" width="55" height="7" />
            </g>
          )}
          {emblem === "hellenoria" && (
            <g fill="none" className="stroke-card" strokeWidth={5} strokeLinecap="round" opacity={0.92}>
              <path d="M34 56 q 10 -12 20 0 t 20 0 t 20 0" />
              <path d="M34 74 q 10 -12 20 0 t 20 0 t 20 0" />
            </g>
          )}
          {emblem === "acheaoria" && (
            <g className="fill-card" opacity={0.92}>
              <circle cx="63" cy="64" r="15" />
              {Array.from({ length: 8 }, (_, i) => (
                <rect key={i} x="61" y="36" width="4" height="9" rx="2" transform={`rotate(${i * 45} 63 64)`} />
              ))}
            </g>
          )}
        </motion.g>
      </svg>
    </div>
  );
}
