import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	...obsidianmd.configs.recommended,
	{
		ignores: [
			"main.js",
			".test-dist/**",
			"node_modules/**",
		],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		rules: {
			"obsidianmd/sample-names": "off",
		},
	},
]);
