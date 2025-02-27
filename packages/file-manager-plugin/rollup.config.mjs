import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import css from "rollup-plugin-import-css";

export default {
    input: 'src/index.tsx',
    external: ['react', '@repo/common', '@repo/ui', '@repo/icon', '@repo/editor'],
	output: {
		file: 'dist/bundle.js',
        format: 'umd',
        name: 'testPlugin',
        globals: {
            "@repo/common": "common",
            "@repo/ui": "ui",
            "@repo/icon": "icon",
            "@repo/editor": "editor",
            "react": "React"
        }
    },
    plugins: [
        typescript(),
        css(),
        postcss({
            plugins: [
                tailwindcss(),
                autoprefixer(),
            ],
      extract: false,
      minimize: true,
    })
    ],
};