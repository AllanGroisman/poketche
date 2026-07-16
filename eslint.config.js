// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      'apps/api/prisma/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // O babel.config.js é CommonJS e roda no Node (build time), não no bundle do app — o
    // formato é imposto pelo Babel, não é escolha nossa.
    files: ['apps/mobile/babel.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
);
