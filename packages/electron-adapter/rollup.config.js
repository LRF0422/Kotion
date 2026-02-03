import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
    }),
  ],
  external: [
    'electron',
    'better-sqlite3',
    'fs-extra',
    'axios',
    'uuid',
    'eventemitter3',
    'path',
    'os',
    'crypto',
  ],
};
