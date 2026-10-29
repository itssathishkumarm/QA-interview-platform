// Tiny JSON-file session store (data/sessions.json). Good enough for a local tool.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FILE = path.join(__dirname, '..', 'data', 'sessions.json');
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { sessions = {}; }

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(sessions, null, 2)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('store save failed', e.message); }
  }, 150);
}
function create(name, durationMin) {
  const id = crypto.randomBytes(16).toString('hex');
  sessions[id] = {
    id, name, durationMin, extraMin: 0, startedAt: Date.now(), finishedAt: null,
    codes: {}, results: {}, attempts: {}, timeSpent: {}, runs: [], lastBeat: null,
    scores: {}, comments: '', verdict: ''
  };
  save();
  return sessions[id];
}
const get = (id) => (id && sessions[id]) || null;
const all = () => Object.values(sessions).sort((a, b) => b.startedAt - a.startedAt);
const deadline = (s) => s.startedAt + (s.durationMin + (s.extraMin || 0)) * 60000;
module.exports = { create, get, all, save, deadline };
