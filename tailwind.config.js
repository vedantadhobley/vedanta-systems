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
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			lavender: 'hsl(var(--lavender))',
  			'lavender-dim': 'hsl(var(--lavender-dim))',
  			'lavender-ghost': 'hsl(var(--lavender-ghost))',
  			'corpo-black': 'hsl(var(--corpo-black))',
  			'corpo-dark': 'hsl(var(--corpo-dark))',
  			'corpo-mid': 'hsl(var(--corpo-mid))',
  			'corpo-panel': 'hsl(var(--corpo-panel))',
  			'corpo-border': 'hsl(var(--corpo-border))',
  			'corpo-text': 'hsl(var(--corpo-text))',
  			'corpo-light': 'hsl(var(--corpo-light))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			none: '0',
  			DEFAULT: '0',
  			sm: 'calc(var(--radius) - 4px)',
  			md: 'calc(var(--radius) - 2px)',
  			lg: 'var(--radius)',
  			xl: '0',
  			'2xl': '0',
  			'3xl': '0',
  			full: '0'
  		},
  		transitionTimingFunction: {
  			'linear-snap': 'linear',
  			corpo: 'cubic-bezier(0, 0, 1, 1)'
  		},
  		transitionDuration: {
  			snap: '120ms',
  			slam: '80ms'
  		},
  		spacing: {
  			hairline: '1px'
  		},
  		fontFamily: {
  			mono: [
  				'Right Serif Mono',
  				'ui-monospace',
  				'monospace'
  			],
  			corpo: [
  				'Right Serif Mono',
  				'ui-monospace',
  				'monospace'
  			]
  		},
  		fontWeight: {
  			fine: '300',
  			regular: '400',
  			dark: '700'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
