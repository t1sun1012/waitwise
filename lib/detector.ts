/**
 * detector.ts — all ChatGPT DOM selectors live here.
 * Nothing outside this file should touch ChatGPT-specific DOM structure.
 *
 * Confirmed selector (DevTools, 2025):
 *   <div class="loading-shimmer ...">Thinking</div>
 *
 * The element can appear anywhere inside <main> — its parent section
 * changes with each conversation turn, so we always search globally.
 */

// Update this list if ChatGPT renames or localises the label.
const THINKING_TEXTS = ['Thinking'];

// Debounce for "ended" detection only — we don't debounce the start
// so a brief Thinking flash isn't missed.
const END_DEBOUNCE_MS = 200;

export interface DetectorCallbacks {
  onThinkingStarted: (prompt: string) => void;
  onThinkingEnded: () => void;
}

/** Returns the active Thinking indicator element, wherever it is in the DOM. */
function findThinkingEl(): Element | null {
  // Primary: .loading-shimmer with matching text (class-agnostic fallback below)
  const byClass = [...document.querySelectorAll('div.loading-shimmer')].find(
    (el) => THINKING_TEXTS.includes(el.textContent?.trim() ?? '')
  );
  if (byClass) return byClass;

  // Fallback: any element whose text exactly matches, in case class changes
  return (
    [...document.querySelectorAll('div')].find(
      (el) =>
        THINKING_TEXTS.includes(el.textContent?.trim() ?? '') &&
        el.childElementCount === 0 // leaf node only — avoid matching parent containers
    ) ?? null
  );
}

/** Returns true if an element is still the active Thinking indicator. */
function isStillThinking(el: Element): boolean {
  return (
    document.contains(el) &&
    THINKING_TEXTS.includes(el.textContent?.trim() ?? '')
  );
}

function extractPrompt(): string {
  const userMessages = document.querySelectorAll(
    '[data-message-author-role="user"]'
  );
  if (userMessages.length === 0) return '';
  const last = userMessages[userMessages.length - 1];
  return last.textContent?.trim() ?? '';
}

export function startDetector(callbacks: DetectorCallbacks): () => void {
  let thinkingEl: Element | null = null;
  let endDebounce: ReturnType<typeof setTimeout> | null = null;

  function handleMutation() {
    const found = findThinkingEl();

    if (!thinkingEl && found) {
      // Thinking indicator appeared — fire immediately (no debounce)
      if (endDebounce) clearTimeout(endDebounce);
      thinkingEl = found;
      callbacks.onThinkingStarted(extractPrompt());
      return;
    }

    if (thinkingEl && !isStillThinking(thinkingEl)) {
      // Element was removed OR its text changed away from "Thinking"
      // Debounce slightly to avoid noise from brief DOM reshuffles
      if (endDebounce) clearTimeout(endDebounce);
      endDebounce = setTimeout(() => {
        // Double-check: a new Thinking element may have appeared in a new section
        const recheck = findThinkingEl();
        if (recheck) {
          // New turn started — update ref, don't fire ended/started again
          thinkingEl = recheck;
        } else {
          thinkingEl = null;
          callbacks.onThinkingEnded();
        }
      }, END_DEBOUNCE_MS);
    }
  }

  const observer = new MutationObserver(handleMutation);
  const target = document.querySelector('main') ?? document.body;
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true, // catch text node changes inside the element
  });

  return () => {
    observer.disconnect();
    if (endDebounce) clearTimeout(endDebounce);
    thinkingEl = null;
  };
}
