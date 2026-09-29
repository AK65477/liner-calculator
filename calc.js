// Cross-dial arrangement: U starts above stationary hub, L below motor hub.
// Both indicators read positive when their plungers are depressed.
export function parseDecimal(value, { signed = false } = {}) {
  const text = String(value ?? '').trim();
  const pattern = signed ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!pattern.test(text)) throw new Error('숫자 입력 필요.');
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error('입력 숫자 확인.');
  return number;
}

// Fixturlaser Alignment System User's Manual, "Tolerance Table" (p.213), metric.
// Maximum allowable deviation when the manufacturer gives no limits.
export const TOLERANCES = [
  { id: '0-1000', label: '1,000 rpm 이하', angle: .10, offset: .13 },
  { id: '1000-2000', label: '1,000~2,000 rpm', angle: .08, offset: .10 },
  { id: '2000-3000', label: '2,000~3,000 rpm', angle: .07, offset: .07 },
  { id: '3000-4000', label: '3,000~4,000 rpm', angle: .06, offset: .05 },
  { id: '4000-6000', label: '4,000~6,000 rpm', angle: .05, offset: .03 },
];

// side90: where the U (start-top) indicator is after the first quarter turn,
// seen from behind the motor looking toward the stationary machine.
export function calculate({ a, b, c, upper, lower, sagUpper = 0, sagLower = 0, resolution = .01, side90 }) {
  if (![a, b, c, sagUpper, sagLower, resolution, ...upper, ...lower].every(Number.isFinite)) throw new Error('입력 숫자 확인.');
  if (a <= 0 || b < 0 || c <= 0) throw new Error('A, C는 0보다 큰 값. B는 0 이상.');
  if (upper.length !== 3 || lower.length !== 3 || resolution <= 0) throw new Error('세 위치 측정값 모두 입력 필요.');
  if (side90 !== undefined && side90 !== 'right' && side90 !== 'left') throw new Error('90° 게이지 위치 선택 필요.');
  // Arrays are [90, 180, 270] degrees of assembly rotation; initial readings are 0.
  // Sag is a SIGNED differential measured in each indicator's own start -> 180 path.
  const s = (upper[1] - sagUpper) / 2;
  const m = (lower[1] - sagLower) / 2;
  const slope = (m - s) / a;
  const front = -(m + slope * b);
  const rear = -(m + slope * (b + c));
  const checks = [upper, lower].map(readings => Math.abs(readings[0] + readings[2] - readings[1]));
  const checkLimit = 2 * resolution;
  if (![front, rear, s, m, slope, ...checks, checkLimit].every(Number.isFinite)) throw new Error('숫자가 너무 큼. 입력값 확인.');
  const result = { front, rear, s, m, slope, checks, checkLimit, consistent: checks.every(error => error <= checkLimit + 1e-9) };
  if (side90) {
    // Positive x = motor centerline to the viewer's right. Bracket sag is equal on
    // both sides, so it cancels in the 90/270 difference.
    const dir = side90 === 'right' ? 1 : -1;
    const xs = dir * (upper[2] - upper[0]) / 2;
    const xm = dir * (lower[2] - lower[0]) / 2;
    const hslope = (xm - xs) / a;
    result.horizontal = { s: xs, m: xm, slope: hslope, front: -(xm + hslope * b), rear: -(xm + hslope * (b + c)) };
  }
  return result;
}

// Offset at the midpoint between the two contact planes (taken as the coupling
// centre) and angularity in mm per 100 mm, compared with the rpm tolerance row.
export function assess(result, toleranceId) {
  const row = TOLERANCES.find(t => t.id === toleranceId);
  if (!row) return null;
  const plane = (s, m, slope) => {
    const offset = Math.abs((s + m) / 2), angle = Math.abs(slope * 100);
    return { offset, angle, offsetOK: offset <= row.offset + 1e-9, angleOK: angle <= row.angle + 1e-9 };
  };
  const vertical = plane(result.s, result.m, result.slope);
  const horizontal = result.horizontal ? plane(result.horizontal.s, result.horizontal.m, result.horizontal.slope) : null;
  const ok = vertical.offsetOK && vertical.angleOK && (!horizontal || (horizontal.offsetOK && horizontal.angleOK));
  return { row, vertical, horizontal, ok, complete: Boolean(horizontal) };
}

export function correction(value) {
  // Display precision is not an alignment acceptance tolerance.
  const rounded = Math.round(Math.abs(value) * 1000) / 1000;
  return { amount: rounded.toFixed(3), action: rounded === 0 ? '표시값 0.000 mm' : value > 0 ? '넣기' : '빼기', kind: value < 0 ? 'remove' : 'add' };
}

export function sideMove(value) {
  const rounded = Math.round(Math.abs(value) * 1000) / 1000;
  return { amount: rounded.toFixed(3), action: rounded === 0 ? '그대로' : value > 0 ? '오른쪽으로' : '왼쪽으로', kind: rounded === 0 ? 'none' : value > 0 ? 'right' : 'left' };
}
