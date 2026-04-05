import type { QuizQuestion } from '../types/messages';

type Op = '+' | '-' | '×' | '÷';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleWrongAnswers(correct: number, count: number): number[] {
  const offsets = [-3, -2, -1, 1, 2, 3];
  const pool = offsets
    .map((o) => correct + o)
    .filter((n) => n !== correct);
  const picked: number[] = [];
  while (picked.length < count) {
    const idx = randomInt(0, pool.length - 1);
    const val = pool.splice(idx, 1)[0];
    picked.push(val);
  }
  return picked;
}

function generate(): QuizQuestion {
  const op: Op = (['+', '-', '×', '÷'] as Op[])[randomInt(0, 3)];
  let a: number, b: number, answer: number, question: string;

  switch (op) {
    case '+':
      a = randomInt(1, 50);
      b = randomInt(1, 50);
      answer = a + b;
      question = `${a} + ${b} = ?`;
      break;
    case '-':
      a = randomInt(10, 50);
      b = randomInt(1, a);
      answer = a - b;
      question = `${a} − ${b} = ?`;
      break;
    case '×':
      a = randomInt(2, 12);
      b = randomInt(2, 12);
      answer = a * b;
      question = `${a} × ${b} = ?`;
      break;
    case '÷': {
      b = randomInt(2, 10);
      answer = randomInt(2, 10);
      a = b * answer;
      question = `${a} ÷ ${b} = ?`;
      break;
    }
  }

  const wrongOptions = shuffleWrongAnswers(answer, 3);
  const allOptions = [...wrongOptions, answer];

  // Shuffle options and track correct index
  for (let i = allOptions.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
  }
  const correctIndex = allOptions.indexOf(answer);

  return {
    id: `math-${Date.now()}-${randomInt(0, 9999)}`,
    question,
    options: allOptions.map(String),
    correctIndex,
  };
}

export const mathGenerator = { generate };
