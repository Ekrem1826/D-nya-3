/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PITCH_LEFT,
  PITCH_TOP,
  PITCH_RIGHT,
  PITCH_BOTTOM,
  CENTER_X,
  CENTER_Y,
  GOAL_LEFT,
  GOAL_RIGHT,
  PHYSICS_DT,
  MAX_PULL_DISTANCE,
  MATCH_DURATION_SECONDS,
  EXTRA_TIME_SECONDS,
  ROLES,
  FORMATIONS,
  PLAYERS_PER_TEAM,
  PASS_MAX_DISTANCE,
  Team,
  PlayerRole,
} from '../game/constants.ts';
import {
  Disk,
  resetDisks,
  physicsStep,
  areDisksMoving,
  calculateShotPower,
  formatTimeMMSS,
  formatFootballMatchMinute,
  checkMatchEnd,
  checkPassSuccess,
} from '../game/rules.ts';
import { sound } from '../game/sound.ts';
import { TacticsModal } from './TacticsModal.tsx';
import { FormationSelector } from './FormationSelector.tsx';
import { Volume2, VolumeX, Pause, Play, Info, Trophy, Layers, Target } from 'lucide-react';

interface PitchCanvasProps {
  teamA: Team; // User's team
  teamB: Team; // Opponent's team
  isKnockout: boolean;
  roundLabel: string;
  difficulty: number; // 0: Easy, 1: Normal, 2: Hard
  initialUserFormationId?: string;
  onMatchFinish: (result: { scoreA: number; scoreB: number; penalties?: [number, number] }) => void;
  onQuitToTournament: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  color: string;
}

export const PitchCanvas: React.FC<PitchCanvasProps> = ({
  teamA,
  teamB,
  isKnockout,
  roundLabel,
  difficulty,
  initialUserFormationId = 'classic',
  onMatchFinish,
  onQuitToTournament,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSecRef = useRef<number>(MATCH_DURATION_SECONDS);

  // Formations
  const [userFormationId, setUserFormationId] = useState<string>(initialUserFormationId);
  const botFormationId = teamB.preferredFormationId || 'classic';

  const userFormation = FORMATIONS.find((f) => f.id === userFormationId) || FORMATIONS[0];
  const botFormation = FORMATIONS.find((f) => f.id === botFormationId) || FORMATIONS[0];

  // Match states
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(MATCH_DURATION_SECONDS);
  const [isExtraTime, setIsExtraTime] = useState<boolean>(false);
  const [currentTurn, setCurrentTurn] = useState<number>(0); // 0: User, 1: Bot
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number>(6); // default to Forvet (idx 6)
  const [statusMessage, setStatusMessage] = useState<string>('Sıra sende. Oyuncunu çek ve fırlat!');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(sound.isMuted);
  const [showTacticsModal, setShowTacticsModal] = useState<boolean>(false);
  const [showFormationModal, setShowFormationModal] = useState<boolean>(false);
  const [goalBanner, setGoalBanner] = useState<string | null>(null);
  const [passBanner, setPassBanner] = useState<{ text: string; x: number; y: number } | null>(null);

  // Penalty shootout state
  const [penaltyState, setPenaltyState] = useState<{
    active: boolean;
    scores: [number, number];
    history: [number[], number[]];
    isUserTurn: boolean;
    message: string;
    isFinished: boolean;
  } | null>(null);

  // Contrasting kit colors calculation
  const getContrastingTeamColors = () => {
    const parseRgb = (hex: string) => [
      parseInt(hex.slice(1, 3), 16) || 0,
      parseInt(hex.slice(3, 5), 16) || 0,
      parseInt(hex.slice(5, 7), 16) || 0,
    ];
    const c1 = parseRgb(teamA.c);
    const c2 = parseRgb(teamB.c);
    const dist = Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);

    if (dist < 130) {
      const awayOptions = ['#ffffff', '#2563eb', '#f59e0b', '#18181b'];
      for (const opt of awayOptions) {
        const co = parseRgb(opt);
        if (Math.hypot(c1[0] - co[0], c1[1] - co[1], c1[2] - co[2]) > 140) {
          return { colorA: teamA.c, colorB: opt };
        }
      }
    }
    return { colorA: teamA.c, colorB: teamB.c };
  };

  const { colorA, colorB } = getContrastingTeamColors();
  const activeRole: PlayerRole = ROLES[selectedPlayerIndex] || ROLES[0];

  // Game state ref
  const gameStateRef = useRef({
    disks: resetDisks(userFormation.positions, botFormation.positions),
    phase: 'aim' as 'aim' | 'move' | 'bot_thinking' | 'goal_pause' | 'end',
    turn: 0,
    waitTimer: 0,
    selectedPlayer: 6,
    lastShooterPlayer: 6,
    lastShootingTeam: 0,
    remainingSeconds: MATCH_DURATION_SECONDS,
    isExtraTime: false,
    score: [0, 0] as [number, number],
    isPaused: false,
    particles: [] as Particle[],
    shake: 0,
    passHighlightIndex: -1,
    drag: null as {
      playerIdx: number;
      startX: number;
      startY: number;
      currX: number;
      currY: number;
    } | null,
  });

  // Pre-bake static stadium background once to an offscreen canvas
  const bakeBackground = useCallback(() => {
    const bg = document.createElement('canvas');
    bg.width = WORLD_WIDTH;
    bg.height = WORLD_HEIGHT;
    const ctx = bg.getContext('2d');
    if (!ctx) return;

    // 1. Stadium background
    ctx.fillStyle = '#0a100d';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 2. Spectator stands (Tribünler)
    const drawStands = (startX: number, width: number) => {
      ctx.fillStyle = '#111a14';
      ctx.fillRect(startX, 0, width, WORLD_HEIGHT);

      ctx.strokeStyle = '#1b261e';
      ctx.lineWidth = 1;
      for (let y = 0; y < WORLD_HEIGHT; y += 14) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + width, y);
        ctx.stroke();
      }

      const fanColors = [colorA, colorB, '#ffffff', '#e2e8f0', '#3b82f6', '#ef4444', '#f59e0b'];
      for (let y = 10; y < WORLD_HEIGHT - 10; y += 14) {
        for (let col = 0; col < 4; col++) {
          const cx = startX + 6 + col * 9;
          const color = fanColors[(Math.floor(y * 3 + col * 7)) % fanColors.length];
          ctx.beginPath();
          ctx.arc(cx, y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    };

    drawStands(0, PITCH_LEFT - 4);
    drawStands(PITCH_RIGHT + 4, WORLD_WIDTH - PITCH_RIGHT - 4);

    // 3. Turf and mower grass stripes
    ctx.fillStyle = '#164024';
    ctx.fillRect(PITCH_LEFT, PITCH_TOP, PITCH_RIGHT - PITCH_LEFT, PITCH_BOTTOM - PITCH_TOP);

    const stripeHeight = (PITCH_BOTTOM - PITCH_TOP) / 10;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1b4d2c' : '#215c35';
      ctx.fillRect(PITCH_LEFT, PITCH_TOP + i * stripeHeight, PITCH_RIGHT - PITCH_LEFT, stripeHeight);
    }

    // Outer boundary line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(PITCH_LEFT, PITCH_TOP, PITCH_RIGHT - PITCH_LEFT, PITCH_BOTTOM - PITCH_TOP);

    // Halfway line & center circle
    ctx.beginPath();
    ctx.moveTo(PITCH_LEFT, CENTER_Y);
    ctx.lineTo(PITCH_RIGHT, CENTER_Y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 50, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Corner arcs
    const cornerR = 14;
    ctx.beginPath();
    ctx.arc(PITCH_LEFT, PITCH_TOP, cornerR, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PITCH_RIGHT, PITCH_TOP, cornerR, Math.PI / 2, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PITCH_LEFT, PITCH_BOTTOM, cornerR, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PITCH_RIGHT, PITCH_BOTTOM, cornerR, Math.PI, Math.PI * 1.5);
    ctx.stroke();

    // Penalty boxes
    const boxW = 210;
    const boxH = 70;
    ctx.strokeRect(CENTER_X - boxW / 2, PITCH_TOP, boxW, boxH);
    ctx.strokeRect(CENTER_X - boxW / 2, PITCH_BOTTOM - boxH, boxW, boxH);

    // Small boxes
    const smallBoxW = 110;
    const smallBoxH = 26;
    ctx.strokeRect(CENTER_X - smallBoxW / 2, PITCH_TOP, smallBoxW, smallBoxH);
    ctx.strokeRect(CENTER_X - smallBoxW / 2, PITCH_BOTTOM - smallBoxH, smallBoxW, smallBoxH);

    // Arcs
    ctx.beginPath();
    ctx.arc(CENTER_X, PITCH_TOP + boxH, 36, 0, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, PITCH_BOTTOM - boxH, 36, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Goal nets
    const drawNet = (yPos: number, isTop: boolean, kitColor: string) => {
      const netHeight = 44;
      const yStart = isTop ? yPos - netHeight : yPos;

      ctx.fillStyle = 'rgba(10, 10, 10, 0.65)';
      ctx.fillRect(GOAL_LEFT, yStart, GOAL_RIGHT - GOAL_LEFT, netHeight);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(GOAL_LEFT, yStart, GOAL_RIGHT - GOAL_LEFT, netHeight);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = GOAL_LEFT; x <= GOAL_RIGHT; x += 10) {
        ctx.moveTo(x, yStart);
        ctx.lineTo(x, yStart + netHeight);
      }
      for (let y = yStart; y <= yStart + netHeight; y += 8) {
        ctx.moveTo(GOAL_LEFT, y);
        ctx.lineTo(GOAL_RIGHT, y);
      }
      ctx.stroke();

      ctx.strokeStyle = kitColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(GOAL_LEFT, yPos);
      ctx.lineTo(GOAL_RIGHT, yPos);
      ctx.stroke();
    };

    drawNet(PITCH_TOP, true, colorB);
    drawNet(PITCH_BOTTOM, false, colorA);

    // 4. Stadium Floodlights
    const floodlights = [
      [PITCH_LEFT - 12, PITCH_TOP - 12],
      [PITCH_RIGHT + 12, PITCH_TOP - 12],
      [PITCH_LEFT - 12, PITCH_BOTTOM + 12],
      [PITCH_RIGHT + 12, PITCH_BOTTOM + 12],
    ];

    floodlights.forEach(([fx, fy]) => {
      const lightGrad = ctx.createRadialGradient(fx, fy, 4, fx, fy, 280);
      lightGrad.addColorStop(0, 'rgba(255, 250, 220, 0.28)');
      lightGrad.addColorStop(0.5, 'rgba(255, 250, 220, 0.08)');
      lightGrad.addColorStop(1, 'rgba(255, 250, 220, 0)');

      ctx.fillStyle = lightGrad;
      ctx.beginPath();
      ctx.arc(fx, fy, 280, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(fx, fy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    bgCanvasRef.current = bg;
  }, [colorA, colorB]);

  // Bake background on mount or color change
  useEffect(() => {
    bakeBackground();
  }, [bakeBackground]);

  // Kickoff setup with 7 players per team
  useEffect(() => {
    sound.playWhistle();
    gameStateRef.current.disks = resetDisks(userFormation.positions, botFormation.positions);
    gameStateRef.current.remainingSeconds = MATCH_DURATION_SECONDS;
    gameStateRef.current.score = [0, 0];
    gameStateRef.current.phase = 'aim';
    gameStateRef.current.turn = Math.random() < 0.5 ? 0 : 1;
    setCurrentTurn(gameStateRef.current.turn);

    if (gameStateRef.current.turn === 1) {
      gameStateRef.current.phase = 'bot_thinking';
      gameStateRef.current.waitTimer = 0.8;
      setStatusMessage(`${teamB.n} oynuyor...`);
    } else {
      setStatusMessage('Sıra sende. Oyuncunu çek ve fırlat!');
    }
  }, [teamA, teamB, userFormation, botFormation]);

  // Handle user changing formation mid-match
  const handleApplyFormation = (newFormationId: string) => {
    setUserFormationId(newFormationId);
    setShowFormationModal(false);
    const newForm = FORMATIONS.find((f) => f.id === newFormationId) || FORMATIONS[0];

    const g = gameStateRef.current;
    if (g.phase === 'aim') {
      newForm.positions.forEach((pos, idx) => {
        g.disks[idx].x = PITCH_LEFT + pos[0];
        g.disks[idx].y = PITCH_TOP + pos[1];
        g.disks[idx].vx = 0;
        g.disks[idx].vy = 0;
      });
      setStatusMessage(`Diziliş güncellendi: ${newForm.name}`);
    }
  };

  // Main 60 FPS animation & physics loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const g = gameStateRef.current;

      if (g.isPaused || penaltyState?.active) {
        drawCanvas();
        return;
      }

      // Decrement match clock (3 minutes)
      if (g.phase === 'aim' || g.phase === 'move' || g.phase === 'bot_thinking') {
        g.remainingSeconds = Math.max(0, g.remainingSeconds - dt);

        const secInt = Math.ceil(g.remainingSeconds);
        if (secInt !== lastSecRef.current) {
          lastSecRef.current = secInt;
          setRemainingSeconds(secInt);
        }

        if (g.remainingSeconds <= 0 && g.phase === 'aim' && !areDisksMoving(g.disks)) {
          const matchCheck = checkMatchEnd(
            g.remainingSeconds,
            g.score[0],
            g.score[1],
            isKnockout,
            g.isExtraTime
          );

          if (matchCheck.startExtraTime) {
            sound.playWhistle();
            g.isExtraTime = true;
            setIsExtraTime(true);
            g.remainingSeconds = EXTRA_TIME_SECONDS;
            setRemainingSeconds(EXTRA_TIME_SECONDS);
            setStatusMessage('⚡ Uzatma Devresi: Altın Gol! İlk atan kazanır.');
          } else if (matchCheck.startPenalties) {
            sound.playWhistle();
            triggerPenaltyShootout();
            return;
          } else if (matchCheck.finished) {
            sound.playWhistle();
            g.phase = 'end';
            setStatusMessage('Maç sona erdi!');
            setTimeout(() => {
              onMatchFinish({ scoreA: g.score[0], scoreB: g.score[1] });
            }, 1800);
            return;
          }
        }
      }

      // Physics update phase
      if (g.phase === 'move') {
        let accumulator = dt;
        let goalDetected = 0;

        while (accumulator >= PHYSICS_DT) {
          accumulator -= PHYSICS_DT;
          const result = physicsStep(g.disks, PHYSICS_DT);

          if (result.highestCollisionImpulse > 120) {
            sound.playCollision(result.highestCollisionImpulse);
          }

          if (result.goal > 0) {
            goalDetected = result.goal;
            break;
          }

          if (!areDisksMoving(g.disks)) {
            break;
          }
        }

        if (goalDetected > 0) {
          handleGoal(goalDetected);
        } else if (!areDisksMoving(g.disks)) {
          // Check Pass condition when disks come to a rest!
          // User requirement: "Eğer bir takım oyuncu topa vurduktan sonra kendi oyuncusunun yanına olursa pas olsun. Ama mesafe çok fazla olmasın."
          const passResult = checkPassSuccess(
            g.disks,
            g.lastShootingTeam,
            g.lastShooterPlayer,
            PASS_MAX_DISTANCE
          );

          if (passResult.isPass && passResult.receiverPlayerIndex !== undefined) {
            // SUCCESSFUL PASS! The team keeps the turn and attack continues!
            sound.playPass();
            const receiverIdx = passResult.receiverPlayerIndex;
            const receiverDisk = g.disks[passResult.receiverDiskIndex!];

            setPassBanner({
              text: 'PAS! 🎯',
              x: receiverDisk.x,
              y: receiverDisk.y - receiverDisk.r - 18,
            });
            setTimeout(() => setPassBanner(null), 1400);

            if (g.lastShootingTeam === 0) {
              // User completed a pass to teammate!
              g.turn = 0;
              setCurrentTurn(0);
              g.phase = 'aim';
              g.selectedPlayer = receiverIdx;
              setSelectedPlayerIndex(receiverIdx);
              g.passHighlightIndex = passResult.receiverDiskIndex!;
              setTimeout(() => {
                g.passHighlightIndex = -1;
              }, 2000);
              setStatusMessage('Harika pas! 🎯 Hücum devam ediyor, sıra sende!');
            } else {
              // Bot completed a pass!
              g.turn = 1;
              setCurrentTurn(1);
              g.phase = 'bot_thinking';
              g.waitTimer = 0.6;
              setStatusMessage(`${teamB.n} pası aldı, atağa devam ediyor...`);
            }
          } else {
            // Regular turn alternation (no pass connection)
            g.turn = g.turn === 0 ? 1 : 0;
            setCurrentTurn(g.turn);

            if (g.turn === 1) {
              g.phase = 'bot_thinking';
              g.waitTimer = 0.6;
              setStatusMessage(`${teamB.n} pozisyon alıyor...`);
            } else {
              g.phase = 'aim';
              const ball = g.disks[g.disks.length - 1];
              let closestIdx = 0;
              let minDist = Infinity;
              for (let i = 0; i < PLAYERS_PER_TEAM; i++) {
                const d = Math.hypot(g.disks[i].x - ball.x, g.disks[i].y - ball.y);
                if (d < minDist) {
                  minDist = d;
                  closestIdx = i;
                }
              }
              g.selectedPlayer = closestIdx;
              setSelectedPlayerIndex(closestIdx);
              setStatusMessage('Sıra sende. Oyuncunu çek ve fırlat!');
            }
          }
        }
      } else if (g.phase === 'bot_thinking') {
        g.waitTimer -= dt;
        if (g.waitTimer <= 0) {
          executeBotTurn();
        }
      } else if (g.phase === 'goal_pause') {
        g.waitTimer -= dt;
        if (g.waitTimer <= 0) {
          setGoalBanner(null);
          if (g.isExtraTime && g.score[0] !== g.score[1]) {
            sound.playWhistle();
            g.phase = 'end';
            setStatusMessage('Altın Gol! Maç bitti.');
            setTimeout(() => {
              onMatchFinish({ scoreA: g.score[0], scoreB: g.score[1] });
            }, 1800);
            return;
          }

          g.disks = resetDisks(userFormation.positions, botFormation.positions);
          g.phase = g.turn === 0 ? 'aim' : 'bot_thinking';
          g.waitTimer = 0.6;
          setStatusMessage(g.turn === 0 ? 'Sıra sende. Başla!' : `${teamB.n} oyuna başlıyor...`);
        }
      }

      // Update particles
      if (g.particles.length > 0) {
        for (let i = 0; i < g.particles.length; i++) {
          const p = g.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 220 * dt;
          p.rotation += p.rotSpeed * dt;
          p.life -= dt;
        }
        g.particles = g.particles.filter((p) => p.life > 0);
      }

      // Decay screen shake
      if (g.shake > 0) {
        g.shake = Math.max(0, g.shake - dt * 2.2);
      }

      drawCanvas();
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isKnockout, teamB.n, onMatchFinish, penaltyState, userFormation, botFormation]);

  // Goal handler with "tok" sound and screen shake & confetti
  const handleGoal = (scoringTeam: number) => {
    const g = gameStateRef.current;
    sound.playGoal();
    g.shake = 1.2;

    const newScoreA = scoringTeam === 1 ? g.score[0] + 1 : g.score[0];
    const newScoreB = scoringTeam === 2 ? g.score[1] + 1 : g.score[1];
    g.score = [newScoreA, newScoreB];
    setScore([newScoreA, newScoreB]);

    const confettiColors = ['#ffd700', '#ffffff', teamA.c, teamB.c, '#22c55e', '#ef4444', '#38bdf8'];
    for (let i = 0; i < 70; i++) {
      g.particles.push({
        x: CENTER_X + (Math.random() - 0.5) * 120,
        y: scoringTeam === 1 ? PITCH_TOP + 15 : PITCH_BOTTOM - 15,
        vx: (Math.random() - 0.5) * 550,
        vy: (scoringTeam === 1 ? 1 : -1) * (180 + Math.random() * 380),
        size: 5 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 2.0 + Math.random() * 0.6,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      });
    }

    setGoalBanner(scoringTeam === 1 ? `GOOOL! ${teamA.n}!` : `GOL! ${teamB.n}!`);
    g.phase = 'goal_pause';
    g.waitTimer = 2.2;
    g.turn = scoringTeam === 1 ? 1 : 0;
    setCurrentTurn(g.turn);
  };

  // Bot AI decision maker across bot's 7 players (indices 7..13)
  const executeBotTurn = () => {
    const g = gameStateRef.current;
    const ball = g.disks[g.disks.length - 1];
    const skillFactor = 0.45 + difficulty * 0.25 + (teamB.r - 70) / 70;

    let bestShot: { index: number; vx: number; vy: number; score: number } | null = null;
    let bestScore = -Infinity;

    // Pick top 3 bot players closest to ball among 7..13
    const botIndices = Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => PLAYERS_PER_TEAM + i);
    const candidates = botIndices
      .map((idx) => ({
        idx,
        dist: Math.hypot(g.disks[idx].x - ball.x, g.disks[idx].y - ball.y),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    const angleJitters = [-0.12, 0, 0.12];

    for (const cand of candidates) {
      const playerDisk = g.disks[cand.idx];
      const role = ROLES[playerDisk.playerIndex || 0] || ROLES[0];
      const baseAngle = Math.atan2(ball.y - playerDisk.y, ball.x - playerDisk.x);

      for (const jitter of angleJitters) {
        const angle = baseAngle + jitter * (1 - skillFactor);
        const pullLen = 50 + Math.random() * 55;
        const shotPower = calculateShotPower(pullLen, role.id, playerDisk.y, 1);
        const vx = Math.cos(angle) * shotPower;
        const vy = Math.sin(angle) * shotPower;

        const simDisks = g.disks.map((d) => ({ ...d }));
        simDisks[cand.idx].vx = vx;
        simDisks[cand.idx].vy = vy;

        let goalResult = 0;
        for (let step = 0; step < 25; step++) {
          const res = physicsStep(simDisks, PHYSICS_DT * 2.0);
          if (res.goal > 0) {
            goalResult = res.goal;
            break;
          }
          if (!areDisksMoving(simDisks, 120)) break;
        }

        let evalScore = 0;
        if (goalResult === 2) evalScore += 10000;
        else if (goalResult === 1) evalScore -= 10000;
        else {
          evalScore += (simDisks[g.disks.length - 1].y - ball.y) * 8;
          const distToGoalCenter = Math.abs(simDisks[g.disks.length - 1].x - CENTER_X);
          evalScore -= distToGoalCenter * 1.2;
        }

        if (evalScore > bestScore) {
          bestScore = evalScore;
          bestShot = { index: cand.idx, vx, vy, score: evalScore };
        }
      }
    }

    if (bestShot) {
      sound.playKick(0.7);
      g.lastShootingTeam = 1;
      g.lastShooterPlayer = g.disks[bestShot.index].playerIndex ?? 0;
      g.disks[bestShot.index].vx = bestShot.vx;
      g.disks[bestShot.index].vy = bestShot.vy;
      g.phase = 'move';
    } else {
      const fallbackIdx = candidates[0].idx;
      const dx = ball.x - g.disks[fallbackIdx].x;
      const dy = ball.y - g.disks[fallbackIdx].y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 400;
      sound.playKick(0.5);
      g.lastShootingTeam = 1;
      g.lastShooterPlayer = g.disks[fallbackIdx].playerIndex ?? 0;
      g.disks[fallbackIdx].vx = (dx / dist) * speed;
      g.disks[fallbackIdx].vy = (dy / dist) * speed;
      g.phase = 'move';
    }
  };

  // Penalty Shootout logic
  const triggerPenaltyShootout = () => {
    setPenaltyState({
      active: true,
      scores: [0, 0],
      history: [[], []],
      isUserTurn: true,
      message: 'Penaltı atışları başladı! İlk sen vuruyorsun.',
      isFinished: false,
    });
  };

  const handlePenaltyShot = (targetZone: number) => {
    if (!penaltyState || penaltyState.isFinished) return;

    const isUserKicking = penaltyState.isUserTurn;
    const keeperDiveZone = Math.floor(Math.random() * 6);

    const isSaved = targetZone === keeperDiveZone && Math.random() < 0.75;
    const isMissed = !isSaved && Math.random() < 0.08;
    const isGoal = !isSaved && !isMissed;

    if (isGoal) {
      sound.playGoal();
    } else {
      sound.playKick(0.8);
    }

    const newHist0 = [...penaltyState.history[0]];
    const newHist1 = [...penaltyState.history[1]];

    if (isUserKicking) {
      newHist0.push(isGoal ? 1 : 0);
    } else {
      newHist1.push(isGoal ? 1 : 0);
    }

    const newScore0 = penaltyState.scores[0] + (isUserKicking && isGoal ? 1 : 0);
    const newScore1 = penaltyState.scores[1] + (!isUserKicking && isGoal ? 1 : 0);

    const shots0 = newHist0.length;
    const shots1 = newHist1.length;

    let finished = false;
    if (shots0 >= 5 && shots1 >= 5) {
      if (shots0 === shots1 && newScore0 !== newScore1) {
        finished = true;
      }
    } else {
      const rem0 = 5 - shots0;
      const rem1 = 5 - shots1;
      if (newScore0 > newScore1 + rem1 || newScore1 > newScore0 + rem0) {
        finished = true;
      }
    }

    const resultMessage = isUserKicking
      ? isGoal
        ? 'GOOOL! Harika bir vuruş!'
        : isSaved
        ? 'Kaleci kurtardı!'
        : 'Top dışarı gitti!'
      : isGoal
      ? 'Rakip golü attı!'
      : isSaved
      ? 'Kurtardın! Harika refleks!'
      : 'Rakip dışarı vurdu!';

    setPenaltyState({
      active: true,
      scores: [newScore0, newScore1],
      history: [newHist0, newHist1],
      isUserTurn: !isUserKicking,
      message: resultMessage,
      isFinished: finished,
    });
  };

  // Canvas drawing
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const g = gameStateRef.current;

    ctx.save();

    if (g.shake > 0) {
      const trauma = g.shake * g.shake;
      const ox = (Math.random() - 0.5) * 16 * trauma;
      const oy = (Math.random() - 0.5) * 16 * trauma;
      ctx.translate(ox, oy);
    }

    // 1. Blit pre-baked stadium background
    if (bgCanvasRef.current) {
      ctx.drawImage(bgCanvasRef.current, 0, 0);
    } else {
      ctx.fillStyle = '#164024';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    // 2. Shadows for all 15 disks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    for (let i = 0; i < g.disks.length; i++) {
      const d = g.disks[i];
      ctx.beginPath();
      ctx.arc(d.x + 3.5, d.y + 5.5, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Render 14 Player Disks (7 User + 7 Bot)
    for (let idx = 0; idx < g.disks.length; idx++) {
      const d = g.disks[idx];
      if (d.ball) continue;

      const isUserTeam = idx < PLAYERS_PER_TEAM;
      const role = ROLES[d.playerIndex || 0] || ROLES[0];
      const isSelected = isUserTeam && d.playerIndex === g.selectedPlayer;
      const isPassHighlight = idx === g.passHighlightIndex;
      const teamColor = isUserTeam ? colorA : colorB;

      // Selection or pass glow indicator
      if (isPassHighlight) {
        ctx.strokeStyle = '#22c55e'; // emerald glowing pass ring
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + 7, 0, Math.PI * 2);
        ctx.stroke();
      } else if (isSelected && g.phase === 'aim' && g.turn === 0) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = teamColor;
      ctx.fill();
      ctx.clip();

      // Forma Şeridi (Jersey Stripe)
      const stripeWidth = Math.round(d.r * 0.42);
      ctx.fillStyle = isUserTeam ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(d.x - stripeWidth / 2, d.y - d.r, stripeWidth, d.r * 2);

      // Top specular highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(d.x, d.y - d.r * 0.3, d.r * 0.85, 0, Math.PI);
      ctx.fill();

      ctx.restore();

      // Rim
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
      ctx.lineWidth = role.id === 1 ? 4.5 : 3;
      ctx.stroke();

      const isLightKit = teamColor === '#ffffff' || teamColor === '#f8fafc' || teamColor === '#facc15';
      const numTextColor = isLightKit ? '#0f172a' : '#ffffff';
      const tagTextColor = isLightKit ? '#b45309' : '#fef08a';

      // Number
      ctx.fillStyle = numTextColor;
      ctx.font = `bold ${role.id === 1 ? 14 : 12}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${role.number}`, d.x, d.y - 3);

      // Role tag abbreviation
      ctx.font = 'bold 8.5px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = tagTextColor;
      ctx.fillText(role.shortName, d.x, d.y + 7.5);
    }

    // 4. Render Ball (Disk index 14)
    const ball = g.disks[g.disks.length - 1];
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 5. Aiming slingshot & forecast trajectory
    if (g.drag && g.phase === 'aim' && g.turn === 0) {
      const activeDisk = g.disks[g.drag.playerIdx];
      const role = ROLES[activeDisk.playerIndex || 0] || ROLES[0];

      const dx = g.drag.startX - g.drag.currX;
      const dy = g.drag.startY - g.drag.currY;
      const pullDist = Math.hypot(dx, dy);

      if (pullDist > 12) {
        const pullClamped = Math.min(pullDist, MAX_PULL_DISTANCE);
        const pullRatio = pullClamped / MAX_PULL_DISTANCE;
        const nx = dx / pullDist;
        const ny = dy / pullDist;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(activeDisk.x, activeDisk.y);
        ctx.lineTo(activeDisk.x - nx * pullClamped, activeDisk.y - ny * pullClamped);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(activeDisk.x - nx * pullClamped, activeDisk.y - ny * pullClamped, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Trajectory forecast arrow (On Numara has extended precision line)
        const trajMultiplier = role.id === 6 ? 1.6 : 1.0;
        const trajLen = (50 + pullRatio * 170) * trajMultiplier;
        const hue = Math.max(0, 125 - pullRatio * 125);
        const aimColor = `hsl(${hue}, 90%, 55%)`;

        ctx.strokeStyle = aimColor;
        ctx.lineWidth = role.id === 6 ? 5 : 4.5;
        ctx.setLineDash([3, 10]);
        ctx.beginPath();
        ctx.moveTo(activeDisk.x + nx * (activeDisk.r + 4), activeDisk.y + ny * (activeDisk.r + 4));
        ctx.lineTo(activeDisk.x + nx * trajLen, activeDisk.y + ny * trajLen);
        ctx.stroke();
        ctx.setLineDash([]);

        const arrowX = activeDisk.x + nx * trajLen;
        const arrowY = activeDisk.y + ny * trajLen;
        ctx.fillStyle = aimColor;
        ctx.beginPath();
        ctx.moveTo(arrowX + nx * 12, arrowY + ny * 12);
        ctx.lineTo(arrowX - ny * 8, arrowY + nx * 8);
        ctx.lineTo(arrowX + ny * 8, arrowY - nx * 8);
        ctx.closePath();
        ctx.fill();

        if (role.id === 7 && activeDisk.y < CENTER_Y) {
          ctx.fillStyle = '#f43f5e';
          ctx.font = 'bold 11px ui-rounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ Bitirici Şut Bonusu!', activeDisk.x, activeDisk.y - activeDisk.r - 12);
        }
      }
    }

    // 6. Pass Toast badge on pitch
    if (passBanner) {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 16px ui-rounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(passBanner.text, passBanner.x, passBanner.y);
    }

    // 7. Confetti particles
    for (let i = 0; i < g.particles.length; i++) {
      const p = g.particles[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.7);
      ctx.restore();
    }

    ctx.restore();
  };

  const getCanvasCoords = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = WORLD_WIDTH / rect.width;
    const scaleY = WORLD_HEIGHT / rect.height;
    return [(clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameStateRef.current;
    if (g.phase !== 'aim' || g.turn !== 0 || g.isPaused || penaltyState?.active) return;

    const [x, y] = getCanvasCoords(e.clientX, e.clientY);

    // Check if clicked close to any of user's 7 players (indices 0..6)
    let closestIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < PLAYERS_PER_TEAM; i++) {
      const disk = g.disks[i];
      const dist = Math.hypot(disk.x - x, disk.y - y);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    if (minDist < 48 && closestIdx !== -1) {
      g.selectedPlayer = closestIdx;
      setSelectedPlayerIndex(closestIdx);
      sound.playSelection();
    }

    g.drag = {
      playerIdx: g.selectedPlayer,
      startX: x,
      startY: y,
      currX: x,
      currY: y,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameStateRef.current;
    if (!g.drag) return;
    const [x, y] = getCanvasCoords(e.clientX, e.clientY);
    g.drag.currX = x;
    g.drag.currY = y;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameStateRef.current;
    if (!g.drag) return;

    const drag = g.drag;
    g.drag = null;

    if (g.phase !== 'aim' || g.turn !== 0) return;

    const dx = drag.startX - drag.currX;
    const dy = drag.startY - drag.currY;
    const pullDist = Math.hypot(dx, dy);

    if (pullDist > 14) {
      const activeDisk = g.disks[drag.playerIdx];
      const role = ROLES[activeDisk.playerIndex || 0] || ROLES[0];
      const power = calculateShotPower(pullDist, role.id, activeDisk.y, 0);

      const nx = dx / pullDist;
      const ny = dy / pullDist;

      sound.playKick(Math.min(1, pullDist / MAX_PULL_DISTANCE));

      // Record shooter info for pass detection!
      g.lastShootingTeam = 0;
      g.lastShooterPlayer = activeDisk.playerIndex ?? 0;

      activeDisk.vx = nx * power;
      activeDisk.vy = ny * power;

      g.phase = 'move';
      setStatusMessage('Top hareket halinde...');
    }
  };

  const toggleMute = () => {
    sound.isMuted = !sound.isMuted;
    setIsMuted(sound.isMuted);
  };

  return (
    <div className="relative flex flex-col items-center justify-between h-full w-full bg-stone-950 select-none overflow-hidden text-stone-100">
      {/* Top HUD */}
      <header className="w-full max-w-xl px-3 py-2 z-20 flex flex-col gap-1.5 bg-stone-900/90 border-b border-stone-800 backdrop-blur-xs">
        <div className="flex items-center justify-between text-xs text-stone-400 font-semibold px-1">
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            {roundLabel}
          </span>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-950/80 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono text-[11px] border border-emerald-800">
              ⏱️ {formatTimeMMSS(remainingSeconds)}
            </span>
            <span className="text-stone-300 font-bold">
              {formatFootballMatchMinute(remainingSeconds, MATCH_DURATION_SECONDS, isExtraTime)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFormationModal(true)}
              aria-label="Diziliş Seçimi"
              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Diziliş Değiştir"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Diziliş:</span> {userFormation.shortLabel}
            </button>
            <button
              onClick={() => setShowTacticsModal(true)}
              aria-label="Mevki ve Taktik Bilgisi"
              className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
              title="Mevki Özellikleri"
            >
              <Info className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              onClick={toggleMute}
              aria-label={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
              className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-stone-300" />}
            </button>
            <button
              onClick={() => {
                const next = !isPaused;
                setIsPaused(next);
                gameStateRef.current.isPaused = next;
              }}
              aria-label={isPaused ? 'Devam Et' : 'Duraklat'}
              className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-stone-300" />}
            </button>
          </div>
        </div>

        {/* Score Board with Formations */}
        <div className="flex items-center justify-between bg-stone-950/70 rounded-xl p-2 px-3 border border-stone-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-2xl">{teamA.f}</span>
            <div className="min-w-0">
              <span className="font-black text-sm text-white truncate block">{teamA.n}</span>
              <span className="text-[10px] text-emerald-400 font-bold block truncate">
                {userFormation.name}
              </span>
            </div>
          </div>

          <div className="px-4 text-center">
            <span className="font-black text-2xl tracking-wider text-white font-mono">
              {score[0]} – {score[1]}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right">
            <div className="min-w-0">
              <span className="font-black text-sm text-white truncate block">{teamB.n}</span>
              <span className="text-[10px] text-stone-400 font-bold block truncate">
                {botFormation.name}
              </span>
            </div>
            <span className="text-2xl">{teamB.f}</span>
          </div>
        </div>

        {/* Active Role Strip */}
        <div className="flex items-center justify-between text-xs bg-stone-950/50 rounded-lg py-1 px-2.5 border border-stone-800/80">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center">
              {activeRole.number}
            </span>
            <span className="font-bold text-white">{activeRole.name} ({activeRole.shortName})</span>
            <span className="text-stone-400 text-[11px] hidden sm:inline">• {activeRole.sizeDesc}</span>
          </div>
          <span className="text-emerald-400 text-[11px] font-medium truncate max-w-[210px]">
            🌟 {activeRole.specialAbility}
          </span>
        </div>
      </header>

      {/* Main Pitch Stage */}
      <main
        ref={containerRef}
        className="relative flex-1 w-full max-w-xl flex items-center justify-center overflow-hidden p-1 touch-none will-change-transform"
      >
        <canvas
          ref={canvasRef}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-auto h-full max-h-[85vh] aspect-[500/820] shadow-2xl rounded-xl cursor-crosshair border-2 border-stone-800"
          style={{
            transform: 'translateZ(0)',
          }}
        />

        {/* Goal celebration banner overlay */}
        {goalBanner && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="animate-bounce bg-black/90 border-4 border-amber-400 rounded-3xl px-8 py-5 shadow-2xl text-center transform scale-110">
              <span className="block text-4xl sm:text-5xl font-black text-amber-300 drop-shadow-md">
                ⚽ {goalBanner}
              </span>
            </div>
          </div>
        )}

        {/* Pass alert toast overlay */}
        {passBanner && (
          <div className="absolute top-16 z-30 pointer-events-none animate-pulse">
            <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full font-black text-sm shadow-xl flex items-center gap-1.5 border border-emerald-400">
              <Target className="w-4 h-4" />
              BAŞARILI PAS! Top sende!
            </div>
          </div>
        )}

        {/* Pause Overlay */}
        {isPaused && (
          <div className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center gap-3 p-4">
            <h3 className="text-2xl font-black text-white">Oyun Duraklatıldı</h3>
            <p className="text-xs text-stone-400">3 dakikalık maç süresi durduruldu.</p>
            <div className="flex flex-col gap-2 w-48 mt-2">
              <button
                onClick={() => {
                  setIsPaused(false);
                  gameStateRef.current.isPaused = false;
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-sm"
              >
                Devam Et
              </button>
              <button
                onClick={() => setShowFormationModal(true)}
                className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 font-bold text-stone-200 text-sm"
              >
                Diziliş Değiştir
              </button>
              <button
                onClick={() => setShowTacticsModal(true)}
                className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 font-bold text-stone-200 text-sm"
              >
                Mevki Özellikleri
              </button>
              <button
                onClick={onQuitToTournament}
                className="w-full py-2.5 rounded-xl bg-rose-900/80 hover:bg-rose-800 font-bold text-rose-100 text-sm"
              >
                Turnuvaya Dön
              </button>
            </div>
          </div>
        )}

        {/* Penalty Shootout Overlay */}
        {penaltyState && (
          <div className="absolute inset-0 z-40 bg-stone-950/95 flex flex-col items-center justify-center p-4 text-center">
            <h3 className="text-2xl font-black text-amber-400 mb-1">⚽ Penaltı Atışları</h3>
            <p className="text-xs text-stone-300 mb-4">Uzatma eşitlikle bitti. Şampiyon penaltılarla belirleniyor!</p>

            <div className="w-full max-w-sm bg-stone-900 p-4 rounded-2xl border border-stone-800 mb-4">
              <div className="flex justify-between items-center text-sm font-bold text-white mb-2">
                <span>{teamA.f} {teamA.n}</span>
                <span className="font-mono text-xl text-emerald-400">{penaltyState.scores[0]} – {penaltyState.scores[1]}</span>
                <span>{teamB.n} {teamB.f}</span>
              </div>
              <div className="flex justify-between text-xs text-stone-400">
                <div>
                  {penaltyState.history[0].map((h, i) => (
                    <span key={i} className="mr-1">{h ? '🟢' : '🔴'}</span>
                  ))}
                </div>
                <div>
                  {penaltyState.history[1].map((h, i) => (
                    <span key={i} className="ml-1">{h ? '🟢' : '🔴'}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-sm font-semibold text-amber-300 mb-4">
              {penaltyState.message}
            </div>

            {penaltyState.isFinished ? (
              <button
                onClick={() => {
                  onMatchFinish({
                    scoreA: score[0],
                    scoreB: score[1],
                    penalties: penaltyState.scores,
                  });
                }}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black text-white text-base shadow-lg"
              >
                Maçı Tamamla
              </button>
            ) : penaltyState.isUserTurn ? (
              <div>
                <p className="text-xs text-stone-400 mb-2">Vuruş Yapacağın Köşeyi Seç:</p>
                <div className="grid grid-cols-3 gap-2 w-72">
                  {['Sol Üst', 'Orta Üst', 'Sağ Üst', 'Sol Alt', 'Orta Alt', 'Sağ Alt'].map((zone, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePenaltyShot(idx)}
                      className="py-3 px-1 text-xs font-bold rounded-xl bg-stone-800 hover:bg-emerald-600 text-stone-200 hover:text-white border border-stone-700 transition-colors"
                    >
                      {zone}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-stone-400 mb-2">Rakip Vuruyor! Kalecin Hangi Yöne Atlasın?</p>
                <div className="grid grid-cols-3 gap-2 w-72">
                  {['Sol Köşe', 'Merkez', 'Sağ Köşe'].map((zone, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePenaltyShot(idx * 2)}
                      className="py-4 px-2 text-xs font-bold rounded-xl bg-stone-800 hover:bg-amber-600 text-stone-200 hover:text-white border border-stone-700 transition-colors"
                    >
                      {zone}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Status / Selection Bar for 7 Players */}
      <footer className="w-full max-w-xl px-3 py-2 z-20 bg-stone-900/90 border-t border-stone-800 flex items-center justify-between text-xs text-stone-300">
        <span className="font-medium truncate max-w-[280px]">
          {statusMessage}
        </span>

        {/* 7 Player Selection Buttons (1..7) */}
        <div className="flex items-center gap-1">
          {ROLES.map((role) => {
            const isSelected = selectedPlayerIndex === role.id - 1;
            return (
              <button
                key={role.id}
                onClick={() => {
                  gameStateRef.current.selectedPlayer = role.id - 1;
                  setSelectedPlayerIndex(role.id - 1);
                  sound.playSelection();
                }}
                className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-stone-950 scale-105 shadow-md shadow-emerald-500/50'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
                title={`${role.number} - ${role.name}`}
              >
                {role.number}
              </button>
            );
          })}
        </div>
      </footer>

      {/* Tactics Modal */}
      <TacticsModal
        isOpen={showTacticsModal}
        onClose={() => setShowTacticsModal(false)}
        activeRoleId={activeRole.id}
      />

      {/* Formation Selector Modal */}
      <FormationSelector
        isOpen={showFormationModal}
        onClose={() => setShowFormationModal(false)}
        selectedFormationId={userFormationId}
        onSelectFormation={handleApplyFormation}
        teamColor={teamA.c}
      />
    </div>
  );
};
