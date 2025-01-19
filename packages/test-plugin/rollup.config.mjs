import typescript from '@rollup/plugin-typescript';

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
    plugins: [typescript()],
};