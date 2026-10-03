# Design tokens

Single source: `src/styles/design-tokens.css`, imported by `src/app/globals.css`. Tailwind utilities
(`bg-background`, `text-muted-foreground`, `bg-primary`, `text-gold`, ...) come from the `@theme inline`
mapping in `globals.css`. Components never use palette primitives (`ink-*`, `vellum-*`, `gold-*`) directly.

## Identity kept, polish added (Q13)
- **Kept:** obsidian-and-ash dark, warm-vellum light, imperial gold accent, Cinzel / EB Garamond / Inter.
- **Refreshed:** one more surface layer (background, card, popover), calmer decorative borders with a stronger
  `--input` border for controls, higher-contrast muted and meta text, a 12px base radius (`--radius: 0.75rem`),
  three elevation levels (`--shadow-1/2/3`), one gold focus ring (`--ring`), shared motion durations
  (150 / 250 / 400 ms) and easing, and Motion presets in `src/lib/motion.ts`.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64 px only (Tailwind steps 1, 2, 3, 4, 6, 8, 12, 16).

## Measured contrast (WCAG 2.x), regenerated with `npx tsx scripts/check-contrast.ts --markdown`
Asserted in CI by `tests/design-tokens.spec.ts`. Text pairs need 4.5:1; control borders and focus rings 3:1.

| Pair | Role | Min | Light | Dark |
|---|---|---|---|---|
| foreground on background | body text | 4.5:1 | 14.80 | 15.98 |
| card-foreground on card | card text | 4.5:1 | 16.25 | 15.06 |
| popover-foreground on popover | popover text | 4.5:1 | 16.38 | 14.25 |
| muted-foreground on background | muted text on page | 4.5:1 | 7.00 | 8.16 |
| muted-foreground on card | muted text on card | 4.5:1 | 7.69 | 7.69 |
| muted-foreground on muted | muted text on sunken surface | 4.5:1 | 6.35 | 7.36 |
| faint-foreground on background | meta text on page | 4.5:1 | 5.48 | 5.05 |
| faint-foreground on card | meta text on card | 4.5:1 | 6.02 | 4.76 |
| primary-foreground on primary | primary button label | 4.5:1 | 5.60 | 8.65 |
| primary on background | primary used as text | 4.5:1 | 5.06 | 9.03 |
| gold on background | gold accent text on page | 4.5:1 | 5.06 | 9.03 |
| gold on card | gold accent text on card | 4.5:1 | 5.56 | 8.51 |
| link on background | link on page | 4.5:1 | 5.64 | 11.70 |
| link on card | link on card | 4.5:1 | 6.20 | 11.03 |
| secondary-foreground on secondary | secondary button label | 4.5:1 | 10.15 | 13.23 |
| accent-foreground on accent | hover surface text | 4.5:1 | 12.59 | 12.92 |
| destructive on background | error text on page | 4.5:1 | 5.89 | 6.75 |
| destructive-foreground on destructive | destructive button label | 4.5:1 | 6.52 | 6.46 |
| secret on background | secret marker text | 4.5:1 | 5.88 | 8.59 |
| success on background | success text | 4.5:1 | 5.63 | 10.10 |
| sidebar-foreground on sidebar | sidebar text | 4.5:1 | 13.91 | 15.56 |
| sidebar-accent-foreground on sidebar-accent | sidebar active item | 4.5:1 | 12.24 | 13.97 |
| input on background | form control border on page | 3:1 | 3.70 | 3.75 |
| input on card | form control border on card | 3:1 | 4.07 | 3.54 |
| ring on background | focus ring on page | 3:1 | 5.06 | 9.03 |
| ring on card | focus ring on card | 3:1 | 5.56 | 8.51 |
