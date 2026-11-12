// Native flat config exports (eslint-config-next 16+) — no FlatCompat shim
// needed, which avoids a circular-structure crash when eslint-plugin-react's
// flat config is loaded through the legacy @eslint/eslintrc compatibility
// layer.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];

export default eslintConfig;
