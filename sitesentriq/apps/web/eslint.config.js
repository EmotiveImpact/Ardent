import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '.claude',
    'node_modules',
    'coverage',
    'playwright-report',
    'test-results',
    'mobile',
    'supabase/.temp',
    'supabase/functions',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // This repo has legacy pragmatic `any` usage in table/report glue and
      // Supabase payload adapters. Keep lint focused on runtime correctness
      // instead of turning the existing backlog into a hard failure.
      '@typescript-eslint/no-explicit-any': 'off',
      // React Refresh is useful in app component files, but this codebase also
      // colocates constants/hooks with components in shared modules.
      'react-refresh/only-export-components': 'off',
      // The React Compiler advisory rules are too noisy for this app today.
      // `rules-of-hooks` and `exhaustive-deps` remain enabled.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
])
