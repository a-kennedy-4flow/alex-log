// One flat config for the whole workspace. It runs from the root because the
// rules are the same everywhere and a per package copy would drift.

import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueTs from '@vue/eslint-config-typescript'
import globals from 'globals'

export default ts.config(
  {
    // Build output and vendored data. None of it is written by hand.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cdk.out/**',
      'generated/**',
      'packages/fixtures/data/**',
      // Standalone design mockups. Each one takes its globals from the html
      // page that loads it so it does not resolve on its own.
      'mockups/**',
    ],
  },

  js.configs.recommended,
  ts.configs.recommended,
  vue.configs['flat/recommended'],
  vueTs(),

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Layout of the template is left to the author. These rules only ever
      // disagreed with what is already there and none of them catches a fault.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      // apps/api/src/local.ts already carries a disable directive for this so
      // the rule was meant to be on. Nothing else in the workspace uses var.
      'no-var': 'error',
      // The codebase prefixes a deliberately unused binding with an underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Single word component names read fine here because every one of them is
    // already namespaced by its folder.
    files: ['apps/web/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },

  {
    // Tests reach for globals that the source files never touch.
    files: ['**/*.test.ts', '**/test-setup.ts'],
    languageOptions: { globals: { ...globals.node } },
    // A render test mounts several throwaway components from the one file.
    rules: { 'vue/one-component-per-file': 'off' },
  },
)
