import '../assets/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QuizWidget } from '../components/QuizWidget';
import { startDetector } from '../lib/detector';
import { getWidgetPosition, setWidgetPosition } from '../lib/storage';
import type { QuizQuestion } from '../types/messages';

type ShadowUi = Awaited<ReturnType<typeof createShadowRootUi>>;
const SHOW_DELAY_MS = 800;

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    type State = 'idle' | 'generating' | 'dismissed';
    let state: State = 'idle';
    let uiRoot: ShadowUi | null = null;
    let generationId = 0;
    let activeGenerationId: number | null = null;
    let mountedGenerationId: number | null = null;
    let showTimer: ReturnType<typeof setTimeout> | null = null;

    function clearShowTimer() {
      if (showTimer === null) return;
      clearTimeout(showTimer);
      showTimer = null;
    }

    function removeMountedUi(targetUi?: ShadowUi | null) {
      if (targetUi) {
        if (uiRoot === targetUi) {
          uiRoot = null;
        }
        targetUi.remove();
      } else {
        uiRoot?.remove();
        uiRoot = null;
      }

      mountedGenerationId = null;
    }

    function isActiveGeneration(targetGenerationId: number): boolean {
      return (
        state === 'generating' &&
        activeGenerationId === targetGenerationId
      );
    }

    function resetGenerationState() {
      clearShowTimer();
      activeGenerationId = null;
      state = 'idle';
      removeMountedUi();
    }

    function dismissGeneration(targetGenerationId: number, targetUi?: ShadowUi | null) {
      if (activeGenerationId !== targetGenerationId) return;

      clearShowTimer();
      state = 'dismissed';
      removeMountedUi(targetUi);
      void chrome.runtime.sendMessage({ type: 'QUIZ_SKIPPED' });
    }

    // ── Shadow DOM UI ───────────────────────────────────────────────────────
    async function mountUi(
      question: QuizQuestion,
      targetGenerationId: number
    ): Promise<ShadowUi> {
      const initialPosition = await getWidgetPosition();
      let localUi: ShadowUi | null = null;

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
              initialPosition={initialPosition}
              onPositionCommitted={(position) => {
                void setWidgetPosition(position);
              }}
              onSkip={() => {
                dismissGeneration(targetGenerationId, localUi);
              }}
            />
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      localUi = ui;
      ui.mount();
      return ui;
    }

    async function requestAndMountQuiz(targetGenerationId: number) {
      if (
        !isActiveGeneration(targetGenerationId) ||
        mountedGenerationId === targetGenerationId
      ) {
        return;
      }

      console.log('[wAItwise] Thinking detected — requesting quiz');

      let response: { question?: QuizQuestion } | undefined;
      try {
        response = await chrome.runtime.sendMessage({ type: 'GET_QUIZ' });
      } catch (err) {
        console.warn('[wAItwise] sendMessage failed (reload the tab):', err);
        return;
      }

      if (
        !isActiveGeneration(targetGenerationId) ||
        mountedGenerationId === targetGenerationId
      ) {
        return;
      }

      if (!response?.question) {
        console.warn('[wAItwise] No question in response:', response);
        return;
      }

      console.log('[wAItwise] Mounting widget');
      const nextUi = await mountUi(response.question, targetGenerationId);

      if (!isActiveGeneration(targetGenerationId)) {
        nextUi.remove();
        return;
      }

      uiRoot = nextUi;
      mountedGenerationId = targetGenerationId;
    }

    // ── Detector callbacks ──────────────────────────────────────────────────
    async function onThinkingStarted(_prompt: string) {
      if (state !== 'idle') return;
      // If extension was reloaded without refreshing the tab, bail out silently
      if (!chrome.runtime?.id) return;

      generationId += 1;
      const currentGenerationId = generationId;
      activeGenerationId = currentGenerationId;
      state = 'generating';
      clearShowTimer();
      console.log('[wAItwise] Thinking detected — scheduling quiz');

      showTimer = setTimeout(() => {
        showTimer = null;
        void requestAndMountQuiz(currentGenerationId);
      }, SHOW_DELAY_MS);
    }

    function onThinkingEnded() {
      console.log('[wAItwise] Thinking ended, state:', state);
      if (state === 'dismissed') {
        clearShowTimer();
        activeGenerationId = null;
        mountedGenerationId = null;
        state = 'idle';
        return;
      }
      if (state === 'generating') {
        resetGenerationState();
      }
    }

    // ── Start detector; re-start on SPA navigation ──────────────────────────
    console.log('[wAItwise] Content script loaded, starting detector');
    let stopDetector = startDetector({ onThinkingStarted, onThinkingEnded });

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      console.log('[wAItwise] URL changed, resetting');
      stopDetector();
      resetGenerationState();
      stopDetector = startDetector({ onThinkingStarted, onThinkingEnded });
    });

    ctx.onInvalidated(() => {
      stopDetector();
      resetGenerationState();
    });
  },
});
