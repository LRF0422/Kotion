import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
    input: 'src/App.tsx',
    external: ['react', '@repo/common', '@repo/ui','@repo/editor','@repo/core','@repo/icon'],
	output: {
		file: 'dist/bundle.js',
        format: 'umd',
        name: 'DefaultPlugin',
        globals: {
            "@repo/common": "common",
            "@repo/ui": "ui",
            "@repo/editor": "editor",
            "@repo/core": "core",
            "@repo/icon": "icon",
            "react": "React"
        }
    },
    plugins: [
        typescript(),
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