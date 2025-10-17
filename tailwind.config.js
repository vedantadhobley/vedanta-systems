/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Corporate monochrome
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        // Your personal touch - lavender, used sparingly
        'lavender': "hsl(var(--lavender))",
        'lavender-dim': "hsl(var(--lavender-dim))",
        'lavender-ghost': "hsl(var(--lavender-ghost))",
        
        // Corporate grays - the only palette
        'corpo-black': "hsl(var(--corpo-black))",
        'corpo-dark': "hsl(var(--corpo-dark))",
        'corpo-mid': "hsl(var(--corpo-mid))",
        'corpo-panel': "hsl(var(--corpo-panel))",
        'corpo-border': "hsl(var(--corpo-border))",
        'corpo-text': "hsl(var(--corpo-text))",
        'corpo-light': "hsl(var(--corpo-light))",
        
        // UI elements
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      // NO ROUNDED CORNERS
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
      // Linear, precise animations
      transitionTimingFunction: {
        'linear-snap': 'linear',
        'corpo': 'cubic-bezier(0, 0, 1, 1)',
      },
      transitionDuration: {
        'snap': '120ms',
        'slam': '80ms',
      },
      // Corporate spacing
      spacing: {
        'hairline': '1px',
      },
      // PT Mono only
      fontFamily: {
        'mono': ['PT Mono', 'Consolas', 'monospace'],
        'corpo': ['PT Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
