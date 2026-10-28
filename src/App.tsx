/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Team,
  TEAMS_DATA,
  DIFFICULTY_NAMES,
  ROUND_NAMES,
  FORMATIONS,
  TacticalFormation,
} from './game/constants.ts';
import { PitchCanvas } from './components/PitchCanvas.tsx';
import { TacticsModal } from './components/TacticsModal.tsx';
import { FormationSelector } from './components/FormationSelector.tsx';
import { TournamentTreeModal, KnockoutMatchRecord } from './components/TournamentTreeModal.tsx';
import {
  Trophy,
  Shield,
  Layers,
  GitBranch,
  Play,
  RefreshCw,
  BarChart3,
  Award,
  Sparkles,
  Flame,
  Info,
} from 'lucide-react';

interface MatchRecord {
  opponentId: number;
  scoreA: number;
  scoreB: number;
  penalties?: [number, number];
  won: boolean;
}

interface TournamentState {
  userTeamId: number;
  userFormationId: string;
  groups: number[][]; // 8 groups of 4 teams
  table: Array<{ p: number; w: number; d: number; l: number; gf: number; ga: number }>;
  matchDay: number; // 0, 1, 2
  userGroupIndex: number;
  knockoutRound: KnockoutMatchRecord[] | null; // active round matches
  bracketHistory: KnockoutMatchRecord[][];
  matchLog: MatchRecord[];
}

const GROUP_SCHEDULE = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[3, 0], [1, 2]],
];

export default function App() {
  const [difficulty, setDifficulty] = useState<number>(1); // 0: Kolay, 1: Normal, 2: Zor
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [currentMatch, setCurrentMatch] = useState<{
    teamA: Team;
    teamB: Team;
    isKnockout: boolean;
    roundLabel: string;
  } | null>(null);

  // Modals
  const [showTacticsModal, setShowTacticsModal] = useState<boolean>(false);
  const [showFormationModal, setShowFormationModal] = useState<boolean>(false);
  const [showTreeModal, setShowTreeModal] = useState<boolean>(false);

  // End of tournament screen
  const [endTournamentMessage, setEndTournamentMessage] = useState<{
    title: string;
    description: string;
    isChampion: boolean;
  } | null>(null);

  // Load saved tournament or handle autostart
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const autostart = urlParams.get('autostart');

    if (autostart === '1') {
      startNewTournament(16); // Türkiye
      return;
    }

    try {
      const saved = localStorage.getItem('worldcup_fiske_save');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tournament) {
          setTournament(parsed.tournament);
          setDifficulty(parsed.difficulty ?? 1);
        }
      }
    } catch {}
  }, []);

  // Save tournament state on change
  useEffect(() => {
    if (tournament) {
      try {
        localStorage.setItem(
          'worldcup_fiske_save',
          JSON.stringify({ tournament, difficulty })
        );
      } catch {}
    }
  }, [tournament, difficulty]);

  // Sync document body state for ultra-mode checks
  useEffect(() => {
    if (currentMatch) {
      document.body.dataset.state = 'playing';
    } else if (endTournamentMessage) {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'title';
    }
  }, [currentMatch, endTournamentMessage]);

  const getTeamStars = (rating: number): number => {
    return Math.max(1, Math.min(5, Math.round((rating - 62) / 7)));
  };

  // Start new tournament with chosen team
  const startNewTournament = (userTeamId: number) => {
    const sortedIndices = TEAMS_DATA.map((_, i) => i).sort(
      (a, b) => TEAMS_DATA[b].r - TEAMS_DATA[a].r
    );

    const groups: number[][] = Array.from({ length: 8 }, () => []);
    for (let pot = 0; pot < 4; pot++) {
      const potTeams = sortedIndices.slice(pot * 8, pot * 8 + 8).sort(() => Math.random() - 0.5);
      potTeams.forEach((teamId, gIdx) => groups[gIdx].push(teamId));
    }

    const userGroupIndex = groups.findIndex((g) => g.includes(userTeamId));
    const initialTable = TEAMS_DATA.map(() => ({
      p: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
    }));

    const userTeam = TEAMS_DATA[userTeamId];

    const newTournamentState: TournamentState = {
      userTeamId,
      userFormationId: userTeam.preferredFormationId || 'classic',
      groups,
      table: initialTable,
      matchDay: 0,
      userGroupIndex,
      knockoutRound: null,
      bracketHistory: [],
      matchLog: [],
    };

    setTournament(newTournamentState);
    setEndTournamentMessage(null);
  };

  // Simulate non-player matches
  const simulateBotMatch = (teamAId: number, teamBId: number): [number, number] => {
    const diff = TEAMS_DATA[teamAId].r - TEAMS_DATA[teamBId].r;
    const lambdaA = Math.max(0.2, 1.35 * Math.pow(1.045, diff));
    const lambdaB = Math.max(0.2, 1.35 * Math.pow(1.045, -diff));

    const poisson = (mean: number) => {
      const L = Math.exp(-mean);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= Math.random();
      } while (p > L && k < 8);
      return k - 1;
    };

    return [poisson(lambdaA), poisson(lambdaB)];
  };

  const recordResult = (
    teamAId: number,
    teamBId: number,
    scoreA: number,
    scoreB: number
  ) => {
    if (!tournament) return;
    const rowA = tournament.table[teamAId];
    const rowB = tournament.table[teamBId];

    rowA.gf += scoreA;
    rowA.ga += scoreB;
    rowB.gf += scoreB;
    rowB.ga += scoreA;

    if (scoreA > scoreB) {
      rowA.w += 1;
      rowA.p += 3;
      rowB.l += 1;
    } else if (scoreA < scoreB) {
      rowB.w += 1;
      rowB.p += 3;
      rowA.l += 1;
    } else {
      rowA.d += 1;
      rowA.p += 1;
      rowB.d += 1;
      rowB.p += 1;
    }
  };

  const getNextMatchInfo = (): { opponentId: number; label: string } | null => {
    if (!tournament) return null;
    const me = tournament.userTeamId;

    if (!tournament.knockoutRound) {
      const myGroup = tournament.groups[tournament.userGroupIndex];
      const matchPair = GROUP_SCHEDULE[tournament.matchDay]
        .map(([i, j]) => [myGroup[i], myGroup[j]])
        .find((p) => p.includes(me));

      if (!matchPair) return null;
      const opponentId = matchPair[0] === me ? matchPair[1] : matchPair[0];
      const groupLetter = 'ABCDEFGH'[tournament.userGroupIndex];
      return {
        opponentId,
        label: `Grup ${groupLetter} · ${tournament.matchDay + 1}. Maç`,
      };
    } else {
      const myMatch = tournament.knockoutRound.find(
        (m) => m.teamAId === me || m.teamBId === me
      );
      if (!myMatch) return null;
      const opponentId = myMatch.teamAId === me ? myMatch.teamBId : myMatch.teamAId;
      const roundTitle = ROUND_NAMES[tournament.knockoutRound.length] || 'Eleme Turu';
      return {
        opponentId,
        label: roundTitle,
      };
    }
  };

  const handleStartMatch = () => {
    const nextFixture = getNextMatchInfo();
    if (!tournament || !nextFixture) return;

    setCurrentMatch({
      teamA: TEAMS_DATA[tournament.userTeamId],
      teamB: TEAMS_DATA[nextFixture.opponentId],
      isKnockout: !!tournament.knockoutRound,
      roundLabel: nextFixture.label,
    });
  };

  const handleMatchFinish = (result: {
    scoreA: number;
    scoreB: number;
    penalties?: [number, number];
  }) => {
    if (!tournament || !currentMatch) return;

    const me = tournament.userTeamId;
    const op = currentMatch.teamB.id;
    const isWon =
      result.scoreA > result.scoreB ||
      (result.scoreA === result.scoreB &&
        result.penalties &&
        result.penalties[0] > result.penalties[1]);

    const updatedLog: MatchRecord[] = [
      ...tournament.matchLog,
      {
        opponentId: op,
        scoreA: result.scoreA,
        scoreB: result.scoreB,
        penalties: result.penalties,
        won: !!isWon,
      },
    ];

    if (!tournament.knockoutRound) {
      // Group Stage Match
      recordResult(me, op, result.scoreA, result.scoreB);

      tournament.groups.forEach((group, gIdx) => {
        GROUP_SCHEDULE[tournament.matchDay].forEach(([i, j]) => {
          const tA = group[i];
          const tB = group[j];
          if (gIdx === tournament.userGroupIndex && (tA === me || tB === me)) {
            return;
          }
          const [simScoreA, simScoreB] = simulateBotMatch(tA, tB);
          recordResult(tA, tB, simScoreA, simScoreB);
        });
      });

      const nextDay = tournament.matchDay + 1;

      if (nextDay < 3) {
        setTournament({
          ...tournament,
          matchDay: nextDay,
          matchLog: updatedLog,
        });
        setCurrentMatch(null);
      } else {
        const myGroup = tournament.groups[tournament.userGroupIndex];
        const sortedMyGroup = [...myGroup].sort((a, b) => {
          const tA = tournament.table[a];
          const tB = tournament.table[b];
          const diffA = tA.gf - tA.ga;
          const diffB = tB.gf - tB.ga;
          return tB.p - tA.p || diffB - diffA || tB.gf - tA.gf;
        });

        const qualifies = sortedMyGroup.slice(0, 2).includes(me);

        if (!qualifies) {
          setCurrentMatch(null);
          setEndTournamentMessage({
            title: 'Grup Aşamasında Elendin',
            description: `${TEAMS_DATA[me].f} ${TEAMS_DATA[me].n} grubu ilk 2 sırada tamamlayamadı ve turnuvaya veda etti.`,
            isChampion: false,
          });
        } else {
          // Generate Round of 16
          const allGroupRankings = tournament.groups.map((group) => {
            return [...group].sort((a, b) => {
              const tA = tournament.table[a];
              const tB = tournament.table[b];
              const diffA = tA.gf - tA.ga;
              const diffB = tB.gf - tB.ga;
              return tB.p - tA.p || diffB - diffA || tB.gf - tA.gf;
            });
          });

          const roundOf16Pairs = [
            [0, 1], [2, 3], [4, 5], [6, 7],
            [1, 0], [3, 2], [5, 4], [7, 6],
          ];

          const roundOf16Matches: KnockoutMatchRecord[] = roundOf16Pairs.map(([g1, g2]) => ({
            teamAId: allGroupRankings[g1][0],
            teamBId: allGroupRankings[g2][1],
          }));

          setTournament({
            ...tournament,
            matchDay: 3,
            knockoutRound: roundOf16Matches,
            matchLog: updatedLog,
          });
          setCurrentMatch(null);
        }
      }
    } else {
      // Knockout match handling
      const currentRound = tournament.knockoutRound;
      const updatedRoundMatches: KnockoutMatchRecord[] = currentRound.map((m) => {
        if (m.teamAId === me || m.teamBId === me) {
          const isUserTeamA = m.teamAId === me;
          return {
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            scoreA: isUserTeamA ? result.scoreA : result.scoreB,
            scoreB: isUserTeamA ? result.scoreB : result.scoreA,
            winnerId: isWon ? me : op,
          };
        } else {
          const [sA, sB] = simulateBotMatch(m.teamAId, m.teamBId);
          let wId = sA > sB ? m.teamAId : sB > sA ? m.teamBId : null;
          if (!wId) {
            wId = Math.random() < 0.5 ? m.teamAId : m.teamBId;
          }
          return {
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            scoreA: sA,
            scoreB: sB,
            winnerId: wId,
          };
        }
      });

      const updatedHistory = [...tournament.bracketHistory, updatedRoundMatches];

      if (!isWon) {
        setCurrentMatch(null);
        setEndTournamentMessage({
          title: currentRound.length === 1 ? 'Dünya İkincisi Oldun!' : 'Turnuvaya Veda Ettin',
          description:
            currentRound.length === 1
              ? 'Büyük Finalde mağlup oldun ve Dünya İkincisi olarak gümüş madalyayı kazandın.'
              : `${ROUND_NAMES[currentRound.length]} aşamasında elendin.`,
          isChampion: false,
        });
      } else if (currentRound.length === 1) {
        setCurrentMatch(null);
        setEndTournamentMessage({
          title: '🏆 DÜNYA ŞAMPİYONUSUN!',
          description: `${TEAMS_DATA[me].f} ${TEAMS_DATA[me].n} ile Dünya Kupasını kaldırdınız! Tarih yazdın Şampiyon!`,
          isChampion: true,
        });
      } else {
        const nextRoundMatches: KnockoutMatchRecord[] = [];
        for (let i = 0; i < updatedRoundMatches.length; i += 2) {
          nextRoundMatches.push({
            teamAId: updatedRoundMatches[i].winnerId!,
            teamBId: updatedRoundMatches[i + 1].winnerId!,
          });
        }

        setTournament({
          ...tournament,
          knockoutRound: nextRoundMatches,
          bracketHistory: updatedHistory,
          matchLog: updatedLog,
        });
        setCurrentMatch(null);
      }
    }
  };

  // Render match canvas
  if (currentMatch) {
    return (
      <PitchCanvas
        teamA={currentMatch.teamA}
        teamB={currentMatch.teamB}
        isKnockout={currentMatch.isKnockout}
        roundLabel={currentMatch.roundLabel}
        difficulty={difficulty}
        initialUserFormationId={tournament?.userFormationId || 'classic'}
        onMatchFinish={handleMatchFinish}
        onQuitToTournament={() => setCurrentMatch(null)}
      />
    );
  }

  // Render Tournament End Screen (Victory or Elimination with Trophy Animation & Stats)
  if (endTournamentMessage && tournament) {
    const userTeam = TEAMS_DATA[tournament.userTeamId];
    const totalMatches = tournament.matchLog.length;
    const wins = tournament.matchLog.filter((m) => m.won).length;
    const draws = tournament.matchLog.filter((m) => m.scoreA === m.scoreB && !m.penalties).length;
    const losses = totalMatches - wins - draws;
    const goalsFor = tournament.matchLog.reduce((acc, m) => acc + m.scoreA, 0);
    const goalsAgainst = tournament.matchLog.reduce((acc, m) => acc + m.scoreB, 0);
    const goalDiff = goalsFor - goalsAgainst;
    const cleanSheets = tournament.matchLog.filter((m) => m.scoreB === 0).length;

    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-4 select-none relative overflow-hidden">
        {/* Animated Trophy Aura for Champion */}
        {endTournamentMessage.isChampion && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[500px] h-[500px] rounded-full bg-amber-500/15 blur-3xl animate-pulse" />
          </div>
        )}

        <div className="relative w-full max-w-lg bg-stone-900 border-2 border-stone-800 rounded-3xl p-6 text-center shadow-2xl z-10">
          {/* Animated Trophy or Ball */}
          <div className="relative inline-block my-2">
            {endTournamentMessage.isChampion ? (
              <div className="relative animate-bounce">
                <span className="text-8xl drop-shadow-[0_0_35px_rgba(250,204,21,0.8)] inline-block">
                  🏆
                </span>
                <Sparkles className="w-8 h-8 text-amber-300 absolute -top-2 -right-2 animate-spin" />
              </div>
            ) : (
              <span className="text-7xl inline-block mb-1">⚽</span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {endTournamentMessage.title}
          </h1>
          <p className="text-sm text-stone-300 mb-5 leading-relaxed">
            {endTournamentMessage.description}
          </p>

          {/* Detailed Tournament Statistics (Turnuva İstatistikleri) */}
          <div className="bg-stone-950/80 rounded-2xl p-4 border border-stone-800 mb-5 text-left">
            <div className="flex items-center justify-between mb-3 border-b border-stone-800/80 pb-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                Detaylı Turnuva İstatistikleri
              </span>
              <span className="text-xs font-bold text-stone-200">
                {userTeam.f} {userTeam.n}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs mb-3">
              <div className="bg-stone-900 p-2 rounded-xl border border-stone-800">
                <span className="text-base font-black text-emerald-400 block">{wins} / {totalMatches}</span>
                <span className="text-[10px] text-stone-400">Galibiyet</span>
              </div>
              <div className="bg-stone-900 p-2 rounded-xl border border-stone-800">
                <span className="text-base font-black text-amber-400 block">{goalsFor}</span>
                <span className="text-[10px] text-stone-400">Atılan Gol</span>
              </div>
              <div className="bg-stone-900 p-2 rounded-xl border border-stone-800">
                <span className="text-base font-black text-rose-400 block">{goalsAgainst}</span>
                <span className="text-[10px] text-stone-400">Yenen Gol</span>
              </div>
              <div className="bg-stone-900 p-2 rounded-xl border border-stone-800">
                <span className="text-base font-black text-blue-400 block">{cleanSheets}</span>
                <span className="text-[10px] text-stone-400">Gol Yemeden</span>
              </div>
            </div>

            {/* Match History list */}
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1 text-xs">
              {tournament.matchLog.map((log, idx) => {
                const op = TEAMS_DATA[log.opponentId];
                return (
                  <div
                    key={idx}
                    className="p-1.5 px-2 rounded-lg bg-stone-900/60 border border-stone-800/60 flex items-center justify-between"
                  >
                    <span>{idx + 1}. Maç: vs {op.f} {op.n}</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {log.scoreA} – {log.scoreB} {log.penalties ? `(p. ${log.penalties[0]}-${log.penalties[1]})` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowTreeModal(true)}
              className="flex-1 py-3 rounded-2xl bg-stone-800 hover:bg-stone-700 font-bold text-xs text-stone-200 border border-stone-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <GitBranch className="w-4 h-4 text-amber-400" />
              Eleme Ağacını Gör
            </button>
            <button
              data-start="true"
              onClick={() => {
                setTournament(null);
                setEndTournamentMessage(null);
                try {
                  localStorage.removeItem('worldcup_fiske_save');
                } catch {}
              }}
              className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-black text-sm text-white shadow-lg transition-all"
            >
              Yeni Turnuva
            </button>
          </div>
        </div>

        <TournamentTreeModal
          isOpen={showTreeModal}
          onClose={() => setShowTreeModal(false)}
          bracketHistory={tournament.bracketHistory}
          activeRound={tournament.knockoutRound}
          userTeamId={tournament.userTeamId}
        />
      </div>
    );
  }

  // Render Tournament Hub
  if (tournament) {
    const userTeam = TEAMS_DATA[tournament.userTeamId];
    const userForm = FORMATIONS.find((f) => f.id === tournament.userFormationId) || FORMATIONS[0];
    const nextFixture = getNextMatchInfo();
    const opponentTeam = nextFixture ? TEAMS_DATA[nextFixture.opponentId] : null;
    const opponentForm = opponentTeam
      ? FORMATIONS.find((f) => f.id === opponentTeam.preferredFormationId) || FORMATIONS[0]
      : FORMATIONS[0];

    const myGroup = tournament.groups[tournament.userGroupIndex];
    const sortedGroup = [...myGroup].sort((a, b) => {
      const tA = tournament.table[a];
      const tB = tournament.table[b];
      const diffA = tA.gf - tA.ga;
      const diffB = tB.gf - tB.ga;
      return tB.p - tA.p || diffB - diffA || tB.gf - tA.gf;
    });

    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center p-3 sm:p-5 select-none">
        <div className="w-full max-w-xl flex flex-col gap-3.5">
          {/* Header */}
          <header className="flex items-center justify-between bg-stone-900/90 p-3.5 px-4 rounded-2xl border border-stone-800">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{userTeam.f}</span>
              <div>
                <h1 className="text-base font-black text-white">{userTeam.n}</h1>
                <span className="text-xs text-emerald-400 font-semibold">
                  {nextFixture?.label || 'Turnuva Merkezi'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowFormationModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 border border-stone-700 transition-colors"
                title="Diziliş Seçimi"
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                {userForm.shortLabel}
              </button>
              <button
                onClick={() => setShowTacticsModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 border border-stone-700 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Mevkiler & Pas
              </button>
            </div>
          </header>

          {/* Next Match Card with Formations */}
          {opponentTeam && (
            <section className="bg-gradient-to-br from-emerald-950/40 via-stone-900 to-stone-900 p-4 rounded-2xl border border-emerald-800/60 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Sıradaki Karşılaşma
                </span>
                <span className="text-xs text-stone-400 font-medium">⏱️ 3 Dakika (180s)</span>
              </div>

              <div className="flex items-center justify-between py-2 px-3 bg-stone-950/60 rounded-xl border border-stone-800/80 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-3xl">{userTeam.f}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-white block truncate">{userTeam.n}</span>
                    <span className="text-[11px] text-emerald-400 font-medium block truncate">
                      {userForm.name}
                    </span>
                  </div>
                </div>

                <span className="text-base font-black text-stone-400 px-3 font-mono">VS</span>

                <div className="flex items-center gap-2.5 text-right min-w-0">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-white block truncate">{opponentTeam.n}</span>
                    <span className="text-[11px] text-amber-400 font-medium block truncate">
                      {opponentForm.name}
                    </span>
                  </div>
                  <span className="text-3xl">{opponentTeam.f}</span>
                </div>
              </div>

              {/* Formation switcher prompt */}
              <div className="flex items-center justify-between text-xs text-stone-300 px-1 mb-3">
                <span>Takım Dizilişin: <b className="text-emerald-400">{userForm.name}</b></span>
                <button
                  onClick={() => setShowFormationModal(true)}
                  className="text-xs text-amber-400 hover:underline font-bold"
                >
                  Dizilişi Değiştir ⚙️
                </button>
              </div>

              <button
                data-start="true"
                onClick={handleStartMatch}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black text-base text-white shadow-lg shadow-emerald-950/60 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                Maça Çık
              </button>
            </section>
          )}

          {/* Group Table or Knockout Round */}
          {!tournament.knockoutRound ? (
            <section className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                  Grup {'ABCDEFGH'[tournament.userGroupIndex]} Puan Durumu
                </h2>
                <button
                  onClick={() => setShowTreeModal(true)}
                  className="text-xs text-amber-400 hover:underline font-bold flex items-center gap-1"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Eleme Ağacı
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-400 border-b border-stone-800">
                      <th className="py-2 px-1 text-center w-6">#</th>
                      <th className="py-2 px-2">Takım</th>
                      <th className="py-2 px-1 text-center">O</th>
                      <th className="py-2 px-1 text-center">G</th>
                      <th className="py-2 px-1 text-center">B</th>
                      <th className="py-2 px-1 text-center">M</th>
                      <th className="py-2 px-1 text-center">Av</th>
                      <th className="py-2 px-1 text-center font-bold text-white">P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGroup.map((teamId, rank) => {
                      const t = TEAMS_DATA[teamId];
                      const s = tournament.table[teamId];
                      const isMe = teamId === tournament.userTeamId;
                      const diff = s.gf - s.ga;

                      return (
                        <tr
                          key={teamId}
                          className={`border-b border-stone-800/50 ${
                            isMe ? 'bg-emerald-950/40 font-bold' : ''
                          }`}
                        >
                          <td className="py-2 px-1 text-center text-stone-400">
                            {rank + 1}
                          </td>
                          <td className="py-2 px-2 flex items-center gap-1.5 truncate">
                            <span>{t.f}</span>
                            <span className={isMe ? 'text-emerald-300' : 'text-stone-200'}>
                              {t.n}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-center text-stone-300">
                            {s.w + s.d + s.l}
                          </td>
                          <td className="py-2 px-1 text-center text-stone-300">{s.w}</td>
                          <td className="py-2 px-1 text-center text-stone-300">{s.d}</td>
                          <td className="py-2 px-1 text-center text-stone-300">{s.l}</td>
                          <td className="py-2 px-1 text-center text-stone-300">
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="py-2 px-1 text-center font-bold text-amber-300">
                            {s.p}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-stone-400 mt-2">
                * İlk 2 sırayı alan takımlar Son 16 eleme turuna yükselir.
              </p>
            </section>
          ) : (
            <section className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                  Eleme Aşaması ({ROUND_NAMES[tournament.knockoutRound.length]})
                </h2>
                <button
                  onClick={() => setShowTreeModal(true)}
                  className="text-xs text-amber-400 hover:underline font-bold flex items-center gap-1"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Tüm Ağacı Gör
                </button>
              </div>
              <div className="grid gap-2">
                {tournament.knockoutRound.map((m, idx) => {
                  const tA = TEAMS_DATA[m.teamAId];
                  const tB = TEAMS_DATA[m.teamBId];
                  const isMyMatch = m.teamAId === tournament.userTeamId || m.teamBId === tournament.userTeamId;

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                        isMyMatch
                          ? 'bg-emerald-950/40 border-emerald-600 font-bold shadow-md shadow-emerald-950/40'
                          : 'bg-stone-950/50 border-stone-800 text-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-1 truncate">
                        <span>{tA.f}</span>
                        <span className="truncate">{tA.n}</span>
                      </div>
                      <span className="px-2 font-mono text-stone-400">VS</span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end truncate">
                        <span className="truncate">{tB.n}</span>
                        <span>{tB.f}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quick Buttons Bar */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowTreeModal(true)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-bold text-stone-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <GitBranch className="w-4 h-4 text-amber-400" />
              Turnuva Ağacı
            </button>
            <button
              onClick={() => setShowFormationModal(true)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs font-bold text-stone-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              Diziliş Taktikleri
            </button>
          </div>

          {/* Reset Tournament button */}
          <button
            onClick={() => {
              if (confirm('Turnuvayı sıfırlayıp yeni bir takım seçmek istiyor musunuz?')) {
                setTournament(null);
                try {
                  localStorage.removeItem('worldcup_fiske_save');
                } catch {}
              }
            }}
            className="py-2 text-xs text-stone-400 hover:text-stone-200 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Turnuvayı Sıfırla / Farklı Takım Seç
          </button>
        </div>

        {/* Modals */}
        <TacticsModal
          isOpen={showTacticsModal}
          onClose={() => setShowTacticsModal(false)}
        />
        <FormationSelector
          isOpen={showFormationModal}
          onClose={() => setShowFormationModal(false)}
          selectedFormationId={tournament.userFormationId}
          onSelectFormation={(fid) => {
            setTournament({ ...tournament, userFormationId: fid });
            setShowFormationModal(false);
          }}
          teamColor={userTeam.c}
        />
        <TournamentTreeModal
          isOpen={showTreeModal}
          onClose={() => setShowTreeModal(false)}
          bracketHistory={tournament.bracketHistory}
          activeRound={tournament.knockoutRound}
          userTeamId={tournament.userTeamId}
        />
      </div>
    );
  }

  // Render Title Screen
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-between p-4 select-none">
      <div className="w-full max-w-xl flex flex-col gap-4">
        {/* Title Lockup */}
        <header className="text-center pt-2 pb-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-700/60 shadow-xl mb-2 text-2xl">
            🏆
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Dünya Kupası
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1">
            Fiske Futbol Turnuvası · 7'şer Oyuncu · Paslaşma Mantığı · Taktiksel Dizilişler
          </p>

          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="px-3 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-xs font-semibold">
              ⏱️ Her Maç 3 Dakika
            </span>
            <button
              onClick={() => setShowFormationModal(true)}
              className="px-3 py-1 rounded-full bg-stone-900 border border-stone-700 hover:border-emerald-600 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Dizilişler
            </button>
            <button
              onClick={() => setShowTacticsModal(true)}
              className="px-3 py-1 rounded-full bg-stone-900 border border-stone-700 hover:border-emerald-600 text-stone-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              Mevkiler & Pas
            </button>
          </div>
        </header>

        {/* Difficulty Selector */}
        <section className="bg-stone-900/80 p-3 rounded-2xl border border-stone-800 flex items-center justify-between">
          <span className="text-xs font-bold text-stone-300">Zorluk Seviyesi:</span>
          <div className="flex gap-1.5">
            {DIFFICULTY_NAMES.map((name, idx) => (
              <button
                key={idx}
                onClick={() => setDifficulty(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  difficulty === idx
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {/* Team Selection Grid */}
        <main className="bg-stone-900/60 p-3.5 rounded-3xl border border-stone-800">
          <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 px-1">
            Turnuvaya Katılacak Takımını Seç (32 Ülke)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[52vh] overflow-y-auto pr-1">
            {TEAMS_DATA.map((t) => {
              const stars = getTeamStars(t.r);
              const form = FORMATIONS.find((f) => f.id === t.preferredFormationId) || FORMATIONS[0];

              return (
                <button
                  key={t.id}
                  onClick={() => startNewTournament(t.id)}
                  className="p-2.5 rounded-2xl bg-stone-900 hover:bg-emerald-950/60 border border-stone-800 hover:border-emerald-500 text-left transition-all hover:scale-[1.02] flex items-center gap-2.5 shadow-sm group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {t.f}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs text-stone-100 truncate block">
                      {t.n}
                    </span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-amber-400 tracking-tighter">
                        {'★'.repeat(stars)}
                      </span>
                      <span className="text-[9px] text-stone-400 font-mono">
                        {form.shortLabel}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </main>
      </div>

      <footer className="text-center text-[11px] text-stone-400 py-2">
        Fiske ile çek ve fırlat · Taktik dizilişini kur ve Dünya Kupasını kaldır!
      </footer>

      {/* Modals */}
      <TacticsModal
        isOpen={showTacticsModal}
        onClose={() => setShowTacticsModal(false)}
      />
      <FormationSelector
        isOpen={showFormationModal}
        onClose={() => setShowFormationModal(false)}
        selectedFormationId="classic"
        onSelectFormation={() => setShowFormationModal(false)}
      />
    </div>
  );
}
