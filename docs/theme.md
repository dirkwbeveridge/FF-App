# Bud Iceman

A Chicago Bears theme laid over a frozen backdrop — navy and orange on glacial
blue, named for the team it dresses. Built to read at Soldier Field in December
and on a phone in a draft room.

## Color Palette

### Core — Chicago Bears

- **Bears Navy**: `#0B162A` — primary surface, the base everything sits on
- **Bears Orange**: `#C83803` — the only true accent; used for emphasis, never decoration
- **Bears Orange Bright**: `#E85A1F` — hover and active states, small highlights

### Ice — the "Iceman" layer

- **Deep Ice**: `#050B14` — page ground, darker than navy so panels lift off it
- **Glacier**: `#12233D` — raised panels
- **Rime**: `#1C3352` — borders and dividers
- **Frost**: `#7FB2D9` — muted text, secondary labels
- **Ice White**: `#E8F1FA` — primary text

### Data

Position colors keep their semantic roles and are tuned for contrast on navy:

- **QB**: `#F2A65A` · **RB**: `#5FD3A6` · **WR**: `#6FB3F2` · **TE**: `#C99BF0`
- **Good**: `#4FD1A5` · **Bad**: `#FF6B5E` · **Warn**: `#F2C14E`

## Background

A layered ice field rendered in CSS, no image files:

1. A radial glacial glow off the top-left, Bears navy fading to deep ice
2. A faint orange ember low-right, so the palette reads Bears rather than merely cold
3. Crystalline frost shards — thin diagonal linear-gradient strata at low opacity,
   suggesting cracked lake ice without competing with content
4. Fixed attachment, so the ice stays put while data scrolls over it

## Typography

- **Headers**: Oswald — condensed, athletic, close to a jersey numeral
- **Body / Data**: Inter, tabular figures on for every number that gets compared
  down a column

Both are self-hosted at build time via `next/font`, so the site makes no
external font requests and works offline on a phone.

## Contrast

Ice White on Deep Ice is 16.8:1. Frost on Glacier is 6.1:1. Bears Orange on
Deep Ice is 5.4:1 — used for headings and emphasis, not body copy. All pass
WCAG AA at the sizes used.

## Best Used For

Fantasy football, Chicago sports, cold-weather brands, anything that wants to
feel like a stadium in January rather than a dashboard.
