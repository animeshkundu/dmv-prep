# Design System - DMV Prep

The visual and interaction system for a calm, trustworthy, confidence-building prep app (the deliberate anti-thesis to cluttered DMV sites). Documented against the real tokens in [`src/styles/tokens.css`](../src/styles/tokens.css) and the base component styles in [`src/styles/global.css`](../src/styles/global.css).

- Related: [UX](./UX.md) · [Product Spec](./PRODUCT_SPEC.md) · [Architecture](./ARCHITECTURE.md)

---

## 1. Principles

- **Calm and trustworthy.** Generous spacing, one accent color, restrained elevation. Nothing shouts.
- **Content first.** Type and spacing carry the design; color is used sparingly and semantically.
- **Accessible by construction.** AA contrast, visible focus, 44px targets, reduced-motion, dark mode are defaults, not add-ons.
- **One source of truth.** All color/type/spacing/radius/elevation come from CSS custom properties in `tokens.css`. Components never hardcode raw values.

---

## 2. Color tokens

Defined in `tokens.css` for light (`:root`) and overridden for dark (`:root[data-theme='dark']`). All colors are chosen to meet WCAG 2.1 AA against their paired surfaces.

### Brand + accent

| Token | Light | Dark | Role |
|---|---|---|---|
| `--c-accent` | `#1f6feb` | `#4a90ff` | Primary actions, links, focus |
| `--c-accent-hover` | `#1a5fd0` | `#6aa5ff` | Hover state of accent |
| `--c-accent-contrast` | `#ffffff` | `#0b1220` | Text/icon on accent fills |
| `--c-accent-soft` | `#e7f0ff` | `#16233d` | Accent-tinted backgrounds, focus glow |

### Semantic (quiz feedback)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--c-pass` / `--c-pass-soft` | `#1a7f4b` / `#e3f6ec` | `#3fb27a` / `#10241a` | Correct answer, pass result |
| `--c-fail` / `--c-fail-soft` | `#c8332b` / `#fdecea` | `#f0665e` / `#2a1513` | Incorrect answer, fail result |
| `--c-warn` / `--c-warn-soft` | `#9a6700` / `#fff8e1` | `#e0a83a` / `#241d0a` | Stale-content / caution notices |

Pass/fail must never be conveyed by color alone. Pair with an icon (check/cross), text, and `aria-live` announcement.

### Neutral surfaces + text

| Token | Light | Dark | Role |
|---|---|---|---|
| `--c-bg` | `#f7f8fa` | `#0d1117` | Page background |
| `--c-surface` | `#ffffff` | `#161b22` | Cards, header, footer |
| `--c-surface-2` | `#f0f2f5` | `#1c232d` | Insets, ghost hover, badges |
| `--c-border` | `#d9dee5` | `#2c333d` | Hairlines, control borders |
| `--c-text` | `#1a1f26` | `#e6edf3` | Primary text |
| `--c-text-muted` | `#5a6472` | `#9aa5b1` | Secondary text |
| `--c-text-faint` | `#8a94a3` | `#6e7681` | Tertiary/placeholder |

---

## 3. Typography

System font stack (`--font-sans`) for zero-latency, native feel; `--font-mono` for citations/codes.

| Token | Value | Use |
|---|---|---|
| `--fs-xs` | `0.78rem` | Badges, captions, state codes |
| `--fs-sm` | `0.875rem` | Secondary text, nav, meta |
| `--fs-base` | `1rem` | Body |
| `--fs-lg` | `1.125rem` | Lede, card titles |
| `--fs-xl` | `clamp(1.25rem, 1.1rem + 0.7vw, 1.5rem)` | h3 |
| `--fs-2xl` | `clamp(1.6rem, 1.3rem + 1.5vw, 2.25rem)` | h2 |
| `--fs-3xl` | `clamp(2rem, 1.5rem + 2.6vw, 3rem)` | h1, 404 code |
| `--lh-tight` | `1.2` | Headings |
| `--lh-normal` | `1.55` | Body |

Headings are weight 700 with `-0.01em` tracking. The fluid `clamp()` sizes scale smoothly from mobile to desktop without breakpoints.

---

## 4. Spacing, radius, elevation

Spacing is a 4px-based scale; use tokens, never raw px.

| Spacing | Value | | Radius | Value |
|---|---|---|---|---|
| `--sp-1` | 0.25rem | | `--r-sm` | 6px |
| `--sp-2` | 0.5rem | | `--r-md` | 10px |
| `--sp-3` | 0.75rem | | `--r-lg` | 16px |
| `--sp-4` | 1rem | | `--r-full` | 999px |
| `--sp-5` | 1.5rem | | | |
| `--sp-6` | 2rem | | **Elevation** | |
| `--sp-8` | 3rem | | `--shadow-sm` | subtle card lift |
| `--sp-10` | 4rem | | `--shadow-md` | raised/hover |
| | | | `--shadow-lg` | modal/popover |

Layout tokens: `--container` (72rem), `--container-narrow` (48rem). Motion: `--transition` = `160ms cubic-bezier(0.4, 0, 0.2, 1)`. Focus: `--focus-ring` = `0 0 0 3px var(--c-accent-soft), 0 0 0 1px var(--c-accent)`.

---

## 5. Dark mode

- Toggled by `data-theme` on `<html>`, persisted to `localStorage` (`dmvp:theme`), applied pre-paint by an inline script in `BaseLayout.astro` to avoid a flash.
- The toggle (`Header.astro`) flips between explicit `light`/`dark`; with no stored preference it falls back to `prefers-color-scheme`.
- `@media (prefers-color-scheme: dark)` sets `color-scheme: dark` when the user has not explicitly chosen light, so form controls match.
- Dark shadows are darker/heavier to read against the dark surface.

---

## 6. Reduced motion

`global.css` honors `prefers-reduced-motion: reduce` globally: `scroll-behavior` becomes `auto` and all animations/transitions are cut to ~0ms. New components must not reintroduce essential motion that ignores this. Any motion must be decorative and safely removable.

---

## 7. Component inventory

Base component classes live in `global.css`; feature components compose these tokens.

### Buttons (`.btn`)

- Base `.btn`: inline-flex, weight 600, `--sp-3`/`--sp-5` padding, `--r-md`, **min-height 44px** (touch target), press feedback via `translateY(1px)` on `:active`.
- `.btn-primary`: accent fill, `--c-accent-contrast` text, hover -> `--c-accent-hover`.
- `.btn-ghost`: transparent, `--c-border` outline, hover -> `--c-surface-2`.
- Variants to add consistently: destructive (uses `--c-fail`), and a loading state (spinner + `aria-busy`, disabled interaction).

### Cards (`.card`)

Surface background, `--c-border` hairline, `--r-lg`, `--shadow-sm`. Used for the state picker, feature tiles, "why" panel, quiz shell, and result panels.

### Badges (`.badge`)

Pill (`--r-full`), `--fs-xs`, weight 600, `--c-surface-2` background. Use for review-status labels, "verified as of" chips, category tags. Semantic variants tint with pass/fail/warn soft backgrounds.

### Quiz option (feature component)

A selectable answer built on a native radio inside a `<fieldset>/<legend>` question group. States:

- Default: surface, border, comfortable padding, >=44px height.
- Hover/focus: accent border + `--c-accent-soft` tint (mirrors the state-grid link pattern in `index.astro`).
- Correct: `--c-pass` border + `--c-pass-soft` fill + check icon.
- Incorrect (chosen): `--c-fail` border + `--c-fail-soft` fill + cross icon; the correct option is also revealed as pass.
- Result is announced via `aria-live="polite"`.

### Progress meter (feature component)

A labeled bar for mastery/mock score. Track `--c-surface-2`, fill `--c-accent` (or `--c-pass`/`--c-fail` for pass/fail context). Always paired with a text value; never color-only.

### State card / state-grid entry

The picker entries in `index.astro`: a code chip (`--c-accent` on `--c-accent-soft`, min-width 34px) plus the state name, in a responsive `auto-fill minmax(150px, 1fr)` grid, each >=44px tall, hover -> accent border + soft fill.

---

## 8. Interaction states

Every interactive component must define all applicable states:

| State | Treatment |
|---|---|
| Hover | subtle background/border shift via `--transition` |
| Focus | `--focus-ring` (never removed; `outline: none` is only paired with the box-shadow ring in `global.css`) |
| Active | `translateY(1px)` press feedback on buttons |
| Disabled | reduced opacity, `cursor: not-allowed`, not focusable when truly inert |
| Loading | `aria-busy="true"`, spinner, interaction blocked |
| Empty | friendly copy + a primary next action (see [UX](./UX.md)) |
| Error | `--c-fail` accent, plain-language message, a recovery action |

---

## 9. Accessibility spec

Accessibility is a stated product feature (see [Product Spec](./PRODUCT_SPEC.md#513-accessibility-wcag-21-aa)). Requirements:

- **Contrast:** WCAG 2.1 AA - >=4.5:1 for body text, >=3:1 for large text and meaningful UI/graphical boundaries, verified against each token's paired surface in both themes.
- **Focus:** every focusable element shows `--focus-ring` via `:focus-visible`; focus is never suppressed without an equivalent visible indicator. A skip link (`.skip-link`) jumps to `#main`.
- **Touch targets:** interactive controls are >=44px (buttons, inputs, state links, quiz options all enforce `min-height: 44px`).
- **Keyboard model:** full keyboard operability. Quiz questions are native radios in a `<fieldset>` with a `<legend>`; arrow keys move within options, Tab moves between groups, Enter/Space activate. No keyboard trap. `main` is focusable (`tabindex="-1"`) so the skip link lands correctly.
- **`aria-live` for feedback:** answer correctness and mock results are announced in a polite live region so screen-reader users get the same instant feedback sighted users see.
- **Images:** sign SVGs carry accessible names; decorative emoji/icons are `aria-hidden`.
- **Motion:** `prefers-reduced-motion` fully honored (§6).
- **Verification:** automated axe/Lighthouse budgets in CI plus a **manual** pass (keyboard, screen reader, 200% zoom/reflow, print, Spanish). Automated tools cannot establish AA on their own; the manual pass is a release requirement.
