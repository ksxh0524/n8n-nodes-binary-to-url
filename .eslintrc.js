module.exports = {
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:n8n-nodes-base/recommended',
	],
	plugins: ['@typescript-eslint'],
	globals: {
		node: true,
	},
	rules: {
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-function-return-type': 'off',
	},
};
