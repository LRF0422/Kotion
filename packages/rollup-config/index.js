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
import babel from "@rollup/plugin-babel";
import calc from "postcss-calc";
import postcssCascadeLayers from "@csstools/postcss-cascade-layers";

export const baseConfig = ({ input = "src/index.ts", pkg }) => ({
  external: [
    "react",
    "@kn/common",
    "@kn/ui",
    "@kn/icon",
    "@kn/editor",
    "@kn/core",
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
        "@kn/common": "common",
        "@kn/ui": "ui",
        "@kn/icon": "icon",
        "@kn/editor": "editor",
        "@kn/core": "core",
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
    resolve({
      browser: true,
    }),
    json(),
    nodePolyfills(),
    babel({
      babelHelpers: "bundled",
      exclude: "../../node_modules/**",
    }),
    postcss({
      // tailwindcss(), autoprefixer(), nested(), cssnext(), calc()
      plugins: [cssnext(), nested(), postcssCascadeLayers()],
      extensions: [".css"],
      extract: false,
      minimize: true,
    }),
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          declaration: true,
          isolatedModules: false,
          moduleResolution: "bundler",
          declarationDir: "./dist",
          // declarationMap: true,
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
