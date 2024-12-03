import react from '@vitejs/plugin-react-swc'
import { join, resolve } from 'path'
import type { UserConfig } from 'vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { peerDependencies } from './package.json'

export default defineConfig({
	plugins: [
		react(),
		dts({ rollupTypes: true }), // Output .d.ts files
	],
	build: {
		target: 'esnext',
		minify: false,
		lib: {
			entry: resolve(__dirname, join('src', 'index.ts')),
			fileName: 'index',
			formats: ['es', 'cjs'],
		},
		rollupOptions: {
			// Exclude peer dependencies from the bundle to reduce bundle size
			external: ['react/jsx-runtime', ...Object.keys(peerDependencies)],
		},
	},
}) satisfies UserConfig
