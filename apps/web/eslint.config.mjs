import nextConfig from 'eslint-config-next';

const eslintConfig = [
  { ignores: ['generated/**'] },
  ...nextConfig,
  {
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];

export default eslintConfig;
