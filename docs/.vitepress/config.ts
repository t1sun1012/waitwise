import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'wAItwise',
  description: 'A Chrome extension that turns AI wait time into active thinking.',
  base: '/waitwise/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: { text: 'wAItwise' },
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'GitHub', link: 'https://github.com/t1sun1012/waitwise' },
    ],
    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'User Guide', link: '/user-guide' },
        ],
      },
      {
        text: 'How It Works',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'RAG Corpus', link: '/rag-corpus' },
          { text: 'Privacy Model', link: '/privacy' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Development', link: '/development' },
          { text: 'Deployment', link: '/deployment' },
          { text: 'Roadmap', link: '/roadmap' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/t1sun1012/waitwise' },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Prototype documentation for the wAItwise Chrome extension.',
      copyright: 'Released as project documentation for wAItwise.',
    },
  },
});
