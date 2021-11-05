module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:node/recommended',
	],
	parserOptions: {
		'ecmaVersion': 2020,
	},
	rules: {
		'comma-spacing': 1,
		'eqeqeq': 1,
		'node/no-unsupported-features/es-syntax': 0,
		'no-process-exit': 0,
		'object-curly-spacing': ['error', 'always'],
		'space-infix-ops': 1,
		'@typescript-eslint/no-var-requires': 0,
	},
};