/**
 * Design system do PokeTche (NativeWind v4 / Tailwind v3).
 *
 * Fonte única de tokens do app: cores, tipografia, raios e espaçamento. As telas usam `className`
 * com variantes `dark:` (a paleta é dark-first, sensível ao esquema do SO — mesmo comportamento do
 * antigo `useThemeColors`). Substitui os literais soltos (`padding:16`, `fontSize:24`) espalhados
 * pelas ~19 telas por uma escala consistente.
 *
 * Correção de bug do tema antigo: `brand` (identidade) e `danger` (erro) eram a MESMA cor. Agora
 * são escalas distintas.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Identidade — índigo/violeta, leitura premium de app de coleção.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Superfícies neutras (dark-first). Usadas via bg-white dark:bg-ink-950 etc.
        ink: {
          50: '#f6f6f8',
          100: '#eeeef1',
          200: '#e2e2e6',
          300: '#c9c9d0',
          400: '#9a9aa2',
          500: '#6b6b73',
          600: '#4a4a52',
          700: '#33333a',
          800: '#26262b',
          900: '#1c1c20',
          950: '#111114',
        },
        danger: {
          DEFAULT: '#ef4444',
          fg: '#ffffff',
          soft: '#fee2e2',
          softDark: '#3b1517',
        },
        success: {
          DEFAULT: '#16a34a',
          dark: '#22c55e',
          soft: '#dcfce7',
          softDark: '#0f2a1a',
        },
        warning: {
          DEFAULT: '#d97706',
          dark: '#f59e0b',
          soft: '#fef3c7',
          softDark: '#3a2a0a',
        },
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
        extrabold: ['Inter_800ExtraBold'],
      },
      fontSize: {
        '2xs': '11px',
        xs: '12px',
        sm: '13px',
        base: '15px',
        lg: '17px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
};
