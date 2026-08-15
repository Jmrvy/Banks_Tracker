import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  // Tailwind prunes @layer base/components rules whose classes it can't find
  // in `content`. lucide-react stamps `.lucide` on every icon at runtime, so
  // the string never appears in JSX and the global 1.6 stroke-weight rule in
  // src/index.css would be dropped without this.
  safelist: ["lucide"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    // Declared in full (not extended) so the design's single collapse width
    // sorts between `lg` and `xl` instead of being appended after `2xl`,
    // which would make it win over the larger breakpoints.
    //
    // The design collapses every multi-column layout at exactly one width:
    // 1180px. `wide` is the name to reach for; `bp` and `ft` are aliases so
    // the intent is unmistakable at call sites that read better with them.
    // Unused breakpoint variants cost nothing — JIT only emits what's used.
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      wide: "1180px",
      bp: "1180px",
      ft: "1180px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        inter: ['Instrument Sans', 'sans-serif'],
        sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
        // Display serif — page titles, hero figures, brand marks.
        display: ['Instrument Serif', 'Georgia', 'serif'],
      },
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1rem' }],    // 11px instead of 12px
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px instead of 14px
        base: ['0.875rem', { lineHeight: '1.375rem' }], // 14px instead of 16px
        lg: ['1rem', { lineHeight: '1.5rem' }],       // 16px instead of 18px
        xl: ['1.125rem', { lineHeight: '1.625rem' }], // 18px instead of 20px
        '2xl': ['1.25rem', { lineHeight: '1.75rem' }], // 20px instead of 24px
        '3xl': ['1.5rem', { lineHeight: '2rem' }],     // 24px instead of 30px
        '4xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px instead of 36px
        '5xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px instead of 48px
        '6xl': ['2.625rem', { lineHeight: '1' }],      // 42px instead of 60px
        '7xl': ['3rem', { lineHeight: '1' }],          // 48px instead of 72px
        '8xl': ['3.75rem', { lineHeight: '1' }],       // 60px instead of 96px
        '9xl': ['4.5rem', { lineHeight: '1' }],        // 72px instead of 128px
      },
      // Instrument Sans loads as a 400..700 variable axis (index.html), so
      // the design's two half-steps are genuinely renderable: 550 for
      // interactive text (buttons, chips, segments, nav) and 650 for
      // emphasis (primary buttons, card titles). Tailwind's 500/600 round
      // both down and flatten the pair.
      fontWeight: {
        550: '550',
        650: '650',
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        // Refonte 2026 surface / ink scale
        pos: "hsl(var(--pos))",
        neg: "hsl(var(--neg))",
        warn: "hsl(var(--warn))",
        // Same story as `accent-soft` below: the `--*-soft` tokens carry
        // their own alpha and are the designed tone fills, but they were
        // never mapped, so `bg-warn-soft` emitted nothing and callers either
        // reached for a raw Tailwind palette colour or spelled the token out
        // as `bg-[hsl(var(--warn-soft))]`.
        "pos-soft": "hsl(var(--pos-soft))",
        "neg-soft": "hsl(var(--neg-soft))",
        "warn-soft": "hsl(var(--warn-soft))",
        line: "hsl(var(--line))",
        "line-soft": "hsl(var(--line-soft))",
        "line-strong": "hsl(var(--line-strong))",
        "fg-mute": "hsl(var(--fg-mute))",
        "fg-dim": "hsl(var(--fg-dim))",
        "fg-onink": "hsl(var(--fg-onink))",
        "bg-elev": "hsl(var(--bg-elev))",
        "bg-sunk": "hsl(var(--bg-sunk))",
        "bg-subtle": "hsl(var(--bg-subtle))",
        "bg-hover": "hsl(var(--bg-hover))",
        "bg-ink": "hsl(var(--bg-ink))",
        "bg-inverse": "hsl(var(--bg-inverse))",
        "accent-deep": "hsl(var(--accent-deep))",
        // The token carries its own alpha, so this is the tinted accent fill
        // the design uses behind selected chips and active rows. It was being
        // written as `bg-accent-soft` before it existed here, which emitted
        // nothing and left selected filter chips indistinguishable.
        "accent-soft": "hsl(var(--accent-soft))",
        "accent-wash": "hsl(var(--accent-wash))",
        "on-accent": "hsl(var(--on-accent))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Banking specific colors
        bank: {
          sg: "hsl(var(--bank-sg))",
          revolut: "hsl(var(--bank-revolut))",
          boursorama: "hsl(var(--bank-boursorama))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // Refonte 2026 radius scale. Remapped rather than extended so the
      // ~270 existing `rounded-xl` / `rounded-2xl` call sites pick up the
      // new geometry without being touched.
      borderRadius: {
        sm: "var(--r-xs)",    //  8px
        DEFAULT: "var(--r-xs)",
        md: "var(--r-sm)",    // 11px
        lg: "var(--r-md)",    // 15px
        xl: "var(--r-lg)",    // 20px
        "2xl": "var(--r-lg)", // 20px — the card radius
        "3xl": "var(--r-xl)", // 28px — hero / sheet
      },
      boxShadow: {
        "sh-1": "var(--sh-1)",
        "sh-2": "var(--sh-2)",
        "sh-3": "var(--sh-3)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
