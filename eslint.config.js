import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'data/', 'backups/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.property.name='exec'][arguments.0.type='TemplateLiteral']", message: 'لا تبنِ SQL بقوالب نصية؛ استخدم prepare مع معاملات.' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', URL: 'readonly', setTimeout: 'readonly', alert: 'readonly' } },
    rules: { 'no-var': 'off' },
  },
);
