import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const hasCustomDomain = existsSync(new URL('./CNAME', import.meta.url));
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName && !hasCustomDomain ? `/${repositoryName}/` : '/';

export default defineConfig({ base, plugins: [react()] });
