import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
    input: 'src/index.tsx',
    external: ['react', '@repo/common', '@repo/ui'],
	output: {
		file: 'dist/bundle.js',
        format: 'umd',
        name: 'testPlugin',
        globals: {
            "@repo/common": "common",
            "@repo/ui": "ui",
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