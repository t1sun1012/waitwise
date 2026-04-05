import '../assets/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QuizWidget } from '../components/QuizWidget';
import { startDetector } from '../lib/detector';
import type { QuizQuestion } from '../types/messages';

type ShadowUi = Awaited<ReturnType<typeof createShadowRootUi>>;

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    type State = 'idle' | 'generating' | 'dismissed';
    let state: State = 'idle';
    let uiRoot: ShadowUi | null = null;

    // ── Shadow DOM UI ───────────────────────────────────────────────────────
    async function mountUi(question: QuizQuestion): Promise<ShadowUi> {
      const ui = await createShadowRootUi(ctx, {
        name: 'waitwise-widget',
        position: 'overlay',
        zIndex: 9999,
        onMount(container) {
          const root = ReactDOM.createRoot(container);
          root.render(
            <QuizWidget
              question={question}
              onAnswer={(correct) => {
                chrome.runtime.sendMessage({ type: 'QUIZ_ANSWERED', correct });
              }}
              onSkip={() => {
                state = 'dismissed';
                chrome.runtime.sendMessage({ type: 'QUIZ_SKIPPED' });
                uiRoot?.remove();
                uiRoot = null;
              }}
            />
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
      return ui;
    }

    // ── Detector callbacks ──────────────────────────────────────────────────
    async function onThinkingStarted(_prompt: string) {
      if (state !== 'idle') return;
      // If extension was reloaded without refreshing the tab, bail out silently
      if (!chrome.runtime?.id) return;
      state = 'generating';
      console.log('[wAItwise] Thinking detected — requesting quiz');

      let response: { question?: QuizQuestion } | undefined;
      try {
        response = await chrome.runtime.sendMessage({ type: 'GET_QUIZ' });
      } catch (err) {
        console.warn('[wAItwise] sendMessage failed (reload the tab):', err);
        state = 'idle';
        return;
      }

      if (!response?.question) {
        console.warn('[wAItwise] No question in response:', response);
        state = 'idle';
        return;
      }

      console.log('[wAItwise] Mounting widget');
      uiRoot = await mountUi(response.question);
    }

    function onThinkingEnded() {
      console.log('[wAItwise] Thinking ended, state:', state);
      if (state === 'dismissed') {
        state = 'idle';
        return;
      }
      if (state === 'generating') {
        state = 'idle';
        uiRoot?.remove();
        uiRoot = null;
      }
    }

    // ── Start detector; re-start on SPA navigation ──────────────────────────
    console.log('[wAItwise] Content script loaded, starting detector');
    let stopDetector = startDetector({ onThinkingStarted, onThinkingEnded });

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      console.log('[wAItwise] URL changed, resetting');
      stopDetector();
      state = 'idle';
      uiRoot?.remove();
      uiRoot = null;
      stopDetector = startDetector({ onThinkingStarted, onThinkingEnded });
    });

    ctx.onInvalidated(() => {
      stopDetector();
      uiRoot?.remove();
    });
  },
});
