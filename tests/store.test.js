import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.js';

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m }; };
const input = (extra = {}) => ({ step: 1, angle: 0, unit: 'mm', dims: { a: '200', b: '150', c: '300' }, readings: { upper: ['', '', ''], lower: ['', '', ''] }, signs: { upper: [1, 1, 1], lower: [1, 1, 1] }, setup: true, positive: true, sagMode: 'unknown', sagUpper: '', sagLower: '', side90: '', rpm: '', ...extra });
const valid = s => Boolean(s?.dims) && Number.isInteger(s.step);

test('empty storage gives an empty record book', () => {
  const r = store.load(memory(), valid);
  assert.equal(r.ok, true); assert.deepEqual(r.db.jobs, []); assert.equal(r.notice, undefined);
});
test('old single save becomes round 1 of one job and the old key is kept', () => {
  const old = JSON.stringify({ version: 1, state: input({ step: 3 }) });
  const s = memory({ [store.LEGACY_KEY]: old });
  const r = store.load(s, valid);
  assert.equal(r.notice, 'migrated'); assert.equal(r.db.jobs.length, 1);
  const cur = store.current(r.db);
  assert.equal(cur.number, 1); assert.equal(cur.round.input.step, 3); assert.equal(cur.round.calcVersion, store.CALC_VERSION);
  assert.equal(s.getItem(store.LEGACY_KEY), old);
});
test('re-measurement adds a round and keeps the earlier one with its result', () => {
  const s = memory(); const { db } = store.load(s, valid);
  const first = store.newJob(db, input());
  first.result = store.snapshot({ consistent: true, front: -.275, rear: -.425, checks: [0, 0] });
  store.addRound(db, db.jobs[0].id, input());
  assert.ok(store.save(s, db));
  const back = store.load(s, valid).db;
  assert.equal(back.jobs[0].rounds.length, 2); assert.equal(back.jobs[0].rounds[0].result.front, -.275);
  assert.equal(store.current(back).number, 2);
  assert.equal(back.equipment[0].no, 1); store.newJob(back, input()); assert.equal(back.equipment[1].no, 2);
});
test('unreadable records are set aside, not overwritten', () => {
  const s = memory({ [store.KEY]: '{"version":2,"jobs":"broken"}' });
  const r = store.load(s, valid, new Date(1000));
  assert.equal(r.notice, 'unreadable'); assert.equal(s.getItem(`${store.KEY}-unreadable-1000`), '{"version":2,"jobs":"broken"}');
});
test('blocked storage reports not ok', () => {
  const r = store.load({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, valid);
  assert.equal(r.ok, false);
});
