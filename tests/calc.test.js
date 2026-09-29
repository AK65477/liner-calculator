import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, parseDecimal, correction, sideMove, assess, TOLERANCES } from '../calc.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
// A forward measurement model, independent of the inverse correction formula.
// Positive compression at top S is -height; at bottom M is -height.
// Rotation through 180 reverses the projection: delta = 2 * height in both.
function fromLine({ intercept, slope, a=200, b=150, c=300, sagU=0, sagL=0, horizontal=0 }) {
  const hS=intercept, hM=intercept+slope*a;
  const readings=(height,sag)=>[height+horizontal+sag/2,2*height+sag,height-horizontal+sag/2];
  return {a,b,c,upper:readings(hS,sagU),lower:readings(hM,sagL),sagUpper:sagU,sagLower:sagL};
}
test('parallel motor above reference removes equal thickness; below adds',()=>{
  for(const height of [-.3,0,.2]){
    const r=calculate(fromLine({intercept:height,slope:0}));
    close(r.front,-height);close(r.rear,-height);assert.equal(r.consistent,true);
  }
});
test('tilted motor: corrections cancel the original line at both feet',()=>{
  for(const intercept of [-.4,.1,.6])for(const slope of [-.002,0,.001]){
    const input=fromLine({intercept,slope,horizontal:.13});const r=calculate(input);
    close(r.front+intercept+slope*(input.a+input.b),0);
    close(r.rear+intercept+slope*(input.a+input.b+input.c),0);
    assert.equal(r.consistent,true);
  }
});
test('signed sag of opposite starting positions is subtracted, not subtracted twice',()=>{
  const r=calculate(fromLine({intercept:.1,slope:.0005,sagU:-.06,sagL:.04}));
  close(r.front,-.275);close(r.rear,-.425);
});
test('published SKF example in mils/inches converted exactly to mm',()=>{
  // Source p.28: S=12 mil, M=17.5 mil, A=5 in, B=7 in, C=24 in.
  const input={a:127,b:177.8,c:609.6,upper:[.3048,.6096,.3048],lower:[.4445,.889,.4445]};
  const r=calculate(input);close(r.front,-.64008);close(r.rear,-1.31064);
});
test('opposite front and rear corrections are supported',()=>{
  const r=calculate(fromLine({intercept:-.5,slope:.001}));
  close(r.front,.15);close(r.rear,-.15);
});
test('inconsistent readings fail the sum check; boundary has numerical tolerance',()=>{
  const input=fromLine({intercept:.1,slope:0});input.upper[0]+=.021;
  assert.equal(calculate(input).consistent,false);
  input.upper[0]-=.001;assert.equal(calculate(input).consistent,true);
});
test('blank, exponent, comma, nonnumeric, invalid geometry and nonfinite inputs rejected',()=>{
  for(const text of ['', ' ', 'abc', '1,2', '1e2', 'Infinity', '-.1'])assert.throws(()=>parseDecimal(text));
  close(parseDecimal('0'),0);close(parseDecimal('.12'),.12);close(parseDecimal(' -0.12 ',{signed:true}),-.12);
  for(const patch of [{a:0},{a:-1},{b:-1},{c:0},{upper:[0,NaN,0]},{lower:[0,0]},{resolution:0},{a:Number.MIN_VALUE,upper:[1,2,1]}])assert.throws(()=>calculate({...fromLine({intercept:.1,slope:0}),...patch}));
});
test('display rounding never displays add/remove for a rounded zero',()=>{
  assert.equal(correction(-.0001).action,'표시값 0.000 mm');
  assert.equal(correction(.15).action,'넣기');assert.equal(correction(-.15).action,'빼기');
  assert.equal(correction(-.425).amount,'0.425');
});

// Independent 2-D geometric simulation of the physical dial set-up.
// Cross-section seen from behind the motor looking at the stationary machine:
// x = viewer's right, y = up. Motor centreline: x(z)=x0+kx*z, y(z)=y0+ky*z,
// z measured from the U contact plane toward the motor. Stationary centreline = 0.
// A dial fixed to shaft X at radius rb touches shaft Y's rim at angle th
// (clockwise from top) pointing at the centre: gap = (Cx-Cy)·u + rb - rh,
// reading = compression = gap(start) - gap(now).
function simulate({ x0, kx, y0, ky, dir, a = 200, b = 150, c = 300 }) {
  const rb = 120, rh = 80;
  const motor = z => [x0 + kx * z, y0 + ky * z];
  const gap = (cx, cy, th) => cx[0] * Math.sin(th) + cx[1] * Math.cos(th) - (cy[0] * Math.sin(th) + cy[1] * Math.cos(th)) + rb - rh;
  const dial = (cx, cy, start) => [1, 2, 3].map(k => gap(cx, cy, start) - gap(cx, cy, start + dir * k * Math.PI / 2));
  return {
    input: { a, b, c, side90: dir === 1 ? 'right' : 'left',
      upper: dial(motor(0), [0, 0], 0), // on motor, reads stationary hub, starts top
      lower: dial([0, 0], motor(a), Math.PI) }, // on stationary, reads motor hub, starts bottom
    footFront: motor(a + b), footRear: motor(a + b + c), mid: motor(a / 2), kx, ky,
  };
}
test('geometric simulation: vertical and horizontal moves cancel the motor position at both feet', () => {
  for (const dir of [1, -1]) for (const x0 of [-.3, 0, .2]) for (const kx of [-.001, 0, .0007]) for (const [y0, ky] of [[.1, .0005], [-.2, -.001]]) {
    const sim = simulate({ x0, kx, y0, ky, dir });
    const r = calculate(sim.input);
    assert.equal(r.consistent, true);
    close(r.front + sim.footFront[1], 0); close(r.rear + sim.footRear[1], 0);
    close(r.horizontal.front + sim.footFront[0], 0); close(r.horizontal.rear + sim.footRear[0], 0);
  }
});
test('motor offset to the right needs a move to the left; rotation direction is honoured', () => {
  for (const dir of [1, -1]) {
    const r = calculate(simulate({ x0: .1, kx: 0, y0: 0, ky: 0, dir }).input);
    close(r.horizontal.front, -.1); close(r.horizontal.rear, -.1);
    assert.equal(sideMove(r.horizontal.front).action, '왼쪽으로');
  }
  const wrong = calculate({ ...simulate({ x0: .1, kx: 0, y0: 0, ky: 0, dir: 1 }).input, side90: 'left' });
  close(wrong.horizontal.front, .1); // choosing the wrong side flips the direction, never the size
});
test('horizontal result is omitted without a side choice; invalid side rejected', () => {
  const input = simulate({ x0: .1, kx: 0, y0: 0, ky: 0, dir: 1 }).input;
  assert.equal(calculate({ ...input, side90: undefined }).horizontal, undefined);
  assert.throws(() => calculate({ ...input, side90: 'up' }));
});
test('tolerance: offset at mid-plane and angularity per 100 mm against the Fixturlaser table', () => {
  assert.deepEqual(TOLERANCES.find(t => t.id === '1000-2000'), { id: '1000-2000', label: '1,000~2,000 rpm', angle: .08, offset: .10 });
  const sim = simulate({ x0: .02, kx: .0001, y0: .1, ky: .0005, dir: 1 });
  const v = assess(calculate(sim.input), '1000-2000');
  close(v.vertical.offset, Math.abs(sim.mid[1])); close(v.vertical.angle, .05);
  close(v.horizontal.offset, Math.abs(sim.mid[0])); close(v.horizontal.angle, .01);
  assert.equal(v.vertical.offsetOK, false); assert.equal(v.vertical.angleOK, true); assert.equal(v.ok, false);
  const good = assess(calculate(simulate({ x0: .01, kx: 0, y0: -.02, ky: .0002, dir: -1 }).input), '1000-2000');
  assert.equal(good.ok, true); assert.equal(good.complete, true);
  assert.equal(assess(calculate(sim.input), 'nope'), null);
});
test('app demo numbers match the method page', () => {
  const r = calculate({ a: 200, b: 150, c: 300, upper: [.06, .2, .14], lower: [.1, .4, .3], side90: 'right' });
  assert.equal(correction(r.front).amount, '0.275'); assert.equal(correction(r.rear).amount, '0.425');
  assert.deepEqual([sideMove(r.horizontal.front).amount, sideMove(r.horizontal.front).action], ['0.145', '왼쪽으로']);
  assert.deepEqual([sideMove(r.horizontal.rear).amount, sideMove(r.horizontal.rear).action], ['0.235', '왼쪽으로']);
});
