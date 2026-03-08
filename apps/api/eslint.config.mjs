import tseslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/**/*.ts"],
    plugins: { "@typescript-eslint": tseslint },
    languageOptions: { parser: tsParser },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
]
