import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    {
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        extends: [
            'eslint:recommended',
            'plugin:@typescript-eslint/recommended',
            'prettier'
        ],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        }
    }
];