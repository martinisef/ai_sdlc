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
          { text: 'Start here', link: '/start/what-is-it' },
          { text: 'Guide', link: '/guide/introduction' },
          { text: 'Reference', link: '/reference/cli' },
        ],
        sidebar: [
          {
            text: 'Start here',
            items: [
              { text: 'What it is, in 2 minutes', link: '/start/what-is-it' },
              { text: 'Install', link: '/start/install' },
              { text: 'Tutorial: your first change', link: '/start/tutorial' },
              { text: 'Everyday use', link: '/start/daily' },
              { text: 'Connect Jira', link: '/start/jira' },
              { text: 'Troubleshooting', link: '/start/troubleshooting' },
            ],
          },
          {
            text: 'Getting started',
            items: [
              { text: 'Introduction', link: '/guide/introduction' },
              { text: 'Your first change in 10 minutes', link: '/guide/first-change' },
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
              { text: 'Risk tiers', link: '/guide/risk' },
              { text: 'Ship and own it', link: '/guide/rollout' },
              { text: 'Dashboard', link: '/guide/dashboard' },
              { text: 'Editor extension', link: '/guide/editor' },
            ],
          },
          {
            text: 'Guides',
            items: [
              { text: 'For teams', link: '/guide/team' },
              { text: 'Running a pilot', link: '/guide/pilot' },
              { text: 'For platform teams', link: '/guide/platform' },
              { text: 'Managed settings', link: '/guide/managed-settings' },
              { text: 'Notifications', link: '/guide/notifications' },
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
              { text: 'Trackers', link: '/reference/trackers' },
              { text: 'Control bands', link: '/reference/bands' },
              { text: 'Evals', link: '/reference/evals' },
              { text: 'Agent scorecard', link: '/reference/agent-scorecard' },
              { text: 'Telemetry', link: '/reference/telemetry' },
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
          { text: 'Empezá acá', link: '/es/empezar/que-es' },
          { text: 'Guías', link: '/es/guia-equipo' },
          { text: 'Integraciones', link: '/es/integraciones/trackers' },
          { text: 'Referencia (en)', link: '/reference/cli' },
        ],
        sidebar: [
          {
            text: 'Empezá acá',
            items: [
              { text: 'Qué es, en 2 minutos', link: '/es/empezar/que-es' },
              { text: 'Instalar', link: '/es/empezar/instalar' },
              { text: 'Tutorial: tu primer cambio', link: '/es/empezar/tutorial' },
              { text: 'Uso diario', link: '/es/empezar/dia-a-dia' },
              { text: 'Conectar Jira', link: '/es/empezar/jira' },
              { text: 'Problemas frecuentes', link: '/es/empezar/problemas' },
            ],
          },
          {
            text: 'Guías',
            items: [
              { text: 'Inicio', link: '/es/' },
              { text: 'Tu primer cambio en 10 minutos', link: '/es/primer-cambio' },
              { text: 'Para equipos', link: '/es/guia-equipo' },
              { text: 'Niveles de riesgo', link: '/es/riesgo' },
              { text: 'Mergear y hacerse cargo', link: '/es/despliegue' },
              { text: 'Para plataforma', link: '/es/guia-plataforma' },
              { text: 'Managed settings', link: '/es/managed-settings' },
              { text: 'Avisos', link: '/es/avisos' },
            ],
          },
          {
            text: 'Integraciones',
            items: [
              { text: 'Trackers (Jira, GitHub Issues, Linear)', link: '/es/integraciones/trackers' },
              { text: 'CI · GitHub', link: '/es/integraciones/ci-github' },
              { text: 'CI · GitLab', link: '/es/integraciones/ci-gitlab' },
              { text: 'CI · Bitbucket', link: '/es/integraciones/ci-bitbucket' },
            ],
          },
        ],
      },
    },
  },
});
