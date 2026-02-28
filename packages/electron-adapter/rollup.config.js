import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
  },
  plugins: [
    commonjs(),
    resolve({
      preferBuiltins: true,
    }),
    json(),
    typescript({
      tsconfigOverride: {
        compilerOptions: {
          declaration: true,
          declarationDir: './dist',
        },
      },
    }),
  ],
  external: [
    'electron',
    'fs-extra',
    'axios',
    'uuid',
    'eventemitter3',
    'path',
    'os',
    'crypto',
  ],
};
