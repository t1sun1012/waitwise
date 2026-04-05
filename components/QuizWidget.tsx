import React, { useState } from 'react';
import type { QuizQuestion } from '../types/messages';

interface Props {
  question: QuizQuestion;
  onAnswer: (correct: boolean) => void;
  onSkip: () => void;
}

export function QuizWidget({ question, onAnswer, onSkip }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  const answered = selected !== null;
  const correct = selected === question.correctIndex;

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
    onAnswer(idx === question.correctIndex);
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-72 rounded-2xl bg-white shadow-2xl border border-gray-100 p-4 font-sans text-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
          Quick Quiz
        </span>
        <button
          onClick={onSkip}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      <p className="font-medium text-gray-800 mb-3">{question.question}</p>

      <div className="flex flex-col gap-2">
        {question.options.map((opt, idx) => {
          let style =
            'rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ';
          if (!answered) {
            style += 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50';
          } else if (idx === question.correctIndex) {
            style += 'border-green-400 bg-green-50 text-green-800';
          } else if (idx === selected) {
            style += 'border-red-400 bg-red-50 text-red-800';
          } else {
            style += 'border-gray-200 text-gray-400';
          }

          return (
            <button key={idx} className={style} onClick={() => handleSelect(idx)}>
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <p className={`mt-3 text-xs font-medium ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? 'Correct!' : `Wrong — answer is ${question.options[question.correctIndex]}`}
        </p>
      )}
    </div>
  );
}
