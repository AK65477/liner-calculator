// Records kept only on this phone: equipment -> job -> measurement rounds.
// Every round keeps its own input and a snapshot of the result it showed, so an
// earlier round survives re-measurement and a later formula change.
export const KEY = 'field-app-v2';
export const LEGACY_KEY = 'liner-calculator-v1';
export const CALC_VERSION = 'alignment-0.2';

let seq = 0;
const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isText = (x, max = 64) => typeof x === 'string' && x.length <= max;
// What was actually done after a round: per foot, liner added (+1) or removed (-1) and the typed mm.
const validFoot = f => f && (f.sign === 1 || f.sign === -1) && isText(f.value, 12);
const validApplied = a => a === undefined || (a && validFoot(a.front) && validFoot(a.rear));
export function emptyApplied(front = 1, rear = 1) { return { front: { sign: front, value: '' }, rear: { sign: rear, value: '' } }; }

export function emptyDb() { return { version: 2, equipment: [], jobs: [], current: null }; }

function validDb(db, validInput) {
  if (!db || db.version !== 2 || !Array.isArray(db.equipment) || !Array.isArray(db.jobs)) return false;
  if (!db.equipment.every(e => e && isText(e.id) && isText(e.name, 60) && isText(e.createdAt) && (e.no === undefined || (Number.isInteger(e.no) && e.no > 0)))) return false;
  const ids = new Set(db.equipment.map(e => e.id));
  return db.jobs.every(j => j && isText(j.id) && ids.has(j.equipmentId) && j.module === 'alignment' && isText(j.createdAt)
    && Array.isArray(j.rounds) && j.rounds.length > 0
    && j.rounds.every(r => r && isText(r.id) && isText(r.createdAt) && isText(r.calcVersion) && validInput(r.input)
      && (r.result === null || typeof r.result === 'object') && validApplied(r.applied)));
}

// Returns { db, ok, notice }. ok=false: storage unusable, nothing will be saved.
// Unreadable data is copied aside under another key instead of being overwritten.
export function load(storage, validInput, now = new Date()) {
  let raw;
  try { raw = storage.getItem(KEY); } catch { return { db: emptyDb(), ok: false }; }
  if (raw !== null) {
    try {
      const db = JSON.parse(raw);
      if (validDb(db, validInput)) {
        if (!findRound(db, db.current?.jobId, db.current?.roundId)) db.current = null;
        db.equipment.forEach((e, i) => { e.no ??= i + 1; });
        return { db, ok: true };
      }
    } catch {}
    try { storage.setItem(`${KEY}-unreadable-${now.getTime()}`, raw); } catch {}
    return { db: emptyDb(), ok: true, notice: 'unreadable' };
  }
  const db = emptyDb();
  try {
    const legacy = JSON.parse(storage.getItem(LEGACY_KEY) || 'null');
    // The old single-measurement save becomes the first round of one job. The old key is left in place.
    if (legacy?.version === 1 && validInput(legacy.state)) {
      newJob(db, legacy.state, now);
      return { db, ok: true, notice: 'migrated' };
    }
  } catch {}
  return { db, ok: true };
}

export function save(storage, db) {
  try { storage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

function makeRound(input, now) {
  return { id: newId(), createdAt: now.toISOString(), calcVersion: CALC_VERSION, input, result: null };
}

export function newJob(db, input, now = new Date()) {
  // Unnamed equipment is shown as 「설비 N」 by this running number.
  const no = db.equipment.reduce((max, e, i) => Math.max(max, e.no ?? i + 1), 0) + 1;
  const equipment = { id: newId(), name: '', no, createdAt: now.toISOString() };
  const round = makeRound(input, now);
  const job = { id: newId(), equipmentId: equipment.id, module: 'alignment', createdAt: now.toISOString(), rounds: [round] };
  db.equipment.push(equipment); db.jobs.push(job);
  db.current = { jobId: job.id, roundId: round.id };
  return round;
}

export function addRound(db, jobId, input, now = new Date()) {
  const job = db.jobs.find(j => j.id === jobId);
  if (!job) throw new Error('job not found');
  const round = makeRound(input, now);
  job.rounds.push(round);
  db.current = { jobId, roundId: round.id };
  return round;
}

export function findRound(db, jobId, roundId) {
  const job = db.jobs.find(j => j.id === jobId);
  const index = job ? job.rounds.findIndex(r => r.id === roundId) : -1;
  if (index < 0) return null;
  return { job, round: job.rounds[index], number: index + 1, equipment: db.equipment.find(e => e.id === job.equipmentId) };
}

export function current(db) { return db.current ? findRound(db, db.current.jobId, db.current.roundId) : null; }

export function equipmentOf(db, job) { return db.equipment.find(e => e.id === job.equipmentId); }

// Backup file: the whole record book, readable by readBackup on any phone.
export function backupText(db, now = new Date()) {
  return JSON.stringify({ app: 'field-app', kind: 'backup', exportedAt: now.toISOString(), data: db });
}
export function readBackup(text, validInput) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('백업 파일이 아님.'); }
  const data = parsed?.app === 'field-app' ? parsed.data : parsed;
  if (!validDb(data, validInput)) throw new Error('읽을 수 없는 백업 파일.');
  return data;
}
// Adds what the phone does not have yet; never removes or overwrites local records.
// Unnamed equipment that arrives gets the next local number so 「설비 N」 stays unique.
export function mergeInto(db, incoming) {
  const added = { jobs: 0, rounds: 0 };
  const haveEq = new Set(db.equipment.map(e => e.id));
  let next = db.equipment.reduce((max, e, i) => Math.max(max, e.no ?? i + 1), 0);
  incoming.equipment.forEach(e => { if (!haveEq.has(e.id)) { db.equipment.push({ ...e, no: ++next }); haveEq.add(e.id); } });
  for (const job of incoming.jobs) {
    const local = db.jobs.find(j => j.id === job.id);
    if (!local) { db.jobs.push(structuredClone(job)); added.jobs++; added.rounds += job.rounds.length; continue; }
    const have = new Set(local.rounds.map(r => r.id));
    const extra = job.rounds.filter(r => !have.has(r.id));
    if (!extra.length) continue;
    local.rounds.push(...structuredClone(extra));
    local.rounds.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    added.rounds += extra.length;
  }
  db.jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return added;
}

// The numbers as shown on the result screen, frozen with the round.
export function snapshot(result) {
  return { consistent: result.consistent, front: result.front, rear: result.rear, checks: [...result.checks],
    horizontal: result.horizontal ? { front: result.horizontal.front, rear: result.horizontal.rear } : null };
}
