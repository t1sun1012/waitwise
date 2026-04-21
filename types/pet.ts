export type PetMood = 'happy' | 'neutral' | 'sad' | 'excited' | 'sleeping';
export type PetStage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';

export interface PetState {
  xp: number;
  level: number;
  mood: PetMood;
  lastInteraction: number;
  hunger: number; // 0–100
  consecutiveCorrect: number;
}

export const DEFAULT_PET_STATE: PetState = {
  xp: 0,
  level: 1,
  mood: 'neutral',
  lastInteraction: 0,
  hunger: 80,
  consecutiveCorrect: 0,
};
