// Usability test harness: same tasks in both layouts; records time, clicks, success and ease rating.
// Results are stored in localStorage ('nl_test_results') and compared on the home page.
window.NL = window.NL || {};

NL.TASKS = [
  { id: 't1', text: 'Find how many grams of White Miso go into the Spicy Miso Tare.', ask: 'Your answer (g)' },
  { id: 't2', text: 'Change the amount of Pork Chashu Pouch in the final product to 50 g.' },
  { id: 't3', text: 'Add 2 g of Salt to the Chicken Roll.' },
  { id: 't4', text: 'Set the yield loss of the Spicy Miso Broth to 5%.' },
  { id: 't5', text: 'Create a new sub-assembly "Chili Oil" (30 g Sesame Oil + 10 g Chili Flakes) and add 8 g of it to the final product.' },
  { id: 't6', text: 'Remove Fried Shallots from the recipe.' },
  { id: 't7', text: 'Find the total calories per portion of the final product.', ask: 'Your answer (kcal)' },
];

NL.LAYOUT_NAMES = { graph: 'Layout A · Node graph', cards: 'Layout B · Recipe cards', sheet: 'Layout C · Recipe sheets' };
NL.LAYOUT_LINKS = { graph: '../node-graph/index.html', cards: '../recipe-cards/index.html', sheet: '../recipe-sheet/index.html' };

// Spreadsheet-friendly CSV (opens directly in Excel). tester = null → everyone's results.
NL.downloadResults = function (tester) {
  let rows = []; try { rows = JSON.parse(localStorage.getItem('nl_test_results')) || []; } catch { }
  if (tester != null) rows = rows.filter(r => r.tester === tester);
  if (!rows.length) { NL.toast('No results to download yet'); return; }
  const head = ['Tester', 'Layout', 'Task #', 'Task', 'Seconds', 'Clicks', 'Completed', 'Ease (1-5)', 'Answer', 'Comment', 'Date'];
  const lines = rows.map(r => {
    const i = NL.TASKS.findIndex(t => t.id === r.task);
    return [r.tester, NL.LAYOUT_NAMES[r.layout] || r.layout, i + 1, NL.TASKS[i]?.text || r.task, (r.ms / 1000).toFixed(1), r.clicks,
      r.success ? 'yes' : 'cancelled', r.rating, r.answer || '', r.comment || '', new Date(r.ts).toLocaleString()];
  });
  const csv = '﻿' + [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const who = tester ? tester.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'tester' : 'all-testers';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `nutrilabel-results-${who}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
};

(function () {
  const layout = document.body.dataset.layout;
  if (!layout) return;
  const KEY = 'nl_test_results';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = r => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { } };
  let tester = localStorage.getItem('nl_tester') || '';
  let open = false, cur = null, phase = 'idle', t0 = 0, clicks = 0, pending = null, timer = null;

  const el = document.createElement('div');
  el.className = 'tester';
  document.body.appendChild(el);

  document.addEventListener('pointerdown', e => { if (phase === 'running' && !el.contains(e.target)) clicks++; }, true);

  function done(lay = layout) { return new Set(load().filter(r => r.layout === lay && r.tester === tester).map(r => r.task)); }
  const anyResults = () => load().some(r => r.tester === tester);
  function finishedHTML() {
    const left = Object.keys(NL.LAYOUT_NAMES).filter(l => done(l).size < NL.TASKS.length);
    return `<div class="ts-fin">
        <div class="ts-fin-h">🎉 You finished ${NL.esc(NL.LAYOUT_NAMES[layout])}!</div>
        ${left.length
          ? `<div class="ts-next">Please also try:<br>${left.map(l => `<a href="${NL.LAYOUT_LINKS[l]}">${NL.esc(NL.LAYOUT_NAMES[l])} →</a>`).join('<br>')}</div>`
          : '<div class="ts-next"><b>You tested all three layouts. Thank you!</b></div>'}
      </div>
      <button class="ts-export">⬇ Download my results</button>
      <div class="ts-send">${left.length ? 'You can download now or after the other layouts. The file includes everything you have done so far.' : 'A file will download. <b>Please send it back</b> to the person who shared this link (email or WhatsApp is fine).'}</div>`;
  }
  function nextTask() { const d = done(); return NL.TASKS.find(t => !d.has(t.id)); }

  function draw() {
    if (!open) {
      const d = done().size;
      el.innerHTML = `<button class="ts-pill">🧪 Usability test <span>${d}/${NL.TASKS.length}</span></button>`;
      el.querySelector('button').onclick = () => { open = true; draw(); };
      return;
    }
    const d = done();
    let body = '';
    if (phase === 'idle') {
      const nt = nextTask();
      body = `
        <label class="ts-lab">Tester name</label>
        <input class="ts-name" value="${NL.esc(tester)}" placeholder="e.g. Chef Ana">
        ${nt ? `<ol class="ts-list">${NL.TASKS.map(t => `<li class="${d.has(t.id) ? 'done' : ''} ${nt.id === t.id ? 'next' : ''}">${NL.esc(t.text)}</li>`).join('')}</ol>`
          : `<div class="ts-meter">✓ All ${NL.TASKS.length} tasks done in this layout</div>`}
        ${nt ? `<button class="ts-go">Start task ${NL.TASKS.indexOf(nt) + 1}</button>` : finishedHTML()}
        <div class="ts-row">
          <button class="ts-link ts-fresh">Open fresh sample tab</button>
          ${nt && anyResults() ? '<button class="ts-link ts-dl">Download my results so far</button>' : ''}
          <button class="ts-link ts-clear">Clear my results here</button>
        </div>`;
    } else if (phase === 'running') {
      body = `<div class="ts-task">${NL.esc(cur.text)}</div>
        <div class="ts-meter"><span class="ts-time">0.0 s</span> · <span class="ts-clicks">0</span> clicks</div>
        ${cur.ask ? `<input class="ts-ans" placeholder="${cur.ask}">` : ''}
        <div class="ts-row"><button class="ts-ok">✓ Done</button><button class="ts-skip">Cancel</button></div>`;
    } else if (phase === 'rate') {
      body = `<div class="ts-task">How easy was that?</div>
        <div class="ts-rate">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}">${n}</button>`).join('')}</div>
        <div class="ts-scale"><span>very hard</span><span>very easy</span></div>
        <textarea class="ts-cmt" placeholder="Anything confusing? (optional)"></textarea>`;
    }
    el.innerHTML = `<div class="ts-panel">
      <div class="ts-head"><b>🧪 Usability test</b><span>${({ graph: 'Layout A · Node graph', cards: 'Layout B · Recipe cards', sheet: 'Layout C · Recipe sheets' })[layout]}</span><button class="ts-x">–</button></div>
      ${body}</div>`;
    el.querySelector('.ts-x').onclick = () => { open = false; draw(); };
    const q = s => el.querySelector(s);
    q('.ts-name')?.addEventListener('input', e => { tester = e.target.value.trim(); localStorage.setItem('nl_tester', tester); });
    q('.ts-name')?.addEventListener('change', draw);
    if (q('.ts-go')) q('.ts-go').onclick = () => {
      if (!tester) { q('.ts-name').focus(); NL.toast('Enter a tester name first'); return; }
      if (!done().size && window.NL_resetSample && confirm('Open a fresh copy of the sample recipe (in a new tab) before starting?')) window.NL_resetSample();
      cur = nextTask(); phase = 'running'; t0 = performance.now(); clicks = 0; draw();
      timer = setInterval(() => { const t = q('.ts-time'), c = q('.ts-clicks'); if (t) t.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' s'; if (c) c.textContent = clicks; }, 100);
    };
    if (q('.ts-ok')) q('.ts-ok').onclick = () => finish(true);
    if (q('.ts-skip')) q('.ts-skip').onclick = () => finish(false);
    el.querySelectorAll('.ts-rate button').forEach(b => b.onclick = () => {
      const r = load(); r.push({ ...pending, rating: +b.dataset.r, comment: q('.ts-cmt').value.trim() }); save(r);
      phase = 'idle'; pending = null; draw();
    });
    if (q('.ts-export')) q('.ts-export').onclick = () => { NL.downloadResults(tester); NL.toast('Downloaded. Please send the file back 🙏'); };
    if (q('.ts-dl')) q('.ts-dl').onclick = () => NL.downloadResults(tester);
    if (q('.ts-fresh')) q('.ts-fresh').onclick = () => { if (window.NL_resetSample) window.NL_resetSample(); };
    if (q('.ts-clear')) q('.ts-clear').onclick = () => {
      if (!confirm(`Clear ${tester || 'anonymous'}'s results for this layout?`)) return;
      save(load().filter(r => !(r.layout === layout && r.tester === tester))); draw();
    };
  }
  function finish(success) {
    clearInterval(timer);
    pending = { layout, tester, task: cur.id, ms: Math.round(performance.now() - t0), clicks, success, answer: el.querySelector('.ts-ans')?.value || '', ts: new Date().toISOString() };
    phase = 'rate'; draw();
  }
  draw();
})();
