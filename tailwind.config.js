/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./webview/**/*.{ts,tsx,html}",
    "./src/**/*.{ts,tsx,html}"
  ],
  theme: {
    extend: {
      colors: {
        // Vibe Log brand colors
        primary: {
          DEFAULT: '#6366F1', // Indigo
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        accent: {
          DEFAULT: '#F59E0B', // Orange
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        // VSCode theme colors (using CSS variables)
        vscode: {
          foreground: 'var(--vscode-foreground)',
          background: 'var(--vscode-editor-background)',
          sidebarBackground: 'var(--vscode-sideBar-background)',
          border: 'var(--vscode-panel-border)',
          buttonPrimary: 'var(--vscode-button-background)',
          buttonPrimaryHover: 'var(--vscode-button-hoverBackground)',
          buttonSecondary: 'var(--vscode-button-secondaryBackground)',
          buttonSecondaryHover: 'var(--vscode-button-secondaryHoverBackground)',
          input: 'var(--vscode-input-background)',
          inputBorder: 'var(--vscode-input-border)',
          error: 'var(--vscode-errorForeground)',
          warning: 'var(--vscode-editorWarning-foreground)',
          info: 'var(--vscode-editorInfo-foreground)',
          success: 'var(--vscode-terminal-ansiGreen)',
        }
      },
      fontFamily: {
        sans: ['var(--vscode-font-family)', 'system-ui', 'sans-serif'],
        mono: ['var(--vscode-editor-font-family)', 'monospace'],
      },
      fontSize: {
        'vscode-sm': ['var(--vscode-font-size)', { lineHeight: '1.5' }],
        'vscode-base': ['calc(var(--vscode-font-size) * 1.1)', { lineHeight: '1.5' }],
        'vscode-lg': ['calc(var(--vscode-font-size) * 1.3)', { lineHeight: '1.4' }],
        'vscode-xl': ['calc(var(--vscode-font-size) * 1.6)', { lineHeight: '1.3' }],
      },
      spacing: {
        'vscode-sm': '8px',
        'vscode-md': '12px',
        'vscode-lg': '16px',
        'vscode-xl': '24px',
      },
      borderRadius: {
        'vscode': '2px',
      },
      boxShadow: {
        'vscode': '0 2px 8px var(--vscode-widget-shadow)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in',
        'slide-in': 'slideIn 0.3s ease-out',
        'spin-slow': 'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
