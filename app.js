import { calculate, parseDecimal, correction } from './calc.js';

const KEY = 'liner-calculator-v1';
const app = document.querySelector('#app');
const empty = () => ({ step: 0, angle: 0, unit: 'mm', dims: { a: '', b: '', c: '' }, readings: { upper: ['', '', ''], lower: ['', '', ''] }, signs: { upper: [1, 1, 1], lower: [1, 1, 1] }, setup: false, positive: false, sagMode: 'unknown', sagUpper: '', sagLower: '' });
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
      && typeof s.setup === 'boolean' && typeof s.positive === 'boolean') saved = s;
  }
} catch { storageOK = false; }
let state = empty();
let demo = false;
let message = '';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function persist() {
  if (demo) return;
  saved = structuredClone(state);
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, state })); }
  catch { storageOK = false; }
}
function diagram(highlight = '') {
  return `<svg class="diagram" viewBox="0 0 620 290" role="img" aria-label="왼쪽은 고정측, 오른쪽은 모터. 처음 위 게이지는 고정측을, 처음 아래 게이지는 모터측을 잽니다. A는 두 접촉점 사이, B는 모터측 접촉점부터 앞발 볼트 중심, C는 앞발부터 뒷발 볼트 중심까지입니다.">
    <rect x="21" y="106" width="98" height="87" rx="8" fill="#dbe3e1"/><text x="70" y="155" text-anchor="middle">고정측</text>
    <path d="M119 151H202 M277 151H336" stroke="#81948d" stroke-width="13"/>
    <rect x="185" y="116" width="24" height="70" rx="4" fill="#899c94"/><rect x="269" y="116" width="24" height="70" rx="4" fill="#899c94"/>
    <rect x="335" y="94" width="244" height="100" rx="10" fill="#d5e8dc" stroke="#346851" stroke-width="2"/><text x="457" y="151" text-anchor="middle">조정할 모터</text>
    <path d="M370 194v25 M543 194v25" stroke="#346851" stroke-width="20"/>
    <circle cx="197" cy="62" r="21" fill="#174baa"/><text x="197" y="70" text-anchor="middle" style="fill:white;font-weight:800">위</text><path d="M197 83v33 M218 62h63v54" fill="none" stroke="#174baa" stroke-width="4"/>
    <circle cx="281" cy="216" r="21" fill="#914200"/><text x="281" y="224" text-anchor="middle" style="fill:white;font-weight:800">아래</text><path d="M281 195v-9 M260 216h-63v-30" fill="none" stroke="#914200" stroke-width="4"/>
    <text x="370" y="83" text-anchor="middle" class="label">앞발</text><text x="543" y="83" text-anchor="middle" class="label">뒷발</text>
    <path d="M197 237v39 M281 239v37 M370 229v47 M543 229v47" stroke="#6c877c" stroke-dasharray="4 4"/>
    <path d="M197 255h84 M281 255h89 M370 255h173" stroke="#123f35" stroke-width="2"/>
    ${[['A',239],['B',325],['C',457]].map(([name,x]) => `<rect x="${x-20}" y="239" width="40" height="34" rx="7" fill="${highlight === name ? '#ffd876' : '#f5f8f7'}"/><text x="${x}" y="265" text-anchor="middle" class="dim">${name}</text>`).join('')}
  </svg>`;
}
function progress() {
  return `<ol class="progress" aria-label="진행 단계">${['준비', '거리', '측정', '결과'].map((x, i) => `<li class="${state.step === i+1 ? 'active' : state.step > i+1 ? 'done' : ''}" ${state.step === i+1 ? 'aria-current="step"' : ''}>${i+1}. ${x}</li>`).join('')}</ol>`;
}
function navigation(nextText = '다음', backAction = 'back') {
  return `<div class="actions"><button class="back" data-action="${backAction}" type="button">이전</button><button class="primary" type="submit">${nextText}</button></div>`;
}
function render(focus = true) {
  let content = '';
  if (!state.step) content = home();
  if (state.step === 1) content = setup();
  if (state.step === 2) content = dimensions();
  if (state.step === 3) content = readings();
  if (state.step === 4) content = results();
  app.innerHTML = `${demo ? '<div class="demo-banner">예시 숫자로 연습 중 · 실제 작업값이 아닙니다.</div>' : ''}${!storageOK ? '<p class="notice storage-warning">이 브라우저에서는 저장이 안 됩니다. 창을 닫기 전에 결과를 따로 기록해 주세요.</p>' : ''}${state.step ? progress() : ''}${content}${state.step ? `<p class="saved">${demo ? '연습값은 기존 기록을 덮어쓰지 않습니다.' : storageOK ? '입력하면 자동으로 저장됩니다.' : '현재 입력은 저장되지 않습니다.'}</p><button class="plain" data-action="home">${demo ? '연습 마치기' : '처음 화면'}</button>` : ''}`;
  if (focus) { const heading = app.querySelector('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
function errorSlot() { return `<div id="error" role="alert">${message ? `<p class="error">${esc(message)}</p>` : ''}</div>`; }
function showError(text) { message = text; const region = document.querySelector('#error'); if (region) { region.innerHTML = `<p class="error">${esc(text)}</p>`; region.scrollIntoView({ block: 'center', behavior: 'auto' }); } }
function home() {
  return `<div class="eyebrow">모터 앞발 · 뒷발</div><h1>라이너를 얼마나<br>넣고 뺄까요?</h1><p class="lead">거리와 게이지 숫자를 차례로 넣어 주세요.</p>
  <div class="notice"><strong>현장 검증 전 시험용</strong><br>계산 결과는 참고값입니다. 실제 조정 전 기존 계산법과 대조해 주세요.</div>
  <div class="stack intro-actions">${saved && saved.step > 0 ? '<button class="primary" data-action="resume">하던 측정 이어서 하기</button>' : ''}<button class="${saved && saved.step > 0 ? 'secondary' : 'primary'}" data-action="new">새로 측정하기</button><button class="secondary" data-action="demo">예시 숫자로 연습하기</button></div>
  <div class="card intro-diagram"><h2>이 배치에서 사용합니다</h2><div class="diagram-box">${diagram()}</div><p class="helper">처음에는 고정측을 재는 게이지가 위,<br>모터측을 재는 게이지가 아래입니다.</p></div>
  <details><summary>처음 사용하시나요?</summary><p>새로 측정하기 → 거리 입력 → 게이지 숫자 입력 → 앞발·뒷발 결과 순서입니다.</p><p>앞발은 축 연결부에 가까운 발입니다. 사진을 찍거나 회원가입할 필요가 없습니다.</p><p class="helper">인터넷에 연결해 사용해 주세요. 같은 휴대폰에서도 카카오톡과 Chrome의 저장 기록은 다를 수 있습니다.</p></details>`;
}
function setup() {
  return `<h1>먼저 배치를 확인해 주세요</h1><p class="lead">그림은 모터를 오른쪽에 놓고 본 모습입니다.</p><form id="setup-form"><div class="card"><div class="diagram-box">${diagram()}</div>
  <label class="check"><input type="checkbox" id="setup" ${state.setup ? 'checked' : ''}><span>위 게이지는 고정측 바깥둘레를, 아래 게이지는 모터측 바깥둘레를 잽니다. 이 자세에서 둘 다 0으로 맞춥니다.</span></label>
  <label class="check"><input type="checkbox" id="positive" ${state.positive ? 'checked' : ''}><span>두 게이지 모두 측정봉이 안으로 눌리면 ＋값입니다.</span></label></div>
  <div class="card"><h2>숫자를 어떻게 입력할까요?</h2><div class="unit-options"><button type="button" data-unit="mm" aria-pressed="${state.unit === 'mm'}">mm로 입력<br><span class="tiny">예: 0.12</span></button><button type="button" data-unit="div" aria-pressed="${state.unit === 'div'}">눈금 칸 수<br><span class="tiny">예: 12칸</span></button></div><p class="helper">${state.unit === 'div' ? '한 칸이 0.01 mm인 게이지만 가능합니다. 12칸 = 0.12 mm입니다.' : '눈금의 칸 수가 아닌 mm 값으로 입력합니다.'}</p></div>
  <details><summary>지지대 처짐 보정</summary><p class="helper">긴 지지대가 처지면 측정값에 영향을 줍니다. 모르면 기본값으로 시험하고, 결과를 현장에 적용하기 전에 확인해 주세요.</p>
  <label for="sagMode" class="field-label">보정 방법</label><select id="sagMode"><option value="unknown" ${state.sagMode === 'unknown' ? 'selected' : ''}>모름 · 보정 없이 시험</option><option value="measured" ${state.sagMode === 'measured' ? 'selected' : ''}>별도로 측정한 처짐값 입력</option><option value="compensated" ${state.sagMode === 'compensated' ? 'selected' : ''}>입력할 숫자는 이미 보정됨</option></select>
  <div id="sag-fields" ${state.sagMode !== 'measured' ? 'hidden' : ''}><p class="helper">같은 배치를 강체에 설치해 처음 자세에서 0을 맞추고 반 바퀴 돌려 읽은 값입니다. 두 값 모두 부호를 포함한 mm로 입력합니다. 기계의 측정값을 그대로 넣으면 안 됩니다.</p><div class="field"><label for="sagUpper">처음 위 게이지의 처짐값 (mm)</label><input id="sagUpper" type="text" inputmode="text" maxlength="12" value="${esc(state.sagUpper)}" placeholder="예: -0.02"></div><div class="field"><label for="sagLower">처음 아래 게이지의 처짐값 (mm)</label><input id="sagLower" type="text" inputmode="text" maxlength="12" value="${esc(state.sagLower)}" placeholder="예: +0.02"></div></div></details>
  <p class="check-note">0.01 mm 눈금 게이지용입니다. 설비를 정지하고 현장 작업 절차에 따라 측정합니다. 이 앱은 수직 라이너 보정만 계산하며, 좌우 이동·열팽창 목표·개별 발 들뜸은 계산하지 않습니다.</p>${errorSlot()}${navigation('거리 입력하기')}</form>`;
}
function dimensions() {
  return `<h1>거리 세 곳을 입력해 주세요</h1><p class="lead">축을 따라 잰 거리입니다. 모두 mm로 넣습니다.</p><form id="dimensions-form"><div class="card"><div class="diagram-box">${diagram()}</div>
  ${[['a','A','두 게이지 접촉점 사이','게이지 끝이 닿는 두 위치 사이입니다.'],['b','B','모터측 접촉점 → 앞발','처음 아래 게이지가 닿는 곳부터 앞발 볼트 중심까지입니다.'],['c','C','앞발 → 뒷발','앞발과 뒷발 볼트의 중심 사이입니다.']].map(([key,letter,label,help]) => `<div class="field"><label for="dim-${key}"><span class="distance-letter">${letter}</span>${label}</label><p class="helper" id="help-${key}">${help}</p><div class="unit-input"><input id="dim-${key}" name="${key}" type="text" inputmode="decimal" maxlength="12" autocomplete="off" aria-describedby="help-${key}" value="${esc(state.dims[key])}" placeholder="거리 입력"><span>mm</span></div></div>`).join('')}</div>
  <p class="helper">이전 거리값이 보이면 같은 기계인지 확인해 주세요. 10 cm는 100 mm입니다.</p>${errorSlot()}${navigation('게이지 입력하기')}</form>`;
}
function readings() {
  const angle = [90,180,270][state.angle];
  return `<h1>${angle}° 돌린 숫자를 넣어 주세요</h1><p class="lead">처음 0을 맞춘 자세에서 ${['¼바퀴','반 바퀴','¾바퀴'][state.angle]}입니다.<br>두 축을 함께 같은 방향으로 돌리고, 중간에 다시 0을 맞추지 않습니다.</p>
  <div class="angles" aria-label="측정 순서">${[90,180,270].map((n,i) => `<div class="angle ${state.angle === i ? 'active' : ''}" ${state.angle === i ? 'aria-current="step"' : ''}>${n}°<small>${['¼바퀴','반 바퀴','¾바퀴'][i]}</small></div>`).join('')}</div>
  <p class="helper">‘처음 위 / 처음 아래’ 이름은 돌려도 바뀌지 않습니다.${angle === 180 ? ' 지금은 위아래 위치가 서로 바뀝니다.' : ''}</p>
  <form id="readings-form">${['upper','lower'].map((dial,i) => `<section class="card reading ${i ? 'lower' : ''}" aria-labelledby="title-${dial}"><h2 id="title-${dial}"><span class="dial-tag ${i ? 'lower' : ''}">${i ? '처음 아래' : '처음 위'}</span> 게이지</h2><p class="helper">${i ? '모터측을 재는 게이지' : '고정측을 재는 게이지'}</p><div class="signs" role="group" aria-label="${i ? '처음 아래' : '처음 위'} 게이지 부호"><button type="button" class="sign" data-dial="${dial}" data-sign="1" aria-pressed="${state.signs[dial][state.angle] === 1}">＋ 플러스</button><button type="button" class="sign" data-dial="${dial}" data-sign="-1" aria-pressed="${state.signs[dial][state.angle] === -1}">− 마이너스</button></div><label class="field-label" for="read-${dial}">측정값</label><div class="readout-entry"><span class="readout-sign" id="sign-${dial}" aria-hidden="true">${state.signs[dial][state.angle] === 1 ? '+' : '−'}</span><input type="text" inputmode="decimal" maxlength="12" autocomplete="off" id="read-${dial}" value="${esc(state.readings[dial][state.angle])}" placeholder="${state.unit === 'div' ? '칸 수 입력' : 'mm 값 입력'}" aria-describedby="reading-unit"><span>${state.unit === 'div' ? '칸' : 'mm'}</span></div></section>`).join('')}
  <p id="reading-unit" class="helper">${state.unit === 'div' ? '1칸 = 0.01 mm입니다.' : 'mm 단위로 입력합니다.'} 0이면 숫자 0을 넣어 주세요. −값은 ‘마이너스’를 선택하고 크기만 입력합니다.</p>${errorSlot()}${navigation(state.angle === 2 ? '결과 확인하기' : '다음 위치 입력')}</form>`;
}
function inputModel() {
  const multiplier = state.unit === 'div' ? .01 : 1;
  return { ...Object.fromEntries(Object.entries(state.dims).map(([k,v]) => [k,parseDecimal(v)])), upper: state.readings.upper.map((v,i) => parseDecimal(v) * state.signs.upper[i] * multiplier), lower: state.readings.lower.map((v,i) => parseDecimal(v) * state.signs.lower[i] * multiplier), sagUpper: state.sagMode === 'measured' ? parseDecimal(state.sagUpper, { signed:true }) : 0, sagLower: state.sagMode === 'measured' ? parseDecimal(state.sagLower, { signed:true }) : 0, resolution:.01 };
}
function results() {
  let result, model;
  try {
    if (!state.setup || !state.positive) throw new Error('게이지 배치와 부호 기준을 먼저 확인해 주세요.');
    model = inputModel(); result = calculate(model);
  } catch (e) { return `<h1>입력값을 확인해 주세요</h1><p class="error">${esc(e.message)}</p><button class="primary" data-action="edit-setup">입력 다시 확인하기</button>`; }
  const facts = `<details><summary>입력한 숫자 확인</summary><div class="facts"><div><span>거리 A / B / C</span><span>${model.a} / ${model.b} / ${model.c} mm</span></div>${[90,180,270].map((n,i) => `<div><span>${n}° 처음 위 / 아래</span><span>${signed(model.upper[i])} / ${signed(model.lower[i])} mm</span></div>`).join('')}<div><span>처짐 보정</span><span>${state.sagMode === 'unknown' ? '미적용' : state.sagMode === 'compensated' ? '입력값에 이미 반영' : `${signed(model.sagUpper)} / ${signed(model.sagLower)} mm`}</span></div></div><button class="secondary" data-action="edit-distance">거리 수정</button></details>`;
  if (!result.consistent) return `<h1>측정값을 다시 확인해 주세요</h1><div class="error">네 방향의 숫자가 서로 맞지 않아 라이너 결과를 표시하지 않았습니다. 부호, 입력값, 게이지 고정 상태를 확인해 주세요.</div><div class="card"><h2>숫자 합계의 차이</h2><p>처음 위: ${result.checks[0].toFixed(3)} mm<br>처음 아래: ${result.checks[1].toFixed(3)} mm</p><p class="helper">처음값 0 + 180° 값과 90° + 270° 값을 비교합니다. 차이가 0.020 mm를 넘으면 재확인합니다. 이는 0.01 mm 게이지의 입력 확인 기준이며, 설비의 정렬 허용오차가 아닙니다.</p></div>${facts}<button class="primary" data-action="edit-readings">측정값 다시 확인하기</button>`;
  return `<h1>앞발·뒷발 계산 결과</h1><p class="lead">현재 라이너에서 더하거나 뺄 두께입니다.</p><div class="notice"><strong>${demo ? '연습용 예시 결과' : '현장 검증 전 · 참고값'}</strong><br>${state.sagMode === 'unknown' ? '지지대 처짐은 보정하지 않았습니다. ' : ''}실제 조정 전 기존 계산법과 대조해 주세요.</div>
  <div class="result-grid">${[['앞발','축 연결부에 가까운 발',result.front],['뒷발','축 연결부에서 먼 발',result.rear]].map(([title,label,value]) => { const x=correction(value); return `<section class="card result"><h2>${title}</h2><div class="foot-label">${label}</div><div class="result-number">${x.amount} <small>mm</small></div><div class="result-action ${x.kind}">${x.action}</div></section>`; }).join('')}</div>
  <p class="helper">앞쪽 두 발, 뒤쪽 두 발에 각각 같은 양을 적용하는 계산입니다. 기존 라이너 총두께가 아닙니다. ‘빼기’ 양이 기존 두께보다 크면 그대로 작업할 수 없습니다.</p>
  <div class="result-check">측정값 합계 확인 범위 이내<p class="tiny">이 확인만으로 정렬 완료를 판정하지 않습니다. 조정 후 반드시 다시 측정해 주세요.</p></div>${facts}
  <details><summary>계산 기준과 한계</summary><p class="helper">처음 위 게이지는 고정측, 처음 아래 게이지는 모터측을 측정합니다. 두 측정점의 높이 차를 구한 뒤 발 위치까지 직선으로 연장해 보정량을 계산합니다. 눌림이 ＋인 게이지 기준입니다.</p><p class="helper">소수 셋째 자리 표시는 계산 표시 자릿수이며 측정 정확도를 보증하지 않습니다. 열팽창 목표는 0, 개별 발 들뜸은 별도 점검 대상입니다. 수평 이동은 계산하지 않습니다.</p><a href="./method.html">계산식과 검산 자료 보기</a></details>
  <div class="stack"><button class="primary" data-action="remeasure">같은 거리로 다시 측정</button><button class="secondary" data-action="edit-readings">입력값 수정하기</button></div>`;
}
function signed(n) { return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(3)}`; }
function changeStep(step) { state.step=step; message=''; persist(); render(); }
function startNew(reuse = true) {
  const previous = demo ? state : saved;
  const next = empty(); next.step=1;
  if (reuse && previous) { next.dims={...previous.dims}; next.unit=previous.unit; next.sagMode=previous.sagMode; next.sagUpper=previous.sagUpper; next.sagLower=previous.sagLower; }
  state=next; message=''; persist(); render();
}
app.addEventListener('click', event => {
  const button=event.target.closest('button'); if (!button) return;
  if (button.dataset.sign) {
    const dial=button.dataset.dial; state.signs[dial][state.angle]=Number(button.dataset.sign); persist();
    button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector(`#sign-${dial}`).textContent=Number(button.dataset.sign)===1?'+':'−'; return;
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
    case 'new': if(saved?.step>0&&!confirm('이전 측정값을 지우고 새로 시작할까요? 거리값은 유지됩니다.'))return; demo=false; startNew(); break;
    case 'resume': demo=false; state=structuredClone(saved); render(); break;
    case 'home': demo=false; state=empty(); message=''; render(); break;
    case 'demo': demo=true; state=empty(); state.step=1; state.setup=true; state.positive=true; state.dims={a:'200',b:'150',c:'300'}; state.readings={upper:['0.10','0.20','0.10'],lower:['0.20','0.40','0.20']}; render(); break;
    case 'back': if(state.step===3&&state.angle>0){state.angle--;persist();message='';render();}else changeStep(state.step-1); break;
    case 'edit-readings': state.angle=0; changeStep(3); break;
    case 'edit-distance': changeStep(2); break;
    case 'edit-setup': changeStep(1); break;
    case 'remeasure': if(confirm('거리값은 유지하고 게이지 숫자를 지울까요?'))startNew(); break;
  }
});
app.addEventListener('input',event=>{
  const el=event.target;
  if(el.id.startsWith('dim-'))state.dims[el.name]=el.value;
  if(el.id.startsWith('read-'))state.readings[el.id.slice(5)][state.angle]=el.value;
  if(['sagUpper','sagLower'].includes(el.id))state[el.id]=el.value;
  if(['setup','positive'].includes(el.id))state[el.id]=el.checked;
  persist();
});
app.addEventListener('change',event=>{
  if(event.target.id==='sagMode'){state.sagMode=event.target.value;persist();document.querySelector('#sag-fields').hidden=state.sagMode!=='measured';}
});
app.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    if(state.step===1){
      if(!state.setup||!state.positive)throw new Error('배치와 부호 기준 두 항목을 확인해 주세요. 다르면 이 계산기를 적용할 수 없습니다.');
      if(state.sagMode==='measured'){parseDecimal(state.sagUpper,{signed:true});parseDecimal(state.sagLower,{signed:true});}
      changeStep(2);
    }else if(state.step===2){
      const a=parseDecimal(state.dims.a),b=parseDecimal(state.dims.b),c=parseDecimal(state.dims.c);
      if(a<=0||b<0||c<=0)throw new Error('A와 C는 0보다 큰 거리를 넣어 주세요.');
      state.angle=0;changeStep(3);
    }else if(state.step===3){
      for(const dial of ['upper','lower'])parseDecimal(state.readings[dial][state.angle]);
      if(state.angle<2){state.angle++;message='';persist();render();}else{calculate(inputModel());changeStep(4);}
    }
  }catch(error){showError(error.message);}
});

// Optional browser-agent integration, sharing the visible calculation path.
if(document.modelContext?.registerTool){
  try { Promise.resolve(document.modelContext.registerTool({name:'read_alignment_result',title:'현재 라이너 계산 결과 확인',description:'Read the result for the current complete input; does not alter any readings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments accepted.');if(state.step!==4||!state.setup||!state.positive)throw new Error('Complete the visible measurement flow first.');const r=calculate(inputModel());return {demo,fieldValidated:false,sagMode:state.sagMode,consistent:r.consistent,...(r.consistent?{frontChangeMm:r.front,rearChangeMm:r.rear}:{checks:r.checks})};}})).catch(()=>{}); }catch{}
}
render(false);
