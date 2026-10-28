/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FORMATIONS, TacticalFormation, ROLES } from '../game/constants.ts';
import { X, Check } from 'lucide-react';

interface FormationSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFormationId: string;
  onSelectFormation: (formationId: string) => void;
  teamColor?: string;
  isCompact?: boolean;
}

export const FormationSelector: React.FC<FormationSelectorProps> = ({
  isOpen,
  onClose,
  selectedFormationId,
  onSelectFormation,
  teamColor = '#e30a17',
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="formation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs select-none"
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-stone-900 border-2 border-stone-700 text-stone-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-800 bg-stone-950/80">
          <div>
            <h2 id="formation-modal-title" className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              📋 Taktiksel Saha Dizilişleri
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Takımın sahaya yayılışını ve oyun stratejini belirle
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formation Cards */}
        <div className="overflow-y-auto p-4 space-y-3">
          {FORMATIONS.map((f: TacticalFormation) => {
            const isSelected = selectedFormationId === f.id;
            return (
              <div
                key={f.id}
                onClick={() => onSelectFormation(f.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50 ring-1 ring-emerald-500'
                    : 'bg-stone-800/80 border-stone-700 hover:border-stone-500'
                }`}
              >
                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{f.icon}</span>
                    <h3 className="font-black text-base text-white">{f.name}</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-stone-700 text-emerald-300">
                      {f.shortLabel}
                    </span>
                    {isSelected && (
                      <span className="ml-auto sm:ml-2 flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <Check className="w-4 h-4" /> Seçili
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-300 mb-2">{f.description}</p>
                </div>

                {/* Mini Tactical Pitch Preview */}
                <div className="relative w-36 h-24 bg-emerald-950/80 border border-emerald-800/80 rounded-lg p-1 flex-none overflow-hidden shadow-inner">
                  {/* Pitch lines */}
                  <div className="absolute inset-0 border border-white/20 rounded-lg m-1 pointer-events-none" />
                  <div className="absolute left-1 right-1 top-1/2 border-t border-white/20 pointer-events-none" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/20 pointer-events-none" />

                  {/* Render 6 player dots */}
                  {f.positions.map((pos, idx) => {
                    const role = ROLES[idx];
                    // Normalize position (pitch width = 400, height = 680)
                    const leftPct = (pos[0] / 400) * 100;
                    const topPct = (pos[1] / 680) * 100;
                    return (
                      <div
                        key={idx}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          backgroundColor: teamColor,
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-white flex items-center justify-center text-[7px] font-black text-white shadow-sm"
                        title={`${role.number} ${role.name}`}
                      >
                        {role.number}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between text-xs text-stone-400">
          <span>Her maç öncesinde veya oyun içinde dizilişini değiştirebilirsin.</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
