# Design tokens

Single source: `src/styles/design-tokens.css`, imported by `src/app/globals.css`. Tailwind utilities
(`bg-background`, `text-muted-foreground`, `bg-signal`, `bg-plate`, `text-brass`, ...) come from the `@theme inline`
mapping in `globals.css`. Components never use palette primitives (`carbon-*`, `parchment-*`, `periwinkle-*`,
`signal-*`, `amber-*`, `seal-*`) directly; the design gate rejects them outside the token file.

## Identity: a Notion page in a Nintendo shell, set in Asetheria (2026-10-23)
Approved from the style board (claude.ai artifact "Asetheria Restyle Board").
- **Notion:** calm pages, a quiet sidebar, page icons beside titles, property-style tags, long prose in EB Garamond.
- **Nintendo.com 2001:** a carbon command bar with a halftone grille and an amber sill (`chrome-bar`), bevelled
  periwinkle plates and buttons that press down 3px (`bevel`), outlined box-art lettering (`wordmark`), small
  pixel legends in Silkscreen (`pixel-label`), plate headers on panels (`PlateHeader`).
- **Fantasy:** parchment by day, a carbon keep by night, brass for tools and marks, seal red only for DM secrets.
- **Colour roles:** signal orange (`bg-signal`) only on actions that move you forward (the default button);
  periwinkle plate (`bg-plate`) for secondary actions and panel heads; brass (`bg-brass`, token `--amber`) for
  page icons and the current place; indigo (`primary`, `link`) for links and selected things.
- **Depth** is a hard offset (`--shadow-1/2/3`), never a soft blur. **Radius** is 8px (`--radius: 0.5rem`).
- **Fonts:** Cinzel (display and wordmark), EB Garamond (prose), Figtree (interface), Silkscreen (chrome labels).
- **Command bar:** `.chrome-scope` gives the header the night palette in both themes; the `dark:` variant matches it.
- **Focus:** bevelled controls own their box-shadow, so they show focus with a 3px outline in `--ring`; text fields
  show the bevel only at rest (`inset-field`), so the focus ring always wins.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64 px only (Tailwind steps 1, 2, 3, 4, 6, 8, 12, 16). The design gate
  rejects arbitrary spacing values (`p-[13px]`).
- **Enforcement:** `npm run check:design` runs the static gates; `tests/a11y.spec.ts` runs axe on the key routes in
  both themes after the entrance animations settle.

## Measured contrast (WCAG 2.x), regenerated with `npx tsx scripts/check-contrast.ts --markdown`
Asserted in CI by `tests/design-tokens.spec.ts`. Text pairs need 4.5:1; control borders, focus rings and icons 3:1.

| Pair | Role | Min | Light | Dark |
|---|---|---|---|---|
| foreground on background | body text | 4.5:1 | 13.20 | 14.65 |
| card-foreground on card | card text | 4.5:1 | 14.92 | 13.36 |
| popover-foreground on popover | popover text | 4.5:1 | 15.56 | 11.94 |
| muted-foreground on background | muted text on page | 4.5:1 | 6.50 | 8.26 |
| muted-foreground on card | muted text on card | 4.5:1 | 7.35 | 7.53 |
| muted-foreground on muted | muted text on sunken surface | 4.5:1 | 6.09 | 7.26 |
| faint-foreground on background | meta text on page | 4.5:1 | 5.80 | 6.68 |
| faint-foreground on card | meta text on card | 4.5:1 | 6.56 | 6.09 |
| faint-foreground on muted | meta text on sunken surface | 4.5:1 | 5.43 | 5.88 |
| faint-foreground on secondary | meta text on a secondary badge | 4.5:1 | 5.08 | 5.22 |
| faint-foreground on accent | meta text on hover / active rows | 4.5:1 | 5.47 | 4.74 |
| muted-foreground on accent | muted text on hover / active rows | 4.5:1 | 6.13 | 5.86 |
| muted-foreground on secondary | muted text on a secondary badge | 4.5:1 | 5.69 | 6.45 |
| gold on muted | gold icon on a sunken tile | 3:1 | 5.07 | 7.97 |
| gold on accent | gold icon on hover / active rows | 3:1 | 5.10 | 6.43 |
| secret on card | secret marker text on card | 4.5:1 | 7.69 | 7.37 |
| primary-foreground on primary | primary button label | 4.5:1 | 7.47 | 9.76 |
| primary on background | primary used as text | 4.5:1 | 6.34 | 9.76 |
| gold on background | gold accent text on page | 4.5:1 | 5.41 | 9.06 |
| gold on card | gold accent text on card | 4.5:1 | 6.12 | 8.26 |
| link on background | link on page | 4.5:1 | 7.37 | 10.29 |
| link on card | link on card | 4.5:1 | 8.33 | 9.38 |
| secondary-foreground on secondary | secondary button label | 4.5:1 | 10.26 | 11.45 |
| accent-foreground on accent | hover surface text | 4.5:1 | 12.46 | 11.17 |
| destructive on background | error text on page | 4.5:1 | 6.27 | 7.98 |
| destructive-foreground on destructive | destructive button label | 4.5:1 | 7.39 | 7.98 |
| secret on background | secret marker text | 4.5:1 | 6.80 | 8.09 |
| success on background | success text | 4.5:1 | 5.42 | 10.24 |
| sidebar-foreground on sidebar | sidebar text | 4.5:1 | 12.02 | 15.17 |
| sidebar-accent-foreground on sidebar-accent | sidebar active item | 4.5:1 | 10.66 | 9.36 |
| input on background | form control border on page | 3:1 | 3.78 | 4.76 |
| input on card | form control border on card | 3:1 | 4.27 | 4.34 |
| ring on background | focus ring on page | 3:1 | 3.89 | 7.59 |
| ring on card | focus ring on card | 3:1 | 4.40 | 6.92 |
