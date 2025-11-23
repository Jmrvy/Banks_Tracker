import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
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
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
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
