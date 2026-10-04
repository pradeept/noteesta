import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import { configs, extensions, plugins } from 'eslint-config-airbnb-extended';

export default defineConfig([
  ...Object.values(plugins),
  ...extensions.base.recommended,
  ...extensions.base.typescript,
  ...extensions.next.recommended,
  ...extensions.react.typescript,
  ...configs.next.recommended,
  ...configs.next.typescript,
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      'react/jsx-no-bind': 'off',
      'react/require-default-props': 'off',
    },
  },
  prettier,
  globalIgnores(['.next/**', 'coverage/**', 'api/**', 'node_modules/**']),
]);
