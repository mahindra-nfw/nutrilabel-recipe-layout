// Layout A — n8n-style node graph. Raw ingredients → sub-assemblies → final product.
// Amounts live on the connection and are edited in the row where the wire lands.
(function () {
  const LS = 'nl_graph_v1';
  const WID = { ing: 190, asm: 270, final: 270 };
  const HEAD = 40, ROW = 28, PAD = 4, COLW = 340;
  const $ = s => document.querySelector(s);
  const vpEl = $('#vp'), worldEl = $('#world'), edgesEl = $('#edges'), nodesEl = $('#nodes'), insp = $('#insp');

  let S = null, sel = null, model, calc, hist;

  // ---------- model helpers ----------
  const node = id => S.nodes.find(n => n.id === id);
  const inputsOf = id => S.edges.filter(e => e.to === id);
  const outputsOf = id => S.edges.filter(e => e.from === id);
  const finalNode = () => S.nodes.find(n => n.kind === 'final');
  const nodeName = n => n.kind === 'ing' ? (NL.ingMap[n.ref]?.name || n.ref) : n.name;

  function fromModel(m) {
    const nodes = [], edges = [], ingNode = {};
    for (const [id, a] of Object.entries(m.asm))
      nodes.push({ id, kind: id === m.root ? 'final' : 'asm', name: a.name, yieldLoss: a.yieldLoss || 0, notes: a.notes || '', x: 0, y: 0 });
    for (const [id, a] of Object.entries(m.asm)) for (const it of a.items) {
      const [t, r] = it.ref.split(':');
      let from = r;
      if (t === 'ing') {
        if (!ingNode[r]) { ingNode[r] = 'i_' + r; nodes.push({ id: 'i_' + r, kind: 'ing', ref: r, x: 0, y: 0 }); }
        from = ingNode[r];
      }
      edges.push({ id: NL.uid('e'), from, to: id, amount: it.amount });
    }
    S = { nodes, edges };
    arrange();
    return S;
  }
  function toModel() {
    const asm = {};
    for (const n of S.nodes) if (n.kind !== 'ing') asm[n.id] = { name: n.name, yieldLoss: n.yieldLoss, items: [] };
    for (const e of S.edges) {
      const f = node(e.from);
      if (f && asm[e.to]) asm[e.to].items.push({ ref: f.kind === 'ing' ? 'ing:' + f.ref : 'asm:' + f.id, amount: e.amount });
    }
    return { root: finalNode().id, asm };
  }
  function upstream(id, acc = new Set()) {
    for (const e of inputsOf(id)) if (!acc.has(e.from)) { acc.add(e.from); upstream(e.from, acc); }
    return acc;
  }
  const wouldCycle = (from, to) => from === to || upstream(from).has(to);

  // ---------- geometry ----------
  function nodeH(n) {
    if (n.kind === 'ing') return HEAD + 26 + 3;
    return HEAD + 1 + PAD * 2 + Math.max(1, inputsOf(n.id).length) * ROW + ROW + ROW + 3;
  }
  const outPt = n => ({ x: n.x + WID[n.kind], y: n.y + 21.5 });
  function inPt(e) {
    const t = node(e.to), idx = Math.max(0, inputsOf(t.id).indexOf(e));
    return { x: t.x, y: t.y + 2.5 + HEAD + PAD + idx * ROW + ROW / 2 };
  }
  function curve(a, b) {
    const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  }
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of S.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + WID[n.kind]); y1 = Math.max(y1, n.y + nodeH(n)); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // Columns by distance from the final product; each node sits next to the row it feeds.
  function arrange() {
    const fin = finalNode(); const depth = { [fin.id]: 0 };
    for (let k = 0; k < 40; k++) {
      let ch = false;
      for (const e of S.edges) if (depth[e.to] != null) {
        const d = depth[e.to] + 1;
        if (d < 30 && (depth[e.from] == null || depth[e.from] < d)) { depth[e.from] = d; ch = true; }
      }
      if (!ch) break;
    }
    fin.x = 0; fin.y = 0;
    const maxD = Math.max(0, ...Object.values(depth));
    let bottom = nodeH(fin);
    for (let d = 1; d <= maxD; d++) {
      const col = S.nodes.filter(n => depth[n.id] === d).map(n => {
        const ys = outputsOf(n.id).filter(e => depth[e.to] < d).map(e => inPt(e).y);
        return { n, key: ys.length ? Math.min(...ys) : 0 };
      }).sort((a, b) => a.key - b.key);
      let prev = -Infinity;
      for (const { n, key } of col) {
        n.x = -d * COLW + (WID.asm - WID[n.kind]);
        n.y = Math.max(key - 21.5, prev + 18);
        prev = n.y + nodeH(n);
        bottom = Math.max(bottom, prev);
      }
    }
    let y = bottom + 60;
    for (const n of S.nodes.filter(n => depth[n.id] == null)) { n.x = -COLW + (WID.asm - WID[n.kind]); n.y = y; y += nodeH(n) + 18; }
  }

  // ---------- rendering ----------
  function render() {
    model = toModel(); calc = NL.calc(model);
    const hl = sel?.t === 'node' ? new Set([sel.id, ...upstream(sel.id)]) : null;
    const dimming = hl && node(sel.id)?.kind !== 'final';
    nodesEl.innerHTML = S.nodes.map(n => nodeHTML(n, hl, dimming)).join('');
    renderEdges(hl, dimming);
    renderInspector();
    $('#recipeTitle').textContent = finalNode().name;
    wb.live(S);
  }
  const renderKeep = () => NL.keepFocus(render);

  function nodeHTML(n, hl, dimming) {
    const cls = [n.kind, sel?.t === 'node' && sel.id === n.id ? 'sel' : '', hl?.has(n.id) && sel.id !== n.id ? 'hl' : '', dimming && !hl.has(n.id) ? 'dim' : ''].join(' ');
    const pos = `left:${n.x}px;top:${n.y}px`;
    if (n.kind === 'ing') {
      const i = NL.ingMap[n.ref] || { name: n.ref, n: [0], cat: '' };
      return `<div class="gnode ${cls}" data-id="${n.id}" style="${pos}">
        <div class="ghead" data-drag><span class="gic" style="background:${NL.CAT_COLORS[i.cat] || '#94a3b8'}">●</span><span class="gtitle" title="${NL.esc(i.name)}">${NL.esc(i.name)}</span></div>
        <div class="gmeta"><span>${NL.esc(i.vendor || 'No vendor')}</span><span>${Math.round(i.n[0])} kcal/100g</span></div>
        <div class="port out" data-port title="Drag to connect"></div></div>`;
    }
    const c = calc[n.id], ins = inputsOf(n.id);
    const rows = ins.map(e => {
      const f = node(e.from); const sub = f.kind !== 'ing';
      return `<div class="grow ${sub ? 'sub' : ''}" data-src="${f.id}"><span class="dot"></span>
        <span class="rn" title="${NL.esc(nodeName(f))}">${sub ? '⚗︎ ' : ''}${NL.esc(nodeName(f))}</span>
        <input class="num" inputmode="decimal" data-fk="amt-${e.id}" data-amt="${e.id}" value="${e.amount}"><span class="u">g</span>
        <span class="p">${NL.pct(+e.amount || 0, c.batch)}</span>
        <button class="x" data-del-edge="${e.id}" title="Remove from ${NL.esc(n.name)}">×</button></div>`;
    }).join('') || `<div class="gempty">Drop ingredients here…</div>`;
    const yl = +n.yieldLoss || 0;
    const foot = n.kind === 'final'
      ? `<span>Per portion</span><b>${NL.fmt(c.yielded)} g · ${Math.round(c.perG[0] * c.yielded)} kcal</b>`
      : `<span>Batch <b>${NL.fmt(c.batch)} g</b>${yl ? ` → ${NL.fmt(c.yielded)} g` : ''}</span><span>${yl ? `−${yl}% loss · ${NL.yieldPct(yl)}% yield` : 'no loss'}</span>`;
    return `<div class="gnode ${cls}" data-id="${n.id}" style="${pos}">
      <div class="ghead" data-drag><span class="gic">${n.kind === 'final' ? '★' : '⚗︎'}</span>
        <span class="gtitle" title="${NL.esc(n.name)}">${NL.esc(n.name)}</span><span class="gkind">${n.kind === 'final' ? 'Final' : 'Sub-assembly'}</span></div>
      <div class="gbody">${rows}</div>
      <div class="gadd"><button data-add="${n.id}">+ Add ingredient / sub-assembly</button></div>
      <div class="gfoot">${foot}</div>
      ${n.kind === 'asm' ? '<div class="port out" data-port title="Drag to connect into another assembly"></div>' : ''}</div>`;
  }

  function renderEdges(hl, dimming) {
    edgesEl.innerHTML = S.edges.map(e => {
      const f = node(e.from), t = node(e.to); if (!f || !t) return '';
      const d = curve(outPt(f), inPt(e));
      const on = hl && hl.has(e.from) && hl.has(e.to);
      const cls = ['edge', f.kind !== 'ing' ? 'from-asm' : '', on ? 'hl' : '', dimming && !on ? 'dim' : '', sel?.t === 'edge' && sel.id === e.id ? 'sel' : ''].join(' ');
      return `<path class="${cls}" d="${d}"/><path class="edge-hit" data-edge="${e.id}" d="${d}"/>`;
    }).join('') + '<path class="edge temp" id="tempEdge" d=""/>';
  }

  // ---------- inspector ----------
  const GUIDE = `<div class="guide"><b>Building from scratch</b><ol>
    <li>Name your recipe below.</li>
    <li>Drag raw ingredients from the left panel <b>onto the ★ final node</b>, or click its <b>+ Add ingredient</b>.</li>
    <li>Need a sub-assembly (a sauce, a broth)? Drag <b>Sub-assembly</b> onto the canvas, add ingredients to it, then drag its <b>right dot</b> into the final node.</li>
    <li>Type grams on each row. Batch weight, % and nutrition update as you type.</li></ol></div>`;
  function nutriRows(perG, grams) {
    return NL.NUTRIENTS.map((n, i) => `<tr><td>${n.label}</td><td class="r">${NL.fmt(perG[i] * grams, n.unit === 'mg' || !n.unit ? 0 : 1)} ${n.unit || 'kcal'}</td></tr>`).join('');
  }
  function renderInspector() {
    const n = sel?.t === 'node' ? node(sel.id) : null;
    if (!n) {
      const f = finalNode();
      insp.innerHTML = (!inputsOf(f.id).length ? GUIDE : '') + `
        ${sel?.t === 'edge' ? `<div class="in-hint">Connection selected — press <span class="kbd">Del</span> to remove it.</div>` : `<div class="in-hint">Click any node to inspect it. The inputs that feed it light up in blue.</div>`}
        <div class="in-kicker">Recipe</div><div class="in-title">${NL.esc(f.name)}</div>
        <div class="in-sec">Structure</div>
        <div>${S.nodes.filter(x => x.kind !== 'ing').map(x => `<span class="chip" data-goto="${x.id}">${x.kind === 'final' ? '★' : '⚗︎'} ${NL.esc(x.name)}</span>`).join('')}</div>
        <div class="in-sec">Nutrition per portion</div>${NL.labelHTML(model, calc, f.id)}`;
      return;
    }
    if (n.kind === 'ing') {
      const i = NL.ingMap[n.ref];
      insp.innerHTML = `<div class="in-kicker">Raw ingredient</div><div class="in-title">${NL.esc(i.name)}</div>
        <div class="in-grid"><span>Category</span><span>${i.cat}</span><span>Vendor</span><span>${NL.esc(i.vendor || '— none —')}</span></div>
        <div class="in-sec">Used in</div>
        ${outputsOf(n.id).map(e => `<span class="chip" data-goto="${e.to}">${NL.esc(node(e.to).name)} · ${e.amount} g</span>`).join('') || '<span class="faint">Not connected yet — drag from its right dot to an assembly.</span>'}
        <div class="in-sec">Nutrition per 100 g</div><table class="in-tbl">${nutriRows(i.n.map(v => v / 100), 100)}</table>
        <div style="margin-top:14px"><button class="btn sm" data-delnode>Delete node</button></div>`;
      return;
    }
    const c = calc[n.id], ins = inputsOf(n.id);
    insp.innerHTML = (n.kind === 'final' && !ins.length ? GUIDE : '') + `<div class="in-kicker">${n.kind === 'final' ? 'Final product (per portion)' : 'Sub-assembly'}</div>
      <input class="txt in-title" data-fk="name" data-field="name" value="${NL.esc(n.name)}">
      <div class="in-row"><label>Yield loss</label><input class="num" inputmode="decimal" data-fk="yl" data-field="yieldLoss" value="${n.yieldLoss || 0}"> %</div>
      <div class="in-row"><label>Yield</label><input class="num" inputmode="decimal" data-fk="yp" data-field="yieldPct" value="${NL.yieldPct(n.yieldLoss)}"> % <span class="faint">= 100 − loss</span></div>
      <div class="in-grid"><span>Batch weight</span><b>${NL.fmt(c.batch)} g</b><span>After yield loss</span><b>${NL.fmt(c.yielded)} g</b>
        <span>Calories</span><b>${Math.round(c.perG[0] * 100)} kcal / 100 g</b></div>
      <div class="in-sec">Inputs</div>
      <table class="in-tbl"><tr><th>Name</th><th class="r">g</th><th class="r">%</th></tr>
      ${ins.map(e => `<tr class="link" data-goto="${e.from}"><td>${node(e.from).kind !== 'ing' ? '⚗︎ ' : ''}${NL.esc(nodeName(node(e.from)))}</td><td class="r">${e.amount}</td><td class="r">${NL.pct(+e.amount || 0, c.batch)}</td></tr>`).join('')}
      </table>
      ${n.kind === 'asm' ? `<div class="in-sec">Used in</div>${outputsOf(n.id).map(e => `<span class="chip" data-goto="${e.to}">${NL.esc(node(e.to).name)} · ${e.amount} g</span>`).join('') || '<span class="faint">Not used yet — drag from its right dot into the final product.</span>'}` : ''}
      <div class="in-sec">Notes (procedure · heating · tasting)</div>
      <textarea class="txt" data-fk="notes" data-field="notes" placeholder="Add notes…">${NL.esc(n.notes || '')}</textarea>
      ${n.kind === 'final' ? `<div class="in-sec">Nutrition per portion</div>${NL.labelHTML(model, calc, n.id)}` : `<div class="in-sec">Nutrition per 100 g</div><table class="in-tbl">${nutriRows(c.perG, 100)}</table>
      <div style="margin-top:14px"><button class="btn sm" data-delnode>Delete sub-assembly</button></div>`}`;
  }

  // ---------- mutations ----------
  function select(s) { sel = s; render(); }
  function commit() { hist.commit(); }
  function removeNode(id) {
    const n = node(id); if (!n || n.kind === 'final') return;
    S.nodes = S.nodes.filter(x => x.id !== id);
    S.edges = S.edges.filter(e => e.from !== id && e.to !== id);
    sel = null; render(); commit();
  }
  function removeEdge(id) { S.edges = S.edges.filter(e => e.id !== id); if (sel?.id === id) sel = null; render(); commit(); }
  function focusAmt(eid) {
    const i = document.querySelector(`[data-amt="${eid}"]`);
    if (i) { i.focus(); i.select(); }
  }
  function placeLeft(t, kind) {
    const srcs = inputsOf(t.id).map(e => node(e.from)).filter(s => s.x < t.x);
    const y = srcs.length ? Math.max(...srcs.map(s => s.y + nodeH(s))) + 18 : t.y;
    return { x: t.x - (kind === 'ing' ? WID.ing + 70 : COLW), y };
  }
  function connect(from, to, amount = 0) {
    if (wouldCycle(from, to)) { NL.toast('That would create a loop'); return null; }
    if (S.edges.some(e => e.from === from && e.to === to)) { NL.toast('Already connected'); return null; }
    const e = { id: NL.uid('e'), from, to, amount };
    S.edges.push(e); return e;
  }
  function addInput(tid, value) {
    const t = node(tid); let src;
    if (value.startsWith('ing:')) { src = { id: NL.uid('i'), kind: 'ing', ref: value.slice(4), ...placeLeft(t, 'ing') }; S.nodes.push(src); }
    else if (value === 'new-asm') { src = { id: NL.uid('a'), kind: 'asm', name: 'New sub-assembly', yieldLoss: 0, notes: '', ...placeLeft(t, 'asm') }; S.nodes.push(src); }
    else src = node(value.slice(4));
    const e = connect(src.id, tid);
    if (!e) { if (value.startsWith('ing:') || value === 'new-asm') S.nodes = S.nodes.filter(n => n !== src); return; }
    if (value === 'new-asm') sel = { t: 'node', id: src.id };
    render(); commit(); focusAmt(e.id);
    if (value === 'new-asm') NL.toast('Sub-assembly created — rename it in the right panel');
  }
  function openAddPicker(tid, anchor) {
    const r = anchor.getBoundingClientRect();
    const subs = S.nodes.filter(n => n.kind === 'asm' && !wouldCycle(n.id, tid) && !S.edges.some(e => e.from === n.id && e.to === tid));
    NL.picker({
      x: r.left, y: r.bottom + 4,
      placeholder: 'Search ingredients or sub-assemblies…',
      groups: [
        { label: 'Create', items: [{ value: 'new-asm', label: '＋ New sub-assembly', color: '#7c5cff', always: true }] },
        { label: 'Sub-assemblies on canvas', items: subs.map(n => ({ value: 'asm:' + n.id, label: n.name, color: '#7c5cff' })) },
        ...NL.ingredientGroups(),
      ],
      onPick: v => addInput(tid, v),
    });
  }

  // ---------- interactions ----------
  const vp = NL.viewport(vpEl, worldEl, {
    isBackground: t => t === vpEl || t === worldEl || t === nodesEl || t === edgesEl,
    onChange: v => { $('#zl').textContent = Math.round(v.s * 100) + '%'; },
  });
  vpEl.addEventListener('click', e => {
    if ((e.target === vpEl || e.target === worldEl || e.target === nodesEl || e.target === edgesEl) && !vp.lastPanMoved && sel) select(null);
  });

  nodesEl.addEventListener('pointerdown', e => {
    const nEl = e.target.closest('.gnode'); if (!nEl || e.button !== 0) return;
    const id = nEl.dataset.id;
    if (e.target.closest('[data-port]')) return startConnect(e, id);
    if (e.target.closest('input,button,textarea')) return;
    e.preventDefault();
    const n = node(id);
    if (sel?.id !== id) select({ t: 'node', id });
    const start = vp.toWorld(e.clientX, e.clientY), ox = n.x, oy = n.y; let moved = false;
    const mv = ev => {
      const p = vp.toWorld(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
      moved = true; n.x = ox + p.x - start.x; n.y = oy + p.y - start.y;
      const el = nodesEl.querySelector(`[data-id="${id}"]`); if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      const hl = new Set([sel.id, ...upstream(sel.id)]); renderEdges(hl, node(sel.id).kind !== 'final');
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) commit(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  function startConnect(e, fromId) {
    e.preventDefault(); e.stopPropagation();
    const f = node(fromId), a = outPt(f), temp = $('#tempEdge');
    let target = null;
    const mark = t => { nodesEl.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); if (t) t.classList.add('drop'); };
    const mv = ev => {
      const p = vp.toWorld(ev.clientX, ev.clientY);
      temp.setAttribute('d', curve(a, p));
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.gnode');
      const tn = el && node(el.dataset.id);
      target = tn && tn.kind !== 'ing' && !wouldCycle(fromId, tn.id) ? tn : null;
      mark(target ? el : null);
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      temp.setAttribute('d', ''); mark(null);
      if (!target) return;
      const ed = connect(fromId, target.id);
      if (ed) { render(); commit(); focusAmt(ed.id); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }

  edgesEl.addEventListener('pointerdown', e => {
    const id = e.target.dataset?.edge; if (!id) return;
    e.stopPropagation(); select({ t: 'edge', id });
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.amt) { const ed = S.edges.find(x => x.id === t.dataset.amt); if (ed) { ed.amount = t.value === '' ? 0 : +t.value || 0; renderKeep(); } }
    else if (t.dataset.field && sel?.t === 'node') {
      const n = node(sel.id); const f = t.dataset.field;
      if (f === 'yieldPct') { if (t.value !== '') n.yieldLoss = NL.lossFromYield(t.value); }
      else n[f] = f === 'yieldLoss' ? (+t.value || 0) : t.value;
      renderKeep();
    }
  });
  // inputs are re-rendered while typing, so 'change' never fires: commit shortly after typing stops, and on blur
  let typingT;
  document.addEventListener('input', e => { if (e.target.dataset.amt || e.target.dataset.field) { clearTimeout(typingT); typingT = setTimeout(commit, 600); } });
  document.addEventListener('focusout', e => { if (e.target.dataset.amt || e.target.dataset.field) commit(); });
  document.addEventListener('keydown', e => {
    if (e.target.dataset?.amt && e.key === 'Enter') e.target.blur();
  });

  document.addEventListener('click', e => {
    const t = e.target;
    const del = t.closest('[data-del-edge]'); if (del) return removeEdge(del.dataset.delEdge);
    const add = t.closest('[data-add]'); if (add) return openAddPicker(add.dataset.add, add);
    const go = t.closest('[data-goto]');
    if (go) { const n = node(go.dataset.goto); select({ t: 'node', id: n.id }); vp.centerOn(n.x + WID[n.kind] / 2, n.y + nodeH(n) / 2); return; }
    if (t.closest('[data-delnode]') && sel) return removeNode(sel.id);
  });

  // palette
  function drawPalette() {
    const q = $('#palSearch').value.trim().toLowerCase();
    $('#palList').innerHTML = NL.CATEGORIES.map(cat => {
      const items = NL.INGREDIENTS.filter(i => i.cat === cat && (!q || i.name.toLowerCase().includes(q)));
      if (!items.length) return '';
      return `<div class="pal-cat"><i style="background:${NL.CAT_COLORS[cat]}"></i>${cat}</div>` +
        items.map(i => `<div class="pal-item" draggable="true" data-ing="${i.id}" title="Drag onto the canvas or onto an assembly"><span class="nm">${NL.esc(i.name)}</span><span class="faint">${Math.round(i.n[0])}</span></div>`).join('');
    }).join('');
  }
  $('#palSearch').addEventListener('input', drawPalette);
  document.querySelector('.palette').addEventListener('dragstart', e => {
    const it = e.target.closest('.pal-item'); if (!it) return;
    e.dataTransfer.setData('text/plain', it.dataset.ing ? 'ing:' + it.dataset.ing : 'new-asm');
    e.dataTransfer.effectAllowed = 'copy';
  });
  vpEl.addEventListener('dragover', e => {
    e.preventDefault();
    const el = e.target.closest?.('.gnode');
    nodesEl.querySelectorAll('.drop').forEach(x => x !== el && x.classList.remove('drop'));
    if (el && node(el.dataset.id).kind !== 'ing') el.classList.add('drop');
  });
  vpEl.addEventListener('dragleave', e => { if (e.target === vpEl) nodesEl.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
  vpEl.addEventListener('drop', e => {
    e.preventDefault();
    nodesEl.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const v = e.dataTransfer.getData('text/plain'); if (!v) return;
    const el = e.target.closest?.('.gnode'), tn = el && node(el.dataset.id);
    if (tn && tn.kind !== 'ing') return addInput(tn.id, v);
    const p = vp.toWorld(e.clientX, e.clientY);
    const kind = v === 'new-asm' ? 'asm' : 'ing';
    const n = kind === 'asm'
      ? { id: NL.uid('a'), kind, name: 'New sub-assembly', yieldLoss: 0, notes: '', x: p.x - WID.asm / 2, y: p.y - 20 }
      : { id: NL.uid('i'), kind, ref: v.slice(4), x: p.x - WID.ing / 2, y: p.y - 20 };
    S.nodes.push(n); sel = { t: 'node', id: n.id }; render(); commit();
  });

  document.addEventListener('keydown', e => {
    if (NL.isTyping()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); sel.t === 'node' ? removeNode(sel.id) : removeEdge(sel.id); }
    else if (e.key === 'f' || e.key === 'F') vp.fit(bounds());
    else if (e.key === 'Escape') select(null);
  });

  $('#undo').onclick = () => hist.undo();
  $('#redo').onclick = () => hist.redo();
  $('#fit').onclick = () => vp.fit(bounds());
  $('#arrange').onclick = () => { arrange(); render(); commit(); vp.fit(bounds()); };
  $('#zin').onclick = () => vp.zoom(1.2);
  $('#zout').onclick = () => vp.zoom(1 / 1.2);
  $('#newVer').onclick = async () => {
    const v = await NL.prompt('Version name (shown on the tab):', nameOf(S) + ' v' + (wb.count() + 1));
    if (!v) return;
    wb.add(JSON.parse(JSON.stringify(S)), v);
    NL.toast('Version "' + v + '" created');
  };
  $('#newRecipe').onclick = () => newRecipe();
  $('#newIng').onclick = async () => { const i = await NL.ingredientForm(); if (i) NL.toast(`"${i.name}" added. Drag it from the list.`); };
  document.addEventListener('nl:ingredients', drawPalette);

  // ---------- recipes as tabs (workbook) ----------
  const nameOf = st => st.nodes.find(n => n.kind === 'final')?.name;
  const blank = () => ({ nodes: [{ id: 'final', kind: 'final', name: 'Untitled recipe ' + (wb.count() + 1), yieldLoss: 0, notes: '', x: 0, y: 0 }], edges: [] });
  function newRecipe() { wb.add(blank()); }
  window.NL_resetSample = () => {
    const cur = S, st = fromModel(NL.SAMPLE); S = cur; // fromModel works on the global S
    wb.add(st); NL.toast('Sample recipe opened in a new tab');
  };

  function openState(state) {
    S = state; sel = null;
    hist = NL.history(() => wb.save(S), () => S, s => { S = s; sel = null; render(); });
    const empty = !S.edges.length && S.nodes.length === 1;
    if (empty) sel = { t: 'node', id: finalNode().id };
    render();
    if (empty) {
      const r = vpEl.getBoundingClientRect(), f = finalNode();
      vp.v.s = 1; vp.v.x = r.width * 0.62 - f.x; vp.v.y = 80 - f.y; vp.apply(); // final on the right, room on the left for inputs
      const t = document.querySelector('[data-field="name"]'); t.focus(); t.select();
    } else vp.fit(bounds(), 50, { min: 0.72, align: 'right' });
  }

  // ---------- boot ----------
  const wb = NL.workbook({
    key: 'nl_graph_book_v1', legacyKey: LS,
    sample: () => fromModel(NL.SAMPLE),
    nameOf,
    beforeSwitch: () => { clearTimeout(typingT); commit(); },
    onSwitch: openState,
    onNew: newRecipe,
  });
  drawPalette();
  openState(wb.current());
})();
