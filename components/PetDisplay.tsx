import React, { useEffect, useRef, useState } from 'react';
import { getStage, getXpProgress } from '../lib/petEngine';
import type { PetMood, PetStage, PetState } from '../types/pet';

export type PetAnimationType = 'celebrate' | 'sad' | 'idle';

interface Props {
  petState: PetState;
  animationType: PetAnimationType;
  animKey: number;
  xpGained?: number;
}

const BODY_COLOR: Record<PetMood, string> = {
  excited: '#FCD34D',
  happy: '#6EE7B7',
  neutral: '#C4B5FD',
  sad: '#94A3B8',
  sleeping: '#DDD6FE',
};

const BODY_SHADOW: Record<PetMood, string> = {
  excited: '#F59E0B',
  happy: '#10B981',
  neutral: '#7C3AED',
  sad: '#64748B',
  sleeping: '#8B5CF6',
};

const PET_ANIMATIONS = `
@keyframes pet-bob {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}
@keyframes pet-celebrate {
  0%   { transform: scale(1)   rotate(0deg); }
  15%  { transform: scale(1.35) rotate(-12deg); }
  30%  { transform: scale(1.35) rotate(12deg); }
  50%  { transform: scale(1.2)  rotate(-6deg); }
  70%  { transform: scale(1.1)  rotate(6deg); }
  100% { transform: scale(1)   rotate(0deg); }
}
@keyframes pet-shake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  20% { transform: translateX(-6px) rotate(-3deg); }
  40% { transform: translateX(6px) rotate(3deg); }
  60% { transform: translateX(-5px) rotate(-2deg); }
  80% { transform: translateX(5px) rotate(2deg); }
}
@keyframes egg-wobble {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(4deg); }
}
@keyframes sparkle-float {
  0%   { opacity: 0; transform: translateY(0) scale(0.3); }
  25%  { opacity: 1; transform: translateY(-10px) scale(1); }
  100% { opacity: 0; transform: translateY(-28px) scale(0.5); }
}
@keyframes xp-flash {
  0%   { opacity: 0; transform: translateY(0) scale(0.8); }
  20%  { opacity: 1; transform: translateY(-4px) scale(1.1); }
  80%  { opacity: 1; transform: translateY(-8px) scale(1); }
  100% { opacity: 0; transform: translateY(-14px) scale(0.9); }
}
.pet-bob      { animation: pet-bob 2.2s ease-in-out infinite; }
.pet-celebrate{ animation: pet-celebrate 0.85s ease-in-out forwards; }
.pet-shake    { animation: pet-shake 0.55s ease-in-out forwards; }
.egg-wobble   { animation: egg-wobble 1.8s ease-in-out infinite; }
.sparkle      { animation: sparkle-float 1.1s ease-out forwards; }
.xp-label     { animation: xp-flash 1.4s ease-out forwards; }
`;

function EggBody() {
  return (
    <>
      {/* shell */}
      <ellipse cx="50" cy="56" rx="32" ry="37" fill="#FEF3C7" stroke="#FCD34D" strokeWidth="2" />
      {/* highlight */}
      <ellipse cx="38" cy="40" rx="9" ry="6" fill="white" opacity="0.35" />
      {/* crack marks */}
      <polyline points="44,24 47,34 41,40" stroke="#FCD34D" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="56,28 59,38 53,44" stroke="#FCD34D" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* tiny peeking eyes */}
      <circle cx="42" cy="56" r="3.5" fill="#1E293B" />
      <circle cx="43.4" cy="54.6" r="1.2" fill="white" />
      <circle cx="58" cy="56" r="3.5" fill="#1E293B" />
      <circle cx="59.4" cy="54.6" r="1.2" fill="white" />
    </>
  );
}

interface CreatureBodyProps {
  mood: PetMood;
  stage: PetStage;
}

function CreatureBody({ mood, stage }: CreatureBodyProps) {
  const fill = BODY_COLOR[mood];
  const shadow = BODY_SHADOW[mood];
  const isHappy = mood === 'happy' || mood === 'excited';
  const isSad = mood === 'sad';
  const isSleeping = mood === 'sleeping';

  return (
    <>
      {/* shadow under body */}
      <ellipse cx="50" cy="91" rx="28" ry="5" fill={shadow} opacity="0.2" />

      {/* Wings for adult stage */}
      {stage === 'adult' && (
        <>
          <path d="M18,52 Q2,28 18,18 Q22,42 26,52Z" fill="#A78BFA" opacity="0.75" />
          <path d="M82,52 Q98,28 82,18 Q78,42 74,52Z" fill="#A78BFA" opacity="0.75" />
        </>
      )}

      {/* Main body blob */}
      <path
        d="M50,12 C72,12 88,28 88,50 C88,74 72,88 50,88 C28,88 12,74 12,50 C12,28 28,12 50,12Z"
        fill={fill}
      />
      {/* body highlight */}
      <ellipse cx="36" cy="33" rx="11" ry="7" fill="white" opacity="0.28" />

      {/* Cheek blush (happy/excited) */}
      {isHappy && (
        <>
          <circle cx="23" cy="62" r="8" fill="#FDA4AF" opacity="0.45" />
          <circle cx="77" cy="62" r="8" fill="#FDA4AF" opacity="0.45" />
        </>
      )}

      {/* Ears for child+ */}
      {(stage === 'child' || stage === 'teen' || stage === 'adult') && (
        <>
          <circle cx="22" cy="28" r="9" fill={fill} />
          <circle cx="78" cy="28" r="9" fill={fill} />
          <circle cx="22" cy="28" r="5" fill={shadow} opacity="0.35" />
          <circle cx="78" cy="28" r="5" fill={shadow} opacity="0.35" />
        </>
      )}

      {/* Crown for teen/adult */}
      {(stage === 'teen' || stage === 'adult') && (
        <>
          <path d="M30,18 L36,6 L46,14 L50,4 L54,14 L64,6 L70,18Z" fill="#FCD34D" />
          <rect x="30" y="15" width="40" height="5" rx="2.5" fill="#F59E0B" />
          <circle cx="50" cy="7" r="3" fill="#FCA5A5" />
          <circle cx="36" cy="9" r="2.5" fill="#86EFAC" />
          <circle cx="64" cy="9" r="2.5" fill="#93C5FD" />
        </>
      )}

      {/* Eyes */}
      {isSleeping ? (
        <>
          <path d="M30,51 Q36,57 42,51" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M58,51 Q64,57 70,51" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* ZZZ */}
          <text x="72" y="38" fontSize="9" fill="#8B5CF6" opacity="0.8" fontWeight="bold">z</text>
          <text x="79" y="28" fontSize="11" fill="#8B5CF6" opacity="0.9" fontWeight="bold">z</text>
          <text x="87" y="18" fontSize="13" fill="#8B5CF6" fontWeight="bold">Z</text>
        </>
      ) : isHappy ? (
        <>
          {/* Happy/excited — crescent eyes */}
          <path d="M29,51 Q35,43 41,51" stroke="#1E293B" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M59,51 Q65,43 71,51" stroke="#1E293B" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </>
      ) : isSad ? (
        <>
          {/* Sad — normal eyes with worried brows */}
          <circle cx="35" cy="51" r="5.5" fill="#1E293B" />
          <circle cx="37.2" cy="48.8" r="1.8" fill="white" />
          <circle cx="65" cy="51" r="5.5" fill="#1E293B" />
          <circle cx="67.2" cy="48.8" r="1.8" fill="white" />
          <path d="M29,42 Q35,46.5 41,40.5" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M59,40.5 Q65,46.5 71,42" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Neutral — normal round eyes */}
          <circle cx="35" cy="50" r="5.5" fill="#1E293B" />
          <circle cx="37.2" cy="47.8" r="1.8" fill="white" />
          <circle cx="65" cy="50" r="5.5" fill="#1E293B" />
          <circle cx="67.2" cy="47.8" r="1.8" fill="white" />
        </>
      )}

      {/* Mouth */}
      {mood === 'excited' ? (
        <>
          <path d="M32,65 Q50,80 68,65" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M35,66 Q50,79 65,66 L65,70 Q50,83 35,70Z" fill="white" opacity="0.75" />
        </>
      ) : mood === 'happy' ? (
        <path d="M36,65 Q50,76 64,65" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : mood === 'neutral' ? (
        <path d="M39,65 Q50,69 61,65" stroke="#1E293B" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      ) : mood === 'sad' ? (
        <path d="M36,70 Q50,60 64,70" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : (
        /* sleeping */
        <path d="M40,65 Q50,68 60,65" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
      )}
    </>
  );
}

export function PetDisplay({ petState, animationType, animKey, xpGained }: Props) {
  const stage = getStage(petState.level);
  const { percent } = getXpProgress(petState);
  const isEgg = stage === 'egg';

  const animClass = animationType === 'celebrate'
    ? 'pet-celebrate'
    : animationType === 'sad'
      ? 'pet-shake'
      : isEgg
        ? 'egg-wobble'
        : 'pet-bob';

  const showSparkles = animationType === 'celebrate';
  const showXpLabel = xpGained !== undefined && xpGained > 0 && animationType !== 'idle';

  const progressColor =
    petState.mood === 'excited' ? '#F59E0B'
    : petState.mood === 'happy' ? '#10B981'
    : petState.mood === 'sad' ? '#64748B'
    : '#7C3AED';

  // Stage label
  const stageLabel = isEgg ? 'Egg' : stage.charAt(0).toUpperCase() + stage.slice(1);

  return (
    <div className="relative flex items-center gap-2 select-none">
      <style>{PET_ANIMATIONS}</style>

      {/* Pet character */}
      <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
        <svg
          key={animKey}
          className={animClass}
          viewBox="0 0 100 100"
          style={{ width: 52, height: 52, display: 'block', overflow: 'visible' }}
        >
          {isEgg ? <EggBody /> : <CreatureBody mood={petState.mood} stage={stage} />}
        </svg>

        {/* Sparkles overlay on celebrate */}
        {showSparkles && (
          <svg
            key={`sparkle-${animKey}`}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', inset: 0, width: 52, height: 52, pointerEvents: 'none', overflow: 'visible' }}
          >
            <text className="sparkle" x="0" y="30" fontSize="14" fill="#FCD34D" style={{ animationDelay: '0ms' }}>✦</text>
            <text className="sparkle" x="80" y="20" fontSize="11" fill="#FCD34D" style={{ animationDelay: '100ms' }}>✦</text>
            <text className="sparkle" x="88" y="65" fontSize="9" fill="#FCD34D" style={{ animationDelay: '200ms' }}>✦</text>
          </svg>
        )}
      </div>

      {/* Info column */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Name + level */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gray-700 leading-none">Wiz</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
            style={{ backgroundColor: progressColor }}
          >
            Lv.{petState.level} {stageLabel}
          </span>

          {/* XP gained pop-up */}
          {showXpLabel && (
            <span
              key={`xp-${animKey}`}
              className="xp-label text-[10px] font-bold leading-none"
              style={{ color: animationType === 'celebrate' ? '#10B981' : '#64748B' }}
            >
              {animationType === 'celebrate' ? `+${xpGained} XP` : '...'}
            </span>
          )}
        </div>

        {/* XP progress bar */}
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${percent}%`, backgroundColor: progressColor }}
          />
        </div>

        {/* Hunger dots */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const filled = (petState.hunger / 100) * 5 > i;
            return (
              <div
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: filled ? '#FDA4AF' : '#E5E7EB' }}
              />
            );
          })}
          <span className="ml-1 text-[9px] text-gray-400 leading-none">hunger</span>
        </div>
      </div>
    </div>
  );
}
