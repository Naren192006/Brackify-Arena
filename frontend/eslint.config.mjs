import { dirname } from "path";
import { fileURLToPath } from "url";

/** @type {import('eslint').Linter.Config} */
const eslintConfig = {
  extends: ["next/core-web-vitals", "next/typescript"],
};

export default eslintConfig;
