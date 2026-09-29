import { calculate, parseDecimal, correction, sideMove, assess, TOLERANCES } from './calc.js?v=4';

const KEY = 'liner-calculator-v1';
const app = document.querySelector('#app');
const empty = () => ({ step: 0, angle: 0, unit: 'mm', dims: { a: '', b: '', c: '' }, readings: { upper: ['', '', ''], lower: ['', '', ''] }, signs: { upper: [1, 1, 1], lower: [1, 1, 1] }, setup: false, positive: false, sagMode: 'unknown', sagUpper: '', sagLower: '', side90: '', rpm: '' });
let storageOK = true;
let saved = null;
try {
  const data = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (data?.version === 1 && data.state) {
    const s = data.state;
    if ([s.readings?.upper, s.readings?.lower, s.signs?.upper, s.signs?.lower].every(x => Array.isArray(x) && x.length === 3)
      && s.dims && [s.dims.a, s.dims.b, s.dims.c, s.sagUpper, s.sagLower, ...s.readings.upper, ...s.readings.lower].every(x => typeof x === 'string' && x.length <= 32)
      && [...s.signs.upper, ...s.signs.lower].every(x => x === 1 || x === -1)
      && ['mm', 'div'].includes(s.unit) && ['unknown', 'measured', 'compensated'].includes(s.sagMode)
      && Number.isInteger(s.step) && s.step >= 0 && s.step <= 4 && Number.isInteger(s.angle) && s.angle >= 0 && s.angle <= 2
      && typeof s.setup === 'boolean' && typeof s.positive === 'boolean'
      && ['', 'right', 'left'].includes(s.side90 ?? '') && ['', ...TOLERANCES.map(t => t.id)].includes(s.rpm ?? '')) saved = { ...s, side90: s.side90 ?? '', rpm: s.rpm ?? '' };
  }
} catch { storageOK = false; }
let state = empty();
let demo = false;
let message = '';
const ANGLES = [90, 180, 270];
const TURNS = ['¼바퀴', '반 바퀴', '¾바퀴'];
const DIALS = { upper: { tag: '처음 위', target: '고정측 측정' }, lower: { tag: '처음 아래', target: '모터측 측정' } };
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function persist() {
  if (demo) return;
  saved = structuredClone(state);
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, state })); }
  catch { storageOK = false; }
}
function diagram() {
  return `<svg class="diagram" viewBox="0 0 620 290" role="img" aria-label="왼쪽 고정측, 오른쪽 모터. 처음 위 게이지는 고정측, 처음 아래 게이지는 모터측 측정. A는 두 게이지 침 사이, B는 모터측 침 자리부터 앞발 볼트, C는 앞발부터 뒷발 볼트.">
    <rect x="21" y="106" width="98" height="87" rx="8" fill="#dbe3e1"/><text x="70" y="155" text-anchor="middle">고정측</text>
    <path d="M119 151H202 M277 151H336" stroke="#81948d" stroke-width="13"/>
    <rect x="185" y="116" width="24" height="70" rx="4" fill="#899c94"/><rect x="269" y="116" width="24" height="70" rx="4" fill="#899c94"/>
    <rect x="335" y="94" width="244" height="100" rx="10" fill="#d5e8dc" stroke="#346851" stroke-width="2"/><text x="457" y="151" text-anchor="middle">모터</text>
    <path d="M370 194v25 M543 194v25" stroke="#346851" stroke-width="20"/>
    <circle cx="197" cy="62" r="21" fill="#174baa"/><text x="197" y="70" text-anchor="middle" style="fill:white;font-weight:800">위</text><path d="M197 83v33 M218 62h63v54" fill="none" stroke="#174baa" stroke-width="4"/>
    <circle cx="281" cy="216" r="21" fill="#914200"/><text x="281" y="224" text-anchor="middle" style="fill:white;font-weight:800">아래</text><path d="M281 195v-9 M260 216h-63v-30" fill="none" stroke="#914200" stroke-width="4"/>
    <text x="370" y="83" text-anchor="middle" class="label">앞발</text><text x="543" y="83" text-anchor="middle" class="label">뒷발</text>
    <path d="M197 237v39 M281 239v37 M370 229v47 M543 229v47" stroke="#6c877c" stroke-dasharray="4 4"/>
    <path d="M197 255h84 M281 255h89 M370 255h173" stroke="#123f35" stroke-width="2"/>
    ${[['A',239],['B',325],['C',457]].map(([name,x]) => `<g class="dim-box" data-dim="${name}"><rect x="${x-20}" y="239" width="40" height="34" rx="7"/><text x="${x}" y="265" text-anchor="middle" class="dim">${name}</text></g>`).join('')}
  </svg>`;
}
function progress() {
  return `<ol class="progress" aria-label="진행 단계">${['배치', '거리', '게이지', '결과'].map((x, i) => `<li class="${state.step === i+1 ? 'active' : state.step > i+1 ? 'done' : ''}" ${state.step === i+1 ? 'aria-current="step"' : ''}>${i+1}. ${x}</li>`).join('')}</ol>`;
}
function navigation(nextText = '다음') {
  return `<div class="actions"><button class="back" data-action="back" type="button">이전</button><button class="primary" type="submit">${nextText}</button></div>`;
}
function render(focus = true) {
  let content = '';
  if (!state.step) content = home();
  if (state.step === 1) content = setup();
  if (state.step === 2) content = dimensions();
  if (state.step === 3) content = readings();
  if (state.step === 4) content = results();
  app.innerHTML = `${demo ? '<div class="demo-banner">연습 모드 · 예시 숫자</div>' : ''}${!storageOK ? '<p class="notice storage-warning">이 브라우저는 저장 불가. 결과를 따로 기록.</p>' : ''}${state.step ? progress() : ''}${content}${state.step ? `<p class="saved">${demo ? '연습값은 저장 안 함' : storageOK ? '입력값 자동 저장' : '입력값 저장 안 됨'}</p><button class="plain" data-action="home">${demo ? '연습 종료' : '처음 화면'}</button>` : ''}`;
  if (focus) { const heading = app.querySelector('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
function errorSlot() { return `<div id="error" role="alert">${message ? `<p class="error">${esc(message)}</p>` : ''}</div>`; }
// An input problem that names the box to fix, so the user is taken straight to it.
class InputError extends Error { constructor(text, field) { super(text); this.field = field; } }
function clearInvalid(scope = app) { scope.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid')); scope.querySelectorAll('.field-error').forEach(el => el.remove()); }
function showError(text, fieldId) {
  message = text; clearInvalid();
  const region = document.querySelector('#error');
  if (region) region.innerHTML = `<p class="error">${esc(text)}</p>`;
  const target = fieldId && document.getElementById(fieldId);
  const box = target && (target.closest('.field, .card') || target);
  if (box) {
    box.classList.add('invalid');
    box.insertAdjacentHTML('beforeend', `<p class="error field-error">${esc(text)}</p>`);
    box.scrollIntoView({ block: 'center', behavior: 'auto' });
    if (target.tagName === 'INPUT') target.focus({ preventScroll: true });
  } else region?.scrollIntoView({ block: 'center', behavior: 'auto' });
}
function home() {
  const resumable = saved && saved.step > 0;
  return `<h1>모터 라이너 계산</h1><p class="lead">리버스 다이얼 게이지 · 앞발/뒷발 증감량</p>
  <div class="stack intro-actions">${resumable ? '<button class="primary" data-action="resume">하던 측정 계속</button>' : ''}<button class="${resumable ? 'secondary' : 'primary'}" data-action="new">새 측정</button><button class="secondary" data-action="demo">연습 (예시 숫자)</button></div>
  <div class="notice"><strong>시험용.</strong> 결과는 기존 계산과 대조 후 사용.</div>
  <div class="card intro-diagram"><h2>게이지 배치</h2><div class="diagram-box">${diagram()}</div><p class="helper">위 게이지 → 고정측 측정<br>아래 게이지 → 모터측 측정<br>이 자세에서 두 게이지 0점</p></div>
  <details><summary>순서</summary><ol class="steps"><li>거리 A·B·C 입력 (mm)</li><li>90°·180°·270° 게이지 값 입력</li><li>앞발·뒷발 라이너 증감량 확인</li></ol><p class="helper">앞발 = 커플링 쪽 발, 뒷발 = 반대쪽 발</p></details>`;
}
function setup() {
  return `<h1>게이지 배치 확인</h1><p class="lead">옆에서 본 그림. 모터가 오른쪽.</p><form id="setup-form"><div class="card"><div class="diagram-box">${diagram()}</div>
  <ul class="setup-points"><li>위 게이지 → 고정측, 아래 게이지 → 모터측</li><li>이 자세에서 두 게이지 0점</li><li>게이지 침이 눌리면 ＋</li></ul>
  <p class="helper">이렇게 달았으면 아래 버튼. 다르게 달면 결과가 틀림.</p></div>
  <div class="card"><h2>게이지 값 입력 단위</h2><div class="unit-options"><button type="button" data-unit="mm" aria-pressed="${state.unit === 'mm'}">mm<br><span class="tiny">예: 0.12</span></button><button type="button" data-unit="div" aria-pressed="${state.unit === 'div'}">칸<br><span class="tiny">예: 12칸</span></button></div><p class="helper">${state.unit === 'div' ? '0.01 mm 눈금 게이지만 해당. 12칸 = 0.12 mm' : '눈금 칸 수 아님. mm 값 입력'}</p></div>
  <details><summary>지지대 처짐 보정 <span class="tiny">(보통 안 함)</span></summary>
  <label for="sagMode" class="field-label">보정 방법</label><select id="sagMode"><option value="unknown" ${state.sagMode === 'unknown' ? 'selected' : ''}>안 함</option><option value="measured" ${state.sagMode === 'measured' ? 'selected' : ''}>처짐값 직접 입력</option><option value="compensated" ${state.sagMode === 'compensated' ? 'selected' : ''}>게이지 값에 이미 반영</option></select>
  <div id="sag-fields" ${state.sagMode !== 'measured' ? 'hidden' : ''}><p class="helper">지지대를 곧은 파이프에 걸고 같은 자세에서 0점 → 반 바퀴 회전 후 읽은 값. 부호 포함 mm.</p><div class="field"><label for="sagUpper">처음 위 게이지 처짐값 (mm)</label><input id="sagUpper" type="text" inputmode="text" maxlength="12" value="${esc(state.sagUpper)}" placeholder="예: -0.02"></div><div class="field"><label for="sagLower">처음 아래 게이지 처짐값 (mm)</label><input id="sagLower" type="text" inputmode="text" maxlength="12" value="${esc(state.sagLower)}" placeholder="예: +0.02"></div></div></details>
  <p class="check-note">높이(상하) 라이너와 좌우 이동 계산. 좌우는 모터 뒤에서 고정측을 바라본 기준.</p>${errorSlot()}${navigation('이 배치 맞음 · 다음')}</form>`;
}
function dimensions() {
  const fields = [['a','A','게이지 침 사이','위 게이지 침 자리 ↔ 아래 게이지 침 자리'],['b','B','모터측 침 자리 → 앞발','아래 게이지 침 자리 → 앞발 볼트 중심'],['c','C','앞발 → 뒷발','앞발 볼트 중심 → 뒷발 볼트 중심']];
  return `<h1>거리 입력</h1><p class="lead">단위 mm (10 cm = 100 mm)</p><form id="dimensions-form"><div class="card"><div class="diagram-box">${diagram()}</div>
  ${fields.map(([key,letter,label,help]) => `<div class="field"><label for="dim-${key}"><span class="distance-letter">${letter}</span>${label}</label><p class="helper" id="help-${key}">${help}</p><div class="unit-input"><input id="dim-${key}" name="${key}" data-dim="${letter}" type="text" inputmode="decimal" maxlength="12" autocomplete="off" aria-describedby="help-${key}" value="${esc(state.dims[key])}" placeholder="mm"><span>mm</span></div></div>`).join('')}</div>
  ${state.dims.a || state.dims.b || state.dims.c ? '<p class="helper">지난번 거리값. 다른 기계면 수정.</p>' : ''}${errorSlot()}${navigation('다음: 게이지 값')}</form>`;
}
function readings() {
  const i = state.angle;
  return `<h1>${ANGLES[i]}° 게이지 값</h1><p class="lead">0점 자세에서 ${TURNS[i]} 회전. 두 축 같은 방향으로 함께. 중간 0점 다시 잡지 않음.</p>
  <div class="angles" aria-label="측정 순서">${ANGLES.map((n,k) => `<div class="angle ${k === i ? 'active' : k < i ? 'done' : ''}" ${k === i ? 'aria-current="step"' : ''}>${n}°<small>${TURNS[k]}</small></div>`).join('')}</div>
  ${i === 1 ? '<p class="helper flip-note">180°: 두 게이지 위아래 위치가 바뀜. 이름은 처음 자리 기준.</p>' : ''}
  ${i === 0 ? `<section class="card side-card" aria-labelledby="side-title"><h2 id="side-title"><span class="dial-tag">처음 위</span> 게이지 지금 위치</h2><p class="helper">모터 뒤에 서서 고정측을 바라볼 때. 좌우 계산에 필요.</p><div class="signs" role="group" aria-label="처음 위 게이지 위치"><button type="button" class="sign" data-side="left" aria-pressed="${state.side90 === 'left'}">← 왼쪽</button><button type="button" class="sign" data-side="right" aria-pressed="${state.side90 === 'right'}">오른쪽 →</button></div></section>` : ''}
  <form id="readings-form">${Object.entries(DIALS).map(([dial,info],k) => `<section class="card reading ${k ? 'lower' : ''}" aria-labelledby="title-${dial}"><h2 id="title-${dial}"><span class="dial-tag ${k ? 'lower' : ''}">${info.tag}</span> 게이지 <span class="helper">${info.target}</span></h2><div class="signs" role="group" aria-label="${info.tag} 게이지 부호"><button type="button" class="sign" data-dial="${dial}" data-sign="1" aria-pressed="${state.signs[dial][i] === 1}">＋ 플러스</button><button type="button" class="sign" data-dial="${dial}" data-sign="-1" aria-pressed="${state.signs[dial][i] === -1}">− 마이너스</button></div><div class="readout-entry"><span class="readout-sign" id="sign-${dial}" aria-hidden="true">${state.signs[dial][i] === 1 ? '+' : '−'}</span><input type="text" inputmode="decimal" maxlength="12" autocomplete="off" id="read-${dial}" aria-label="${info.tag} 게이지 값" value="${esc(state.readings[dial][i])}" placeholder="${state.unit === 'div' ? '칸' : 'mm'}" aria-describedby="reading-unit"><span>${state.unit === 'div' ? '칸' : 'mm'}</span></div></section>`).join('')}
  <p id="reading-unit" class="helper">${state.unit === 'div' ? '1칸 = 0.01 mm. ' : ''}−값은 마이너스 선택 후 숫자만 입력. 0이면 0 입력.</p>${errorSlot()}${navigation(i === 2 ? '결과 보기' : `다음: ${ANGLES[i+1]}°`)}</form>`;
}
function inputModel() {
  const multiplier = state.unit === 'div' ? .01 : 1;
  return { ...Object.fromEntries(Object.entries(state.dims).map(([k,v]) => [k,parseDecimal(v)])), upper: state.readings.upper.map((v,i) => parseDecimal(v) * state.signs.upper[i] * multiplier), lower: state.readings.lower.map((v,i) => parseDecimal(v) * state.signs.lower[i] * multiplier), sagUpper: state.sagMode === 'measured' ? parseDecimal(state.sagUpper, { signed:true }) : 0, sagLower: state.sagMode === 'measured' ? parseDecimal(state.sagLower, { signed:true }) : 0, resolution:.01, side90: state.side90 || undefined };
}
function results() {
  let result, model;
  try {
    model = inputModel(); result = calculate(model);
  } catch (e) { return `<h1>입력값 확인</h1><p class="error">${esc(e.message)}</p><button class="primary" data-action="edit-setup">처음부터 확인</button>`; }
  const facts = `<details><summary>입력값</summary><div class="facts"><div><span>거리 A / B / C</span><span>${model.a} / ${model.b} / ${model.c} mm</span></div>${ANGLES.map((n,i) => `<div><span>${n}° 처음 위 / 아래</span><span>${signed(model.upper[i])} / ${signed(model.lower[i])} mm</span></div>`).join('')}<div><span>90° 처음 위 게이지</span><span>${state.side90 === 'right' ? '오른쪽' : state.side90 === 'left' ? '왼쪽' : '미선택'}</span></div><div><span>처짐 보정</span><span>${state.sagMode === 'unknown' ? '안 함' : state.sagMode === 'compensated' ? '값에 이미 반영' : `${signed(model.sagUpper)} / ${signed(model.sagLower)} mm`}</span></div></div><div class="stack"><button class="secondary" data-action="edit-readings">게이지 값 수정</button><button class="secondary" data-action="edit-distance">거리 수정</button></div></details>`;
  if (!result.consistent) return `<h1>게이지 값 불일치</h1><div class="error">네 방향 값이 서로 맞지 않아 결과를 내지 않음.<br>부호(＋/−) 또는 입력 숫자 확인.</div><div class="card"><h2>어긋난 양</h2><div class="facts"><div><span>처음 위 게이지</span><span>${result.checks[0].toFixed(3)} mm</span></div><div><span>처음 아래 게이지</span><span>${result.checks[1].toFixed(3)} mm</span></div></div><p class="helper">90° 값 + 270° 값 = 180° 값이어야 함. 허용 차이 0.02 mm.</p></div>${facts}<button class="primary" data-action="edit-readings">게이지 값 다시 입력</button>`;
  const feet = [['앞발','커플링 쪽'],['뒷발','반대쪽']];
  const h = result.horizontal;
  return `<h1>조정량</h1><p class="lead">현재 위치 기준 증감</p>
  <h2 class="result-heading">① 높이 · 라이너</h2>
  <div class="result-grid">${feet.map(([title,label],k) => { const x=correction(k ? result.rear : result.front); const verb = x.kind==='remove' ? '빼기' : x.amount==='0.000' ? '그대로' : '넣기'; return `<section class="card result ${x.kind}"><h2>${title} <span class="foot-label">${label}</span></h2><div class="result-number">${x.amount} <small>mm</small></div><div class="result-action ${x.kind}">${verb}</div></section>`; }).join('')}</div>
  <h2 class="result-heading">② 좌우 · 모터 이동</h2>
  ${h ? `<p class="helper">모터 뒤에서 고정측을 바라본 방향.</p><div class="result-grid">${feet.map(([title,label],k) => { const x=sideMove(k ? h.rear : h.front); return `<section class="card result side"><h2>${title} <span class="foot-label">${label}</span></h2><div class="result-number">${x.amount} <small>mm</small></div><div class="result-action side">${x.action}</div></section>`; }).join('')}</div>`
    : `<div class="notice">90° 때 처음 위 게이지 위치(왼쪽/오른쪽) 미선택 → 좌우 계산 안 함.</div><button class="secondary" data-action="edit-readings">90° 화면에서 위치 선택</button>`}
  <div class="notice"><strong>${demo ? '연습용 예시 결과.' : '시험용 결과. 기존 계산과 대조 후 사용.'}</strong>${state.sagMode === 'unknown' ? ' 처짐 보정 안 함.' : ''}</div>
  <p class="helper">앞발 2개 동일, 뒷발 2개 동일. 빼는 양이 현재 라이너보다 크면 그대로 적용 불가. 높이 먼저, 좌우 나중. 조정 후 재측정.</p>
  ${judgement(result)}${facts}
  <details><summary>계산 방법</summary><p class="helper">처음 위 게이지 값 → 고정측 자리의 높이 차, 처음 아래 게이지 값 → 모터측 자리의 높이 차. 두 점을 직선으로 이어 앞발·뒷발 위치까지 연장, 그 높이 차를 없애는 양이 조정량.</p><a href="./method.html">공식과 검산 자료</a></details>
  <div class="stack"><button class="primary" data-action="remeasure">같은 거리로 재측정</button></div>`;
}
function judgement(result) {
  const picker = `<div class="rpm-options" role="group" aria-label="모터 회전수">${TOLERANCES.map(t => `<button type="button" data-rpm="${t.id}" aria-pressed="${state.rpm === t.id}">${t.label}</button>`).join('')}</div>`;
  const a = assess(result, state.rpm);
  if (!a) return `<section class="card"><h2>③ 정렬 상태 판정</h2><p class="helper">모터 회전수 선택. 4극 60Hz ≈ 1,800 rpm, 2극 60Hz ≈ 3,600 rpm.</p>${picker}</section>`;
  const mark = ok => `<span class="verdict ${ok ? 'ok' : 'over'}">${ok ? '허용 이내' : '초과'}</span>`;
  const row = (name, value, limit, ok, unit) => `<div><span>${name}</span><span>${value.toFixed(3)} / ${limit.toFixed(2)} ${unit} ${mark(ok)}</span></div>`;
  const plane = (title, p) => row(`${title} 평행`, p.offset, a.row.offset, p.offsetOK, 'mm') + row(`${title} 각도`, p.angle, a.row.angle, p.angleOK, 'mm/100mm');
  const summary = !a.ok ? '조정 필요' : a.complete ? '허용 기준 이내' : '높이만 기준 이내 (좌우 미판정)';
  return `<section class="card judgement"><h2>③ 정렬 상태 판정</h2>${picker}
  <p class="verdict-line ${a.ok ? 'ok' : 'over'}">${summary}</p>
  <div class="facts"><div><span></span><span class="tiny">현재값 / 허용값</span></div>${plane('상하', a.vertical)}${a.horizontal ? plane('좌우', a.horizontal) : ''}</div>
  <p class="helper">평행 = 두 게이지 침 가운데 지점(커플링 중심으로 봄)의 축 어긋남. 각도 = 100 mm당 기울기 차. 제조사 기준이 없을 때 쓰는 일반 표(Fixturlaser). 설비·제조사 기준이 우선. 열팽창 목표 0 가정.</p></section>`;
}
function signed(n) { return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(3)}`; }
function changeStep(step) { state.step=step; message=''; persist(); render(); }
function startNew(reuse = true) {
  const previous = demo ? state : saved;
  const next = empty(); next.step=1;
  if (reuse && previous) { next.dims={...previous.dims}; next.unit=previous.unit; next.sagMode=previous.sagMode; next.sagUpper=previous.sagUpper; next.sagLower=previous.sagLower; next.setup=previous.setup; next.positive=previous.positive; next.side90=previous.side90||''; next.rpm=previous.rpm||''; }
  state=next; message=''; persist(); render();
}
function highlightDim(letter) {
  app.querySelectorAll('.dim-box').forEach(g => g.classList.toggle('active', g.dataset.dim === letter));
}
app.addEventListener('click', event => {
  const button=event.target.closest('button'); if (!button) return;
  if (button.dataset.sign) {
    const dial=button.dataset.dial; state.signs[dial][state.angle]=Number(button.dataset.sign); persist();
    button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector(`#sign-${dial}`).textContent=Number(button.dataset.sign)===1?'+':'−';
    document.querySelector(`#read-${dial}`)?.focus(); return;
  }
  if (button.dataset.side) {
    state.side90=button.dataset.side; persist();
    button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    clearInvalid(); return;
  }
  if (button.dataset.rpm) {
    state.rpm=button.dataset.rpm; persist();
    const y=window.scrollY; render(false); window.scrollTo(0,y); return;
  }
  if (button.dataset.unit) {
    const next=button.dataset.unit;
    if(next!==state.unit){
      const factor=next==='div'?100:.01;
      for(const dial of ['upper','lower'])state.readings[dial]=state.readings[dial].map(v=>{try{return String(Number((parseDecimal(v)*factor).toFixed(8)));}catch{return v;}});
      state.unit=next; persist(); render(false);
    } return;
  }
  switch(button.dataset.action){
    case 'new': if(saved?.step>0&&!confirm('하던 측정값을 지우고 새로 시작합니까? (거리값은 유지)'))return; demo=false; startNew(); break;
    case 'resume': demo=false; state=structuredClone(saved); render(); break;
    case 'home': demo=false; state=empty(); message=''; render(); break;
    case 'demo': demo=true; state=empty(); state.step=1; state.setup=true; state.positive=true; state.dims={a:'200',b:'150',c:'300'}; state.readings={upper:['0.06','0.20','0.14'],lower:['0.10','0.40','0.30']}; state.side90='right'; state.rpm='1000-2000'; render(); break;
    case 'back': if(state.step===3&&state.angle>0){state.angle--;persist();message='';render();}else changeStep(state.step-1); break;
    case 'edit-readings': state.angle=0; changeStep(3); break;
    case 'edit-distance': changeStep(2); break;
    case 'edit-setup': changeStep(1); break;
    case 'remeasure': if(confirm('거리값은 유지, 게이지 값만 지웁니까?'))startNew(); break;
  }
});
app.addEventListener('input',event=>{
  const el=event.target;
  if(el.id.startsWith('dim-'))state.dims[el.name]=el.value;
  if(el.id.startsWith('read-'))state.readings[el.id.slice(5)][state.angle]=el.value;
  if(['sagUpper','sagLower'].includes(el.id))state[el.id]=el.value;
  const box=el.closest('.invalid'); if(box)clearInvalid(box.parentElement);
  persist();
});
app.addEventListener('focusin',event=>{ if(event.target.dataset?.dim)highlightDim(event.target.dataset.dim); });
app.addEventListener('focusout',event=>{ if(event.target.dataset?.dim)highlightDim(''); });
app.addEventListener('change',event=>{
  if(event.target.id==='sagMode'){state.sagMode=event.target.value;persist();document.querySelector('#sag-fields').hidden=state.sagMode!=='measured';}
});
app.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    if(state.step===1){
      // Pressing "이 배치 맞음" is the confirmation; there is no hidden checkbox to find.
      state.setup=true;state.positive=true;
      if(state.sagMode==='measured'){
        for(const [id,name] of [['sagUpper','처음 위'],['sagLower','처음 아래']]){
          try{parseDecimal(state[id],{signed:true});}catch{document.querySelector('details')?.setAttribute('open','');throw new InputError(`${name} 게이지 처짐값 입력 필요. 예: -0.02`,id);}
        }
      }
      changeStep(2);
    }else if(state.step===2){
      const names={a:'A (게이지 침 사이)',b:'B (모터측 침 자리 → 앞발)',c:'C (앞발 → 뒷발)'};
      for(const key of ['a','b','c']){
        let value;
        try{value=parseDecimal(state.dims[key]);}catch{throw new InputError(`${names[key]} 거리 입력 필요. 숫자만, 예: 200`,`dim-${key}`);}
        if(key!=='b'&&value<=0)throw new InputError(`${names[key]}는 0보다 큰 값.`,`dim-${key}`);
      }
      state.angle=0;changeStep(3);
    }else if(state.step===3){
      if(state.angle===0&&!state.side90)throw new InputError('처음 위 게이지가 지금 왼쪽인지 오른쪽인지 눌러 주세요.','side-title');
      for(const dial of ['upper','lower']){
        try{parseDecimal(state.readings[dial][state.angle]);}catch{throw new InputError(`${DIALS[dial].tag} 게이지 값 입력 필요. 0이면 0.`,`read-${dial}`);}
      }
      if(state.angle<2){state.angle++;message='';persist();render();}else{calculate(inputModel());changeStep(4);}
    }
  }catch(error){showError(error.message,error.field);}
});

// Optional browser-agent integration, sharing the visible calculation path.
if(document.modelContext?.registerTool){
  try { Promise.resolve(document.modelContext.registerTool({name:'read_alignment_result',title:'현재 라이너 계산 결과 확인',description:'Read the result for the current complete input; does not alter any readings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments accepted.');if(state.step!==4||!state.setup||!state.positive)throw new Error('Complete the visible measurement flow first.');const r=calculate(inputModel());return {demo,fieldValidated:false,sagMode:state.sagMode,consistent:r.consistent,...(r.consistent?{frontChangeMm:r.front,rearChangeMm:r.rear,...(r.horizontal?{frontRightMoveMm:r.horizontal.front,rearRightMoveMm:r.horizontal.rear}:{})}:{checks:r.checks})};}})).catch(()=>{}); }catch{}
}
render(false);
