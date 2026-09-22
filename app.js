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
const ANGLES = [90, 180, 270];
const TURNS = ['¼바퀴', '반 바퀴', '¾바퀴'];
const DIALS = { upper: { tag: '처음 위', target: '고정측을 재는 게이지' }, lower: { tag: '처음 아래', target: '모터 쪽을 재는 게이지' } };
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function persist() {
  if (demo) return;
  saved = structuredClone(state);
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, state })); }
  catch { storageOK = false; }
}
function diagram() {
  return `<svg class="diagram" viewBox="0 0 620 290" role="img" aria-label="왼쪽은 고정측, 오른쪽은 모터. 처음 위 게이지는 고정측을, 처음 아래 게이지는 모터 쪽을 잽니다. A는 두 게이지 침 사이, B는 모터 쪽 침 자리부터 앞발 볼트, C는 앞발부터 뒷발 볼트까지입니다.">
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
  return `<ol class="progress" aria-label="진행 단계">${['준비', '거리', '게이지', '결과'].map((x, i) => `<li class="${state.step === i+1 ? 'active' : state.step > i+1 ? 'done' : ''}" ${state.step === i+1 ? 'aria-current="step"' : ''}>${i+1}. ${x}</li>`).join('')}</ol>`;
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
  app.innerHTML = `${demo ? '<div class="demo-banner">연습 중입니다 · 예시 숫자라서 실제 작업값이 아닙니다.</div>' : ''}${!storageOK ? '<p class="notice storage-warning">이 브라우저에서는 저장이 안 됩니다. 결과를 따로 적어 두세요.</p>' : ''}${state.step ? progress() : ''}${content}${state.step ? `<p class="saved">${demo ? '연습 숫자는 저장하지 않습니다.' : storageOK ? '넣은 숫자는 자동으로 저장됩니다.' : '지금 넣는 숫자는 저장되지 않습니다.'}</p><button class="plain" data-action="home">${demo ? '연습 끝내기' : '처음 화면으로'}</button>` : ''}`;
  if (focus) { const heading = app.querySelector('h1'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
}
function errorSlot() { return `<div id="error" role="alert">${message ? `<p class="error">${esc(message)}</p>` : ''}</div>`; }
function showError(text) { message = text; const region = document.querySelector('#error'); if (region) { region.innerHTML = `<p class="error">${esc(text)}</p>`; region.scrollIntoView({ block: 'center', behavior: 'auto' }); } }
function home() {
  const resumable = saved && saved.step > 0;
  return `<h1>라이너를 얼마나<br>넣고 뺄까요?</h1><p class="lead">거리 세 곳과 게이지 숫자를 순서대로 넣으면 <br>앞발·뒷발에 넣을 양이 나옵니다.</p>
  <div class="stack intro-actions">${resumable ? '<button class="primary" data-action="resume">하던 측정 이어서 하기</button>' : ''}<button class="${resumable ? 'secondary' : 'primary'}" data-action="new">새로 측정하기</button><button class="secondary" data-action="demo">예시 숫자로 연습하기</button></div>
  <div class="notice"><strong>시험용입니다.</strong> 결과는 평소 계산과 한 번 맞춰 보고 쓰세요.</div>
  <div class="card intro-diagram"><h2>이렇게 게이지를 건 경우에 맞습니다</h2><div class="diagram-box">${diagram()}</div><p class="helper">고정측을 재는 게이지가 위,<br>모터 쪽을 재는 게이지가 아래에서 시작합니다.</p></div>
  <details><summary>사용 순서</summary><ol class="steps"><li>거리 A, B, C를 mm로 넣습니다.</li><li>축을 90°, 180°, 270° 돌려 읽은 게이지 숫자를 넣습니다.</li><li>앞발·뒷발에 몇 mm 넣을지 뺄지 나옵니다.</li></ol><p class="helper">앞발은 커플링에 가까운 발, 뒷발은 먼 발입니다.</p></details>`;
}
function setup() {
  return `<h1>게이지가 이렇게<br>걸려 있나요?</h1><p class="lead">모터를 오른쪽에 두고 옆에서 본 그림입니다.</p><form id="setup-form"><div class="card"><div class="diagram-box">${diagram()}</div>
  <label class="check"><input type="checkbox" id="setup" ${state.setup ? 'checked' : ''}><span>위 게이지는 고정측을, 아래 게이지는 모터 쪽을 잽니다. 이 자세에서 둘 다 0을 맞춥니다.</span></label>
  <label class="check"><input type="checkbox" id="positive" ${state.positive ? 'checked' : ''}><span>게이지 침이 눌리면 ＋(플러스)로 읽습니다.</span></label></div>
  <div class="card"><h2>게이지 숫자는 어떻게 넣을까요?</h2><div class="unit-options"><button type="button" data-unit="mm" aria-pressed="${state.unit === 'mm'}">mm로<br><span class="tiny">예: 0.12</span></button><button type="button" data-unit="div" aria-pressed="${state.unit === 'div'}">칸 수로<br><span class="tiny">예: 12칸</span></button></div><p class="helper">${state.unit === 'div' ? '한 칸이 0.01 mm인 게이지만 됩니다. 12칸 = 0.12 mm.' : '눈금 칸 수가 아니라 mm 숫자로 넣습니다.'}</p></div>
  <details><summary>지지대 처짐 보정 <span class="tiny">(평소 안 하면 그대로 두세요)</span></summary>
  <label for="sagMode" class="field-label">보정 방법</label><select id="sagMode"><option value="unknown" ${state.sagMode === 'unknown' ? 'selected' : ''}>안 함 · 읽은 숫자 그대로 계산</option><option value="measured" ${state.sagMode === 'measured' ? 'selected' : ''}>따로 잰 처짐값을 넣기</option><option value="compensated" ${state.sagMode === 'compensated' ? 'selected' : ''}>게이지 숫자에 이미 반영했음</option></select>
  <div id="sag-fields" ${state.sagMode !== 'measured' ? 'hidden' : ''}><p class="helper">지지대를 곧은 파이프에 걸고, 같은 자세에서 0을 맞춘 뒤 반 바퀴 돌려 읽은 값입니다. ＋/− 부호까지 mm로 넣습니다.</p><div class="field"><label for="sagUpper">처음 위 게이지 처짐값 (mm)</label><input id="sagUpper" type="text" inputmode="text" maxlength="12" value="${esc(state.sagUpper)}" placeholder="예: -0.02"></div><div class="field"><label for="sagLower">처음 아래 게이지 처짐값 (mm)</label><input id="sagLower" type="text" inputmode="text" maxlength="12" value="${esc(state.sagLower)}" placeholder="예: +0.02"></div></div></details>
  <p class="check-note">위아래(높이) 라이너만 계산합니다. 좌우 이동은 계산하지 않습니다.</p>${errorSlot()}${navigation('거리 넣기')}</form>`;
}
function dimensions() {
  const fields = [['a','A','두 게이지 침 사이','위 게이지 침이 닿는 자리에서 아래 게이지 침이 닿는 자리까지'],['b','B','모터 쪽 침 자리에서 앞발까지','아래 게이지 침이 닿는 자리에서 앞발 볼트 중심까지'],['c','C','앞발에서 뒷발까지','앞발 볼트 중심에서 뒷발 볼트 중심까지']];
  return `<h1>거리 세 곳을<br>넣어 주세요</h1><p class="lead">줄자로 잰 거리를 mm로 넣습니다. 10 cm는 100 mm입니다.</p><form id="dimensions-form"><div class="card"><div class="diagram-box sticky-diagram">${diagram()}</div>
  ${fields.map(([key,letter,label,help]) => `<div class="field"><label for="dim-${key}"><span class="distance-letter">${letter}</span>${label}</label><p class="helper" id="help-${key}">${help}</p><div class="unit-input"><input id="dim-${key}" name="${key}" data-dim="${letter}" type="text" inputmode="decimal" maxlength="12" autocomplete="off" aria-describedby="help-${key}" value="${esc(state.dims[key])}" placeholder="숫자"><span>mm</span></div></div>`).join('')}</div>
  ${state.dims.a || state.dims.b || state.dims.c ? '<p class="helper">지난번 거리가 들어 있습니다. 같은 기계가 아니면 고쳐 주세요.</p>' : ''}${errorSlot()}${navigation('게이지 숫자 넣기')}</form>`;
}
function readings() {
  const i = state.angle;
  return `<h1>${TURNS[i]}(${ANGLES[i]}°) 돌린 뒤<br>게이지 숫자</h1><p class="lead">두 축을 같은 방향으로 함께 돌립니다. <br>중간에 0을 다시 맞추지 마세요.</p>
  <div class="angles" aria-label="측정 순서">${ANGLES.map((n,k) => `<div class="angle ${k === i ? 'active' : k < i ? 'done' : ''}" ${k === i ? 'aria-current="step"' : ''}>${n}°<small>${TURNS[k]}</small></div>`).join('')}</div>
  ${i === 1 ? '<p class="helper flip-note">지금은 위아래가 서로 바뀌어 있습니다. 이름은 처음 자리 그대로 부릅니다.</p>' : ''}
  <form id="readings-form">${Object.entries(DIALS).map(([dial,info],k) => `<section class="card reading ${k ? 'lower' : ''}" aria-labelledby="title-${dial}"><h2 id="title-${dial}"><span class="dial-tag ${k ? 'lower' : ''}">${info.tag}</span> 게이지 <span class="helper">· ${info.target}</span></h2><div class="signs" role="group" aria-label="${info.tag} 게이지 부호"><button type="button" class="sign" data-dial="${dial}" data-sign="1" aria-pressed="${state.signs[dial][i] === 1}">＋ 플러스</button><button type="button" class="sign" data-dial="${dial}" data-sign="-1" aria-pressed="${state.signs[dial][i] === -1}">− 마이너스</button></div><div class="readout-entry"><span class="readout-sign" id="sign-${dial}" aria-hidden="true">${state.signs[dial][i] === 1 ? '+' : '−'}</span><input type="text" inputmode="decimal" maxlength="12" autocomplete="off" id="read-${dial}" aria-label="${info.tag} 게이지 숫자" value="${esc(state.readings[dial][i])}" placeholder="숫자" aria-describedby="reading-unit"><span>${state.unit === 'div' ? '칸' : 'mm'}</span></div></section>`).join('')}
  <p id="reading-unit" class="helper">${state.unit === 'div' ? '1칸 = 0.01 mm. ' : ''}−면 마이너스를 누르고 숫자만 넣습니다. 0이면 0을 넣어 주세요.</p>${errorSlot()}${navigation(i === 2 ? '결과 보기' : `다음 · ${ANGLES[i+1]}° 숫자`)}</form>`;
}
function inputModel() {
  const multiplier = state.unit === 'div' ? .01 : 1;
  return { ...Object.fromEntries(Object.entries(state.dims).map(([k,v]) => [k,parseDecimal(v)])), upper: state.readings.upper.map((v,i) => parseDecimal(v) * state.signs.upper[i] * multiplier), lower: state.readings.lower.map((v,i) => parseDecimal(v) * state.signs.lower[i] * multiplier), sagUpper: state.sagMode === 'measured' ? parseDecimal(state.sagUpper, { signed:true }) : 0, sagLower: state.sagMode === 'measured' ? parseDecimal(state.sagLower, { signed:true }) : 0, resolution:.01 };
}
function results() {
  let result, model;
  try {
    if (!state.setup || !state.positive) throw new Error('준비 단계의 두 항목을 먼저 확인해 주세요.');
    model = inputModel(); result = calculate(model);
  } catch (e) { return `<h1>넣은 숫자를<br>확인해 주세요</h1><p class="error">${esc(e.message)}</p><button class="primary" data-action="edit-setup">처음부터 다시 확인</button>`; }
  const facts = `<details><summary>넣은 숫자 보기</summary><div class="facts"><div><span>거리 A / B / C</span><span>${model.a} / ${model.b} / ${model.c} mm</span></div>${ANGLES.map((n,i) => `<div><span>${n}° 처음 위 / 아래</span><span>${signed(model.upper[i])} / ${signed(model.lower[i])} mm</span></div>`).join('')}<div><span>처짐 보정</span><span>${state.sagMode === 'unknown' ? '안 함' : state.sagMode === 'compensated' ? '숫자에 이미 반영' : `${signed(model.sagUpper)} / ${signed(model.sagLower)} mm`}</span></div></div><div class="stack"><button class="secondary" data-action="edit-readings">게이지 숫자 고치기</button><button class="secondary" data-action="edit-distance">거리 고치기</button></div></details>`;
  if (!result.consistent) return `<h1>숫자가 서로<br>맞지 않습니다</h1><div class="error">네 방향 숫자가 서로 맞지 않아 결과를 내지 않았습니다.<br>보통 ＋/− 부호가 바뀌었거나 숫자를 잘못 넣은 경우입니다.</div><div class="card"><h2>어긋난 양</h2><div class="facts"><div><span>처음 위 게이지</span><span>${result.checks[0].toFixed(3)} mm</span></div><div><span>처음 아래 게이지</span><span>${result.checks[1].toFixed(3)} mm</span></div></div><p class="helper">90° 숫자와 270° 숫자를 더한 값이 180° 숫자와 같아야 합니다. 0.02 mm까지는 넘어갑니다.</p></div>${facts}<button class="primary" data-action="edit-readings">게이지 숫자 다시 넣기</button>`;
  return `<h1>앞발·뒷발 라이너</h1><p class="lead">지금 들어 있는 라이너에서 더하거나 뺄 두께입니다.</p>
  <div class="result-grid">${[['앞발','커플링에 가까운 발',result.front],['뒷발','커플링에서 먼 발',result.rear]].map(([title,label,value]) => { const x=correction(value); const verb = x.kind==='remove' ? '빼세요' : x.amount==='0.000' ? '그대로' : '넣으세요'; return `<section class="card result ${x.kind}"><h2>${title} <span class="foot-label">${label}</span></h2><div class="result-number">${x.amount} <small>mm</small></div><div class="result-action ${x.kind}">${verb}</div></section>`; }).join('')}</div>
  <div class="notice"><strong>${demo ? '연습용 예시 결과입니다.' : '시험용 결과입니다.'}</strong> ${demo ? '' : '평소 계산과 한 번 맞춰 보고 쓰세요. '}${state.sagMode === 'unknown' ? '지지대 처짐은 보정하지 않았습니다.' : ''}</div>
  <p class="helper">앞발 두 개에 같은 양, 뒷발 두 개에 같은 양입니다. 빼는 양이 지금 라이너보다 두꺼우면 그대로는 못 뺍니다. 조정 뒤에는 한 번 더 재 주세요.</p>${facts}
  <details><summary>계산 방법</summary><p class="helper">처음 위 게이지 숫자로 고정측 자리의 높이 차이, 처음 아래 게이지 숫자로 모터 쪽 자리의 높이 차이를 구합니다. 두 점을 직선으로 이어 앞발·뒷발 자리까지 늘려서, 그 높이 차이를 없애는 양을 냅니다.</p><a href="./method.html">공식과 검산 자료 보기</a></details>
  <div class="stack"><button class="primary" data-action="remeasure">같은 거리로 다시 측정</button></div>`;
}
function signed(n) { return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(3)}`; }
function changeStep(step) { state.step=step; message=''; persist(); render(); }
function startNew(reuse = true) {
  const previous = demo ? state : saved;
  const next = empty(); next.step=1;
  if (reuse && previous) { next.dims={...previous.dims}; next.unit=previous.unit; next.sagMode=previous.sagMode; next.sagUpper=previous.sagUpper; next.sagLower=previous.sagLower; next.setup=previous.setup; next.positive=previous.positive; }
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
  if (button.dataset.unit) {
    const next=button.dataset.unit;
    if(next!==state.unit){
      const factor=next==='div'?100:.01;
      for(const dial of ['upper','lower'])state.readings[dial]=state.readings[dial].map(v=>{try{return String(Number((parseDecimal(v)*factor).toFixed(8)));}catch{return v;}});
      state.unit=next; persist(); render(false);
    } return;
  }
  switch(button.dataset.action){
    case 'new': if(saved?.step>0&&!confirm('하던 측정 숫자를 지우고 새로 시작할까요? 거리는 남겨 둡니다.'))return; demo=false; startNew(); break;
    case 'resume': demo=false; state=structuredClone(saved); render(); break;
    case 'home': demo=false; state=empty(); message=''; render(); break;
    case 'demo': demo=true; state=empty(); state.step=1; state.setup=true; state.positive=true; state.dims={a:'200',b:'150',c:'300'}; state.readings={upper:['0.10','0.20','0.10'],lower:['0.20','0.40','0.20']}; render(); break;
    case 'back': if(state.step===3&&state.angle>0){state.angle--;persist();message='';render();}else changeStep(state.step-1); break;
    case 'edit-readings': state.angle=0; changeStep(3); break;
    case 'edit-distance': changeStep(2); break;
    case 'edit-setup': changeStep(1); break;
    case 'remeasure': if(confirm('거리는 남기고 게이지 숫자만 지울까요?'))startNew(); break;
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
app.addEventListener('focusin',event=>{ if(event.target.dataset?.dim)highlightDim(event.target.dataset.dim); });
app.addEventListener('focusout',event=>{ if(event.target.dataset?.dim)highlightDim(''); });
app.addEventListener('change',event=>{
  if(event.target.id==='sagMode'){state.sagMode=event.target.value;persist();document.querySelector('#sag-fields').hidden=state.sagMode!=='measured';}
});
app.addEventListener('submit',event=>{
  event.preventDefault();
  try{
    if(state.step===1){
      if(!state.setup||!state.positive)throw new Error('두 항목에 모두 체크해 주세요. 게이지를 다르게 걸었다면 이 계산기와 맞지 않습니다.');
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
