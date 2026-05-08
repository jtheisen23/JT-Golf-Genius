// Live watcher for a tournament. Logs every Firebase update with a diff
// of what changed (scores added/removed, players changed, groups changed).
//
// Usage:  node scripts/watch-tournament.mjs <tournamentId>

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyB3gBuhvTMaFAetFgbXQp46mT3be7H-Qwg',
  authDomain: 'jt-golf-genius.firebaseapp.com',
  databaseURL: 'https://jt-golf-genius-989ef-default-rtdb.firebaseio.com',
  projectId: 'jt-golf-genius',
  storageBucket: 'jt-golf-genius.firebasestorage.app',
  messagingSenderId: '559147014773',
  appId: '1:559147014773:web:2d39f1dd20b8bca2b1363c',
};

const id = process.argv[2];
if (!id) {
  console.error('usage: node scripts/watch-tournament.mjs <tournamentId>');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function countScores(scoresMap) {
  if (!scoresMap) return 0;
  let n = 0;
  for (const groupId of Object.keys(scoresMap)) {
    const g = scoresMap[groupId] || {};
    for (const playerId of Object.keys(g)) {
      n += Object.keys(g[playerId] || {}).length;
    }
  }
  return n;
}

function flattenScores(scoresMap) {
  const flat = {};
  if (!scoresMap) return flat;
  for (const [gid, g] of Object.entries(scoresMap)) {
    for (const [pid, p] of Object.entries(g || {})) {
      for (const [hole, val] of Object.entries(p || {})) {
        flat[`${gid}/${pid}/${hole}`] = val;
      }
    }
  }
  return flat;
}

let prev = null;
const start = Date.now();

console.log(`watching tournaments/${id} ...`);

onValue(ref(db, `tournaments/${id}`), (snap) => {
  const t = snap.val();
  const ts = ((Date.now() - start) / 1000).toFixed(2).padStart(7);
  if (!t) {
    console.log(`[${ts}s] (null)`);
    return;
  }

  const totalScores = countScores(t.scores);
  const players = Object.keys(t.players || {}).length;
  const groups = Array.isArray(t.groups) ? t.groups.length : Object.keys(t.groups || {}).length;
  const updatedAt = t.updatedAt || '';

  const flat = flattenScores(t.scores);
  let diff = '';
  if (prev) {
    const added = [];
    const removed = [];
    const changed = [];
    for (const k of Object.keys(flat)) {
      if (!(k in prev)) added.push(`${k}=${flat[k]}`);
      else if (prev[k] !== flat[k]) changed.push(`${k}:${prev[k]}→${flat[k]}`);
    }
    for (const k of Object.keys(prev)) {
      if (!(k in flat)) removed.push(`${k}(was ${prev[k]})`);
    }
    if (added.length) diff += `  +scores: ${added.join(', ')}\n`;
    if (changed.length) diff += `  ~scores: ${changed.join(', ')}\n`;
    if (removed.length) diff += `  -scores: ${removed.join(', ')}\n`;
  }
  prev = flat;

  console.log(
    `[${ts}s] players=${players} groups=${groups} totalScores=${totalScores} updatedAt=${updatedAt}`,
  );
  if (diff) process.stdout.write(diff);
});
