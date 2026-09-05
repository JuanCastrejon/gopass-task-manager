import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuración deliberadamente corta.
 *
 * El grueso del trabajo lo hace ya `tsc` con `strict`,
 * `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. ESLint aquí solo
 * cubre lo que el compilador no ve: promesas sin manejar y variables muertas.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      // `tsconfig.json` solo incluye `src` porque es lo que se compila a
      // `dist`. Las reglas con información de tipos necesitan ver también las
      // pruebas, así que ESLint usa un tsconfig propio.
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
