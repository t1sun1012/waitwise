import { mathGenerator } from '../quiz/mathGenerator';
import { recordAnswer, recordQuizShown } from '../lib/storage';
import type { Message } from '../types/messages';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'GET_QUIZ': {
          await recordQuizShown();
          const question = mathGenerator.generate();
          sendResponse({ question });
          break;
        }
        case 'QUIZ_ANSWERED': {
          const stats = await recordAnswer(message.correct);
          sendResponse({ stats });
          break;
        }
        case 'QUIZ_SKIPPED': {
          sendResponse({});
          break;
        }
        default:
          sendResponse({});
      }
    })();
    return true; // keep channel open for async response
  });
});
