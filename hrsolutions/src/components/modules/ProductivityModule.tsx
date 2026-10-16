'use client';

import React, { useState } from 'react';
import { AppState } from '@/services/store';
import { useApp } from '@/context/AppContext';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Flame,
  CheckCircle2,
  Coffee,
  Volume2,
  Calendar,
  Zap,
} from 'lucide-react';

interface ProductivityModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const ProductivityModule: React.FC<ProductivityModuleProps> = ({ state }) => {
  const { timerSeconds, timerActive, toggleTimer, resetTimer, setTimerSeconds, formatTimer } = useApp();
  
  const userRecords = (state.attendance || []).filter(
    (r) => !state.currentPersona || r.employeeId === state.currentPersona.id || r.employeeName === state.currentPersona.name
  );
  const streakDays = Math.max(1, new Set(userRecords.map((r) => r.date)).size);

  const completedSessions = (state.tasks || []).filter((t) => t.status === 'Completed').length;
  const sessionTarget = Math.max((state.tasks || []).length, 4);

  const [ambientSound, setAmbientSound] = useState<'None' | 'Deep Focus Rain' | 'Binaural Alpha Waves' | 'Cyber Chill'>('Deep Focus Rain');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Timer className="h-6 w-6 text-[#7c5cfc]" /> Deep Work & Pomodoro Focus Hub
          </h2>
          <p className="text-xs text-[#8e9eb5]">
            Boost uninterrupted engineering & deep thought productivity through structured time blocks
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161d2e] border border-[#232d44] text-xs">
          <Flame className="h-4 w-4 text-[#fb923c]" />
          <span className="text-[#8e9eb5]">Current Streak:</span>
          <span className="font-bold text-white">{streakDays} Day{streakDays > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Main Focus Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timer Card */}
        <div className="lg:col-span-2 p-8 rounded-3xl bg-[#161d2e] border border-[#232d44] shadow-lg text-center space-y-6 flex flex-col justify-center items-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#7c5cfc]/20 border border-[#7c5cfc]/30 text-[#c4b5fd] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5 text-[#a78bfa]" />
            {timerActive ? 'Active Focus Session' : 'Ready to Focus'}
          </div>

          <div className="text-7xl md:text-8xl font-bold text-white tracking-tight font-mono tabular-nums select-none drop-shadow-lg">
            {formatTimer(timerSeconds)}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={toggleTimer}
              className={`flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-95 ${
                timerActive
                  ? 'bg-[#fb923c] hover:bg-[#ea580c] shadow-[#fb923c]/30'
                  : 'bg-[#7c5cfc] hover:bg-[#6b47fc] shadow-[#7c5cfc]/30'
              }`}
            >
              {timerActive ? (
                <>
                  <Pause className="h-4 w-4" /> Pause Focus
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Start Focus Session
                </>
              )}
            </button>

            <button
              onClick={resetTimer}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold text-[#8e9eb5] hover:text-white bg-[#131929] hover:bg-[#1f2940] border border-[#232d44] transition-all"
              title="Reset Timer"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="pt-4 border-t border-[#232d44] flex flex-wrap justify-center gap-3 text-xs font-semibold text-[#8e9eb5]">
            <button
              onClick={() => { setTimerSeconds(1500); if (timerActive) toggleTimer(); }}
              className="px-3 py-1.5 rounded-lg bg-[#131929] hover:bg-[#7c5cfc] hover:text-white border border-[#232d44] transition-all"
            >
              25m Deep Work
            </button>
            <button
              onClick={() => { setTimerSeconds(3000); if (timerActive) toggleTimer(); }}
              className="px-3 py-1.5 rounded-lg bg-[#131929] hover:bg-[#7c5cfc] hover:text-white border border-[#232d44] transition-all"
            >
              50m Sprint
            </button>
            <button
              onClick={() => { setTimerSeconds(300); if (timerActive) toggleTimer(); }}
              className="px-3 py-1.5 rounded-lg bg-[#131929] hover:bg-[#2dd4bf] hover:text-white border border-[#232d44] transition-all"
            >
              5m Coffee Break
            </button>
            <button
              onClick={() => { setTimerSeconds(900); if (timerActive) toggleTimer(); }}
              className="px-3 py-1.5 rounded-lg bg-[#131929] hover:bg-[#2dd4bf] hover:text-white border border-[#232d44] transition-all"
            >
              15m Rest Break
            </button>
          </div>
        </div>

        {/* Goals & Ambient Sounds */}
        <div className="space-y-6">
          {/* Daily Goal Card */}
          <div className="p-6 rounded-xl bg-[#161d2e] border border-[#232d44] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#2dd4bf]" /> Daily Target
              </h3>
              <span className="text-xs font-bold text-[#2dd4bf]">
                {completedSessions} / {sessionTarget} Sessions
              </span>
            </div>

            <div className="h-2.5 w-full bg-[#131929] rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-[#7c5cfc] to-[#2dd4bf] rounded-full transition-all"
                style={{ width: `${(completedSessions / sessionTarget) * 100}%` }}
              />
            </div>

            <p className="text-[11px] text-[#8e9eb5]">
              {Math.round((completedSessions / sessionTarget) * 100)}% of your deep work goal achieved today ({completedSessions * 25} mins focused).
            </p>
          </div>

          {/* Ambient Sound Mode */}
          <div className="p-6 rounded-xl bg-[#161d2e] border border-[#232d44] shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-[#7c5cfc]" /> Ambient Background
            </h3>

            <div className="space-y-2">
              {(['None', 'Deep Focus Rain', 'Binaural Alpha Waves', 'Cyber Chill'] as const).map((sound) => (
                <button
                  key={sound}
                  onClick={() => setAmbientSound(sound)}
                  className={`w-full p-2.5 rounded-lg text-left text-xs font-semibold flex items-center justify-between transition-all ${
                    ambientSound === sound
                      ? 'bg-[#7c5cfc]/20 border border-[#7c5cfc] text-white'
                      : 'bg-[#131929] border border-[#232d44] text-[#8e9eb5] hover:text-white'
                  }`}
                >
                  <span>{sound}</span>
                  {ambientSound === sound && (
                    <span className="w-2 h-2 rounded-full bg-[#2dd4bf] animate-ping" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
