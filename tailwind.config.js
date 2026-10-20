/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'surface-subtle': 'var(--surface-subtle)',
        'surface-hover': 'var(--surface-hover)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        line: {
          DEFAULT: 'var(--line)',
          soft: 'var(--line-soft)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          dark: 'var(--accent-dark)',
        },
        'h1-color': 'var(--h1-color)',
        control: 'var(--control-surface)',
        'control-hover': 'var(--control-surface-hover)',
        'focus-ring': 'var(--focus-ring)',
        overlay: 'var(--overlay)',
        danger: {
          DEFAULT: 'var(--danger-fg)',
          soft: 'var(--danger-soft)',
          line: 'var(--danger-line)',
        },
        warning: {
          DEFAULT: 'var(--warning-fg)',
          soft: 'var(--warning-soft)',
        },
        success: {
          DEFAULT: 'var(--success-fg)',
          soft: 'var(--success-soft)',
        },
        info: {
          DEFAULT: 'var(--info-fg)',
          soft: 'var(--info-soft)',
        },
        'stage-inbox': 'var(--stage-inbox)',
        'stage-inbox-soft': 'var(--stage-inbox-soft)',
        'stage-scripting': 'var(--stage-scripting)',
        'stage-scripting-soft': 'var(--stage-scripting-soft)',
        'stage-production': 'var(--stage-production)',
        'stage-production-soft': 'var(--stage-production-soft)',
        'stage-published': 'var(--stage-published)',
        'stage-published-soft': 'var(--stage-published-soft)',
        'stage-icebox': 'var(--stage-icebox)',
        'stage-icebox-soft': 'var(--stage-icebox-soft)',
        background: 'var(--canvas)',
        muted: 'var(--canvas)',
        border: 'var(--line)',
        brand: {
          50: 'var(--accent-soft)',
          100: 'rgba(47, 92, 78, 0.15)',
          500: 'var(--accent)',
          600: 'var(--accent)',
          700: 'var(--accent-dark)',
        }
      },
      borderRadius: {
        sm: 'var(--radius-sm, 8px)',
        DEFAULT: 'var(--radius-sm, 8px)',
        md: 'var(--radius-sm, 8px)',
        lg: 'var(--radius-md, 12px)',
        xl: 'var(--radius-md, 12px)',
        '2xl': 'var(--radius-lg, 18px)',
        '3xl': 'var(--radius-lg, 18px)',
        card: 'var(--radius-md, 12px)',
        panel: 'var(--radius-lg, 18px)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        serif: ['Georgia', 'Cambria', '"Songti SC"', 'SimSun', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 1px 2px -1px rgba(0, 0, 0, 0.02)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
        'card-hover': '0 4px 12px -2px rgba(37, 40, 39, 0.05)',
        modal: '0 16px 36px -8px rgba(37, 40, 39, 0.12), 0 4px 12px -2px rgba(37, 40, 39, 0.06)',
        'nav-ambient': '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'soft-pill': '0 2px 8px -1px rgba(47, 92, 78, 0.12)',
      },
      transitionTimingFunction: {
        'editorial-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'editorial-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      }
    },
  },
  plugins: [],
}
