import { defineConfig } from 'vitepress';

const repo = 'https://github.com/martinisef/ai_sdlc';

export default defineConfig({
  title: 'ai-native-sdlc',
  description: 'The AI-native SDLC loop for Claude Code, Cursor and AGENTS.md agents.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/introduction' },
          { text: 'Reference', link: '/reference/cli' },
        ],
        sidebar: [
          {
            text: 'Getting started',
            items: [
              { text: 'Introduction', link: '/guide/introduction' },
              { text: 'Quickstart: Claude Code', link: '/guide/quickstart-claude' },
              { text: 'Quickstart: Cursor', link: '/guide/quickstart-cursor' },
              { text: 'Quickstart: AGENTS.md agents', link: '/guide/quickstart-agents-md' },
            ],
          },
          {
            text: 'Concepts',
            items: [
              { text: 'The loop', link: '/guide/concepts' },
              { text: 'Guardrails', link: '/guide/guardrails' },
              { text: 'Dashboard', link: '/guide/dashboard' },
            ],
          },
          {
            text: 'Guides',
            items: [
              { text: 'For teams', link: '/guide/team' },
              { text: 'For platform teams', link: '/guide/platform' },
              { text: 'Managed settings', link: '/guide/managed-settings' },
            ],
          },
          {
            text: 'Reference',
            items: [
              { text: 'CLI', link: '/reference/cli' },
              { text: 'Configuration', link: '/reference/config' },
              { text: 'CI', link: '/reference/ci' },
              { text: 'CI · GitHub', link: '/reference/ci-github' },
              { text: 'CI · GitLab', link: '/reference/ci-gitlab' },
              { text: 'CI · Bitbucket', link: '/reference/ci-bitbucket' },
              { text: 'Control bands', link: '/reference/bands' },
              { text: 'Evals', link: '/reference/evals' },
              { text: 'RFC: hosted', link: '/rfc/hosted' },
            ],
          },
        ],
      },
    },
    es: {
      label: 'Español',
      lang: 'es',
      themeConfig: {
        nav: [
          { text: 'Guías', link: '/es/guia-equipo' },
          { text: 'Referencia (en)', link: '/reference/cli' },
        ],
        sidebar: [
          {
            text: 'Guías',
            items: [
              { text: 'Inicio', link: '/es/' },
              { text: 'Para equipos', link: '/es/guia-equipo' },
              { text: 'Para plataforma', link: '/es/guia-plataforma' },
              { text: 'Managed settings', link: '/es/managed-settings' },
            ],
          },
        ],
      },
    },
  },
});
