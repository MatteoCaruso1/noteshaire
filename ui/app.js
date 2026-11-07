'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (p, b) => { const r = await fetch(p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}); return r.json(); };

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CAT = {
  technique: ['Technique', '--technique'], 'new-song': ['New repertoire', '--new-song'], 'known-song': ['Known songs', '--known-song'],
  noodling: ['Noodling', '--learning'], unnamed: ['Unnamed', '--unnamed'], recording: ['Red Grand Jazz', '--recording'], skip: ['Not practice', '--free'], stray: ['Too short', '--free'],
  learning: ['Noodling', '--learning'], free: ['Noodling', '--learning'],
};
const COUNTS = [['technique', 'Technique'], ['new-song', 'New repertoire'], ['known-song', 'Known songs'], ['noodling', 'Noodling'], ['recording', 'Filmed for Red Grand Jazz'], ['any', 'Any playing'],
  ...KEYS.map((k, i) => [`key:${i}`, `In ${k}`]), ['style:Stride', 'Stride'], ['style:Ballad', 'Ballads'], ['style:Up-tempo', 'Up-tempo'], ['style:Walking bass', 'Walking bass']];
const colorOf = (counts) => { const c = (counts || '').split('|')[0]; return CAT[c] ? CAT[c][1] : '--any'; };

const hm = (sec) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const mss = (sec) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const short = (sec) => { if (sec < 60) return `${Math.round(sec)}s`; const m = Math.round(sec / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayName = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

let week = null, data = null, tab = 'songs', busy = false;
const thisWeek = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const shiftWeek = (w, n) => { const d = new Date(`${w}T12:00:00`); d.setDate(d.getDate() + 7 * n); return ymd(d); };

async function load() {
  data = await api(`/api/week?start=${week}`);
  render();
}

function render() {
  const s = new Date(`${data.week}T12:00:00`), e = new Date(s); e.setDate(e.getDate() + 6);
  const fmtD = (d, m) => d.toLocaleDateString(undefined, m ? { month: 'short', day: 'numeric' } : { day: 'numeric' });
  $('#weekLabel').textContent = s.getMonth() === e.getMonth() ? `${fmtD(s, 1)} – ${fmtD(e)}` : `${fmtD(s, 1)} – ${fmtD(e, 1)}`;
  $('#next').disabled = data.week >= thisWeek();
  renderGoals(); renderSession(); renderSummary(); renderDays(); renderInbox();
  $('#songNames').innerHTML = data.songs.map((x) => `<option value="${esc(x.name)}">`).join('');
  renderTab();
}

function daysLeft() {
  if (data.week !== thisWeek()) return 0;
  return 7 - ((new Date().getDay() + 6) % 7);
}
function renderGoals() {
  const left = daysLeft();
  $('#goals').innerHTML = data.goals.map((g) => {
    const goal = g.minutes * 60, pct = goal ? g.seconds / goal : 0, w = Math.min(1, pct) * 100;
    const pace = '';
    const tick = g.minutes > 0 ? Math.max(2, (30 / g.minutes) * 100) : 100;
    return `<div class="goal ${pct >= 1 ? 'done' : ''}" style="--c:var(${colorOf(g.counts)})">
      <div class="goal-head"><span class="goal-name">${esc(g.name)}</span>
        <span class="goal-val num">${pace}<b>${hm(g.seconds)}</b> / ${hm(goal)}<span class="pct">${Math.round(pct * 100)}%</span></span></div>
      <div class="bar"><div class="fill" style="width:${w}%"></div><div class="ticks" style="--tick:${tick}%"></div></div></div>`;
  }).join('');
}

/** session goals: picked from this week's goals, up to what is left of each; they fill from what is played after the start */
let addingSession = false;
function renderSession() {
  const el = $('#session'), cur = data.week === thisWeek();
  el.hidden = !cur;
  if (!cur) return;
  const left = (g) => Math.max(0, Math.round(g.minutes - g.seconds / 60));
  const items = data.session ? data.session.items : [];
  const open = data.goals.filter((g) => left(g) > 0 && !items.some((i) => i.goal === g.id));
  const bars = items.map((i) => {
    const goal = i.minutes * 60, pct = goal ? i.seconds / goal : 0;
    return `<div class="goal sgoal ${pct >= 1 ? 'done' : ''}" style="--c:var(${colorOf(i.counts)})"><div class="goal-head"><span class="goal-name">${esc(i.name)}</span>
      <span class="goal-val num"><b>${hm(i.seconds)}</b> / ${hm(goal)}<span class="pct">${Math.round(pct * 100)}%</span></span></div>
      <div class="bar thin"><div class="fill" style="width:${Math.min(1, pct) * 100}%"></div></div></div>`;
  }).join('');
  const canAdd = open.length > 0;
  el.innerHTML = `<div class="sec-head"><h2>Session goals</h2><span class="sec-tools">${items.length ? '<button class="ghost small send">End session</button><button class="edit-goals sedit" title="Edit session goals" aria-label="Edit session goals">✎</button>' : canAdd ? '<button class="ghost small sedit">+ Add</button>' : ''}</span></div>
    ${bars}${!items.length ? '<div class="hint-line">Pick a weekly goal to focus on right now.</div>' : ''}`;
  const se = $('.sedit', el); if (se) se.onclick = openSession;
  const send = $('.send', el); if (send) send.onclick = async () => { await api('/api/session', { items: [] }); load(); };
}
/** the session editor: rows of (weekly goal, minutes), minutes capped at what is left of that weekly goal */
function sessRow(i) {
  const left = (g) => Math.max(0, Math.round(g.minutes - g.seconds / 60));
  const goals = data.goals.filter((g) => left(g) > 0 || g.id === i.goal);
  if (!goals.length) return '';
  const cur = i.goal || goals[0].id, g0 = data.goals.find((g) => g.id === cur);
  return `<div class="grow-row srow"><select class="sg">${goals.map((g) => `<option value="${esc(g.id)}" data-left="${left(g)}" ${g.id === cur ? 'selected' : ''}>${esc(g.name)} · ${left(g)} min left</option>`).join('')}</select>
    <input class="sm num" type="number" min="1" step="5" max="${left(g0)}" value="${i.minutes || Math.min(30, left(g0))}"><button type="button" class="x" title="Remove">×</button></div>`;
}
function openSession() {
  const rows = $('#sessRows'), items = data.session ? data.session.items : [];
  rows.innerHTML = (items.length ? items.map(sessRow) : [sessRow({})]).join('');
  const wire = () => {
    rows.querySelectorAll('.x').forEach((b) => { b.onclick = () => b.parentElement.remove(); });
    rows.querySelectorAll('.sg').forEach((s) => { s.onchange = () => { const m = s.parentElement.querySelector('.sm'), mx = +s.selectedOptions[0].dataset.left; m.max = mx; if (+m.value > mx) m.value = mx; }; });
  };
  wire();
  // a new row starts on a weekly goal not already in the session
  $('#addSess').onclick = () => { const used = [...rows.querySelectorAll('.sg')].map((x) => x.value); const next = data.goals.find((g) => !used.includes(g.id) && g.minutes * 60 > g.seconds); rows.insertAdjacentHTML('beforeend', sessRow(next ? { goal: next.id } : {})); wire(); };
  $('#sessEdit').showModal();
}
$('#sessEdit').addEventListener('close', async () => {
  if ($('#sessEdit').returnValue !== 'save') return;
  const seen = new Set();
  const items = [...document.querySelectorAll('#sessRows .srow')].map((r) => {
    const s = $('.sg', r), mx = +s.selectedOptions[0].dataset.left;
    return { goal: s.value, minutes: Math.min(Math.max(mx, 1), Math.max(1, Math.round(+$('.sm', r).value || 0))) };
  }).filter((i) => !seen.has(i.goal) && seen.add(i.goal));
  await api('/api/session', { items });
  load();
});

function renderSummary() {
  const c = data.cats, chips = [`<span class="chip">Played <b class="num">${hm(data.total)}</b></span>`];
  if (data.streak >= 2) chips.push(`<span class="chip">${data.streak} days in a row</span>`);
  let insight = '';
  if (data.total >= 600) {
    const [topCat, topSec] = Object.entries(c).filter(([k]) => k !== 'skip').sort((a, b) => b[1] - a[1])[0] || [];
    const behind = data.goals.filter((g) => g.minutes > 0).map((g) => ({ g, pct: g.seconds / (g.minutes * 60) })).sort((a, b) => a.pct - b.pct)[0];
    const parts = [];
    if (topCat) parts.push(`Most time: <b>${CAT[topCat][0]}</b> ${Math.round((topSec / data.total) * 100)}%`);
    if (behind && behind.pct < 1) parts.push(`Furthest behind: <b>${esc(behind.g.name)}</b>`);
    insight = parts.join('<span class="sep">·</span>');
  }
  $('#insight').innerHTML = insight;
  // time that fills none of the goals, by what it was (unnamed songs count once they are named)
  const off = Object.entries(data.offCats || {}).filter(([, v]) => v >= 30).sort((a, b) => b[1] - a[1]);
  if (off.length) chips.push(`<span class="chip ${data.total && data.offplan / data.total > 0.3 ? 'warn' : ''}">Not in any goal <b class="num">${hm(data.offplan)}</b>
    <span class="chip-sub">${off.map(([k, v]) => `${CAT[k] ? CAT[k][0] : k} ${hm(v)}${k === 'unnamed' ? ' (name them to count)' : ''}`).join(' · ')}</span></span>`);
  $('#summary').innerHTML = chips.join('');
}

function renderDays() {
  const days = Object.entries(data.days), tot = (o) => Object.entries(o).filter(([k]) => k !== 'skip').reduce((a, [, v]) => a + v, 0);
  const max = Math.max(900, ...days.map(([, o]) => tot(o)));
  const today = ymd(new Date()), order = ['technique', 'new-song', 'noodling', 'known-song', 'unnamed'];
  $('#days').innerHTML = days.map(([d, o]) => {
    const t = tot(o);
    const segs = order.filter((k) => o[k]).map((k) => `<span title="${CAT[k][0]} ${short(o[k])}" style="--c:var(${CAT[k][1]});height:${(o[k] / max) * 100}%"></span>`).join('');
    return `<div class="day ${d === today ? 'today' : ''}"><div class="stack">${segs}</div><div class="lbl">${dayName(new Date(`${d}T12:00:00`))}</div><div class="min num">${t >= 60 ? short(t) : ''}</div></div>`;
  }).join('');
}

const PLAY = '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z"/></svg>', STOP = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8"/></svg>';
const styleOf = (p) => (p.style || []).filter((t) => !info || info.instrument === 'piano' || !['Stride', 'Walking bass'].includes(t));
function pieceMeta(p) {
  return [`${dayName(p.start_ms)} ${clock(p.start_ms)}`, mss(p.seconds), p.key, ...styleOf(p)].filter(Boolean).map(esc).join(' · ');
}
const drafts = {}; // piece id -> { name, status } typed but not saved yet
function renderInbox() {
  const box = $('#inbox');
  if (!data.inbox.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="ask-head"><h2>Help us recognize your tunes</h2><span class="ask-sub">Name each once. After that NoteshAIre knows it.</span></div>` + data.inbox.map((p) => `
    <div class="take ask" data-id="${esc(p.id)}">
      <div class="ask-top"><button class="play" title="Listen">${PLAY}</button>
        <div class="meta">${p.guess ? `<b>Sounds like ${esc(p.guess)}</b><br>` : p.throughKeys ? '<b>Through the keys?</b><br>' : ''}${pieceMeta(p)}</div>
        <span class="grow"></span>${p.throughKeys ? '<button class="ghost small tech">It was technique</button>' : ''}
        <select class="mini" aria-label="Not a song"><option value="">Not a song?</option><option value="noodling">Noodling</option><option value="technique">Technique</option><option value="skip">Not practice</option></select></div>
      <div class="ask-form">
        <label class="step"><span class="n">1</span><span class="t">Song name</span>
          <input placeholder="e.g. Autumn Leaves" list="songNames" value="${esc(drafts[p.id] ? drafts[p.id].name : p.guess || '')}"></label>
        <div class="step"><span class="n">2</span><span class="t">Is it new to you?</span>
          <span class="seg pick big"><button data-s="new" class="${drafts[p.id] && drafts[p.id].status === 'new' ? 'on' : ''}">New to me</button><button data-s="known" class="${drafts[p.id] && drafts[p.id].status === 'known' ? 'on' : ''}">I know it</button></span></div>
        <button class="primary save" disabled>Save</button>
      </div></div>`).join('');
  box.querySelectorAll('.take').forEach((row) => {
    const id = row.dataset.id, inp = $('input', row);
    $('.play', row).onclick = (e) => togglePlay(id, e.currentTarget);
    // New / Known is a choice (a song already in the list takes its status); Save (or Enter) names it
    const status = () => { const on = $('.pick .on', row); return on ? on.dataset.s : null; };
    const ready = () => { const ok = !!inp.value.trim() && !!status(); $('.save', row).disabled = !ok; row.classList.toggle('need-name', !inp.value.trim()); row.classList.toggle('need-pick', !status()); };
    const keep = () => { drafts[id] = { name: inp.value, status: status() }; ready(); };
    const pick = (st) => { row.querySelectorAll('.pick button').forEach((b) => b.classList.toggle('on', b.dataset.s === st)); keep(); };
    row.querySelectorAll('.pick button').forEach((b) => { b.onclick = () => pick(b.dataset.s); });
    const match = () => data.songs.find((x) => x.name.toLowerCase() === inp.value.trim().toLowerCase());
    inp.oninput = () => { const m = match(); if (m) pick(m.status); else keep(); };
    if (!drafts[id] && match()) pick(match().status);
    ready();
    const save = async () => { const name = inp.value.trim(); if (!name) { inp.focus(); return; } if (!status()) { row.querySelector('.pick').classList.add('shake'); setTimeout(() => row.querySelector('.pick').classList.remove('shake'), 500); return; } await api('/api/name', { piece: id, name, status: status() }); delete drafts[id]; load(); };
    $('.save', row).onclick = save;
    inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
    const tb = $('.tech', row); if (tb) tb.onclick = async () => { await api('/api/kind', { piece: id, kind: 'technique' }); load(); };
    $('select', row).onchange = async (e) => { if (e.target.value) { await api('/api/kind', { piece: id, kind: e.target.value }); load(); } };
  });
}

function renderTab() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['songs', 'technique', 'noodling', 'log']) $(`#tab-${t}`).hidden = t !== tab;
  ({ songs: renderSongs, technique: renderTechnique, noodling: renderNoodling, log: renderLog })[tab]();
  if (view === 'stats') renderTrends();
}

function ago(ms) {
  if (!ms) return '';
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days` : new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function renderSongs() {
  const el = $('#tab-songs');
  if (!data.songs.length) { el.innerHTML = areaTop('songs', '--new-song') + '<div class="empty">No songs yet</div>'; wireSpan(el); return; }
  const max = Math.max(60, ...data.songs.map((s) => s.weekSeconds));
  el.innerHTML = areaTop('songs', '--new-song') + `<table class="songs"><thead><tr><th></th><th>Song</th><th></th><th>This week</th><th class="r">Plays</th><th class="r">Key</th><th class="r">Last</th></tr></thead><tbody>${data.songs.map((s) => `
    <tr><td>${s.lastPiece ? `<button class="play sm" data-id="${esc(s.lastPiece)}" title="Listen to the latest take">${PLAY}</button>` : ''}</td><td>${esc(s.name)}</td>
      <td><button class="status-btn ${s.status === 'new' ? 'new' : ''}" data-id="${esc(s.id)}" data-s="${esc(s.status)}">${s.status === 'new' ? 'New' : 'Known'}</button></td>
      <td class="num"><span class="mbar" style="width:${Math.round((s.weekSeconds / max) * 120)}px;--c:var(${s.status === 'new' ? '--new-song' : '--known-song'})"></span>${s.weekSeconds ? short(s.weekSeconds) : ''}</td>
      <td class="r num">${s.plays}</td><td class="r">${esc(s.key || '')}</td><td class="r">${ago(s.last)}</td></tr>`).join('')}</tbody></table>`;
  wireSpan(el);
  el.querySelectorAll('.play[data-id]').forEach((b) => { b.onclick = () => togglePlay(b.dataset.id, b); });
  el.querySelectorAll('.status-btn').forEach((b) => { b.onclick = async () => { await api('/api/song', { id: b.dataset.id, status: b.dataset.s === 'new' ? 'known' : 'new' }); load(); }; });
}

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
let keySpan = 'week';
/** circle of fifths for one area; brightness = time in that key */
function wheel(keys, color, noun) {
  const C = 110, max = Math.max(60, ...keys);
  const at = (i, r) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
  const dots = FIFTHS.map((k, i) => {
    const [x, y] = at(i, 88), v = keys[k], on = v >= 10, f = on ? v / max : 0; // share of the busiest key, linear
    return `<g class="${on ? 'hot' : ''}${f > 0.55 ? ' top' : ''}"><title>${KEYS[k]}${on ? ` ${short(v)}` : ''}</title><circle cx="${x}" cy="${y}" r="${on ? 11 + f * 10 : 11}" fill="${on ? `color-mix(in srgb, var(${color}) ${Math.round(12 + f * 88)}%, #15171a)` : '#111215'}" stroke="${f > 0.55 ? `var(${color})` : '#23262c'}"/><text x="${x}" y="${y}">${KEYS[k]}</text></g>`;
  }).join('');
  return `<svg class="wheel" viewBox="0 0 220 220" width="220" height="220">${dots}<text x="${C}" y="${C - 8}" style="font-size:26px;fill:var(--ink);font-weight:600">${keys.filter((v) => v >= 10).length}</text><text x="${C}" y="${C + 16}">of 12 keys</text></svg>`;
}
/** the same top for songs, technique and noodling: keys wheel, keyboard, keys untouched in 4 weeks */
function areaTop(area, color) {
  const k = data.keys[keySpan][area], m = data.keys.month[area];
  const untouched = FIFTHS.filter((x) => m.keys[x] < 10).map((x) => KEYS[x]);
  return `<div class="area"><div>${wheel(k.keys, color)}</div><div class="area-r">
      <div class="keys-head"><span class="seg">${[['week', 'This week'], ['month', '4 weeks']].map(([v, n]) => `<button data-span="${v}" class="${keySpan === v ? 'on' : ''}">${n}</button>`).join('')}</span></div>
      <div class="kb">${keyboard(k.kb, color)}</div>
      ${untouched.length && untouched.length < 12 ? `<div class="neglect"><h2>Untouched in 4 weeks</h2><span class="keys">${untouched.map((x) => `<i>${x}</i>`).join('')}</span></div>` : ''}
    </div></div>`;
}
function wireSpan(el) { el.querySelectorAll('[data-span]').forEach((b) => { b.onclick = () => { keySpan = b.dataset.span; renderTab(); }; }); }
function renderNoodling() {
  const el = $('#tab-noodling'), list = data.noodles;
  el.innerHTML = areaTop('noodling', '--learning') + (list.length ? list.map((p) => {
    const secs = p.segs.filter((x) => x.cat === 'noodling').reduce((a, x) => a + x.seconds, 0);
    const keyIdx = (p.segs.find((x) => x.cat === 'noodling' && x.key != null) || {}).key;
    return `<div class="take" data-id="${esc(p.id)}"><button class="play" title="Listen">${PLAY}</button>
      <div class="meta"><b>${dayName(p.start_ms)} ${clock(p.start_ms)}</b><br>${[mss(secs), keyIdx != null ? KEYS[keyIdx] : "", ...styleOf(p)].filter(Boolean).map(esc).join(' · ')}</div><div></div></div>`;
  }).join('') : '<div class="empty">No noodling this week</div>');
  el.querySelectorAll('.take').forEach((row) => { $('.play', row).onclick = (e) => togglePlay(row.dataset.id, e.currentTarget); });
  wireSpan(el);
}
function keyboard(h, color = '--red') {
  const max = Math.max(1, ...h), white = [];
  let x = 0;
  for (let i = 0; i < 88; i++) { const n = (i + 21) % 12; if (![1, 3, 6, 8, 10].includes(n)) white.push({ i, x: x++ }); }
  const w = 100 / white.length;
  const heat = (v) => `color-mix(in srgb, var(${color}) ${Math.round(Math.sqrt(v / max) * 100)}%, #1a1c20)`;
  let s = white.map((k) => `<rect x="${k.x * w}%" y="0" width="${w - 0.15}%" height="46" rx="1.5" fill="${h[k.i] ? heat(h[k.i]) : '#1a1c20'}"/>`).join('');
  x = 0;
  for (let i = 0; i < 88; i++) { const n = (i + 21) % 12; if ([1, 3, 6, 8, 10].includes(n)) s += `<rect x="${(x - 0.32) * w}%" y="0" width="${w * 0.64}%" height="28" rx="1" fill="${h[i] ? heat(h[i]) : '#0b0c0e'}" stroke="#0e0f11" stroke-width=".6"/>`; else x++; }
  return `<svg preserveAspectRatio="none">${s}</svg>`;
}
/** a small line of values (oldest first) */
function spark(vals) {
  if (vals.length < 2) return '';
  const max = Math.max(...vals), min = Math.min(...vals), W = 70, H = 18, x = (i) => (i / (vals.length - 1)) * W, y = (v) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="var(--technique)" stroke-width="1.6" points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="2.2" fill="var(--technique)"/></svg>`;
}
async function renderTrends() {
  const el = $('#tab-trends');
  el.innerHTML = '<div class="empty">…</div>';
  const t = await api('/api/trends');
  const max = Math.max(1800, ...t.map((w) => w.total)), order = ['technique', 'new-song', 'noodling', 'known-song', 'unnamed'];
  const label = (w) => new Date(`${w}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const bars = t.map((w) => `<div class="wk ${w.week === data.week ? 'cur' : ''}" title="${label(w.week)}: ${short(w.total)}"><div class="stack">${order.filter((k) => w.cats[k]).map((k) => `<span style="--c:var(${CAT[k][1]});height:${(w.cats[k] / max) * 100}%"></span>`).join('')}</div><div class="lbl">${label(w.week)}</div><div class="min num">${w.total >= 60 ? short(w.total) : ''}</div></div>`).join('');
  const names = [...new Set(t.flatMap((w) => w.goals.map((g) => g.name)))];
  const hits = names.map((n) => `<div class="hitrow"><span>${esc(n)}</span><span class="hits">${t.map((w) => { const g = w.goals.find((x) => x.name === n); const p = g ? Math.min(1, g.pct) : 0; return `<i title="${label(w.week)} ${g ? Math.round(g.pct * 100) + '%' : ''}" style="--p:${Math.round(p * 100)}%;--c:var(${colorOf(g && g.counts)})" class="${g && g.pct >= 1 ? 'hit' : ''}"></i>`; }).join('')}</span></div>`).join('');
  el.innerHTML = `<div class="weeks">${bars}</div><div class="hitlist">${hits}</div>`;
}
function renderTechnique() {
  const el = $('#tab-technique');
  // one row per drill ("Major scale"), the keys it went through marked underneath
  const drills = {};
  for (const r of data.technique) {
    const type = r.label.replace(/^[A-G][b#]?/, '').trim() || r.label, d = drills[type] || (drills[type] = { type, seconds: 0, keys: {}, nps: 0, even: [] });
    d.seconds += r.seconds; d.keys[r.key] = (d.keys[r.key] || 0) + r.seconds; d.nps = Math.max(d.nps, r.nps); d.even.push(r.even);
  }
  const t = Object.values(drills).sort((a, b) => b.seconds - a.seconds);
  const keyRow = (keys) => `<span class="keys">${FIFTHS.map((k) => `<i class="${keys[k] ? 'on' : ''}" title="${KEYS[k]}${keys[k] ? ` ${short(keys[k])}` : ''}">${KEYS[k]}</i>`).join('')}</span>`;
  el.innerHTML = areaTop('technique', '--technique') + `<div>${t.length ? `<table><thead><tr><th>Drill</th><th class="r">Time</th><th class="r">Top speed</th><th class="r">Even</th></tr></thead><tbody>${t.map((d) => `
    <tr><td>${esc(d.type[0].toUpperCase() + d.type.slice(1))}${keyRow(d.keys)}</td><td class="r num">${short(d.seconds)}</td><td class="r num">${spark((data.drills[d.type] || []).map((x) => x.nps))}${d.nps}/s</td><td class="r num">${Math.round((d.even.reduce((a, b) => a + b, 0) / d.even.length) * 100)}%</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No technique this week</div>'}</div>`;
  wireSpan(el);
}

/** ["C major scale", "G major scale", "F pattern"] -> ["Major scale C G", "Pattern F"] */
function drillSummary(labels) {
  const by = {};
  for (const l of labels) { const m = l.match(/^([A-G][b#]?)(.*)$/); const type = m ? m[2].trim() : l; (by[type] ||= new Set()).add(m ? m[1] : ''); }
  return Object.entries(by).map(([t, ks]) => `${t[0].toUpperCase()}${t.slice(1)} ${[...ks].join(' ')}`.trim());
}
/** scissors: a timeline of the piece; click to hear that moment, then cut there */
function openCutter(row) {
  document.querySelectorAll('.cutter').forEach((c) => c.remove());
  const p = data.pieces.find((x) => x.id === row.dataset.ids), len = p.t1 - p.t0;
  let at = null;
  const segs = p.segs.map((x) => `<span style="flex:${x.seconds};--c:var(${CAT[x.cat][1]})" title="${CAT[x.cat][0]} ${short(x.seconds)}"></span>`).join('');
  const ticks = Array.from({ length: Math.floor(len / 60) }, (_, i) => `<i style="left:${((i + 1) * 60 / len) * 100}%"></i>`).join('');
  row.insertAdjacentHTML('afterend', `<div class="cutter"><div class="track">${segs}${ticks}<b class="marker" hidden></b></div>
    <div class="cut-row"><span class="num cut-time">Click the bar to listen</span><span class="grow"></span><button class="ghost cancel">Cancel</button><button class="primary go" disabled>Cut here</button></div></div>`);
  const box = row.nextElementSibling, track = $('.track', box), marker = $('.marker', box);
  track.onclick = (e) => {
    const r = track.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    at = f * len; marker.hidden = false; marker.style.left = `${f * 100}%`;
    $('.cut-time', box).textContent = mss(at); $('.go', box).disabled = false;
    playFrom(p.id, at, 8);
  };
  $('.cancel', box).onclick = () => { stopPlay(); box.remove(); };
  $('.go', box).onclick = async () => { stopPlay(); await api('/api/cut', { take: p.take, t: p.t0 + at }); load(); };
}
const KIND_OPTS = [['', 'Auto'], ['song', 'Song'], ['technique', 'Technique'], ['noodling', 'Noodling'], ['skip', 'Not practice']];
function renderLog() {
  const el = $('#tab-log');
  if (!data.pieces.length) { el.innerHTML = '<div class="empty">Nothing played this week</div>'; return; }
  const byDay = {};
  // back-to-back pieces of the same kind (stop-start lick work, scales key by key) read as one row
  const sig = (p) => [...new Set(p.segs.map((s) => s.cat))].sort().join() + (p.song || '') + (p.recording ? 'f' : '') + (p.label && p.label.kind || '');
  const rows = [];
  for (const p of [...data.pieces].reverse()) {
    const last = rows[rows.length - 1];
    if (last && !p.song && p.seconds < 120 && last.played < 120 && sig(last) === sig(p) && p.start_ms - (last.start_ms + last.seconds * 1000) < 180e3 && new Date(p.start_ms).toDateString() === new Date(last.start_ms).toDateString()) {
      last.ids.push(p.id); last.seconds = (p.start_ms - last.start_ms) / 1000 + p.seconds; last.played += p.seconds; last.segs = last.segs.concat(p.segs);
    } else rows.push({ ...p, ids: [p.id], played: p.seconds });
  }
  // a piece that starts right where the one before it (same take) ended came from a cut: it can be joined back
  const all = [...data.pieces].sort((a, b) => a.start_ms - b.start_ms);
  for (const r of rows) { const p = all.find((x) => x.id === r.ids[0]), i = all.indexOf(p), prev = all[i - 1]; r.joinable = r.ids.length === 1 && prev && prev.take === p.take && p.t0 - prev.t1 < 1; }
  for (const p of rows.reverse()) (byDay[new Date(p.start_ms).toDateString()] ||= []).push(p);
  el.innerHTML = Object.entries(byDay).map(([d, ps]) => `<div class="logday"><h3>${new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>${ps.map((p) => {
    const cats = {}; p.segs.forEach((s) => { cats[s.cat] = (cats[s.cat] || 0) + s.seconds; });
    const labels = drillSummary(p.segs.flatMap((s) => (s.label ? s.label.split(', ') : [])));
    const tags = Object.keys(cats).map((c) => `<span class="tag" style="--c:var(${CAT[c][1]})">${c === 'new-song' || c === 'known-song' ? esc(p.songName || CAT[c][0]) : CAT[c][0]}</span>`);
    if (p.recording) tags.push('<span class="tag" style="--c:var(--recording)">Filmed</span>');
    const extra = [...labels.slice(0, 3), p.key && !labels.length ? p.key : "", ...styleOf(p)].filter(Boolean).map((x) => `<span class="tag dim">${esc(x)}</span>`);
    const cur = p.label && p.label.kind ? p.label.kind : '';
    return `<div class="entry" data-ids="${esc(p.ids.join(' '))}"><button class="play sm" title="Listen">${PLAY}</button><span class="when num">${clock(p.start_ms)}</span><span class="num">${mss(p.played)}</span>
      <span class="what">${tags.join('')}${extra.join('')}</span>
      <span class="row-tools">${p.ids.length === 1 && p.seconds >= 20 ? '<button class="icon cut" title="Cut in two">✂</button>' : ''}${p.joinable ? '<button class="icon join" title="Join with the piece before">Join</button>' : ''}
      <select class="mini" aria-label="Fix">${KIND_OPTS.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>`;
  }).join('')}</div>`).join('');
  el.querySelectorAll('.entry .play').forEach((b) => { b.onclick = () => togglePlay(b.closest('.entry').dataset.ids.split(' ')[0], b); });
  el.querySelectorAll('.entry .cut').forEach((b) => { b.onclick = () => openCutter(b.closest('.entry')); });
  el.querySelectorAll('.entry .join').forEach((b) => { b.onclick = async () => { await api('/api/join', { piece: b.closest('.entry').dataset.ids }); load(); }; });
  el.querySelectorAll('.entry select').forEach((s) => { s.onchange = async () => { for (const id of s.closest('.entry').dataset.ids.split(' ')) await api('/api/kind', { piece: id, kind: s.value || null }); load(); }; });
}

// ---- goals editor ----
function goalRow(g) {
  const counts = COUNTS.filter(([v]) => v !== 'recording' || (info && info.mode === 'piano-studio') || g.counts === 'recording');
  return `<div class="grow-row"><input class="gn" value="${esc(g.name)}" placeholder="Goal"><input class="gh num" type="number" min="0" step="0.25" value="${+(g.minutes / 60).toFixed(2)}" title="Hours">
    ${countsPicker(g.counts, counts)}
    <button type="button" class="x" title="Remove">×</button></div>`;
}
/** what a goal counts: tick one or more (Known songs + Noodling, ...) */
function countsPicker(value, counts) {
  const sel = new Set(String(value || '').split('|').map((c) => (c === 'learning' || c === 'free' ? 'noodling' : c)));
  const all = [...counts, ...data.songs.map((x) => [`song:${x.id}`, x.name])];
  const label = all.filter(([v]) => sel.has(v)).map(([, n]) => n).join(' + ') || 'Choose';
  return `<details class="gc"><summary>${esc(label)}</summary><div class="gc-list">${all.map(([v, n]) => `<label><input type="checkbox" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div></details>`;
}
function openGoals() {
  const rows = $('#goalRows');
  rows.innerHTML = data.goals.map(goalRow).join('');
  const wire = () => rows.querySelectorAll('.x').forEach((b) => { b.onclick = () => b.parentElement.remove(); });
  wire();
  rows.addEventListener('change', (e) => { const d = e.target.closest('details'); if (d) { const n = [...d.querySelectorAll('input:checked')].map((i) => i.parentElement.textContent.trim()); d.querySelector('summary').textContent = n.join(' + ') || 'Choose'; } });
  $('#addGoal').onclick = () => { rows.insertAdjacentHTML('beforeend', goalRow({ name: '', minutes: 60, counts: 'technique' })); wire(); };
  document.querySelectorAll('.hint').forEach((x) => { x.hidden = true; });
  $('#goalEdit').showModal();
}
document.addEventListener('click', (e) => document.querySelectorAll('details.gc[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }));
document.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('details.gc') && e.target.open) document.querySelectorAll('details.gc[open]').forEach((d) => { if (d !== e.target) d.open = false; }); }, true);
$('#goalEdit').addEventListener('close', async () => {
  document.querySelectorAll('.hint').forEach((x) => { x.hidden = false; });
  if ($('#goalEdit').returnValue !== 'save') return;
  const goals = [...document.querySelectorAll('#goalRows .grow-row')].map((r) => ({ name: $('.gn', r).value.trim(), minutes: Math.round(+$('.gh', r).value * 60), counts: [...r.querySelectorAll('.gc input:checked')].map((i) => i.value).join('|') })).filter((g) => g.name && g.minutes > 0 && g.counts);
  await api('/api/goals', { week: data.week, goals });
  await load();
  guideStep2();
});

// ---- listening to a take (a plain built-in piano tone, enough to recognise the tune) ----
let audio = null, playing = null;
function stopPlay() { if (playing) playing.stop(); }
async function playFrom(id, from, secs) {
  stopPlay();
  audio ||= new AudioContext();
  await loadPiano();
  const notes = (await api(`/api/notes?id=${encodeURIComponent(id)}`)).filter((n) => n[0] >= from && n[0] < from + secs).map(([t, ...r]) => [t - from, ...r]);
  playing = scheduleNotes(notes, id, null, secs);
}
const SAMPLES = []; // [{ note, buffer }]
let samplesLoading = null;
function loadPiano() {
  if (samplesLoading) return samplesLoading;
  const names = [];
  for (let o = 0; o <= 7; o++) for (const [k, pc] of [['C', 0], ['Ds', 3], ['Fs', 6], ['A', 9]]) if (o > 0 || k === 'A') names.push([k + o, 12 * (o + 1) + pc]);
  names.push(['C8', 108]);
  samplesLoading = Promise.all(names.map(async ([n, note]) => {
    try { const b = await (await fetch(`piano/${n}.mp3`)).arrayBuffer(); SAMPLES.push({ note, buffer: await audio.decodeAudioData(b) }); } catch {}
  }));
  return samplesLoading;
}
function scheduleNotes(notes, id, btn, limit) {
  const t0 = audio.currentTime + 0.08, out = audio.createGain(); out.gain.value = 0.55; out.connect(audio.destination);
  const nodes = [];
  for (const [t, note, dur, vel] of notes) {
    if (t > limit) break;
    if (!SAMPLES.length) break;
    let smp = SAMPLES[0];
    for (const x of SAMPLES) if (Math.abs(x.note - note) < Math.abs(smp.note - note)) smp = x;
    const src = audio.createBufferSource(), g = audio.createGain();
    src.buffer = smp.buffer; src.playbackRate.value = 2 ** ((note - smp.note) / 12);
    const at = t0 + t, off = at + Math.max(0.12, Math.min(dur, 12)), peak = Math.pow(vel / 127, 1.6) * 0.75;
    g.gain.setValueAtTime(peak, at); g.gain.setValueAtTime(peak, off); g.gain.exponentialRampToValueAtTime(0.0005, off + 0.35);
    src.connect(g); g.connect(out); src.start(at); src.stop(off + 0.4);
    nodes.push(src);
  }
  const p = { id, stop: () => { clearTimeout(p.timer); out.disconnect(); nodes.forEach((n) => { try { n.stop(); } catch {} }); if (btn) btn.innerHTML = PLAY; if (playing === p) playing = null; } };
  p.timer = setTimeout(() => p.stop(), (Math.min(limit, notes.length ? notes[notes.length - 1][0] : 0) + 4) * 1000);
  if (btn) btn.innerHTML = STOP;
  return p;
}
async function togglePlay(id, btn) {
  if (playing) { const was = playing.id; playing.stop(); if (was === id) return; }
  audio ||= new AudioContext();
  btn.classList.add('loading');
  await loadPiano();
  btn.classList.remove('loading');
  const notes = await api('/api/notes?id=' + encodeURIComponent(id));
  playing = scheduleNotes(notes, id, btn, 90);
}

// ---- listening through the microphone: only between Listen and Stop, always shown ----
const MIC = { stream: null, ctx: null, node: null, buf: [], len: 0, sent: 0, prev: null, started: 0, timer: null, quietSince: 0, wake: null };
const MIC_SR = 22050, MIC_PIECE_S = 20, MIC_PRE_S = 1, MIC_QUIET_MIN = 20;
async function micStart() {
  try {
    MIC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) { alert('NoteshAIre could not use the microphone. Allow it in your computer\'s settings and try again.'); return; }
  await api('/api/mic/start', {});
  MIC.ctx = new AudioContext({ sampleRate: MIC_SR });
  const src = MIC.ctx.createMediaStreamSource(MIC.stream);
  MIC.node = MIC.ctx.createScriptProcessor(4096, 1, 1);
  MIC.node.onaudioprocess = (e) => { const d = new Float32Array(e.inputBuffer.getChannelData(0)); MIC.buf.push(d); MIC.len += d.length; if (MIC.len >= MIC_PIECE_S * MIC_SR) micSend(); };
  src.connect(MIC.node); MIC.node.connect(MIC.ctx.destination);
  Object.assign(MIC, { buf: [], len: 0, sent: 0, prev: null, started: Date.now(), quietSince: Date.now() });
  try { MIC.wake = await navigator.wakeLock.request('screen'); } catch {}
  MIC.timer = setInterval(micTick, 1000);
  micTick();
}
/** send the sound gathered so far, with the last second of the previous piece in front of it */
async function micSend() {
  if (!MIC.len) return;
  const piece = new Float32Array(MIC.len); let o = 0;
  for (const b of MIC.buf) { piece.set(b, o); o += b.length; }
  MIC.buf = []; MIC.len = 0;
  const pre = MIC.prev ? MIC.prev.subarray(Math.max(0, MIC.prev.length - MIC_PRE_S * MIC_SR)) : new Float32Array(0);
  const body = new Float32Array(pre.length + piece.length); body.set(pre); body.set(piece, pre.length);
  const offset = MIC.sent / MIC_SR, preroll = pre.length / MIC_SR;
  MIC.sent += piece.length; MIC.prev = piece;
  const r = await fetch(`/api/mic/chunk?offset=${offset}&preroll=${preroll}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: body.buffer }).then((x) => x.json()).catch(() => ({}));
  if (r.heard >= 3) MIC.quietSince = Date.now();
}
async function micStop(reason) {
  if (!MIC.stream) return;
  clearInterval(MIC.timer);
  try { MIC.node.disconnect(); } catch {}
  MIC.stream.getTracks().forEach((t) => t.stop());
  await micSend();
  try { await MIC.ctx.close(); } catch {}
  try { if (MIC.wake) await MIC.wake.release(); } catch {}
  MIC.stream = null;
  $('#micbar').hidden = true;
  await api('/api/mic/stop', {});
  if (reason) $('#micnote').textContent = reason, $('#micnote').hidden = false, setTimeout(() => { $('#micnote').hidden = true; }, 15000);
  load();
}
function micTick() {
  const sec = (Date.now() - MIC.started) / 1000;
  $('#micbar').hidden = false;
  $('#micTime').textContent = mss(sec);
  // nothing heard for 20 minutes: stop listening by itself
  if (Date.now() - MIC.quietSince > MIC_QUIET_MIN * 60e3) micStop(`Stopped listening: nothing heard for ${MIC_QUIET_MIN} minutes.`);
}
$('#micBtn').onclick = () => { if (MIC.stream) return micStop(); $('#micAsk').showModal(); };
$('#micAsk').addEventListener('close', () => { if ($('#micAsk').returnValue === 'go') micStart(); });
$('#micStop').onclick = () => micStop();
window.addEventListener('beforeunload', () => { if (MIC.stream) navigator.sendBeacon && fetch('/api/mic/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true }); });

// ---- live status ----
let lastTakes = -1;
async function status() {
  try {
    const s = await api('/api/status');
    let dot = '', txt = '';
    let kb = (s.nord || '').split(',')[0].replace(/\s*(MIDI|USB)\s*(\d+)?$/i, '').trim();
    if (!kb || /^(usb|midi|usb[ -]?midi|usb audio|audio|device|port|keyboard|interface|midi (in|input|device|interface)|usb (device|interface))[\s\d-]*$/i.test(kb)) kb = 'Digital piano';
    if (MIC.stream && !s.nord) { $('#status').innerHTML = '<span class="dot ok"></span><span class="st-txt">Microphone</span>'; $('#status').classList.add('live'); return; }
    if (s.nord) { dot = 'ok'; txt = `${kb.length > 22 ? `${kb.slice(0, 21)}…` : kb || 'Keyboard'} connected`; }
    else if (s.recorder === 'on' && s.error) { dot = 'bad'; txt = 'Keyboard busy'; }
    else if (s.recorder === 'on') { dot = ''; txt = 'No keyboard connected'; }
    else if (s.recorder === 'starting' || s.recorder === 'checking') { dot = 'bad'; txt = 'Starting'; }
    else { dot = 'bad'; txt = 'Recorder off'; }
    $('#status').innerHTML = `<span class="dot ${dot}"></span><span class="st-txt">${esc(txt)}</span>`;
    $('#status').classList.toggle('live', !!s.recording);
    $('#status').title = s.error || s.nord || '';
    if (lastTakes >= 0 && s.takes !== lastTakes && week === thisWeek() && !document.activeElement.matches('input,select')) load();
    lastTakes = s.takes;
  } catch { $('#status').innerHTML = '<span class="dot bad"></span>Offline'; }
}

document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; try { localStorage.setItem('tab', tab); } catch {} renderTab(); }; });
$('#editGoals').onclick = () => openGoals();
$('#prev').onclick = () => { week = shiftWeek(week, -1); load(); };
$('#next').onclick = () => { week = shiftWeek(week, 1); load(); };
try { tab = localStorage.getItem('tab') || 'songs'; } catch {}
if (!['songs', 'technique', 'noodling', 'log'].includes(tab)) tab = 'songs';
let info = null;
async function welcome() {
  info = await api('/api/info');
  if (!info.tutorialSeen) $('#welcome').showModal();
  else if (!info.guideDone) guideStep1();
}
$('#welcome').addEventListener('close', async () => { const first = !info.tutorialSeen; info.tutorialSeen = true; await api('/api/seen', {}); if (first || !info.guideDone) guideStep1(); });

// first start: 1) the Weekly goals pencil glows with a hint, 2) after saving, a hint at the keyboard status, then done
function hint(anchor, text, btn) {
  document.querySelectorAll('.hint').forEach((h) => h.remove());
  const r = anchor.getBoundingClientRect();
  const h = document.createElement('div');
  h.className = 'hint'; h.innerHTML = `<span>${text}</span>${btn ? `<button class="primary small">${btn}</button>` : ''}`;
  document.body.appendChild(h);
  const w = h.offsetWidth;
  h.style.top = `${r.bottom + window.scrollY + 10}px`;
  h.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w + 14))}px`;
  return h;
}
function guideStep1() {
  if (info.guideDone) return;
  if (info.goalsSet) { $('#editGoals').classList.add('glow'); return guideStep2(); } // goals already set: on to playing
  $('#editGoals').classList.add('glow');
  hint($('#editGoals'), '<b>Start here.</b> Set what you want to practise this week.');
}
function guideStep2() {
  if (info.guideDone || !$('#editGoals').classList.contains('glow')) return;
  $('#editGoals').classList.remove('glow');
  const h = hint($('#status'), '<b>Now just play.</b> Plug in your keyboard: the bars fill as you go.', 'Got it');
  h.querySelector('button').onclick = async () => { h.remove(); info.guideDone = true; await api('/api/settings', { guideDone: true }); };
}
window.addEventListener('resize', () => document.querySelectorAll('.hint').forEach((h) => h.remove()));

function renderSettings() {
  const own = info.mode === 'piano-studio';
  $('#setBody').innerHTML = (info.app ? `<label class="set-row"><div><b>Record my keyboard in the background</b><div class="meta">On: NoteshAIre starts with your computer and keeps your keyboard's notes after you close the window. Off: closing the window quits it. The microphone is never used in the background.</div></div>
       <input type="checkbox" id="bgRec" class="switch" ${info.background ? 'checked' : ''}></label>` : '') + `<label class="set-row"><div><b>Keep recordings</b><div class="meta">Listen back to anything you played. Off: recordings are deleted after 7 days; your stats stay.${own ? ' Takes in a Piano Studio set are always kept.' : ''}</div></div>
       <input type="checkbox" id="keepRec" class="switch" ${info.keepRecordings ? 'checked' : ''}></label>`;
  $('#setBody').insertAdjacentHTML('afterbegin', `<label class="set-row"><div><b>I play</b><div class="meta">Keyboard players can plug in by USB. Everyone can use Listen.</div></div>
    <select id="instrument" class="mini">${[['piano', 'Piano / keyboard'], ['guitar', 'Guitar'], ['voice', 'Voice'], ['wind', 'Sax / brass / wind'], ['other', 'Something else']].map(([v, n]) => `<option value="${v}" ${info.instrument === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`);
  $('#instrument').onchange = async (e) => { info.instrument = e.target.value; await api('/api/settings', { instrument: info.instrument }); render(); };
  const bg = $('#bgRec');
  if (bg) bg.onchange = async () => { info.background = bg.checked; await api('/api/settings', { background: bg.checked }); };
  const k = $('#keepRec');
  if (k) k.onchange = async () => { info.keepRecordings = k.checked; await api('/api/settings', { keepRecordings: k.checked }); };
}
$('#replayTour').onclick = async () => { info.guideDone = false; await api('/api/settings', { guideDone: false }); showView('home'); $('#welcome').showModal(); };

// ---- bottom bar: Home, Stats, Settings ----
let view = 'home';
function showView(v) {
  view = v;
  document.querySelectorAll('nav.bottom button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  for (const x of ['home', 'stats', 'settings']) $(`#view-${x}`).hidden = x !== v;
  document.querySelector('header .week').style.visibility = v === 'settings' ? 'hidden' : '';
  document.querySelectorAll('.hint').forEach((x) => { x.hidden = v !== 'home'; });
  if (v === 'settings' && info) renderSettings();
  if (v === 'stats' && data) renderTrends();
  window.scrollTo(0, 0);
  try { localStorage.setItem('view', v); } catch {}
}
document.querySelectorAll('nav.bottom button').forEach((b) => { b.onclick = () => showView(b.dataset.view); });
$('#help').onclick = () => $('#welcome').showModal();
week = thisWeek();
welcome().then(() => { let v = 'home'; try { v = localStorage.getItem('view') || 'home'; } catch {} if (['home', 'stats', 'settings'].includes(v)) showView(v); });
load(); status(); setInterval(status, 3000);
