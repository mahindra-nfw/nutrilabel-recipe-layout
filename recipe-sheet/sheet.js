// Layout C — Modernist Cuisine–style recipe sheets (ingredient groups beside their procedure steps),
// placed on a canvas with connectors from each sub-recipe row to its own sheet.
(function () {
  const SHEETW = 900, GAPX = 160, GAPY = 50;
  const COLORS = ['#2f6fed', '#d9480f', '#7c3aed', '#0f9d58', '#c2185b', '#00838f', '#f59f00', '#5c6bc0'];
  const ROOT_COLOR = '#c8453a';
  const $ = s => document.querySelector(s);
  const vpEl = $('#vp'), worldEl = $('#world'), linksEl = $('#links'), sheetsEl = $('#sheets');

  let S, calc, model, hist, mode = 'edit', rd = true;

  // ---------- sample (Spicy Miso Ramen, written in MC sheet format) ----------
  const G = (items, steps) => ({ items: items.map(([ref, amount, volume = '', extra = {}]) => ({ ref, amount, volume, ...extra })), steps });
  const SAMPLE = {
    root: 'final',
    asm: {
      final: {
        name: 'Spicy Miso Ramen', servings: 'one frozen portion', time: '15 minutes assembly, after the components below are made',
        storage: 'keeps 9 months frozen at −18 °C', difficulty: 'moderate',
        special: 'Spicy Miso Broth, Pork Chashu Pouch and Chicken Roll (see sheets); blast freezer', yieldLoss: 0,
        description: 'Our core retail ramen. The broth is deposited hot over portioned fresh noodles, then topped with sliced chashu and chicken roll before sealing and blast freezing. Reheats from frozen in 6 minutes in a pot of simmering water.',
        groups: [
          G([['ing:ramen_noodles', 140, '1 nest', { base: true }]], ['Portion the noodles into the tray and loosen the strands.']),
          G([['asm:broth', 210, '¾ cup']], ['Deposit the broth over the noodles at no less than 85 °C.']),
          G([['asm:pork', 46.5, '3 slices'], ['asm:chicken_roll', 20, '2 pieces']], ['Arrange the pork and chicken roll on top.', 'Seal, then blast freeze to a core temperature of −18 °C within 90 minutes.']),
        ],
      },
      broth: {
        name: 'Spicy Miso Broth', servings: 'about five portions', time: '30 minutes overall', storage: 'use within 3 days refrigerated', difficulty: 'easy',
        special: 'Spicy Miso Tare (see sheet); fine sieve', yieldLoss: 3, description: '',
        groups: [
          G([['ing:water', 1000, '4¼ cups', { base: true }], ['ing:onion_sweet', 20, '3 Tbsp']], ['Bring the water and onion to a simmer.']),
          G([['asm:tare', 125, '½ cup'], ['ing:dashi_powder', 2, '½ tsp'], ['ing:yeast_extract', 1.56, '½ tsp'], ['ing:ajitop', 1.56, '½ tsp']],
            ['Whisk in the tare and dry seasonings until fully dissolved.', 'Simmer for 10 minutes, then strain through a fine sieve.', 'Check Brix (target 6.5) and salt (target 1.4%).']),
        ],
      },
      tare: {
        name: 'Spicy Miso Tare', servings: '132 g / about ½ cup', time: '10 minutes', storage: 'keeps 2 weeks refrigerated in an airtight container', difficulty: 'easy',
        special: 'blender', yieldLoss: 0, description: '',
        groups: [
          G([['ing:white_miso', 100, '⅓ cup', { base: true }], ['ing:ultra_spicy_sauce', 19.5, '1½ Tbsp'], ['ing:red_miso_powder', 2.39, '1 tsp'], ['ing:topping_spicy_miso', 0.5, 'pinch', { optional: true }]],
            ['Stir together the miso, spicy sauce and miso powder.']),
          G([['ing:garlic', 5, '1 clove'], ['ing:sesame_oil', 5, '1 tsp']],
            ['Sweat the garlic in the sesame oil over low heat until fragrant, about 2 minutes.', 'Blend with the miso mixture until smooth.']),
        ],
      },
      pork: {
        name: 'Pork Chashu Pouch', servings: 'one pouch (45 g)', time: '2½ hours overall, including 2 hours braising', storage: 'keeps 5 days refrigerated; 9 months frozen', difficulty: 'moderate',
        special: 'butcher twine', yieldLoss: 12, description: '',
        groups: [
          G([['ing:pork_belly', 40, '', { base: true }]], ['Roll the pork belly tightly and tie with twine.']),
          G([['ing:soy_sauce', 4, '¾ tsp'], ['ing:mirin', 2, '½ tsp'], ['ing:onion_sweet', 5, '1 Tbsp']], ['Braise in the soy, mirin and onion at 90 °C for 2 hours.']),
          G([['ing:potassium_sorbate', 0.1, '']], ['Chill, slice 5 mm thick, and pouch with the potassium sorbate.']),
        ],
      },
      chicken_roll: {
        name: 'Chicken Roll', servings: 'one portion (20 g)', time: '10 minutes', storage: 'use within 2 days refrigerated', difficulty: 'easy',
        special: '', yieldLoss: 0, description: '',
        groups: [G([['ing:chicken_breast_cooked', 15, '', { base: true }], ['ing:fried_shallots', 5, '1 Tbsp']], ['Roll the chicken around the fried shallots and slice into 2 cm pieces.'])],
      },
    },
  };

  // ---------- model helpers ----------
  const R = id => S.asm[id];
  const allItems = r => r.groups.flatMap(g => g.items);
  const subId = ref => ref.startsWith('asm:') ? ref.slice(4) : null;
  const toModel = () => ({ root: S.root, asm: Object.fromEntries(Object.entries(S.asm).map(([id, r]) => [id, { name: r.name, yieldLoss: r.yieldLoss, items: allItems(r) }])) });
  const parentsOf = id => Object.entries(S.asm).flatMap(([pid, r]) => allItems(r).filter(it => it.ref === 'asm:' + id).map(it => ({ pid, amount: it.amount })));
  function descendants(id, acc = new Set()) {
    for (const it of allItems(R(id))) { const s = subId(it.ref); if (s && R(s) && !acc.has(s)) { acc.add(s); descendants(s, acc); } }
    return acc;
  }
  const wouldCycle = (parent, child) => parent === child || descendants(child).has(parent);
  const colorOf = id => id === S.root ? ROOT_COLOR : (R(id)?.color || '#888');
  const blankRecipe = name => ({ name, servings: '', time: '', storage: '', difficulty: '', special: '', description: '', yieldLoss: 0, groups: [{ items: [], steps: [''] }], x: 0, y: 0 });
  function nextColor() { const used = new Set(Object.values(S.asm).map(r => r.color)); return COLORS.find(c => !used.has(c)) || COLORS[Object.keys(S.asm).length % COLORS.length]; }
  const key = (rid, gi, ii) => `${rid}:${gi}:${ii}`;
  const parseKey = k => { const [rid, gi, ii] = k.split(':'); return { r: R(rid), rid, gi: +gi, ii: +ii }; };

  // MC-style number formatting
  function fmtW(g) {
    g = +g || 0;
    const main = g >= 1000 ? NL.fmt(g / 1000, 2) + ' kg' : NL.fmt(g, 2) + ' g';
    return g >= 450 ? `${main} / ${NL.fmt(g / 453.6, 1)} lb` : main;
  }
  const fmtScale = v => !isFinite(v) ? '—' : (v >= 10 ? Math.round(v) : NL.fmt(v, 1)) + '%';
  function baseAmount(r) {
    const items = allItems(r);
    const b = items.find(it => it.base) || items.find(it => +it.amount > 0);
    return b ? +b.amount || 0 : 0;
  }

  // ---------- rendering ----------
  function render() {
    model = toModel(); calc = NL.calc(model);
    document.body.classList.toggle('preview', mode === 'preview');
    document.body.classList.toggle('rd-off', !rd);
    sheetsEl.innerHTML = Object.keys(S.asm).map(sheetHTML).join('');
    sheetsEl.querySelectorAll('textarea').forEach(grow);
    drawLinks(); drawTree();
    $('#recipeTitle').textContent = R(S.root).name;
    wb.live(S);
  }
  const renderKeep = () => NL.keepFocus(render);
  function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

  function sheetHTML(id) {
    const r = R(id), c = calc[id], isRoot = id === S.root, edit = mode === 'edit', ro = edit ? '' : 'readonly';
    const base = baseAmount(r);
    const field = (f, ph, extra = '') => `<input data-f="${id}:${f}" data-fk="${id}-${f}" value="${NL.esc(r[f] || '')}" placeholder="${ph}" ${ro} ${extra}>`;
    const row = (label, html, empty) => `<div class="k ${empty ? 'empty' : ''}">${label}:</div><div class="v ${empty ? 'empty' : ''}">${html}</div>`;
    const parents = parentsOf(id);
    let stepNo = 1;

    const groups = r.groups.map((g, gi) => {
      const rows = Math.max(g.items.length, 1) + (edit ? 1 : 0);
      const steps = g.steps.map((s, si) => `<li><span class="cn">${stepNo++}</span>
        <textarea rows="1" data-step="${id}:${gi}:${si}" data-fk="st-${id}-${gi}-${si}" placeholder="Describe this step…" ${ro}>${NL.esc(s)}</textarea>
        <button class="x edit-only" data-delstep="${id}:${gi}:${si}" title="Remove step">×</button></li>`).join('');
      const proc = `<td class="c-p" rowspan="${rows}"><ol class="steps">${steps}</ol><button class="lnk edit-only" data-addstep="${id}:${gi}">+ Step</button></td>`;
      const items = g.items.map((it, ii) => itemRow(id, r, c, base, it, gi, ii, ii === 0 ? proc : '')).join('')
        || `<tr class="it-empty"><td colspan="4">${edit ? 'No ingredients in this group yet' : ''}</td>${proc}</tr>`;
      const add = edit ? `<tr class="add-row"><td colspan="4">
          <button data-addi="${id}:${gi}">+ Ingredient</button><button class="s" data-newsub="${id}:${gi}">＋ New sub-recipe</button>
          ${r.groups.length > 1 ? `<button class="danger" data-delgrp="${id}:${gi}">Delete group</button>` : ''}</td></tr>` : '';
      return `<tbody class="grp">${items}${add}</tbody>`;
    }).join('');

    const per100 = i => c.perG[i] * 100;
    return `<div class="sheet ${!isRoot && !parents.length ? 'orphan' : ''}" data-id="${id}" style="left:${r.x}px;top:${r.y}px;--sc:${colorOf(id)}">
      ${isRoot ? '' : `<span class="port edit-only" data-port="${id}" title="Drag onto the recipe that uses this sheet"></span>`}
      <div class="s-head" data-drag>
        <span class="s-kicker">${isRoot ? 'Final recipe' : 'Sub-recipe'}</span>
        <input class="s-title" data-f="${id}:name" data-fk="${id}-name" value="${NL.esc(r.name)}" ${ro}>
        ${isRoot ? '' : `<button class="s-del edit-only" data-delrec="${id}" title="Delete this sub-recipe">🗑 Delete</button>`}
      </div>
      <div class="meta">
        ${row('Yield', `${field('servings', 'e.g. four servings', `class="yield-in" style="width:${Math.max((r.servings || '').length + 2, 16)}ch"`)}<span class="auto">(${fmtW(c.yielded)})</span>`, false)}
        ${row('Time estimate', field('time', 'e.g. 30 minutes overall'), !r.time)}
        ${row('Storage notes', field('storage', 'e.g. keeps 2 weeks refrigerated'), !r.storage)}
        ${row('Level of difficulty', field('difficulty', 'easy / moderate / advanced', 'list="diffList"'), !r.difficulty)}
        ${row('Special requirements', field('special', 'equipment, sub-recipes, optional items'), !r.special)}
        ${isRoot ? '' : row('Used in', parents.length ? parents.map(p => `<a data-goto="${p.pid}">${NL.esc(R(p.pid).name)}</a> (${NL.fmt(p.amount, 2)} g)`).join(', ') : '<span class="faint">not used in any recipe yet. Drag the ● on the left onto a recipe to link it</span>', false)}
      </div>
      <textarea class="desc ${r.description ? '' : 'empty'}" rows="1" data-f="${id}:description" data-fk="${id}-description" placeholder="Short description, serving ideas, why it works… (optional)" ${ro}>${NL.esc(r.description || '')}</textarea>
      <table class="mc">
        <thead><tr><th>Ingredient</th><th>Weight</th><th>Volume</th><th>Scaling</th><th>Procedure</th></tr></thead>
        ${groups}
      </table>
      <button class="lnk addgrp edit-only" data-addgrp="${id}">+ New step</button>
      <div class="rd rd-only">
        <div style="flex:1">
          <div class="rd-h">R&amp;D data</div>
          <div class="rd-grid">
            <div><span>Batch weight</span><b>${fmtW(c.batch)}</b></div>
            <div><span>Yield loss · Yield</span><b><input inputmode="decimal" data-yl="${id}" data-fk="yl-${id}" value="${r.yieldLoss || 0}" ${ro}> % · <input inputmode="decimal" data-yp="${id}" data-fk="yp-${id}" value="${NL.yieldPct(r.yieldLoss)}" ${ro}> %</b></div>
            <div><span>Final yield</span><b>${fmtW(c.yielded)}</b></div>
            <div><span>Energy / 100 g</span><b>${Math.round(per100(0))} kcal</b></div>
            <div><span>Sodium / 100 g</span><b>${Math.round(per100(4))} mg</b></div>
            <div><span>Protein / 100 g</span><b>${NL.fmt(per100(8), 1)} g</b></div>
            ${isRoot ? `<div><span>Energy / portion</span><b>${Math.round(c.perG[0] * c.yielded)} kcal</b></div>
              <div><span>Ingredients</span><b>${allItems(r).length} direct · ${NL.flatten(model, calc, id).length} raw</b></div>` : ''}
          </div>
        </div>
        ${isRoot ? `<div class="rd-nut">${NL.labelHTML(model, calc, id)}</div>` : ''}
      </div>
    </div>`;
  }

  function itemRow(rid, r, c, base, it, gi, ii, proc) {
    const k = key(rid, gi, ii), sid = subId(it.ref), edit = mode === 'edit', ro = edit ? '' : 'readonly';
    let name, vendor = '';
    if (sid && R(sid)) {
      name = `<a class="sublink" data-goto="${sid}" style="--sc:${colorOf(sid)}">${NL.esc(R(sid).name)}</a> <span class="see">(${it.optional ? 'optional, ' : ''}see sheet →)</span>`;
    } else {
      const ing = NL.ingMap[it.ref.slice(4)];
      name = NL.esc(ing?.name || it.ref) + (it.optional ? ' <span class="see">(optional)</span>' : '');
      vendor = ing?.vendor || 'no vendor';
    }
    const w = edit ? `<input inputmode="decimal" data-amt="${k}" data-fk="amt-${k}" value="${it.amount}"><span class="u">g</span>` : fmtW(it.amount);
    const vol = `<input data-vol="${k}" data-fk="vol-${k}" value="${NL.esc(it.volume || '')}" placeholder="${edit ? '—' : ''}" ${ro}>`;
    return `<tr class="it ${sid ? 'sub' : ''}" ${sid ? `data-sub="${sid}" style="--sc:${colorOf(sid)}"` : ''}>
      <td class="c-i">${name}${vendor ? `<div class="vend rd-only">${NL.esc(vendor)}</div>` : ''}
        <span class="tools edit-only"><button class="${it.optional ? 'on' : ''}" data-opt="${k}" title="Mark as optional">opt</button><button data-up="${k}" title="Move up">↑</button><button data-down="${k}" title="Move down">↓</button><button class="x" data-del="${k}" title="Remove">×</button></span></td>
      <td class="c-w">${w}</td>
      <td class="c-v">${vol}</td>
      <td class="c-s"><span class="sc ${it.base ? 'base' : ''}" data-base="${k}" title="Click to make this the 100% base">${base > 0 ? fmtScale(it.amount / base * 100) : '—'}</span>
        <div class="pb rd-only">${NL.pct(+it.amount || 0, c.batch)} of batch</div></td>
      ${proc}</tr>`;
  }

  function drawLinks() {
    let out = '';
    for (const [pid, r] of Object.entries(S.asm)) {
      const pEl = sheetsEl.querySelector(`[data-id="${pid}"]`); if (!pEl) continue;
      const pr = pEl.getBoundingClientRect(), s = pr.width / pEl.offsetWidth || 1;
      const seen = new Set();
      for (const it of allItems(r)) {
        const sid = subId(it.ref); if (!sid || !R(sid) || seen.has(sid)) continue; seen.add(sid);
        const row = pEl.querySelector(`tr[data-sub="${sid}"]`); if (!row) continue;
        const rr = row.getBoundingClientRect();
        const x1 = r.x + pEl.offsetWidth, y1 = r.y + (rr.top - pr.top + 14) / s;
        const ch = R(sid), x2 = ch.x, y2 = ch.y + 26, col = colorOf(sid);
        const dx = Math.max(70, Math.abs(x2 - x1) / 2);
        out += `<path class="link" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}" stroke="${col}"/>
          <circle class="link-dot" cx="${x1}" cy="${y1}" r="5" fill="${col}"/><circle class="link-dot" cx="${x2}" cy="${y2}" r="5" fill="${col}"/>`;
      }
    }
    linksEl.innerHTML = out;
  }

  function drawTree() {
    const seen = new Set();
    const item = (id, depth) => {
      const r = R(id); seen.add(id);
      const kids = [...new Set(allItems(r).map(it => subId(it.ref)).filter(s => s && R(s)))];
      return `<div class="tr-item ${id === S.root ? 'root' : ''}" style="padding-left:${6 + depth * 14}px" data-goto="${id}">
        <span class="sw" style="background:${colorOf(id)}"></span><span class="nm">${NL.esc(r.name)}</span><span class="faint">${r.groups.length} grp</span></div>` +
        (depth < 12 ? kids.map(k => item(k, depth + 1)).join('') : '');
    };
    let html = item(S.root, 0);
    const orphans = Object.keys(S.asm).filter(id => !seen.has(id));
    if (orphans.length) html += `<div class="tr-sep">Not used in the recipe</div>` + orphans.map(id => item(id, 0)).join('');
    $('#tree').innerHTML = html;
  }

  // ---------- layout ----------
  const sheetEl = id => sheetsEl.querySelector(`[data-id="${id}"]`);
  function arrange() {
    render();
    const H = {}; sheetsEl.querySelectorAll('.sheet').forEach(el => { H[el.dataset.id] = el.offsetHeight; });
    const placed = new Set(), colBottom = [];
    const place = (id, d, desired) => {
      if (placed.has(id)) return; placed.add(id);
      const r = R(id);
      r.x = d * (SHEETW + GAPX);
      r.y = Math.max(desired, (colBottom[d] ?? -Infinity) + GAPY);
      colBottom[d] = r.y + H[id];
      const el = sheetEl(id), er = el.getBoundingClientRect(), s = er.width / el.offsetWidth || 1;
      for (const it of allItems(r)) {
        const sid = subId(it.ref); if (!sid || !R(sid)) continue;
        const row = el.querySelector(`tr[data-sub="${sid}"]`);
        place(sid, d + 1, r.y + (row ? (row.getBoundingClientRect().top - er.top) / s : 0) - 20);
      }
    };
    place(S.root, 0, 0);
    let y = Math.max(0, ...colBottom.filter(v => v != null)) + 80;
    for (const id of Object.keys(S.asm)) if (!placed.has(id)) { R(id).x = SHEETW + GAPX; R(id).y = y; y += H[id] + GAPY; }
    render();
  }
  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [id, r] of Object.entries(S.asm)) {
      const h = sheetEl(id)?.offsetHeight || 600;
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + SHEETW); y1 = Math.max(y1, r.y + h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function goto(id) {
    const r = R(id), el = sheetEl(id); if (!r || !el) return;
    const s = Math.max(vp.v.s, 0.75), rc = vpEl.getBoundingClientRect();
    vp.v.s = s; vp.v.x = 40 - r.x * s; vp.v.y = 30 - r.y * s; vp.animate(); vp.apply();
    void rc;
    setTimeout(() => { const e2 = sheetEl(id); e2?.classList.remove('flash'); void e2?.offsetWidth; e2?.classList.add('flash'); }, 150);
  }

  // ---------- mutations ----------
  const commit = () => hist.commit();
  function focusSel(sel) { const i = sheetsEl.querySelector(sel); if (i) { i.focus(); i.select?.(); } }
  function addItem(rid, gi, value) {
    if (value === 'new-sub') return newSub(rid, gi);
    const r = R(rid), g = r.groups[gi];
    if (value.startsWith('asm:') && wouldCycle(rid, value.slice(4))) return NL.toast('That would create a loop');
    g.items.push({ ref: value, amount: 0, volume: '' });
    render(); commit(); focusSel(`[data-amt="${key(rid, gi, g.items.length - 1)}"]`);
  }
  function newSub(rid, gi) {
    const p = R(rid), nid = NL.uid('s'), pe = sheetEl(rid);
    S.asm[nid] = { ...blankRecipe('New sub-recipe'), color: nextColor(), x: p.x + SHEETW + GAPX, y: p.y + (pe ? pe.offsetHeight / 2 : 0) };
    // don't land on top of another sheet
    for (let k = 0; k < 30; k++) {
      const n = S.asm[nid];
      const hit = Object.entries(S.asm).find(([id, a]) => id !== nid && Math.abs(a.x - n.x) < SHEETW && n.y < a.y + (sheetEl(id)?.offsetHeight || 600) && n.y + 400 > a.y);
      if (!hit) break; n.y = hit[1].y + (sheetEl(hit[0])?.offsetHeight || 600) + GAPY;
    }
    p.groups[gi].items.push({ ref: 'asm:' + nid, amount: 0, volume: '' });
    render(); commit(); goto(nid);
    setTimeout(() => focusSel(`[data-f="${nid}:name"]`), 330);
    NL.toast(`Name the sub-recipe, then set its weight in "${p.name}"`);
  }
  function addCard() {
    const nid = NL.uid('s'), rc = vpEl.getBoundingClientRect(), c = vp.toWorld(rc.left + rc.width / 2, rc.top + rc.height / 3);
    S.asm[nid] = { ...blankRecipe('New card'), color: nextColor(), x: Math.round(c.x - SHEETW / 2), y: Math.round(c.y - 80) };
    for (let k = 0; k < 30; k++) {
      const n = S.asm[nid];
      const hit = Object.entries(S.asm).find(([id, a]) => id !== nid && Math.abs(a.x - n.x) < SHEETW && n.y < a.y + (sheetEl(id)?.offsetHeight || 600) && n.y + 400 > a.y);
      if (!hit) break; n.x = hit[1].x + SHEETW + 60;
    }
    render(); commit(); goto(nid);
    setTimeout(() => focusSel(`[data-f="${nid}:name"]`), 330);
    NL.toast('Card added. Drag its ● onto the recipe that uses it, or add it later with + Ingredient');
  }
  function linkCard(child, parent) {
    const p = R(parent);
    if (allItems(p).some(it => it.ref === 'asm:' + child)) return NL.toast('Already linked');
    if (wouldCycle(parent, child)) return NL.toast('That would create a loop');
    addItem(parent, p.groups.length - 1, 'asm:' + child);
    NL.toast(`Linked. Set how many grams of "${R(child).name}" go into "${p.name}"`);
  }
  function deleteRecipe(id) {
    const ps = parentsOf(id);
    if (!confirm(`Delete "${R(id).name}"?${ps.length ? `\nIt will be removed from: ${[...new Set(ps.map(p => R(p.pid).name))].join(', ')}` : ''}`)) return;
    delete S.asm[id];
    for (const r of Object.values(S.asm)) r.groups.forEach(g => { g.items = g.items.filter(it => it.ref !== 'asm:' + id); });
    render(); commit();
  }
  function move(k, dir) {
    const { r, gi, ii } = parseKey(k), g = r.groups[gi], it = g.items[ii];
    if (dir < 0) {
      if (ii > 0) [g.items[ii - 1], g.items[ii]] = [g.items[ii], g.items[ii - 1]];
      else if (gi > 0) { g.items.splice(ii, 1); r.groups[gi - 1].items.push(it); }
    } else {
      if (ii < g.items.length - 1) [g.items[ii + 1], g.items[ii]] = [g.items[ii], g.items[ii + 1]];
      else if (gi < r.groups.length - 1) { g.items.splice(ii, 1); r.groups[gi + 1].items.unshift(it); }
    }
    render(); commit();
  }
  function openPicker(rid, gi, anchor) {
    const rc = anchor.getBoundingClientRect();
    const subs = Object.entries(S.asm).filter(([sid]) => sid !== S.root && !wouldCycle(rid, sid) && !allItems(R(rid)).some(it => it.ref === 'asm:' + sid))
      .map(([sid, a]) => ({ value: 'asm:' + sid, label: a.name, color: colorOf(sid), sub: 'sub-recipe' }));
    NL.picker({
      x: rc.left, y: rc.bottom + 4, placeholder: 'Search ingredients or sub-recipes…',
      groups: [{ label: 'Create', items: [{ value: 'new-sub', label: '＋ New sub-recipe', color: '#7c5cff', always: true }] }, { label: 'Existing sub-recipes', items: subs }, ...NL.ingredientGroups()],
      onPick: v => addItem(rid, gi, v),
    });
  }

  // ---------- interactions ----------
  const vp = NL.viewport(vpEl, worldEl, {
    isBackground: t => t === vpEl || t === worldEl || t === sheetsEl || t === linksEl,
    onChange: v => { $('#zl').textContent = Math.round(v.s * 100) + '%'; },
  });

  sheetsEl.addEventListener('pointerdown', e => {
    const port = e.target.closest('[data-port]');
    if (port && e.button === 0 && mode === 'edit') {
      const id = port.dataset.port, r = R(id);
      return NL.connectDrag({ e, vp, linksEl, from: { x: r.x, y: r.y + 26 }, color: colorOf(id), targetSel: '.sheet', selfEl: port.closest('.sheet'), onDrop: t => linkCard(id, t.dataset.id) });
    }
    const top = e.target.closest('[data-drag]'); if (!top || e.button !== 0) return;
    if (e.target.closest('input,button,textarea,a')) return;
    e.preventDefault();
    const el = top.closest('.sheet'), r = R(el.dataset.id);
    const st = vp.toWorld(e.clientX, e.clientY), ox = r.x, oy = r.y; let moved = false;
    const mv = ev => {
      const p = vp.toWorld(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(p.x - st.x, p.y - st.y) < 3) return;
      moved = true; r.x = ox + p.x - st.x; r.y = oy + p.y - st.y;
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; drawLinks();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) commit(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  const isField = d => d && (d.f || d.amt || d.vol || d.step || d.yl || d.yp);
  let typingT;
  document.addEventListener('input', e => {
    const d = e.target.dataset; if (!isField(d)) return;
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
    if (d.f) {
      const [id, f] = d.f.split(':'); R(id)[f] = e.target.value;
      if (f === 'name') { renderKeep(); } else if (f === 'description') e.target.classList.toggle('empty', !e.target.value);
    } else if (d.amt) { const { r, gi, ii } = parseKey(d.amt); r.groups[gi].items[ii].amount = e.target.value === '' ? 0 : +e.target.value || 0; renderKeep(); }
    else if (d.vol) { const { r, gi, ii } = parseKey(d.vol); r.groups[gi].items[ii].volume = e.target.value; }
    else if (d.step) { const { r, gi, ii } = parseKey(d.step); r.groups[gi].steps[ii] = e.target.value; drawLinks(); }
    else if (d.yl) { R(d.yl).yieldLoss = +e.target.value || 0; renderKeep(); }
    else if (d.yp) { if (e.target.value !== '') { R(d.yp).yieldLoss = NL.lossFromYield(e.target.value); renderKeep(); } }
    clearTimeout(typingT); typingT = setTimeout(commit, 600);
  });
  document.addEventListener('focusout', e => { if (isField(e.target.dataset)) commit(); });
  document.addEventListener('keydown', e => {
    const d = e.target.dataset;
    if (e.key === 'Enter' && d && (d.amt || d.yl || d.yp || d.f && e.target.tagName === 'INPUT' || d.vol)) e.target.blur();
    if (e.key === 'Enter' && d?.step && !e.shiftKey) {
      e.preventDefault();
      const { rid, r, gi, ii } = parseKey(d.step); r.groups[gi].steps.splice(ii + 1, 0, ''); render(); commit();
      focusSel(`[data-step="${rid}:${gi}:${ii + 1}"]`);
    }
  });

  document.addEventListener('click', e => {
    const q = s => e.target.closest(s); let b;
    if ((b = q('[data-goto]'))) return goto(b.dataset.goto);
    if (mode !== 'edit') return;
    if ((b = q('[data-base]'))) { const { r, gi, ii } = parseKey(b.dataset.base); allItems(r).forEach(it => delete it.base); r.groups[gi].items[ii].base = true; render(); commit(); return; }
    if ((b = q('[data-opt]'))) { const { r, gi, ii } = parseKey(b.dataset.opt); const it = r.groups[gi].items[ii]; it.optional = !it.optional; render(); commit(); return; }
    if ((b = q('[data-up]'))) return move(b.dataset.up, -1);
    if ((b = q('[data-down]'))) return move(b.dataset.down, 1);
    if ((b = q('[data-del]'))) { const { r, gi, ii } = parseKey(b.dataset.del); r.groups[gi].items.splice(ii, 1); render(); commit(); return; }
    if ((b = q('[data-addi]'))) { const [rid, gi] = b.dataset.addi.split(':'); return openPicker(rid, +gi, b); }
    if ((b = q('[data-newsub]'))) { const [rid, gi] = b.dataset.newsub.split(':'); return newSub(rid, +gi); }
    if ((b = q('[data-addstep]'))) { const [rid, gi] = b.dataset.addstep.split(':'); const g = R(rid).groups[+gi]; g.steps.push(''); render(); commit(); focusSel(`[data-step="${rid}:${gi}:${g.steps.length - 1}"]`); return; }
    if ((b = q('[data-delstep]'))) { const { r, gi, ii } = parseKey(b.dataset.delstep); r.groups[gi].steps.splice(ii, 1); render(); commit(); return; }
    if ((b = q('[data-addgrp]'))) { const r = R(b.dataset.addgrp); r.groups.push({ items: [], steps: [''] }); render(); commit(); return; }
    if ((b = q('[data-delgrp]'))) {
      const [rid, gi] = b.dataset.delgrp.split(':'); const r = R(rid), g = r.groups[+gi];
      if ((g.items.length || g.steps.some(s => s)) && !confirm('Delete this ingredient group and its steps?')) return;
      r.groups.splice(+gi, 1); render(); commit(); return;
    }
    if ((b = q('[data-delrec]'))) return deleteRecipe(b.dataset.delrec);
  });

  document.addEventListener('keydown', e => {
    if (NL.isTyping()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); }
    else if (e.key === 'f' || e.key === 'F') vp.fit(bounds());
  });

  $('#undo').onclick = () => hist.undo();
  $('#redo').onclick = () => hist.redo();
  $('#fit').onclick = () => vp.fit(bounds());
  $('#arrange').onclick = () => { arrange(); commit(); vp.fit(bounds()); };
  $('#zin').onclick = () => vp.zoom(1.2);
  $('#zout').onclick = () => vp.zoom(1 / 1.2);
  $('#print').onclick = () => window.print();
  $('#modeSeg').onclick = e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    mode = b.dataset.mode; document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('on', x === b));
    NL.closePicker(); render();
  };
  $('#rdToggle').onclick = () => { rd = !rd; $('#rdToggle').textContent = (rd ? '☑' : '☐') + ' R&D data'; $('#rdToggle').classList.toggle('off', !rd); render(); };
  $('#newVer').onclick = async () => {
    const v = await NL.prompt('Version name (shown on the tab):', nameOf(S) + ' v' + (wb.count() + 1));
    if (!v) return;
    wb.add(JSON.parse(JSON.stringify(S)), v);
    NL.toast('Version "' + v + '" created');
  };
  $('#newRecipe').onclick = () => newRecipe();
  $('#addCard').onclick = () => addCard();
  addEventListener('beforeprint', () => { if (mode === 'edit') { document.body.classList.add('preview'); } });
  addEventListener('afterprint', () => { document.body.classList.toggle('preview', mode === 'preview'); });

  // ---------- recipes as tabs (workbook) ----------
  const nameOf = st => st.asm[st.root]?.name;
  const sample = () => {
    const s = JSON.parse(JSON.stringify(SAMPLE));
    Object.entries(s.asm).forEach(([id, r], i) => { r.x = 0; r.y = 0; if (id !== s.root) r.color = COLORS[(i - 1) % COLORS.length]; });
    return Object.assign(s, { _arrange: true });
  };
  const blank = () => ({ root: 'r1', asm: { r1: blankRecipe('Untitled recipe ' + (wb.count() + 1)) } });
  function newRecipe() { wb.add(blank()); }
  window.NL_resetSample = () => { wb.add(sample()); NL.toast('Sample recipe opened in a new tab'); };

  function openState(state) {
    S = state;
    const needsArrange = S._arrange; delete S._arrange;
    hist = NL.history(() => wb.save(S), () => S, s => { S = s; render(); });
    if (needsArrange) { arrange(); wb.save(S); } else render();
    const empty = Object.keys(S.asm).length === 1 && !allItems(R(S.root)).length;
    if (empty) {
      const r = R(S.root); vp.v.s = 1; vp.v.x = 40 - r.x; vp.v.y = 30 - r.y; vp.apply();
      focusSel(`[data-f="${S.root}:name"]`);
    } else vp.fit(bounds(), 40, { min: 0.72, align: 'left' });
  }

  // ---------- boot ----------
  const wb = NL.workbook({
    key: 'nl_sheet_book_v1',
    sample, nameOf,
    beforeSwitch: () => { clearTimeout(typingT); commit(); },
    onSwitch: openState,
    onNew: newRecipe,
  });
  openState(wb.current());
})();
