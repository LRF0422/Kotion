import { baseConfig } from "@repo/rollup-config";
import pkg from "./package.json" with { type: "json" };

export default baseConfig({ input: "src/index.ts", pkg });

// export default {
//   input: "src/index.ts",
//   external: [
//     "react",
//     "@repo/common",
//     "@repo/ui",
//     "@repo/icon",
//     "@repo/editor",
//     "@repo/core",
//   ],
//   output: {
//     file: "dist/index.js",
//     format: "umd",
//     name: "icon",
//     globals: {
//       "@repo/common": "common",
//       "@repo/ui": "ui",
//       "@repo/icon": "icon",
//       "@repo/editor": "editor",
//       "@repo/core": "core",
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
