# UI Patterns & Solutions

This document describes the established UI patterns in this codebase, including hard-won solutions to cross-platform interaction issues.

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

This is NOT a hack - it's the documented way to enable `:active` on iOS.

### When NOT to Use `.nav-btn`

If you only have a single icon (no line/fill pair), don't use `.nav-btn`. Use a simpler approach:

```tsx
<button 
  className="text-corpo-text/70 hover:text-corpo-text active:text-lavender transition-colors"
  onTouchStart={() => {}}
>
  <RiSomeIcon className="w-5 h-5" />
</button>
```

---

## 🎬 Video Player Controls

### The Problem
We wanted videos to autoplay without controls visible, then let users access controls on interaction. Implementing custom show/hide logic caused:
- Race conditions between our logic and browser's native control behavior
- Controls flickering on mobile
- Chromecast button appearing/disappearing inconsistently
- Touch events behaving differently than expected

### The Solution: Native Controls After First Interaction

**Location:** `VideoModal` component in `/src/components/found-footy-browser.tsx`

**Key insight:** Don't fight the browser's native video controls. Just delay when they become available.

### Implementation

```tsx
const [controlsEnabled, setControlsEnabled] = useState(false)
const mountedAtRef = useRef(Date.now())

// Enable controls on first interaction, with grace period
const enableControls = useCallback(() => {
  // 300ms grace period prevents tap "bleed-through" from the element that opened the modal
  if (!controlsEnabled && Date.now() - mountedAtRef.current > 300) {
    setControlsEnabled(true)
  }
}, [controlsEnabled])

// In the JSX:
<video
  controls={controlsEnabled}
  onMouseEnter={enableControls}  // Desktop: hover to enable
  onClick={enableControls}        // Mobile: tap to enable
  disableRemotePlayback           // Hide Chromecast button
  playsInline
  // ...
/>
```

### How It Works

1. **Video opens:** `controls={false}`, video autoplays without UI
2. **User hovers (desktop) or taps (mobile):** `enableControls()` is called
3. **300ms check:** If within 300ms of mount, ignore (prevents bleed-through)
4. **Controls enabled:** `controls={true}`, browser takes over completely
5. **Native behavior:** Browser handles all show/hide logic from here

### Why 300ms Grace Period?

When you tap a fixture card to open the video modal, if the video element happens to render under your finger, the same tap can immediately trigger `onClick` on the video. The 300ms delay prevents this "tap bleed-through".

### Chromecast Button

Chrome shows a Chromecast button on videos. It appears when `controls={false}` and hides when `controls={true}` (merged into control bar). This inconsistency is confusing, so we disable it entirely:

```tsx
disableRemotePlayback // Hide Chromecast button
```

---

## 📝 General Principles

1. **Prefer CSS over JavaScript for interaction states** - More reliable, less code, better performance
2. **Use `@media (hover: hover)`** - Don't apply hover styles on touch devices
3. **Always add `onTouchStart={() => {}}`** - Required for iOS `:active` support
4. **Don't fight native browser behavior** - Especially for complex components like video players
5. **Grace periods prevent event bleed-through** - Especially important for modals/overlays
