# Moon Background - Styling Options

## Current Settings
- **Size:** 50vw (desktop), 70vw (mobile)
- **Dithering:** Bayer 4x4 pattern overlay
- **Opacity:** 0.20 (desktop), 0.18 (mobile)
- **Blend mode:** normal
- **Position:** z-index: 1 (behind content)

---

## 🎨 BAYER DITHERING OPTIONS

The dithering is now applied as a CSS overlay pattern. Edit the `.bayer-dither` styles in `/src/components/moon-background.tsx`:

### Option 1: Subtle Grid (CURRENT)
Classic ordered dithering, subtle
```css
.bayer-dither {
  background-image: 
    repeating-linear-gradient(
      0deg,
      transparent 0px,
      transparent 1px,
      rgba(0, 0, 0, 0.03) 1px,
      rgba(0, 0, 0, 0.03) 2px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0px,
      transparent 1px,
      rgba(0, 0, 0, 0.03) 1px,
      rgba(0, 0, 0, 0.03) 2px
    );
  background-size: 4px 4px;
  opacity: 0.6;
}
```

### Option 2: Stronger Bayer Pattern
More visible dithering effect
```css
.bayer-dither {
  background-image: 
    repeating-linear-gradient(
      0deg,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.08) 2px,
      rgba(0, 0, 0, 0.08) 4px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.08) 2px,
      rgba(0, 0, 0, 0.08) 4px
    );
  background-size: 8px 8px;
  opacity: 0.8;
}
```

### Option 3: Heavy Dithering
Bold, chunky pixels - very retro
```css
.bayer-dither {
  background-image: 
    repeating-linear-gradient(
      0deg,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.12) 3px,
      rgba(0, 0, 0, 0.12) 6px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.12) 3px,
      rgba(0, 0, 0, 0.12) 6px
    );
  background-size: 12px 12px;
  opacity: 1.0;
}
```

### Option 4: Diagonal Bayer (Cool Effect)
Diagonal pattern for unique look
```css
.bayer-dither {
  background-image: 
    repeating-linear-gradient(
      45deg,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.06) 2px,
      rgba(0, 0, 0, 0.06) 4px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent 0px,
      transparent 2px,
      rgba(0, 0, 0, 0.06) 2px,
      rgba(0, 0, 0, 0.06) 4px
    );
  background-size: 8px 8px;
  opacity: 0.7;
}
```

### Option 5: No Dithering
Remove the dithering entirely - clean grayscale
```css
/* Just comment out or remove the .bayer-dither div and styles */
```

---

## 📐 SIZE OPTIONS

Change the `width:` values:

| Size | Desktop | Mobile | Description |
|------|---------|--------|-------------|
| Small | 40vw | 60vw | Subtle presence |
| **Medium (CURRENT)** | **50vw** | **70vw** | **Balanced** |
| Large | 60vw | 80vw | Dominant |
| Max | 70vw | 90vw | Very bold |

Also adjust `max-width`:
- Current: 800px
- Options: 600px, 700px, 800px, 1000px, 1200px

---

## 🌫️ OPACITY OPTIONS

Lower = more subtle, higher = more visible

| Opacity | Desktop | Mobile | When to Use |
|---------|---------|--------|-------------|
| Very Subtle | 0.10 | 0.08 | Almost invisible |
| **Subtle (CURRENT)** | **0.20** | **0.18** | **Background presence** |
| Visible | 0.28 | 0.22 | Clear but not distracting |
| Bold | 0.35 | 0.28 | Statement piece |

---

## 🎭 VIDEO FILTER OPTIONS

Change the `filter:` property on `.moon-video`:

### Current Settings
```css
filter: 
  grayscale(100%)
  contrast(2.0)
  brightness(0.7);
```

### Darker/More Mysterious
```css
filter: 
  grayscale(100%)
  contrast(2.5)
  brightness(0.5);
```

### Lighter/More Visible
```css
filter: 
  grayscale(100%)
  contrast(1.8)
  brightness(0.9);
```

### Sharp/Corporate
```css
filter: 
  grayscale(100%)
  contrast(3.0)
  brightness(0.6);
```

---

## 🎯 My Recommendations

**For corporate dystopian aesthetic:**
- Option 1 or 2 Bayer dithering
- 0.20 opacity desktop / 0.18 mobile
- Current contrast/brightness settings
- 50vw size

**For bold retro look:**
- Option 3 Heavy dithering
- 0.28 opacity
- High contrast (2.5-3.0)
- 60vw size

**For subtle/clean:**
- No dithering
- 0.15 opacity
- Lower contrast (1.5)
- 40vw size
