/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ROLES, PlayerRole } from '../game/constants.ts';
import { Shield, Target, Zap, Activity, Award, UserCheck, X } from 'lucide-react';

interface TacticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoleId?: number;
}

export const TacticsModal: React.FC<TacticsModalProps> = ({ isOpen, onClose, activeRoleId }) => {
  if (!isOpen) return null;

  const getRoleIcon = (roleId: number) => {
    switch (roleId) {
      case 1:
        return <Shield className="w-5 h-5 text-amber-400" />;
      case 2:
        return <Shield className="w-5 h-5 text-blue-400" />;
      case 3:
      case 4:
        return <Zap className="w-5 h-5 text-emerald-400" />;
      case 5:
        return <Activity className="w-5 h-5 text-purple-400" />;
      case 6:
        return <Award className="w-5 h-5 text-yellow-300" />;
      case 7:
        return <Target className="w-5 h-5 text-rose-400" />;
      default:
        return <UserCheck className="w-5 h-5 text-slate-300" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tactics-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-stone-900 border-2 border-stone-700 text-stone-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
          <div>
            <h2 id="tactics-title" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              ⚽ 7 Oyuncu & Pas / Mevki Özellikleri
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Her mevkinin kendine özgü boyut, kütle ve yetenekleri bulunur. Yakın mesafeli paslarla hücuma devam edebilirsiniz!
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of 6 roles */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-3.5">
          {ROLES.map((role: PlayerRole) => {
            const isSelected = activeRoleId === role.id;
            return (
              <div
                key={role.id}
                className={`p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/50'
                    : 'bg-stone-800/80 border-stone-700/80 hover:border-stone-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-900 border border-stone-700 flex items-center justify-center font-black text-lg text-emerald-400">
                      {role.number}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role.id)}
                        <h3 className="font-bold text-base text-white">
                          {role.id} — {role.name}
                        </h3>
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-stone-700/60 text-stone-300">
                          {role.shortName}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-300 mt-1">
                        <span><b className="text-stone-400">Boyut:</b> {role.sizeDesc} ({role.radius}px)</span>
                        <span>•</span>
                        <span><b className="text-stone-400">Kütle:</b> {role.massDesc}</span>
                        <span>•</span>
                        <span><b className="text-stone-400">Şut:</b> {role.powerDesc}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-stone-700/50">
                  <div className="bg-stone-900/60 p-2.5 rounded-lg border border-stone-800">
                    <span className="font-semibold text-emerald-400 block mb-0.5">🌟 Özel Yetenek</span>
                    <span className="text-stone-300">{role.specialAbility}</span>
                  </div>
                  <div className="bg-stone-900/60 p-2.5 rounded-lg border border-stone-800">
                    <span className="font-semibold text-amber-400 block mb-0.5">⚖️ Taktiksel Denge</span>
                    <span className="text-stone-300">{role.balanceDesc}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between text-xs text-stone-400">
          <span>⏱️ Maç Süresi: <b>3 Dakika (180 saniye)</b></span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white transition-colors"
          >
            Anladım, Sahaya Dön
          </button>
        </div>
      </div>
    </div>
  );
};
