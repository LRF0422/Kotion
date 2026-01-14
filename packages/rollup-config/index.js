import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import postcss from "rollup-plugin-postcss";
import nested from "postcss-nested";
import cssnext from "postcss-cssnext";
import json from "@rollup/plugin-json";
import nodePolyfills from "rollup-plugin-polyfill-node";
import babel from "@rollup/plugin-babel";
import postcssCascadeLayers from "@csstools/postcss-cascade-layers";
import { terser } from "rollup-plugin-terser";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

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
      inlineDynamicImports: true,
    },
  ],
  plugins: [
    commonjs(),
    resolve({
      browser: true,
    }),
    json(),
    nodePolyfills(),
    terser(),
    bundleStats(pkg),
    babel({
      babelHelpers: "bundled",
      exclude: "../../node_modules/**",
    }),
    postcss({
      // Process Tailwind CSS and other PostCSS plugins
      plugins: [tailwindcss(), autoprefixer(), cssnext(), nested(), postcssCascadeLayers()],
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
          noImplicitAny: true,
          // declarationMap: true,
          target: "ES2020",
          paths: {
            "@ui/*": ["../ui/src/*"],
            "@editor/*": ["../editor/src/*"],
          },
        },
      },
    }),
  ],
});

const isPluginPkg = (pkg) => {
  return pkg.name.includes("plugin");
};
export default function bundleStats(pkg) {
  let startTime;
  return {
    name: "bundle-stats",
    options() {
      startTime = Date.now();
    },
    generateBundle(_, bundle) {
      const fileSizes = {};
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk") {
          const content = output.code;
          const size = Buffer.byteLength(content, "utf-8");
          const sizeKB = (size / 1024).toFixed(2);
          fileSizes[fileName] = sizeKB + " KB";
          if (isPluginPkg(pkg)) {
            // Note: Auto-upload disabled in build. Use separate deploy step.
            // Uncomment and configure environment variables for deployment
            /*
            console.log("Uploading plugin artifact:", pkg.name);
            const formData = new FormData();
            formData.append("file", new Blob([content]), "index.js");
            fetch(
              "https://kotion.top:888/api/knowledge-resource/oss/endpoint/put-file",
              {
                method: "POST",
                body: formData,
              },
            ).then((res) => {
              res.json().then((body) => {
                fetch(
                  "https://kotion.top:888/api/knowledge-wiki/plugin/public/inner",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      pluginKey: pkg.name,
                      resourcePath: body.data.name,
                      publish: true,
                    }),
                  },
                ).then(() => {
                  console.log("Plugin artifact uploaded:", pkg.name);
                });
              });
            });
            */
          }
        }
      }
      console.table(fileSizes);
    },
    closeBundle() {
      const totalTime = Date.now() - startTime;
      console.log("Build time:", totalTime + "ms");
    },
  };
}
