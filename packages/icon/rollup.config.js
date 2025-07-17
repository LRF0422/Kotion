import { baseConfig } from "@kn/rollup-config";
import pkg from "./package.json" with { type: "json" };

export default baseConfig({ input: "src/index.ts", pkg });

// export default {
//   input: "src/index.ts",
//   external: [
//     "react",
//     "@kn/common",
//     "@kn/ui",
//     "@kn/icon",
//     "@kn/editor",
//     "@kn/core",
//   ],
//   output: {
//     file: "dist/index.js",
//     format: "umd",
//     name: "icon",
//     globals: {
//       "@kn/common": "common",
//       "@kn/ui": "ui",
//       "@kn/icon": "icon",
//       "@kn/editor": "editor",
//       "@kn/core": "core",
//       react: "React",
//     },
//   },
//   plugins: [
//     typescript({
//       tsconfigOverride: {
//         compilerOptions: {
//           declaration: true,
//           declarationMap: true,
//         },
//       },
//     }),
//     resolve(),
//     commonjs(),
//     css(),
//     // typescriptPaths(),
//     postcss({
//       plugins: [tailwindcss(), autoprefixer()],
//       extract: false,
//       minimize: true,
//     }),
//   ],
// };
