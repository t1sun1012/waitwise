import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WidgetPosition } from '../lib/storage';
import type { QuizQuestion } from '../types/messages';

interface Props {
  question: QuizQuestion;
  onAnswer: (correct: boolean) => void;
  onSkip: () => void;
  initialPosition?: WidgetPosition | null;
  onPositionCommitted: (position: WidgetPosition) => void;
}

const VIEWPORT_MARGIN = 16;
const DEFAULT_EDGE_OFFSET = 24;

interface WidgetSize {
  width: number;
  height: number;
}

interface DragState {
  pointerId: number;
  startLeft: number;
  startTop: number;
  startClientX: number;
  startClientY: number;
}

function clampAxis(value: number, size: number, viewport: number): number {
  const max = Math.max(0, viewport - size - VIEWPORT_MARGIN);
  const min = Math.min(VIEWPORT_MARGIN, max);
  return Math.min(Math.max(value, min), max);
}

function clampPosition(
  position: WidgetPosition,
  size: WidgetSize
): WidgetPosition {
  return {
    left: clampAxis(position.left, size.width, window.innerWidth),
    top: clampAxis(position.top, size.height, window.innerHeight),
  };
}

function getDefaultPosition(size: WidgetSize): WidgetPosition {
  return clampPosition(
    {
      left: window.innerWidth - size.width - DEFAULT_EDGE_OFFSET,
      top: window.innerHeight - size.height - DEFAULT_EDGE_OFFSET,
    },
    size
  );
}

function positionsMatch(a: WidgetPosition, b: WidgetPosition): boolean {
  return a.left === b.left && a.top === b.top;
}

export function QuizWidget({
  question,
  onAnswer,
  onSkip,
  initialPosition,
  onPositionCommitted,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [position, setPosition] = useState<WidgetPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef<WidgetPosition | null>(null);

  const answered = selected !== null;
  const correct = selected === question.correctIndex;

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
    onAnswer(idx === question.correctIndex);
  }

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const size = { width: rect.width, height: rect.height };
    const nextPosition = initialPosition
      ? clampPosition(initialPosition, size)
      : getDefaultPosition(size);

    setPosition(nextPosition);
    positionRef.current = nextPosition;

    if (initialPosition && !positionsMatch(nextPosition, initialPosition)) {
      onPositionCommitted(nextPosition);
    }
  }, [initialPosition, onPositionCommitted]);

  useEffect(() => {
    function handleResize() {
      const card = cardRef.current;
      const currentPosition = positionRef.current;
      if (!card || !currentPosition) return;

      const rect = card.getBoundingClientRect();
      const clamped = clampPosition(currentPosition, {
        width: rect.width,
        height: rect.height,
      });

      if (positionsMatch(clamped, currentPosition)) return;
      setPosition(clamped);
      positionRef.current = clamped;
      onPositionCommitted(clamped);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onPositionCommitted]);

  function finishDrag(pointerTarget: HTMLDivElement) {
    const dragState = dragRef.current;
    if (!dragState) return;

    if (pointerTarget.hasPointerCapture(dragState.pointerId)) {
      pointerTarget.releasePointerCapture(dragState.pointerId);
    }

    dragRef.current = null;
    setDragging(false);

    if (positionRef.current) {
      onPositionCommitted(positionRef.current);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !position) return;
    if (event.target instanceof Element && event.target.closest('button')) return;

    const card = cardRef.current;
    if (!card) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startLeft: position.left,
      startTop: position.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current;
    const card = cardRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !card) return;

    const rect = card.getBoundingClientRect();
    const nextPosition = clampPosition(
      {
        left: dragState.startLeft + (event.clientX - dragState.startClientX),
        top: dragState.startTop + (event.clientY - dragState.startClientY),
      },
      { width: rect.width, height: rect.height }
    );

    setPosition(nextPosition);
    positionRef.current = nextPosition;
  }

  return (
    <div
      ref={cardRef}
      className={`fixed z-[9999] w-72 rounded-2xl border border-gray-100 bg-white p-4 font-sans text-sm shadow-2xl ${
        dragging ? 'select-none' : ''
      }`}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div
        className={`mb-3 flex items-center justify-between touch-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event.currentTarget)}
        onPointerCancel={(event) => finishDrag(event.currentTarget)}
      >
        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
          Quick Quiz
        </span>
        <button
          onClick={onSkip}
          className="cursor-pointer text-lg leading-none text-gray-400 hover:text-gray-600"
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
