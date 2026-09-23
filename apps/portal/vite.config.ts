import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// ---- Style switch (one line) -----------------------------------------------------------------
// The folder under plugins/eisen-design/skills that supplies tokens.css (+ components.css).
// 'design-tokens' is the neutral contract, styled by this app's own src/styles/components.css.
// Any other value (e.g. 'ui-style-editorial') uses that skill's tokens.css AND components.css.
// Override without editing: PORTAL_STYLE=ui-style-editorial npm run build
const STYLE = process.env.PORTAL_STYLE || 'design-tokens';
// ----------------------------------------------------------------------------------------------

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const skill = `plugins/eisen-design/skills/${STYLE}`;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ strict: true })
		})
	],
	resolve: {
		alias: {
			'$style/tokens.css': repo(`${skill}/tokens.css`),
			'$style/components.css':
				STYLE === 'design-tokens' ? here('./src/styles/components.css') : repo(`${skill}/components.css`)
		}
	},
	server: {
		// The dev server must be allowed to serve registry/ and plugins/ from outside the app root.
		fs: { allow: [repo('.')] }
	}
});
