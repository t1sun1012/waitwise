import type { Config } from 'tailwindcss';

export default {
  content: ['./entrypoints/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  safelist: [
    { pattern: /^bg-(gray|slate|teal|amber|rose|emerald|indigo|red|green|violet)-(50|100|200|300|400|500|600|700|800|900|950)(\/[0-9]+)?$/ },
    { pattern: /^text-(gray|slate|teal|amber|rose|emerald|indigo|red|green|violet)-(50|100|200|300|400|500|600|700|800|900|950)$/ },
    { pattern: /^border-(gray|slate|teal|amber|rose|emerald|indigo|red|green|violet)-(50|100|200|300|400|500|600|700|800|900|950)$/ },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
