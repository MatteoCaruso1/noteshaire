'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (p, b) => { const r = await fetch(p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}); return r.json(); };

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const CAT = {
  technique: ['Technique', '--technique'], 'new-song': ['New repertoire', '--new-song'], 'known-song': ['Known songs', '--known-song'],
  learning: ['New material', '--learning'], unnamed: ['Unnamed', '--unnamed'], free: ['Free play', '--free'], recording: ['Red Grand Jazz', '--recording'], skip: ['Not practice', '--free'],
};
const COUNTS = [['technique', 'Technique'], ['new-song', 'New repertoire'], ['known-song', 'Known songs'], ['learning', 'New material'], ['recording', 'Filmed for Red Grand Jazz'], ['any', 'Any playing'],
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
  renderGoals(); renderSummary(); renderDays(); renderInbox();
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
    const pace = left && pct < 1 ? `<span class="pace">${short((goal - g.seconds) / left)} a day</span>` : '';
    const tick = g.minutes > 0 ? Math.max(2, (30 / g.minutes) * 100) : 100;
    return `<div class="goal ${pct >= 1 ? 'done' : ''}" style="--c:var(${colorOf(g.counts)})">
      <div class="goal-head"><span class="goal-name">${esc(g.name)}</span>
        <span class="goal-val num">${pace}<b>${hm(g.seconds)}</b> / ${hm(goal)}<span class="pct">${Math.round(pct * 100)}%</span></span></div>
      <div class="bar"><div class="fill" style="width:${w}%"></div><div class="ticks" style="--tick:${tick}%"></div></div></div>`;
  }).join('');
}

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
  if (data.offplan > 0) chips.push(`<span class="chip ${data.total && data.offplan / data.total > 0.3 ? 'warn' : ''}">Outside goals <b class="num">${hm(data.offplan)}</b></span>`);
  for (const k of ['known-song', 'free', 'unnamed']) if (c[k] > 30) chips.push(`<span class="chip" style="--c:var(${CAT[k][1]})"><i></i>${CAT[k][0]} <b class="num">${hm(c[k])}</b></span>`);
  $('#summary').innerHTML = chips.join('');
}

function renderDays() {
  const days = Object.entries(data.days), tot = (o) => Object.entries(o).filter(([k]) => k !== 'skip').reduce((a, [, v]) => a + v, 0);
  const max = Math.max(900, ...days.map(([, o]) => tot(o)));
  const today = ymd(new Date()), order = ['technique', 'new-song', 'learning', 'known-song', 'unnamed', 'free'];
  $('#days').innerHTML = days.map(([d, o]) => {
    const t = tot(o);
    const segs = order.filter((k) => o[k]).map((k) => `<span title="${CAT[k][0]} ${short(o[k])}" style="--c:var(${CAT[k][1]});height:${(o[k] / max) * 100}%"></span>`).join('');
    return `<div class="day ${d === today ? 'today' : ''}"><div class="stack">${segs}</div><div class="lbl">${dayName(new Date(`${d}T12:00:00`))}</div><div class="min num">${t >= 60 ? short(t) : ''}</div></div>`;
  }).join('');
}

const PLAY = '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z"/></svg>', STOP = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8"/></svg>';
function pieceMeta(p) {
  return [`${dayName(p.start_ms)} ${clock(p.start_ms)}`, mss(p.seconds), p.key, ...(p.style || [])].filter(Boolean).map(esc).join(' · ');
}
function renderInbox() {
  const box = $('#inbox');
  if (!data.inbox.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h2>Name ${data.inbox.length === 1 ? 'this' : `these ${data.inbox.length}`}</h2>` + data.inbox.map((p) => `
    <div class="take" data-id="${esc(p.id)}">
      <button class="play" title="Listen">${PLAY}</button>
      <div class="meta"><b>${p.guess ? `${esc(p.guess)}?` : p.throughKeys ? 'Through the keys?' : 'Song'}</b><br>${pieceMeta(p)}</div>
      <div class="name-form">
        <input placeholder="Song" list="songNames" value="${esc(p.guess || '')}">
        <span class="seg"><button class="new" data-s="new" title="New to my repertoire">New</button><button data-s="known" title="I know it">Known</button></span>
        ${p.throughKeys ? '<button class="primary tech">Technique</button>' : ''}
        <select class="mini" aria-label="Not a song"><option value="">Not a song</option><option value="free">Free play</option><option value="technique">Technique</option><option value="learning">New material</option><option value="skip">Not practice</option></select>
      </div></div>`).join('');
  box.querySelectorAll('.take').forEach((row) => {
    const id = row.dataset.id, inp = $('input', row);
    $('.play', row).onclick = (e) => togglePlay(id, e.currentTarget);
    row.querySelectorAll('.seg button').forEach((b) => { b.onclick = async () => { const name = inp.value.trim(); if (!name) { inp.focus(); return; } await api('/api/name', { piece: id, name, status: b.dataset.s }); load(); }; });
    inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) { const known = data.songs.find((x) => x.name.toLowerCase() === inp.value.trim().toLowerCase()); api('/api/name', { piece: id, name: inp.value.trim(), status: known ? known.status : 'new' }).then(load); } };
    const tb = $('.tech', row); if (tb) tb.onclick = async () => { await api('/api/kind', { piece: id, kind: 'technique' }); load(); };
    $('select', row).onchange = async (e) => { if (e.target.value) { await api('/api/kind', { piece: id, kind: e.target.value }); load(); } };
  });
}

function renderTab() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['songs', 'technique', 'noodling', 'log', 'trends']) $(`#tab-${t}`).hidden = t !== tab;
  ({ songs: renderSongs, technique: renderTechnique, noodling: renderNoodling, log: renderLog, trends: renderTrends })[tab]();
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
  el.innerHTML = areaTop('songs', '--new-song') + `<table><thead><tr><th>Song</th><th></th><th>This week</th><th class="r">Plays</th><th class="r">Key</th><th class="r">Last</th></tr></thead><tbody>${data.songs.map((s) => `
    <tr><td>${esc(s.name)}</td>
      <td><button class="status-btn ${s.status === 'new' ? 'new' : ''}" data-id="${esc(s.id)}" data-s="${esc(s.status)}">${s.status === 'new' ? 'New' : 'Known'}</button></td>
      <td class="num"><span class="mbar" style="width:${Math.round((s.weekSeconds / max) * 120)}px;--c:var(${s.status === 'new' ? '--new-song' : '--known-song'})"></span>${s.weekSeconds ? short(s.weekSeconds) : ''}</td>
      <td class="r num">${s.plays}</td><td class="r">${esc(s.key || '')}</td><td class="r">${ago(s.last)}</td></tr>`).join('')}</tbody></table>`;
  wireSpan(el);
  el.querySelectorAll('.status-btn').forEach((b) => { b.onclick = async () => { await api('/api/song', { id: b.dataset.id, status: b.dataset.s === 'new' ? 'known' : 'new' }); load(); }; });
}

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
let keySpan = 'week';
/** circle of fifths for one area; brightness = time in that key */
function wheel(keys, color, noun) {
  const C = 110, max = Math.max(60, ...keys);
  const at = (i, r) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
  const dots = FIFTHS.map((k, i) => {
    const [x, y] = at(i, 88), v = keys[k], on = v >= 10;
    return `<g class="${on ? 'hot' : ''}"><title>${KEYS[k]}${on ? ` ${short(v)}` : ''}</title><circle cx="${x}" cy="${y}" r="${on ? 12 + Math.sqrt(v / max) * 7 : 12}" fill="${on ? `color-mix(in srgb, var(${color}) ${Math.round(30 + Math.sqrt(v / max) * 70)}%, #15171a)` : '#15171a'}" stroke="#23262c"/><text x="${x}" y="${y}">${KEYS[k]}</text></g>`;
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
    const free = p.segs.filter((x) => x.cat === 'free').reduce((a, x) => a + x.seconds, 0), learn = p.segs.filter((x) => x.cat === 'learning').reduce((a, x) => a + x.seconds, 0);
    const keyIdx = (p.segs.find((x) => (x.cat === 'free' || x.cat === 'learning') && x.key != null) || {}).key;
    return `<div class="take" data-id="${esc(p.id)}"><button class="play" title="Listen">${PLAY}</button>
      <div class="meta"><b>${dayName(p.start_ms)} ${clock(p.start_ms)}</b><br>${[mss(free + learn), keyIdx != null ? KEYS[keyIdx] : '', ...(p.style || [])].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="what">${free ? `<span class="tag" style="--c:var(--free)">Free play</span>` : ''}${learn ? `<span class="tag" style="--c:var(--learning)">New material</span>` : ''}</div></div>`;
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
  const max = Math.max(1800, ...t.map((w) => w.total)), order = ['technique', 'new-song', 'learning', 'known-song', 'unnamed', 'free'];
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
const KIND_OPTS = [['', 'Auto'], ['song', 'Song'], ['technique', 'Technique'], ['learning', 'New material'], ['free', 'Free play'], ['skip', 'Not practice']];
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
    const extra = [...labels.slice(0, 3), p.key && !labels.length ? p.key : '', ...(p.style || [])].filter(Boolean).map((x) => `<span class="tag dim">${esc(x)}</span>`);
    const cur = p.label && p.label.kind ? p.label.kind : '';
    return `<div class="entry" data-ids="${esc(p.ids.join(' '))}"><span class="when num">${clock(p.start_ms)}</span><span class="num">${mss(p.played)}</span>
      <span class="what">${tags.join('')}${extra.join('')}</span>
      <span class="row-tools">${p.ids.length === 1 && p.seconds >= 20 ? '<button class="icon cut" title="Cut in two">✂</button>' : ''}${p.joinable ? '<button class="icon join" title="Join with the piece before">Join</button>' : ''}
      <select class="mini" aria-label="Fix">${KIND_OPTS.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>`;
  }).join('')}</div>`).join('');
  el.querySelectorAll('.entry .cut').forEach((b) => { b.onclick = () => openCutter(b.closest('.entry')); });
  el.querySelectorAll('.entry .join').forEach((b) => { b.onclick = async () => { await api('/api/join', { piece: b.closest('.entry').dataset.ids }); load(); }; });
  el.querySelectorAll('.entry select').forEach((s) => { s.onchange = async () => { for (const id of s.closest('.entry').dataset.ids.split(' ')) await api('/api/kind', { piece: id, kind: s.value || null }); load(); }; });
}

// ---- goals editor ----
function goalRow(g) {
  const counts = COUNTS.filter(([v]) => v !== 'recording' || (info && info.mode === 'piano-studio') || g.counts === 'recording');
  return `<div class="grow-row"><input class="gn" value="${esc(g.name)}" placeholder="Goal"><input class="gh num" type="number" min="0" step="0.25" value="${+(g.minutes / 60).toFixed(2)}" title="Hours">
    <select class="gc">${counts.map(([v, n]) => `<option value="${v}" ${v === g.counts ? 'selected' : ''}>${n}</option>`).join('')}${data.songs.map((s) => `<option value="song:${esc(s.id)}" ${`song:${s.id}` === g.counts ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <button type="button" class="x" title="Remove">×</button></div>`;
}
function openGoals() {
  const rows = $('#goalRows');
  rows.innerHTML = data.goals.map(goalRow).join('');
  const wire = () => rows.querySelectorAll('.x').forEach((b) => { b.onclick = () => b.parentElement.remove(); });
  wire();
  $('#addGoal').onclick = () => { rows.insertAdjacentHTML('beforeend', goalRow({ name: '', minutes: 60, counts: 'technique' })); wire(); };
  $('#goalEdit').showModal();
}
$('#goalEdit').addEventListener('close', async () => {
  if ($('#goalEdit').returnValue !== 'save') return;
  const goals = [...document.querySelectorAll('#goalRows .grow-row')].map((r) => ({ name: $('.gn', r).value.trim(), minutes: Math.round(+$('.gh', r).value * 60), counts: $('.gc', r).value })).filter((g) => g.name && g.minutes > 0);
  await api('/api/goals', { week: data.week, goals });
  load();
});

// ---- listening to a take (a plain built-in piano tone, enough to recognise the tune) ----
let audio = null, playing = null;
function stopPlay() { if (playing) playing.stop(); }
async function playFrom(id, from, secs) {
  stopPlay();
  audio ||= new AudioContext();
  const notes = (await api(`/api/notes?id=${encodeURIComponent(id)}`)).filter((n) => n[0] >= from && n[0] < from + secs).map(([t, ...r]) => [t - from, ...r]);
  playing = scheduleNotes(notes, id, null, secs);
}
function scheduleNotes(notes, id, btn, limit) {
  const t0 = audio.currentTime + 0.05, out = audio.createGain(); out.gain.value = 0.18; out.connect(audio.destination);
  const nodes = [];
  for (const [t, note, dur, vel] of notes) {
    if (t > limit) break;
    const f = 440 * 2 ** ((note - 69) / 12), g = audio.createGain(), o1 = audio.createOscillator(), o2 = audio.createOscillator();
    o1.type = 'triangle'; o1.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    const at = t0 + t, len = Math.min(4, dur + 0.4), peak = (vel / 127) * 0.5;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    o1.connect(g); o2.connect(g); g.connect(out); o1.start(at); o2.start(at); o1.stop(at + len); o2.stop(at + len);
    nodes.push(o1, o2);
  }
  const p = { id, stop: () => { clearTimeout(p.timer); out.disconnect(); nodes.forEach((n) => { try { n.stop(); } catch {} }); if (btn) btn.innerHTML = PLAY; if (playing === p) playing = null; } };
  p.timer = setTimeout(() => p.stop(), (Math.min(limit, notes.length ? notes[notes.length - 1][0] : 0) + 4) * 1000);
  if (btn) btn.innerHTML = STOP;
  return p;
}
async function togglePlay(id, btn) {
  if (playing) { const was = playing.id; playing.stop(); if (was === id) return; }
  audio ||= new AudioContext();
  const notes = await api('/api/notes?id=' + encodeURIComponent(id));
  playing = scheduleNotes(notes, id, btn, 90);
}

// ---- live status ----
let lastTakes = -1;
async function status() {
  try {
    const s = await api('/api/status');
    let dot = '', txt = '';
    const kb = (s.nord || '').split(',')[0].replace(/\s*(MIDI|USB)\s*(\d+)?$/i, '').trim();
    if (s.recording) { dot = 'rec'; txt = `Recording ${mss(s.take_seconds)}`; }
    else if (s.nord) { dot = 'ok'; txt = kb.length > 22 ? `${kb.slice(0, 21)}…` : kb || 'Keyboard'; }
    else if (s.recorder === 'on' && s.error) { dot = 'bad'; txt = 'Keyboard busy'; }
    else if (s.recorder === 'on') { dot = ''; txt = 'No keyboard'; }
    else if (s.recorder === 'starting' || s.recorder === 'checking') { dot = 'bad'; txt = 'Starting'; }
    else { dot = 'bad'; txt = 'Recorder off'; }
    $('#status').innerHTML = `<span class="dot ${dot}"></span>${esc(txt)}`;
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
if (!['songs', 'technique', 'noodling', 'log', 'trends'].includes(tab)) tab = 'songs';
let info = null;
async function welcome() {
  info = await api('/api/info');
  if (!info.tutorialSeen) $('#welcome').showModal();
}
$('#welcome').addEventListener('close', () => api('/api/seen', {}));
$('#help').onclick = () => $('#welcome').showModal();
week = thisWeek();
welcome();
load(); status(); setInterval(status, 3000);
