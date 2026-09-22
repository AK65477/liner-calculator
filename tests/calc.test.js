import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, parseDecimal, correction } from '../calc.js';

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
