import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/index.tsx',
	output: {
		file: 'dist/bundle.js',
        format: 'umd',
        name: 'TestPlugin',
        globals: {
            "@repo/common": "@repo/common",
            "react": "React"
        }
    },
    plugins: [typescript()],
};