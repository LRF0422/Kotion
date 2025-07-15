import postcss from "rollup-plugin-postcss";
import { typescriptPaths } from "rollup-plugin-typescript-paths";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "src/index.ts",
  external: [
    "react",
    "@repo/common",
    "@repo/ui",
    "@repo/icon",
    "@repo/editor",
    "@repo/core",
  ],
  output: {
    file: "dist/index.js",
    format: "umd",
    name: "editor",
    globals: {
      "@repo/common": "common",
      "@repo/ui": "ui",
      "@repo/icon": "icon",
      "@repo/editor": "editor",
      "@repo/core": "core",
      react: "React",
    },
  },
  plugins: [
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          declaration: true,
          declarationMap: true,
        },
      },
    }),
    commonjs(),
    resolve(),
    // typescriptPaths(),
    postcss({
      plugins: [tailwindcss(), autoprefixer()],
      extract: false,
      minimize: true,
    }),
  ],
};
