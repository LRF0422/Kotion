/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    // Scan all workspace packages for Tailwind classes
    "../../packages/*/src/**/*.{ts,tsx,jsx,js}",
    "../../apps/*/src/**/*.{ts,tsx,jsx,js}",
    "./node_modules/@kn/**/*.{ts,tsx}",
    "./node_modules/streamdown/dist/*.js",
  ],
  prefix: "",
  safelist: [
    {
      // Match dynamic grid column classes like grid-cols-1, grid-cols-2, etc.
      pattern: /^grid-cols-(\d+|\[.+\])$/,
    },
    {
      // Match dynamic gap classes
      pattern: /^gap-(\d+|\[.+\])$/,
    },
    {
      // Match common dynamic utility patterns (includes arbitrary values like w-[100vh])
      pattern: /^(w|h|max-w|max-h|min-w|min-h)-(\d+|\[.+\]|full|screen|auto)$/,
    },
    // Sheet and Dialog animations from tailwindcss-animate
    {
      pattern: /^animate-(in|out)$/,
    },
    {
      pattern: /^fade-(in|out)-0$/,
    },
    {
      pattern: /^slide-in-from-(top|bottom|left|right)$/,
    },
    {
      pattern: /^slide-out-to-(top|bottom|left|right)$/,
    },
  ],
  theme: {
    container: {
      center: "true",
      padding: "2rem",
      screens: {
        xs: "460px",
        sm: "576px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1440px",
        "3xl": "1900px",
      },
    },
    extend: {
      screens: {
        "3xl": "1900px",
      },
      // Notion-like system font stack (zero web-font dependency, CJK fallbacks)
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
        ],
        serif: ['Georgia', '"Times New Roman"', "ui-serif", "serif"],
        mono: [
          '"SFMono-Regular"',
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          '"Courier New"',
          "monospace",
        ],
      },
      // iOS safe-area inset utilities (e.g. pt-safe-top, pb-safe-bottom, h-screen-safe)
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
      minHeight: {
        "screen-dvh": "100dvh",
      },
      height: {
        "screen-dvh": "100dvh",
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
      backgroundImage: {
        "calendar-disabled-hour":
          "repeating-linear-gradient(-60deg, hsl(var(--border)) 0 0.5px, transparent 0.5px 8px)",
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
        "dialog-in": {
          from: {
            opacity: "0",
            transform: "translate(-50%, -50%) scale(0.95)",
          },
          to: {
            opacity: "1",
            transform: "translate(-50%, -50%) scale(1)",
          },
        },
        "dialog-out": {
          from: {
            opacity: "1",
            transform: "translate(-50%, -50%) scale(1)",
          },
          to: {
            opacity: "0",
            transform: "translate(-50%, -50%) scale(0.95)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "dialog-in": "dialog-in 0.2s ease-out",
        "dialog-out": "dialog-out 0.15s ease-in",
      },
      typography: {
        // Notion-like reading experience for `prose` content
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "hsl(var(--foreground))",
            fontSize: "16px",
            lineHeight: "1.5",
            strong: {
              color: "inherit",
              fontWeight: "600",
            },
            a: {
              color: "hsl(var(--ring))",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontWeight: "inherit",
            },
            "h1, h2, h3, h4": {
              color: "inherit",
              fontWeight: "700",
              letterSpacing: "-0.01em",
            },
            h1: { fontSize: "1.875em", marginTop: "1.6em", marginBottom: "0.4em" },
            h2: { fontSize: "1.5em", marginTop: "1.4em", marginBottom: "0.4em" },
            h3: { fontSize: "1.25em", marginTop: "1.2em", marginBottom: "0.4em" },
            p: { marginTop: "0.4em", marginBottom: "0.4em" },
            code: {
              fontWeight: "400",
              backgroundColor: "hsl(var(--muted))",
              padding: "0.15em 0.35em",
              borderRadius: "4px",
              color: "#eb5757",
            },
            "code::before": { content: '""' },
            "code::after": { content: '""' },
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
