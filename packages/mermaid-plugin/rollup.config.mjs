import { baseConfig } from "@repo/rollup-config";
import pkg from "./package.json" with { type: "json" };

export default baseConfig({ input: "src/index.ts", pkg });
