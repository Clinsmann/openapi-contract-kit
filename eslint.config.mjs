import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts', 'bin/**/*.ts', 'test/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
]);
