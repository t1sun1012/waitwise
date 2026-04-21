import type { PetMood, PetStage, PetState } from '../types/pet';
import { DEFAULT_PET_STATE } from '../types/pet';

const XP_CORRECT = 15;
const XP_WRONG = 5;
const HUNGER_CORRECT = 22;
const HUNGER_WRONG = 6;
const HUNGER_SKIP = -6;
const HUNGER_DECAY_PER_HOUR = 10;

// XP total needed to reach level N: (N-1) * (30 + 10*N)
function xpThreshold(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * (30 + 10 * level);
}

function levelFromXp(xp: number): number {
  let level = 1;
  while (xpThreshold(level + 1) <= xp) level++;
  return level;
}

export function getXpProgress(petState: PetState): {
  current: number;
  needed: number;
  percent: number;
} {
  const current = petState.xp - xpThreshold(petState.level);
  const needed = xpThreshold(petState.level + 1) - xpThreshold(petState.level);
  const percent = needed > 0 ? Math.min(100, (current / needed) * 100) : 100;
  return { current, needed, percent };
}

export function getStage(level: number): PetStage {
  if (level <= 2) return 'egg';
  if (level <= 5) return 'baby';
  if (level <= 10) return 'child';
  if (level <= 20) return 'teen';
  return 'adult';
}

function currentHunger(petState: PetState): number {
  const hoursElapsed = (Date.now() - petState.lastInteraction) / 3_600_000;
  return Math.max(0, Math.min(100, petState.hunger - hoursElapsed * HUNGER_DECAY_PER_HOUR));
}

function moodFromHunger(hunger: number): PetMood {
  if (hunger >= 70) return 'happy';
  if (hunger >= 35) return 'neutral';
  return 'sad';
}

export function applyCorrectAnswer(petState: PetState): PetState {
  const newXp = petState.xp + XP_CORRECT;
  const newLevel = levelFromXp(newXp);
  const newHunger = Math.min(100, currentHunger(petState) + HUNGER_CORRECT);
  const newConsecutive = petState.consecutiveCorrect + 1;
  const newMood: PetMood = newConsecutive >= 3 ? 'excited' : 'happy';
  return {
    xp: newXp,
    level: newLevel,
    hunger: newHunger,
    mood: newMood,
    consecutiveCorrect: newConsecutive,
    lastInteraction: Date.now(),
  };
}

export function applyWrongAnswer(petState: PetState): PetState {
  const newXp = petState.xp + XP_WRONG;
  const newLevel = levelFromXp(newXp);
  const newHunger = Math.min(100, currentHunger(petState) + HUNGER_WRONG);
  return {
    xp: newXp,
    level: newLevel,
    hunger: newHunger,
    mood: 'sad',
    consecutiveCorrect: 0,
    lastInteraction: Date.now(),
  };
}

export function applySkip(petState: PetState): PetState {
  const newHunger = Math.max(0, currentHunger(petState) + HUNGER_SKIP);
  return {
    ...petState,
    hunger: newHunger,
    mood: moodFromHunger(newHunger),
    consecutiveCorrect: 0,
    lastInteraction: Date.now(),
  };
}

export function hydratePetState(raw: unknown): PetState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PET_STATE, lastInteraction: Date.now() };
  }
  const c = raw as Partial<PetState>;
  const xp = typeof c.xp === 'number' ? Math.max(0, c.xp) : 0;
  const hunger = typeof c.hunger === 'number' ? Math.max(0, Math.min(100, c.hunger)) : 80;
  const validMoods: PetMood[] = ['happy', 'neutral', 'sad', 'excited', 'sleeping'];
  const mood = validMoods.includes(c.mood as PetMood) ? (c.mood as PetMood) : moodFromHunger(hunger);
  return {
    xp,
    level: levelFromXp(xp),
    hunger,
    mood,
    lastInteraction: typeof c.lastInteraction === 'number' ? c.lastInteraction : Date.now(),
    consecutiveCorrect: typeof c.consecutiveCorrect === 'number' ? c.consecutiveCorrect : 0,
  };
}
