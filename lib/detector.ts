/**
 * detector.ts — all ChatGPT DOM selectors live here.
 * Nothing outside this file should touch ChatGPT-specific DOM structure.
 *
 * Generation currently has two observable phases in ChatGPT:
 * 1. an explicit "Thinking" label near the response
 * 2. an in-progress composer state with a Stop control after the label disappears
 *
 * We treat either phase as "generation active" so the widget stays mounted until
 * ChatGPT returns to its idle/send state.
 */

// Update this list if ChatGPT renames or localises the label.
const THINKING_TEXTS = ['Thinking'];

// ChatGPT keeps a stop control mounted for the full generation lifecycle.
const STOP_LABEL_SNIPPETS = ['stop', 'stop generating', 'stop streaming'];
const END_DEBOUNCE_MS = 500;

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

function getComposerRoots(): Element[] {
  const candidates = [
    document.querySelector('#thread-bottom-container'),
    document.querySelector('[data-testid="composer"]'),
    document.querySelector('main form'),
    document.querySelector('form'),
    document.querySelector('footer'),
  ].filter((el): el is Element => el instanceof Element);

  return [...new Set(candidates)];
}

function hasStopLabel(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized !== '' &&
    STOP_LABEL_SNIPPETS.some((snippet) => normalized.includes(snippet));
}

function isSemanticStopControl(el: Element): boolean {
  if (el instanceof HTMLButtonElement) {
    if (hasStopLabel(el.getAttribute('aria-label'))) return true;
    if (hasStopLabel(el.getAttribute('title'))) return true;
    if (hasStopLabel(el.textContent)) return true;
  }

  return hasStopLabel(el.getAttribute('data-testid'));
}

function hasSemanticStopControl(root: ParentNode): boolean {
  const candidates = root.querySelectorAll('button, [data-testid]');
  return [...candidates].some(isSemanticStopControl);
}

function isSquareStopIconPath(path: SVGPathElement): boolean {
  const d = path.getAttribute('d')?.replace(/\s+/g, '').toLowerCase() ?? '';
  if (!d) return false;

  return (
    d.includes('h10v10h-10z') ||
    d.includes('h12v12h-12z') ||
    d.includes('h8v8h-8z')
  );
}

function hasStopIconFallback(root: ParentNode): boolean {
  const buttons = [...root.querySelectorAll('button')];

  return buttons.some((button) => {
    const svg = button.querySelector('svg');
    if (!svg) return false;

    const rect = svg.querySelector('rect');
    if (rect) {
      const width = Number(rect.getAttribute('width') ?? '0');
      const height = Number(rect.getAttribute('height') ?? '0');
      if (width > 0 && width === height) return true;
    }

    const paths = [...svg.querySelectorAll('path')];
    return paths.some(isSquareStopIconPath);
  });
}

function hasActiveStopControl(): boolean {
  const roots = getComposerRoots();
  if (roots.length === 0) return false;

  if (roots.some(hasSemanticStopControl)) return true;
  return roots.some(hasStopIconFallback);
}

function isGenerationActive(): boolean {
  return findThinkingEl() !== null || hasActiveStopControl();
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
  let generationActive = false;
  let endDebounce: ReturnType<typeof setTimeout> | null = null;

  function handleMutation() {
    const nextGenerationActive = isGenerationActive();

    if (nextGenerationActive && endDebounce) {
      clearTimeout(endDebounce);
      endDebounce = null;
    }

    if (!generationActive && nextGenerationActive) {
      generationActive = true;
      callbacks.onThinkingStarted(extractPrompt());
      return;
    }

    if (generationActive && !nextGenerationActive) {
      if (endDebounce) clearTimeout(endDebounce);
      endDebounce = setTimeout(() => {
        endDebounce = null;
        if (isGenerationActive()) return;
        generationActive = false;
        callbacks.onThinkingEnded();
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
  handleMutation();

  return () => {
    observer.disconnect();
    if (endDebounce) clearTimeout(endDebounce);
    generationActive = false;
  };
}
