---
name: Electric Social
status: final
sources:
  - {planning_artifacts}/prds/prd-trash-game-2026-06-19/prd.md
updated: 2026-06-19
colors:
  surface: '#1a0b2e'
  surface-dim: '#1a0b2e'
  surface-bright: '#413257'
  surface-container-lowest: '#150629'
  surface-container-low: '#231437'
  surface-container: '#27183b'
  surface-container-high: '#322346'
  surface-container-highest: '#3d2e52'
  on-surface: '#eddcff'
  on-surface-variant: '#d4c0d7'
  inverse-surface: '#eddcff'
  inverse-on-surface: '#38294d'
  outline: '#9d8ba0'
  outline-variant: '#514255'
  surface-tint: '#ecb2ff'
  primary: '#ecb2ff'
  on-primary: '#520071'
  primary-container: '#bd00ff'
  on-primary-container: '#ffffff'
  inverse-primary: '#9900cf'
  secondary: '#ffffff'
  on-secondary: '#003828'
  secondary-container: '#36ffc4'
  on-secondary-container: '#007255'
  tertiary: '#d0cc05'
  on-tertiary: '#333200'
  tertiary-container: '#b3b000'
  on-tertiary-container: '#434100'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f8d8ff'
  primary-fixed-dim: '#ecb2ff'
  on-primary-fixed: '#320047'
  on-primary-fixed-variant: '#74009f'
  secondary-fixed: '#36ffc4'
  secondary-fixed-dim: '#00e1ab'
  on-secondary-fixed: '#002116'
  on-secondary-fixed-variant: '#00513c'
  tertiary-fixed: '#ede933'
  tertiary-fixed-dim: '#d0cc05'
  on-tertiary-fixed: '#1d1d00'
  on-tertiary-fixed-variant: '#4a4900'
  background: '#1a0b2e'
  on-background: '#eddcff'
  surface-variant: '#3d2e52'
typography:
  display-xl:
    fontFamily: Anybody
    fontSize: 96px
    fontWeight: '900'
    lineHeight: 100px
    letterSpacing: -0.04em
  display-lg:
    fontFamily: Anybody
    fontSize: 64px
    fontWeight: '800'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Anybody
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
  headline-lg-mobile:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  label-bold:
    fontFamily: Anybody
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  base-unit: 8px
  container-padding: 32px
  gutter: 24px
  stack-xl: 64px
  stack-md: 32px
  stack-sm: 16px
---

## Brand & Style

**"Electric Social."** Trash is a party at a table — family after a holiday meal, friends after dinner — and the phone is just the dealer. The design is built around one principle from the PRD: **eyes up, not down.** The app should recede so the people at the table are the show. A player glances at their phone for about ten seconds a round and spends the rest looking up, laughing.

The aesthetic resolves that principle as **restraint through fewer elements, not quieter color.** Surfaces are nearly empty — two huge buttons on your turn, a single name when you're waiting — but they're rendered in high-contrast neon on deep nocturnal purple so they read instantly at arm's length, across a table, in a dim living room, by older eyes. The energy is **good-natured and warm**: party energy, not nightclub edge. When someone loses, the moment teases; it never punishes. Massive tap targets feel physically satisfying; thick strokes and saturated accents replace subtle gradients and fine detail.

**Voice:** playful, inclusive, plainspoken. Abuela and the nine-year-old both have to feel invited and unconfused. Never "high-stakes," never "underground," never mean — those framings (including the generated manifest copy) are explicitly rejected in favor of the PRD's warm positioning. The loudest the product ever gets, in look or language, is the showdown reveal — that one beat is allowed to shout.

## Colors

The palette is anchored by a deep, nocturnal purple base to maintain depth, while interactive elements explode with neon vibrance. 

- **Primary**: A saturated Violet used for main brand moments and large surface areas.
- **Secondary**: A piercing Neon Mint reserved for "success" states, turn indicators, and primary CTAs.
- **Tertiary**: A high-energy Electric Yellow for critical warnings or secondary highlights.
- **Neutral**: The background is a "Deep Space" purple, providing much higher contrast than pure black, ensuring neon elements appear to glow without bleeding.

All text-on-background combinations must maintain WCAG AA compliance to ensure the interface remains accessible in chaotic environments.

## Typography

The typography system relies on **Anybody** for all display and headline roles. Its variable-width nature allows for ultra-bold, expressive weights that command attention. For body text, **Hanken Grotesk** provides a clean, contemporary balance that remains readable even when condensed.

- **Display Scales**: Used for "Huge Rank" displays and scoreboards.
- **Weight Strategy**: Avoid anything below 500 weight. The system should feel "heavy" and grounded.
- **Letter Spacing**: Display fonts use tight tracking to create a cohesive visual block.

## Layout & Spacing

This design system uses a **Fluid Content Model** with exaggerated internal padding. Elements are given significantly more breathing room than standard utility apps to account for "fat-finger" interactions and rapid visual scanning.

- **Grid**: A simplified 4-column grid for mobile and 8-column for tablet/desktop. 
- **Margins**: Generous 32px side margins ensure content doesn't feel cramped near the bezel.
- **Rhythm**: Vertical stacking follows a strict 8px multiple, with 32px being the default spacing between functional groups.

## Elevation & Depth

Depth is conveyed through **Tonal Stacking** and **High-Contrast Outlines** rather than soft shadows. 

1.  **Base**: Deep Space purple (#1A0B2E).
2.  **Surface**: A slightly lighter tint of the base purple to define card areas.
3.  **Active Stroke**: Instead of shadows, focused or active elements receive a 4px solid stroke of Neon Mint (`secondary-container` #36ffc4).
4.  **Inert State**: Use 2px semi-transparent white borders (10% opacity) to define boundaries without adding visual noise.

## Shapes

The shape language is defined by **Chunky Geometry**. High corner radii are applied to all interactive elements to make them feel friendly and "toy-like." 

Large containers and cards must use a minimum of 24px corner radius. Primary buttons should be fully pill-shaped (circular ends) to distinguish them as the most important touch targets on the screen. Smaller utility elements like chips use 12px radii.

## Components

> **Token note:** throughout, "Neon Mint" = the **`secondary-container`** token (`#36ffc4`), not `secondary` (which is white `#ffffff`). CTAs and active accents use `secondary-container`.

### Buttons
- **Primary**: Massive height (min 72px). Solid Neon Mint (`secondary-container` #36ffc4) background with black text (#000000) — 15.6:1, well past AA. No subtle hover states—active press should scale the button down to 95%.
- **Secondary**: 4px solid border in Primary Violet (`primary` #ecb2ff) with `on-surface` text.

### Cards (Simplified Display)
- Cards show a **big rank + suit pip** — readable across a table, not a tiny corner index, not photo-realistic.
- Use the **Display-XL** typography for the rank (`A 2 3 … 10 J Q K`). Ace reads as `A` and is the **lowest**; King `K` is the **highest**.
- A single large suit pip (♠ ♥ ♦ ♣) sits with the rank. Suit is **decorative only** — it never affects who loses (comparison is by rank value alone, per PRD FR-10). Reds (♥♦) and darks (♠♣) are distinguished by **shape, not color reliance** so the card is unambiguous for color-blind players against the dark surface.
- **Hidden (default) state:** the player's own card shows a face-down back — a flat neon-outlined panel, no rank visible. This is the resting state; the rank appears only while peeking (see EXPERIENCE.md peek interaction).
- **Loser highlight (Showdown):** the lowest card(s) are framed in the **Error** ramp (`error` #ffb4ab stroke / `error-container` fill) with a thick stroke and gentle scale-up, so the loser is unmistakable even among 20 revealed cards. The highlight is **stroke + scale + position**, never color alone. Computed by the app, never left to human scanning.
- **Receded (non-losing) cards** at Showdown dim to **no lower than 70% opacity** — enough to recede, never so faint that the rank drops below 4.5:1 against the surface. Faces stay legible; the loser just stands out more.

### Motion & Flash (showdown safety)
- The Showdown reveal is the one loud beat, but the **default** (not just Reduce-Motion) flip is **safe**: a single coordinated card-flip ≤400ms, then the loser highlight settles. **No strobe, no flashing, nothing that flashes more than 3 times per second, no full-viewport flash** — the audience includes kids and older adults in a dim room.
- Under **Reduce Motion**: skip the flip entirely (cards appear face-up instantly), skip the loser scale (highlight by stroke + position only), skip the turn-frame pulse.

### Lives Indicator
- A small row of pip tokens: **remaining Lives = filled** Neon Mint (`secondary-container` #36ffc4) circles; **spent Lives = hollow** outlined circles with a clear empty interior. Distinguished by **shape (filled vs. ring), not color alone**, so a color-blind or low-vision Player reads it instantly.
- Spent-pip outline uses `outline` (#9d8ba0, ~3.4:1 on `surface`) — **not** `outline-variant` (#514255, only 2.0:1, fails the 3:1 UI minimum). Never render a spent pip as a faint same-color dot.
- Never a bare number alone — the count must be glanceable across a table; pair pips with a numeral for ≥4 Lives.

### Host Conductor Bar & Controls
- **Conductor bar:** a Host-only bar, anchored at the bottom edge (thumb zone) of non-turn surfaces (Lobby, Waiting, Round Result). Holds the single phase-appropriate primary action — **Deal** / **Showdown** / **Re-deal** — as a Primary button, plus a small **⚙ controls** affordance (≥48dp) opening the controls overlay. It is **absent entirely** for non-Hosts and on the **Your Turn** screen.
- **Controls overlay:** a one-level modal sheet on `surface-container-high`. Contains the Lives stepper (1–5), the roster with a remove affordance per row (`error`-tinted, with a confirm), and a "Make someone else host" action (pick a Player from the roster). Closes back to the surface beneath; never stacks two deep.

### Room Code Display
- The 4-letter code in **Display-LG**, letter-spaced, on `surface-container-high`. Each letter in its own slot so it's easy to read aloud and type. The single most prominent element on the Lobby screen.

### Turn Indicator
- A full-width header bar or a thick (8px) frame around the entire viewport using Neon Mint (`secondary-container`).
- The slow pulse applies **only on the active Player's own "Your Turn" screen** — it signals "it's you, act now." The **Waiting** screen (someone else's turn) shows the active name in a *static* frame, no pulse, no motion — Waiting is the calmest surface.
- Pulse is a gentle opacity/scale breath (~1.2s cycle), never a flash. Disabled under Reduce Motion (static frame instead).

### Inputs & Toggles
- **Input Fields**: Thick 3px borders, 20px padding, and oversized cursor caret.
- **Switches**: Large "pill" toggles that change the entire background color of the track when active (Neon Mint `secondary-container` #36ffc4).

### List Items
- High vertical height (min 80px) with 24px internal padding and separated by large 16px gaps (not just lines) to create a "floating card" list effect.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep screens sparse — restraint is **fewer elements**, not muted color | Add feeds, chat, badges, idle content, or anything to scroll between turns |
| Two huge buttons (Swap / Keep) and nothing else on the active-turn screen | Crowd the turn screen with stats, hints, timers, or host controls |
| Reserve the loudest color, motion, and copy for the **Showdown** | Animate or pulse the calm Waiting screen — it should stay quiet |
| Warm, playful, inclusive voice — Abuela and a 9-year-old both feel invited | "High-stakes," "underground," edgy, or mean framing (reject the generated manifest copy) |
| Compute and highlight the loser; tease them gently | Make the loser feel punished; rely on humans to eyeball 20 cards |
| High contrast meeting WCAG AA on the dark surface; ≥48dp targets | Low-contrast neon-on-neon; small or crowded tap targets |
| Keep a player's card hidden by default, revealed only on an explicit peek | Persistently display any card value; leak a card through layout or state |
| Distinguish suits by shape, not color alone | Depend on red/black color to convey suit |
