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

export function calculate({ a, b, c, upper, lower, sagUpper = 0, sagLower = 0, resolution = .01 }) {
  if (![a, b, c, sagUpper, sagLower, resolution, ...upper, ...lower].every(Number.isFinite)) throw new Error('입력 숫자 확인.');
  if (a <= 0 || b < 0 || c <= 0) throw new Error('A, C는 0보다 큰 값. B는 0 이상.');
  if (upper.length !== 3 || lower.length !== 3 || resolution <= 0) throw new Error('세 위치 측정값 모두 입력 필요.');
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
  return { front, rear, s, m, slope, checks, checkLimit, consistent: checks.every(error => error <= checkLimit + 1e-9) };
}

export function correction(value) {
  // Display precision is not an alignment acceptance tolerance.
  const rounded = Math.round(Math.abs(value) * 1000) / 1000;
  return { amount: rounded.toFixed(3), action: rounded === 0 ? '표시값 0.000 mm' : value > 0 ? '넣기' : '빼기', kind: value < 0 ? 'remove' : 'add' };
}
