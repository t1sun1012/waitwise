import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'output',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'wAItwise',
    description: 'Learn something while you wait for AI to think.',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://generativelanguage.googleapis.com/*',
    ],
  },
});
