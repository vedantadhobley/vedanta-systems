# UI Patterns & Solutions

Status: current-production behavior and migration evidence. The
[frontend re-foundation plan](../../docs/plans/frontend-refoundation.md) and
[interface design system](../../docs/design-system.md) govern new shared
components. Preserve the verified behavior here, but do not promote every
implementation detail into the new API.

This document describes established patterns in the current codebase,
including hard-won solutions to cross-platform interaction issues.

---

## 🔘 Interactive Buttons (CSS-Only Pattern)

### The Problem
We spent **weeks** trying to get consistent hover/active states on buttons across desktop and mobile. React state-based solutions (`useState` for hover/pressed`) caused:
- Touch events not releasing properly on iOS
- Flickering states
- Inconsistent behavior between browsers
- Complex event handler logic that was hard to maintain

### The Solution: Pure CSS with `.nav-btn` and `.text-btn`

**Location:** Global styles defined in `/src/components/header.tsx` (BottomNav component)

**Key insight:** CSS `:hover` and `:active` pseudo-classes work reliably across all platforms when used correctly:
- Use `@media (hover: hover)` to apply hover styles **only on devices that support hover** (desktop)
- Use `:active` for the pressed state - works on both touch and mouse
- **Critical for iOS:** Add `onTouchStart={() => {}}` to elements to enable `:active` states

### Two Button Classes

#### `.nav-btn` - Icon buttons with line/fill swap
Swaps between outline (line) and filled icons on interaction:

```tsx
<button className="nav-btn p-1" onTouchStart={() => {}}>
  <RiHomeLine className="icon-line w-5 h-5" />
  <RiHomeFill className="icon-fill w-5 h-5" />
</button>
```

**How it works:**
- Default: `.icon-line` visible, `.icon-fill` hidden
- Hover (desktop only): `.icon-line` hidden, `.icon-fill` visible
- Active (touch & click): `.icon-line` hidden, `.icon-fill` visible + lavender color

#### `.text-btn` - Text-only buttons
Color change only, no icon swap:

```tsx
<button className="text-btn px-2 py-1" onTouchStart={() => {}}>
  Click me
</button>
```

**How it works:**
- Default: `text-corpo-text/70`
- Hover (desktop only): `text-corpo-text`
- Active (touch & click): `text-lavender`

### The CSS (from header.tsx)

```css
/* Base styles */
.nav-btn, .text-btn {
  color: rgba(var(--corpo-text), 0.7);
  transition: color 0.1s ease-out;
  cursor: pointer;
}
.nav-btn:disabled, .text-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Icon visibility defaults */
.nav-btn .icon-line { display: block; }
.nav-btn .icon-fill { display: none; }

/* Hover - ONLY for devices that support hover (not touch) */
@media (hover: hover) {
  .nav-btn:not(:disabled):hover,
  .text-btn:not(:disabled):hover {
    color: rgb(var(--corpo-text));
  }
  .nav-btn:not(:disabled):hover .icon-line { display: none; }
  .nav-btn:not(:disabled):hover .icon-fill { display: block; }
}

/* Active - works on BOTH touch and mouse */
.nav-btn:not(:disabled):active,
.text-btn:not(:disabled):active {
  color: rgb(var(--lavender));
}
.nav-btn:not(:disabled):active .icon-line { display: none !important; }
.nav-btn:not(:disabled):active .icon-fill { display: block !important; }
```

### Critical: iOS `:active` Workaround

iOS Safari doesn't trigger `:active` states on tap unless the element has a touch event listener. Add an empty handler:

```tsx
onTouchStart={() => {}} // Required for iOS :active to work
```

This is a compatibility workaround in the current buttons. Centralize it in a
shared action primitive and retest it against the supported iOS versions rather
than copying empty handlers throughout new project components.

### When NOT to Use `.nav-btn`

If you only have a single icon (no line/fill pair), don't use `.nav-btn`. Use a simpler approach:

```tsx
<button 
  className="text-btn p-1"
  onTouchStart={() => {}}
>
  <RiSomeIcon className="w-5 h-5" />
</button>
```

---

## 🎬 Video Player Controls

### The Problem
Videos must open with muted autoplay and without the browser's native control
bar. A deliberate tap or click reveals native controls. The previous design
assumed its one-shot autoplay call succeeded, which caused:
- Race conditions between our logic and browser's native control behavior
- Controls flickering on mobile
- Chromecast button appearing/disappearing inconsistently
- Touch events behaving differently than expected

### Target Contract: Muted Autoplay, On-Demand Controls, Explicit Recovery

**Location:** `VideoModal` component in `/src/components/found-footy-browser.tsx`

**Key insight:** Native controls start disabled. A real mouse movement over the
video reveals them on desktop; a deliberate tap reveals them on touch input;
keyboard focus reveals them without requiring pointer input. Muted autoplay is
the default, but autoplay is never assumed to succeed. A custom play action is
reserved for a rejected playback request or a proven false-playing media
session. Ordinary loading and buffering are not recovery states.

**Implementation status (2026-08-23):** the watchdog now distinguishes
buffering from false-playing. Recovery requires future buffered media, an idle
network, no seek, no observed startup progress, and hidden native controls.
The global `touch-action: pan-y` restriction and page-level media mutation are
removed. Physical iPhone Safari and Chrome verification remains required; do
not describe this as a finished reusable primitive until the acceptance matrix
in `docs/found-footy-media.md` passes.

### Implementation

```tsx
const [playbackStatus, setPlaybackStatus] = useState('initializing')
const [controlsEnabled, setControlsEnabled] = useState(false)

// In the JSX:
<video
  autoPlay
  muted
  playsInline
  tabIndex={0}
  controls={controlsEnabled}
  onPointerMove={event => {
    if (event.pointerType === 'mouse') setControlsEnabled(true)
  }}
  onClick={() => setControlsEnabled(true)}
  onFocus={() => setControlsEnabled(true)}
  onPlaying={() => setPlaybackStatus('playing')}
  // ...
/>

{(playbackStatus === 'autoplay-blocked' || playbackStatus === 'false-playing') && (
  <button onClick={playVideo}>play video</button>
)}
```

### How It Works

1. **Video opens:** `autoplay`, `muted`, and `playsinline` exist from element
   initialization; native controls start disabled.
2. **Playback is observed:** `playing` and `timeupdate` prove the timeline is
   advancing. A resolved `play()` promise alone is insufficient. A paused or
   seeking timeline is not classified as stalled.
3. **Frozen playback gets one automatic reset:** only when the browser claims
   to play, buffered media exists ahead of `currentTime`, the network is not
   merely loading, and no native seek interaction is active.
4. **Failure remains recoverable:** a custom play button calls `play()`
   directly inside the user's tap. It is not a native video control bar.
5. **Controls follow the active input:** real mouse movement over the video
   reveals native controls on desktop. Touch movement does not; the first
   deliberate tap reveals them without intentionally pausing the autoplaying
   clip. Keyboard focus also reveals them. A hybrid device follows the
   `PointerEvent.pointerType` of the current interaction rather than a global
   mobile/desktop guess. Once controls are visible, an intentional native pause
   remains paused.
6. **Failures stay visible:** rejected promises and media errors include the
   trigger plus media state in the console.
7. **Native scrubbing is browser-owned:** application gesture policy and
   recovery logic must not intercept or reinterpret the native timeline. Test
   the complete drag, precision adjustment, release, and resumed-play sequence
   on WebKit rather than inferring it from desktop events.
8. **Terminal media never enters playback recovery:** an authoritative removed
   share renders **video no longer available** and an unknown share renders
   **video not found**. Neither state mounts `<video>` or exposes Retry,
   download, or unmute controls.
9. **Overlay launch preserves its source layout:** opening media from an
   existing fixture changes only modal state and the shareable URL. It must not
   collapse, expand, reorder, or scroll the disclosure tree underneath it. A
   direct or restored share may reconstruct missing disclosure before opening
   the same modal.

---

## Mobile viewport and scrolling

The document is the current production portal's sole vertical scroll owner.
Do not recreate a page-sized fixed overflow container inside a project route.
The target shell profiles and contained desktop/standalone experiment are
defined in the [frontend shell plan](../../docs/plans/frontend-shell.md).
Mobile WebKit relates its dynamic browser bars, visual viewport, keyboard,
history restoration, and native scroll anchoring to document scroll.

- Keep `viewport-fit=cover`, then apply every relevant
  `env(safe-area-inset-*)` value at the shell boundary.
- Size the fixed bottom navigation from its base height plus the bottom safe
  area. Give document content the same terminal padding.
- Use a `standalone` web app manifest for the installed experience. A normal
  browser tab cannot force browser chrome to stay hidden.
- Preserve browser zoom and text selection.
- A disclosure collapse must not clamp or jump the current viewport. Capture
  the document height and scroll position before that interaction, retain the
  exact removed height as temporary space before paint, and consume that space
  only after the user has scrolled it completely outside the viewport. Never
  trim it continuously: doing so pins the user to a moving document maximum and
  breaks reverse scrolling. Expansion may consume retained space. Never retain
  a route-lifetime high-water height or let temporary space grow in response to
  unrelated renders.
- Treat stable controls above variable content as an anchor boundary. Found
  Footy's advisory and date controls do not move when the fixture region below
  expands, collapses, or changes date.
- Let the browser own keyboard viewport changes. Do not restore `scrollTop` on
  a timer while an iOS keyboard is closing.

Physical iPhone Safari, Chrome, and installed-home-screen verification is the
acceptance gate for changes to this contract.

---

## 📝 General Principles

1. **Prefer CSS over JavaScript for interaction states** - More reliable, less code, better performance
2. **Use `@media (hover: hover)`** - Don't apply hover styles on touch devices
3. **Centralize the current iOS `:active` workaround** - Keep it where current
   testing requires it; do not scatter new empty handlers across project code
4. **Treat autoplay as optional** - Prove playback started and provide a direct user-action fallback
5. **Grace periods prevent event bleed-through** - Especially important for modals/overlays
6. **Branch on input capability, not viewport width or user agent** - Prefer
   CSS interaction media queries and `PointerEvent.pointerType`; hybrid devices
   can use mouse and touch in one session
