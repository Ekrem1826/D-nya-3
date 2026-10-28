/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_RADIUS,
  ROLES,
  MATCH_DURATION_SECONDS,
  FORMATIONS,
  PLAYERS_PER_TEAM,
  PASS_MAX_DISTANCE,
} from './constants.ts';
import {
  resetDisks,
  calculateShotPower,
  formatTimeMMSS,
  formatFootballMatchMinute,
  checkMatchEnd,
  physicsStep,
  checkPassSuccess,
} from './rules.ts';

test('Each team has 7 players (total 15 disks with ball)', () => {
  assert.equal(PLAYERS_PER_TEAM, 7);
  const disks = resetDisks();
  assert.equal(disks.length, 15);

  // 7 User players
  for (let i = 0; i < 7; i++) {
    assert.equal(disks[i].teamIndex, 0);
    assert.equal(disks[i].playerIndex, i);
  }

  // 7 Bot players
  for (let i = 7; i < 14; i++) {
    assert.equal(disks[i].teamIndex, 1);
    assert.equal(disks[i].playerIndex, i - 7);
  }

  // Ball is disk 14
  assert.equal(disks[14].ball, true);
  assert.equal(disks[14].r, 10);
});

test('Tactical formations all contain exactly 7 player positions', () => {
  assert.equal(FORMATIONS.length, 5);
  FORMATIONS.forEach((f) => {
    assert.equal(f.positions.length, 7, `Formation ${f.name} should have 7 coordinates`);
  });
});

test('Pass detection succeeds when ball stops near a teammate within distance threshold', () => {
  const disks = resetDisks();
  const ball = disks[14];

  // Move ball right next to teammate #2 (Stoper, index 1)
  // Distance will be ~25px, well within PASS_MAX_DISTANCE
  ball.x = disks[1].x + disks[1].r + ball.r + 15;
  ball.y = disks[1].y;

  // Shooter was user player #6 (Forvet, index 6)
  const passResult = checkPassSuccess(disks, 0, 6, PASS_MAX_DISTANCE);
  assert.equal(passResult.isPass, true);
  assert.equal(passResult.receiverPlayerIndex, 1);
  assert.ok(passResult.distance !== undefined && passResult.distance <= PASS_MAX_DISTANCE);
});

test('Pass detection fails if ball stops too far from teammates', () => {
  const disks = resetDisks();
  const ball = disks[14];

  // Place ball in isolated space far from all players
  ball.x = 250;
  ball.y = 410; // center circle, far from all players (> 100px)

  const passResult = checkPassSuccess(disks, 0, 6, PASS_MAX_DISTANCE);
  assert.equal(passResult.isPass, false);
});

test('Pass detection fails if opponent intercepts (closer to ball)', () => {
  const disks = resetDisks();
  const ball = disks[14];

  // Teammate at (200, 450)
  disks[2].x = 200;
  disks[2].y = 450;

  // Ball at (200, 490) -> distance to teammate = 40 - r
  ball.x = 200;
  ball.y = 490;

  // Opponent placed right between at (200, 485) -> closer!
  disks[8].x = 200;
  disks[8].y = 485;

  const passResult = checkPassSuccess(disks, 0, 6, PASS_MAX_DISTANCE);
  assert.equal(passResult.isPass, false);
});

test('Match duration is configured to 3 minutes (180 seconds)', () => {
  assert.equal(MATCH_DURATION_SECONDS, 180);
  assert.equal(formatTimeMMSS(180), '03:00');
  assert.equal(formatTimeMMSS(90), '01:30');
});

test('All 7 roles have defined stats and attributes', () => {
  assert.equal(ROLES.length, 7);
  assert.equal(ROLES[0].name, 'Kaleci');
  assert.equal(ROLES[1].name, 'Stoper');
  assert.equal(ROLES[2].name, 'Sol Bek');
  assert.equal(ROLES[3].name, 'Sağ Bek');
  assert.equal(ROLES[4].name, 'Ön Libero & Merkez');
  assert.equal(ROLES[5].name, 'On Numara');
  assert.equal(ROLES[6].name, 'Forvet');
});
