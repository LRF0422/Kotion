import { baseConfig } from "@kn/rollup-config";
import pkg from "./package.json" with { type: "json" };

const config = baseConfig({ input: "src/index.tsx", pkg });

export default config;
