// ===== UTILIDADES =====
export function toast(m, err) {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.style.background = err ? 'var(--red)' : 'var(--text)';
  el.style.color = err ? '#fff' : 'var(--bg)';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

export function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== PARSER HTML =====
export function parseHTML(raw) {
  const p = new DOMParser(), doc = p.parseFromString(raw, 'text/html');
  const container = doc.querySelector('.question-wrap') || doc.querySelector('main') || doc.body;

  let item = '';
  const iEl = doc.querySelector('.question--sb__number-wrap,.question__number-wrap,[id="question-info-holder"]');
  if (iEl) item = iEl.textContent.replace(/Item/i, '').trim();

  let part = '';
  const pEl = doc.querySelector('.question__part');
  if (pEl) part = pEl.textContent.replace(/\s+/g, ' ').trim();

  let pts = '';
  const ptEl = doc.querySelector('.question__points');
  if (ptEl) pts = (ptEl.childNodes[0] && ptEl.childNodes[0].textContent || '').trim();

  const words = [];
  doc.querySelectorAll('.note__main, .question--matching__choices').forEach(reqEl => {
    reqEl.querySelectorAll('td, .question--matching__choice').forEach(c => {
      const w = c.textContent.trim();
      if (w && words.indexOf(w) === -1) words.push(w);
    });
    if (!reqEl.querySelector('table') && !reqEl.classList.contains('question--matching__choices')) {
      let tx = reqEl.textContent.trim()
        .replace(/Enter a number to rank.*?sentence\./i, '')
        .replace(/Type.*?noun\./i, '')
        .replace(/Select.*?\./i, '').trim();
      const isList = tx.indexOf('/') > -1 || tx.indexOf(',') > -1 || tx.split('\n').length > 1;
      if (tx && tx.indexOf('Workbook') === -1 && isList) {
        tx.split(/[\/\n,]/).map(s => s.trim()).filter(Boolean).forEach(w => {
          if (w && w.length < 50 && words.indexOf(w) === -1 && !/Required information|Skip to question/i.test(w)) words.push(w);
        });
      }
    }
  });

  const opts = [];
  container.querySelectorAll('input[type="radio"]').forEach(r => {
    const lbl = r.closest('label') || r.nextElementSibling;
    if (lbl) { const v = lbl.textContent.trim(); if (v && opts.indexOf(v) === -1) opts.push(v); }
  });
  if (!opts.length) {
    container.querySelectorAll('.answers-wrap label, .answers-wrap li, .answer--matching__option').forEach(l => {
      const t = l.textContent.trim();
      if (t && t.length < 300 && !/Fill in the blank/i.test(t) && opts.indexOf(t) === -1) opts.push(t);
    });
  }

  const workContainer = container.cloneNode(true);
  workContainer.querySelectorAll('select').forEach(el => {
    const selOpts = [];
    el.querySelectorAll('option').forEach(o => {
      const t = o.textContent.trim();
      if (t && !/Click|select|No answer/i.test(t)) selOpts.push(t);
    });
    const span = document.createElement('span');
    span.textContent = ' ______ ' + (selOpts.length ? '[' + selOpts.join(' / ') + '] ' : '');
    el.parentNode.replaceChild(span, el);
  });
  workContainer.querySelectorAll('input[type="text"]').forEach(el => {
    const span = document.createElement('span');
    span.textContent = ' ______ ';
    el.parentNode.replaceChild(span, el);
  });

  function getText(el) {
    let html = el.innerHTML.replace(/[\r\n]+/g, ' ');
    html = html.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '[[NL]]');
    html = html.replace(/<br\s*\/?>/gi, '[[NL]]');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    let text = tmp.textContent || '';
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/(\s*\[\[NL\]\]\s*)+/g, '\n');
    return text.trim();
  }

  let instr = '', qText = '';
  const qEl = workContainer.querySelector('.question') || workContainer.querySelector('.worksheet__main');
  if (qEl) {
    const clone = qEl.cloneNode(true);
    const strong = clone.querySelector('strong');
    if (strong && !instr) { instr = strong.textContent.trim(); strong.remove(); }
    qText = getText(clone);
  }

  if (!qText || qText.length < 5) {
    const parts2 = [];
    workContainer.querySelectorAll('p').forEach(pt => {
      const txt = getText(pt);
      if (txt && !pt.closest('.header') && !pt.closest('.footer') && !pt.classList.contains('question__points') && txt.length > 1) {
        const s = pt.querySelector('strong');
        if (s && !instr) instr = s.textContent.trim();
        parts2.push(txt);
      }
    });
    if (parts2.length) qText = parts2.join('\n').replace(instr, '').trim();
  }

  qText = qText.replace(/\(\d+\)\s*\(Click to select\)/g, '').trim();
  const hasInput = !!container.querySelector('input[type="text"],.answer--input__input');
  const type = hasInput ? 'fill' : (opts.length > 0 ? 'mc' : 'text');
  const hasImages = !!workContainer.querySelector('img');

  return { item, part, pts, words, instr, qText, opts, type, hasImages, imagesBase64: [] };
}

// ===== RENDERER DE LISTA =====
export function renderList(questions) {
  const area = document.getElementById('q-list-area');
  const count = questions.length;
  document.getElementById('count-badge').textContent = count;
  document.getElementById('count-badge').style.display = count ? 'inline-flex' : 'none';
  document.getElementById('resolve-all-btn').style.display = count ? 'flex' : 'none';
  document.getElementById('status-txt').textContent = count
    ? count + ' pregunta' + (count > 1 ? 's' : '') + ' agregada' + (count > 1 ? 's' : '')
    : 'Sin preguntas agregadas';
  document.getElementById('total-badge').textContent = count ? count + ' pregunta' + (count > 1 ? 's' : '') : '';

  if (!count) {
    area.innerHTML = '<div class="es"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg><p>Agrega preguntas desde el panel izquierdo</p></div>';
    return;
  }

  let html = '<div class="q-list">';
  questions.forEach((q, idx) => {
    const meta = [];
    if (q.item) meta.push('Item ' + q.item);
    if (q.part) meta.push(q.part);
    if (q.pts) meta.push(q.pts + ' pts');

    let wbH = '';
    if (q.words.length) {
      const chips = q.words.map(w => `<span class="wchip" style="border-color:var(--pr);color:var(--text);font-weight:600;">${esc(w)}</span>`).join('');
      wbH = `<div class="q-wb" style="background:var(--pb);border-color:var(--pr);"><span class="q-wb-label" style="color:var(--pr);">Bancos de Palabras</span><div style="display:flex;flex-wrap:wrap;gap:4px;">${chips}</div></div>`;
    }

    const instrH = q.instr ? `<div class="q-instr">${esc(q.instr)}</div>` : '';
    let qtH = '';
    if (q.qText) {
      const rendered = esc(q.qText).replace(/_{3,}/g, '<span class="q-blank"></span>');
      qtH = `<div class="q-text">${rendered}</div>`;
    }

    let optsH = '';
    if (q.opts.length) {
      optsH = '<div class="q-opts">';
      q.opts.forEach((o, oi) => { optsH += `<label class="q-opt"><input type="radio" name="q-${idx}"><span>${esc(o)}</span></label>`; });
      optsH += '</div>';
    }

    let imgH = `<div class="q-img-zone" tabindex="0" data-qi="${idx}" style="margin-top:8px;padding:12px;border:1px dashed var(--pr);border-radius:6px;text-align:center;color:var(--mu);font-size:12px;cursor:pointer;outline:none;">${q.hasImages ? '⚠ Esta pregunta tiene imagen. Haz clic y Ctrl+V para pegarla.' : 'Haz clic y Ctrl+V para adjuntar una imagen'}</div>`;
    if (q.imagesBase64 && q.imagesBase64.length) {
      imgH = '<div class="q-img-list" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
      q.imagesBase64.forEach((b64, imgIdx) => {
        imgH += `<div style="position:relative;"><img src="${b64}" style="max-height:100px;border-radius:4px;border:1px solid var(--border);"><button onclick="window.delImg(${idx},${imgIdx})" style="position:absolute;top:-6px;right:-6px;background:var(--fa);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;line-height:1;">&times;</button></div>`;
      });
      imgH += '</div>';
    }

    const ansH = `<div class="q-ans-row"><span class="q-ans-label">Respuesta</span><textarea class="q-ans-input" placeholder="Escribe tu respuesta..." data-qi="${idx}" rows="2" style="width:100%;resize:vertical;"></textarea></div>`;
    const copyBtn = `<button onclick="window.copyPrompt(${idx})" style="background:transparent;border:1px solid var(--pr);cursor:pointer;color:var(--pr);padding:3px 8px;border-radius:4px;font-size:11px;margin-left:auto;font-weight:600;">Copiar Texto</button>`;
    const resolveBtn = `<button onclick="window.resolveSingle(${idx})" id="resolve-btn-${idx}" style="background:var(--pr);border:none;cursor:pointer;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;margin-left:4px;font-weight:600;${q.answer ? 'display:none;' : ''}">Completar</button>`;
    const delBtn = `<button onclick="window.delQ(${idx})" style="background:none;border:none;cursor:pointer;color:var(--fa);padding:2px 4px;border-radius:4px;font-size:11px;margin-left:8px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>`;

    html += `<div class="q-item" data-idx="${idx}"><div class="q-num-row"><span class="q-num">${idx + 1}</span><span class="q-meta">${esc(meta.join(' · '))}</span>${copyBtn}${resolveBtn}${delBtn}</div>${wbH}${instrH}${qtH}${optsH}${imgH}${ansH}</div>`;
  });
  html += '</div>';
  area.innerHTML = html;

  questions.forEach((q, idx) => {
    if (q.answer) {
      const inp = area.querySelector(`textarea[data-qi="${idx}"]`);
      if (inp) inp.value = q.answer;
    }
  });
  area.addEventListener('input', e => {
    if (e.target.dataset.qi !== undefined) questions[parseInt(e.target.dataset.qi)].answer = e.target.value;
  });
}

// ===== EXPORTADORES =====
export function buildTxt(questions) {
  if (!questions.length) return '';
  const fname = document.getElementById('fn-inp').value.trim() || 'assignment';
  const lines = ['=== ' + fname.toUpperCase() + ' - ' + questions.length + ' pregunta' + (questions.length > 1 ? 's' : '') + ' ===', ''];
  questions.forEach((q, i) => {
    const meta = [];
    if (q.item) meta.push('Item ' + q.item);
    if (q.part) meta.push(q.part);
    if (q.pts) meta.push(q.pts + ' pts');
    lines.push((i + 1) + '. ' + (meta.length ? '[' + meta.join(' | ') + ']' : ''));
    if (q.words.length) lines.push('   Palabras: ' + q.words.join(' | '));
    if (q.instr) lines.push('   ' + q.instr);
    if (q.qText) lines.push('   ' + q.qText);
    if (q.opts.length) { lines.push('   Opciones:'); q.opts.forEach((o, oi) => lines.push('      ' + String.fromCharCode(65 + oi) + '. ' + o)); }
    lines.push('   Respuesta: ' + (q.answer || '________________________'), '');
  });
  return lines.join('\n');
}

export function buildMd(questions) {
  if (!questions.length) return '';
  const fname = document.getElementById('fn-inp').value.trim() || 'assignment';
  const lines = ['# ' + fname, '', '---', ''];
  questions.forEach((q, i) => {
    const meta = [];
    if (q.item) meta.push('Item ' + q.item);
    if (q.part) meta.push(q.part);
    if (q.pts) meta.push(q.pts + ' pts');
    lines.push('## ' + (i + 1) + '. ' + (q.qText ? q.qText.substring(0, 60) + (q.qText.length > 60 ? '...' : '') : 'Pregunta ' + (i + 1)));
    if (meta.length) lines.push('*' + meta.join(' · ') + '*', '');
    if (q.words.length) lines.push('**Palabras:** ' + q.words.join(' · '), '');
    if (q.instr) lines.push('*' + q.instr + '*', '');
    if (q.qText) lines.push(q.qText, '');
    if (q.opts.length) { lines.push('**Opciones:**'); q.opts.forEach((o, oi) => lines.push('- [ ] **' + String.fromCharCode(65 + oi) + '.** ' + o)); lines.push(''); }
    lines.push('**Respuesta:** ' + (q.answer ? '**' + q.answer + '**' : '`___________________`'), '---', '');
  });
  return lines.join('\n');
}
