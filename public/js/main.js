import { toast, esc, parseHTML, renderList, buildTxt, buildMd } from './app.js';

// ===== TEMA =====
(function() {
  const btn = document.getElementById('theme-btn'), h = document.documentElement;
  let t = 'dark';
  const SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  const MON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  function set(v) { t = v; h.setAttribute('data-theme', v); btn.innerHTML = v === 'dark' ? SUN : MON; }
  set(t);
  btn.addEventListener('click', () => set(t === 'dark' ? 'light' : 'dark'));
})();

// ===== ESTADO =====
let questions = [];
let currentFmt = 'txt';
const extMap = { txt: '.txt', md: '.md', pdf: '.pdf' };

// ===== LICENCIA =====
let license = JSON.parse(localStorage.getItem('license') || '{"key":""}');
document.getElementById('ai-api-key').value = license.key;

document.getElementById('ai-config-btn').addEventListener('click', () => document.getElementById('ai-modal-bg').classList.add('open'));
document.getElementById('ai-modal-close').addEventListener('click', () => document.getElementById('ai-modal-bg').classList.remove('open'));
document.getElementById('ai-save-btn').addEventListener('click', () => {
  license = { key: document.getElementById('ai-api-key').value.trim() };
  localStorage.setItem('license', JSON.stringify(license));
  document.getElementById('ai-modal-bg').classList.remove('open');
  toast('Licencia guardada');
});

// ===== API CALL (al backend de Vercel) =====
async function callAI(prompt, images) {
  if (!license.key) throw new Error('Falta licencia');
  const res = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey: license.key, prompt, imagesBase64: images || [] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en el servidor');
  return data.answer;
}

// ===== IMAGEN: PEGAR =====
window.delImg = function(qIdx, imgIdx) {
  questions[qIdx].imagesBase64.splice(imgIdx, 1);
  renderList(questions);
};

document.addEventListener('paste', e => {
  const el = document.activeElement;
  if (!el || !el.classList.contains('q-img-zone')) return;
  const idx = parseInt(el.dataset.qi);
  for (const item of e.clipboardData.items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = evt => {
        if (!questions[idx].imagesBase64) questions[idx].imagesBase64 = [];
        questions[idx].imagesBase64.push(evt.target.result);
        renderList(questions);
        toast('Imagen adjuntada');
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
});

// ===== RESOLVER =====
function buildPrompt(idx) {
  const q = questions[idx];
  let prompt = 'Solve this English assignment question. Rules:\n';
  prompt += '- ONLY output the answer string.\n';
  prompt += '- NO explanations or introductory text.\n';
  prompt += '- One answer per line if multiple blanks.\n\n';
  
  const isMatching = q.words.length > 0 && q.opts.length > 0;

  if (q.words.length) prompt += 'WORD BANK: ' + q.words.join(', ') + '\n\n';
  if (q.instr) prompt += 'INSTRUCTIONS: ' + q.instr + '\n';
  prompt += 'QUESTION: ' + q.qText + '\n';
  
  if (q.opts.length) {
    if (isMatching) {
      prompt += '\nMATCHING DEFINITIONS:\n' + q.opts.map((o, i) => String.fromCharCode(65 + i) + '. ' + o).join('\n') + '\n';
      prompt += '\nFormat: Complete definition phrase -> matching word from bank.\n';
    } else {
      prompt += '\nOPTIONS:\n' + q.opts.map((o, i) => String.fromCharCode(65 + i) + '. ' + o).join('\n') + '\n';
      prompt += '\nFormat: Letter. Full text of the option.\n';
    }
  }
  return prompt;
}

window.copyPrompt = function(idx) {
  navigator.clipboard.writeText(buildPrompt(idx)).then(() => toast('Datos copiados'));
};

window.resolveSingle = async function(idx) {
  if (!license.key) return toast('Configura tu licencia primero', true);
  const q = questions[idx];
  const btn = document.getElementById('resolve-btn-' + idx);
  const oldTxt = btn.innerHTML;
  btn.innerHTML = '...';
  btn.disabled = true;
  try {
    const ans = await callAI(buildPrompt(idx), q.imagesBase64);
    q.answer = ans;
    const inp = document.querySelector(`textarea[data-qi="${idx}"]`);
    if (inp) inp.value = ans;
    btn.style.display = 'none';
    toast('Pregunta ' + (idx + 1) + ' completada');
    return true; // Éxito
  } catch (e) {
    toast('Error: ' + e.message, true);
    btn.innerHTML = oldTxt;
    btn.disabled = false;
    return false; // Error
  }
};

document.getElementById('resolve-all-btn').addEventListener('click', async function() {
  if (!license.key) return toast('Configura tu licencia primero', true);
  if (!questions.length) return toast('No hay preguntas');
  const btn = this;
  const oldTxt = btn.innerHTML;
  btn.innerHTML = 'Procesando...';
  btn.disabled = true;
  let solved = 0;
  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].answer) { 
      const ok = await window.resolveSingle(i); 
      if (ok) solved++; 
    }
  }
  btn.innerHTML = oldTxt;
  btn.disabled = false;
  toast(solved > 0 ? '¡Proceso finalizado!' : 'No había pendientes');
});

// ===== PREGUNTAS =====
window.delQ = function(idx) { questions.splice(idx, 1); renderList(questions); toast('Pregunta eliminada'); };

document.getElementById('add-btn').addEventListener('click', () => {
  const raw = document.getElementById('hi').value.trim();
  if (!raw) return toast('Pega el HTML primero', true);
  const q = parseHTML(raw);
  if (!q.qText && !q.opts.length && !q.words.length && !q.item) return toast('No se detectó contenido válido', true);
  q.answer = '';
  questions.push(q);
  renderList(questions);
  document.getElementById('hi').value = '';
  toast('Pregunta ' + questions.length + ' agregada');
});

document.getElementById('hi').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('add-btn').click(); }
});

document.getElementById('clr-all-btn').addEventListener('click', () => {
  if (!questions.length) return toast('No hay preguntas');
  if (confirm('¿Eliminar todas las preguntas?')) { questions = []; renderList(questions); toast('Lista limpiada'); }
});

// ===== EXPORTAR =====
document.getElementById('fmt-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.fmt-tab');
  if (!tab) return;
  document.querySelectorAll('.fmt-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentFmt = tab.dataset.fmt;
  document.getElementById('fn-ext').textContent = extMap[currentFmt];
});

function getFname() { return (document.getElementById('fn-inp').value.trim() || 'assignment').replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '-') + extMap[currentFmt]; }
function dl(content, name, mime) {
  const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function doPDF() {
  if (!questions.length) return toast('Agrega preguntas primero', true);
  const fname = document.getElementById('fn-inp').value.trim() || 'assignment';
  const pf = document.getElementById('pf');
  let h = `<h1>${fname}</h1><div class="pmeta">${questions.length} preguntas</div>`;
  questions.forEach((q, i) => {
    const meta = [];
    if (q.item) meta.push('Item ' + q.item);
    if (q.part) meta.push(q.part);
    if (q.pts) meta.push(q.pts + ' pts');
    h += `<div class="pq"><div class="pq-num">${i + 1}.</div>`;
    if (meta.length) h += `<div class="pq-meta">${meta.join(' · ')}</div>`;
    if (q.words.length) h += `<div class="pwb">Palabras: ${q.words.join(' | ')}</div>`;
    if (q.instr) h += `<div class="pinstr">${q.instr}</div>`;
    if (q.qText) h += `<div class="ptxt">${q.qText}</div>`;
    if (q.opts.length) { h += '<div style="margin-top:6px;font-weight:600;font-size:11px;color:#888;">Opciones:</div>'; q.opts.forEach((o, oi) => { h += `<div class="popt">&#9675; ${String.fromCharCode(65 + oi)}. ${o}</div>`; }); }
    h += `<div class="pans">Respuesta: ${q.answer ? '<strong>' + q.answer + '</strong>' : '___________________________'}</div></div>`;
  });
  pf.innerHTML = h;
  window.print();
}

document.getElementById('exp-btn').addEventListener('click', () => {
  if (!questions.length) return toast('No hay preguntas', true);
  if (currentFmt === 'txt') dl(buildTxt(questions), getFname(), 'text/plain;charset=utf-8');
  else if (currentFmt === 'md') dl(buildMd(questions), getFname(), 'text/markdown;charset=utf-8');
  else doPDF();
});

document.getElementById('prev-btn').addEventListener('click', () => {
  if (!questions.length) return toast('No hay preguntas', true);
  if (currentFmt === 'pdf') { toast('Para PDF usa Exportar directamente'); return; }
  const content = currentFmt === 'md' ? buildMd(questions) : buildTxt(questions);
  document.getElementById('modal-body').textContent = content;
  document.getElementById('modal-ttl').textContent = 'Vista previa: ' + getFname();
  document.getElementById('modal-fmt').textContent = currentFmt.toUpperCase();
  document.getElementById('modal-bg').classList.add('open');
});

document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-bg').classList.remove('open'));
document.getElementById('modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });
document.getElementById('modal-cpy').addEventListener('click', () => navigator.clipboard.writeText(document.getElementById('modal-body').textContent).then(() => toast('Copiado')));
document.getElementById('modal-dl').addEventListener('click', () => {
  const c = document.getElementById('modal-body').textContent;
  const mime = currentFmt === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
  dl(c, getFname(), mime);
  toast('Descargando ' + getFname());
});
