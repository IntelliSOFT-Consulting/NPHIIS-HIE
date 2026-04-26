/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // In-app primary stays blue-dominant. The `nphi` name is kept so
        // component classes don't churn — the palette underneath is Tailwind
        // blue aligned to the existing blue-600 accent the login page uses.
        nphi: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // primary — matches the login page blue-600
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        accent: {
          50: '#fdf3f3',
          100: '#fce4e4',
          200: '#f9cdcd',
          300: '#f3a7a7',
          400: '#ea7676',
          500: '#db4c4c',
          600: '#c63434',
          700: '#a52626',
          800: '#882323',
          900: '#712323',
          950: '#3d0e0e',
        },
        surface: {
          DEFAULT: '#f4f6fb',
          muted: '#eef1f7',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'nphi-gradient':
          'linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #3b82f6 100%)',
        'accent-gradient':
          'linear-gradient(135deg, #a52626 0%, #c63434 55%, #db4c4c 100%)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(30, 64, 175, 0.04), 0 4px 16px rgba(30, 64, 175, 0.06)',
        'card-lg':
          '0 2px 4px rgba(30, 64, 175, 0.05), 0 12px 32px rgba(30, 64, 175, 0.08)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
