module.exports = {
    extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
    plugins: ['node', 'prettier'],
    rules: {
        'prettier/prettier': 'error',
        'block-scoped-var': 'error',
        eqeqeq: 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'eol-last': 'error',
        'prefer-arrow-callback': 'error',
        'no-trailing-spaces': 'error',
        quotes: ['warn', 'single', { avoidEscape: true }],
        'no-restricted-properties': [
            'error',
            {
                object: 'describe',
                property: 'only',
            },
            {
                object: 'it',
                property: 'only',
            },
        ],
        'no-duplicate-imports': 'error',
        //'no-constant-binary-expression': 'warn',
    },

    ignorePatterns: ['src/migrations/*.ts'],
    overrides: [
        {
            files: ['**/*.ts', '**/*.tsx'],
            parser: '@typescript-eslint/parser',
            extends: [
                'plugin:@typescript-eslint/recommended',
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                //"plugin:@typescript-eslint/strict"
            ],
            rules: {
                //'@typescript-eslint/no-non-null-assertion': 'off',
                //'@typescript-eslint/no-use-before-define': 'off',
                //'@typescript-eslint/no-warning-comments': 'off',
                '@typescript-eslint/no-empty-function': 'warn', // TODO
                //'@typescript-eslint/no-var-requires': 'off',
                //'@typescript-eslint/explicit-function-return-type': 'off',
                //'@typescript-eslint/explicit-module-boundary-types': 'off',
                //'@typescript-eslint/ban-types': 'off',
                //'@typescript-eslint/camelcase': 'warn', // legacy
                'node/no-missing-import': 'off',
                'node/no-empty-function': 'off',
                'node/no-unsupported-features/es-syntax': 'off',
                'node/no-missing-require': 'off',
                'node/shebang': 'off',
                'no-dupe-class-members': 'off',
                'require-atomic-updates': 'off',
            },
            parserOptions: {
                ecmaVersion: 2018,
                sourceType: 'module',
                tsconfigRootDir: __dirname,
                project: ['./tsconfig.json'],
            },
            overrides: [
                {
                    files: ['**/*.spec.ts', '**/e2e/*'],
                    env: {
                        mocha: true,
                    },
                },
            ],
        },
    ],
};
