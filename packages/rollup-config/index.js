// import babel from '@rollup/plugin-babel'
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import postcss from "rollup-plugin-postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import nested from "postcss-nested";
import cssnext from "postcss-cssnext";
import json from "@rollup/plugin-json";
import nodePolyfills from "rollup-plugin-polyfill-node";

export const baseConfig = ({ input = "src/index.ts", pkg }) => ({
  external: [
    "react",
    "@repo/common",
    "@repo/ui",
    "@repo/icon",
    "@repo/editor",
    "@repo/core",
  ],
  input,
  output: [
    {
      name: pkg.name,
      file: "dist/index.js",
      format: "umd",
      sourcemap: true,
      exports: "named",
      globals: {
        "@repo/common": "common",
        "@repo/ui": "ui",
        "@repo/icon": "icon",
        "@repo/editor": "editor",
        "@repo/core": "core",
        react: "React",
      },
    },
    // {
    //   name: pkg.name,
    //   file: pkg.main,
    //   format: "cjs",
    //   interop: "compat",
    //   sourcemap: true,
    //   exports: "named",
    // },
    // {
    //   name: pkg.name,
    //   file: pkg.module,
    //   format: "es",
    //   sourcemap: true,
    //   exports: "named",
    // },
  ],
  plugins: [
    commonjs(),
    resolve(),
    json(),
    nodePolyfills(),
    postcss({
      plugins: [tailwindcss(), autoprefixer(), nested(), cssnext()],
      extract: false,
      minimize: true,
    }),
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          declaration: true,
          rootDir: `../../`,
          declarationMap: true,
          target: "ES2018",
          paths: {
            "@ui/*": ["../ui/src/*"],
            "@editor/*": ["../editor/src/*"],
          },
        },
      },
    }),
  ],
});
