// Practice data: every take Piano Studio saved, analysed once and cached; his song names, corrections and weekly goals.
// His data lives next to the recordings (outside any repo): <root>/practice/.
import fs from 'node:fs';
import path from 'node:path';
import { readSmf } from './midi.mjs';
import { analyzeTake, VERSION, TECH, MAJOR } from './analyze.mjs';
import { fingerprint, identify, likeness, MATCH } from './songs.mjs';

export const SONG_MIN_S = 45;      // a music piece this long is a song to name (shorter is free play)

function pianoRoot() {
  try { return JSON.parse(fs.readFileSync('C:/dev/ad-machine/config/piano.json', 'utf8')).root; } catch { return 'C:/Users/matte/Videos/Piano Studio'; }
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.tmp`; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, f); };
const pad = (n) => String(n).padStart(2, '0');
export const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function weekStart(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayOf(d.getTime()); }
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'song';

// the categories a stretch of time can fall in
export const CATS = {
  technique: 'Technique', 'new-song': 'New repertoire', 'known-song': 'Known repertoire', learning: 'New material',
  unnamed: 'Unnamed', free: 'Free play', skip: 'Not practice',
};

export const DEFAULT_GOALS = [
  { id: 'technique', name: 'Technique', minutes: 180, counts: 'technique' },
  { id: 'new-standards', name: 'New standards', minutes: 180, counts: 'new-song' },
  { id: 'red-grand-jazz', name: 'Red Grand Jazz', minutes: 120, counts: 'recording' },
  { id: 'new-material', name: 'New material', minutes: 60, counts: 'learning' },
];

export function openStore({ root = process.env.PRACTICE_ROOT || pianoRoot(), data = process.env.PRACTICE_DATA } = {}) {
  const DATA = data || path.join(root, 'practice');
  const F = { songs: path.join(DATA, 'songs.json'), labels: path.join(DATA, 'labels.json'), goals: path.join(DATA, 'goals.json'), ids: path.join(DATA, 'identify.json') };
  fs.mkdirSync(path.join(DATA, 'cache'), { recursive: true });

  const songsDb = () => readJson(F.songs, { songs: [] });
  const labels = () => readJson(F.labels, {});
  const idCache = () => readJson(F.ids, {});

  /** every take on disk: [{ id: 'YYYY-MM-DD/take-HHMMSS', file, start_ms }] */
  function takes() {
    const dir = path.join(root, 'midi');
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const day of fs.readdirSync(dir).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort()) {
      for (const f of fs.readdirSync(path.join(dir, day)).filter((f) => /^take-\d{6}\.mid$/.test(f)).sort()) {
        const base = f.replace('.mid', ''), meta = readJson(path.join(dir, day, `${base}.json`), {});
        const [, hh, mm, ss] = base.match(/(\d\d)(\d\d)(\d\d)$/);
        const start = meta.start_ms || new Date(`${day}T${hh}:${mm}:${ss}`).getTime();
        out.push({ id: `${day}/${base}`, file: path.join(dir, day, f), start_ms: start });
      }
    }
    return out;
  }

  const notesCache = new Map();
  function takeNotes(take) {
    const st = fs.statSync(take.file);
    const hit = notesCache.get(take.id);
    if (hit && hit.mtime === st.mtimeMs) return hit.m;
    const m = readSmf(fs.readFileSync(take.file));
    notesCache.set(take.id, { mtime: st.mtimeMs, m });
    if (notesCache.size > 40) notesCache.delete(notesCache.keys().next().value);
    return m;
  }

  /** a take's pieces (cached on disk by analyser version and file time) */
  function analysis(take) {
    const cf = path.join(DATA, 'cache', `${take.id.replace('/', '_')}.json`);
    const st = fs.statSync(take.file);
    const c = readJson(cf, null);
    if (c && c.version === VERSION && c.mtime === st.mtimeMs) return c.pieces;
    const m = takeNotes(take);
    const pieces = analyzeTake(m).map((p) => {
      const ns = m.notes.filter((n) => n.t >= p.t0 && n.t < p.t1);
      return { ...p, id: `${take.id}@${Math.round(p.t0)}`, fp: fingerprint(ns, p.t0, p.t1) };
    });
    writeJson(cf, { version: VERSION, mtime: st.mtimeMs, pieces });
    return pieces;
  }

  /** Piano Studio sets: which stretches of which takes were filmed for the channel, and the names he gave them */
  function filmed() {
    const sets = path.join(root, 'sets'), out = [];
    if (!fs.existsSync(sets)) return out;
    for (const d of fs.readdirSync(sets)) {
      const s = readJson(path.join(sets, d, 'set.json'), null);
      if (!s) continue;
      for (const g of s.segments || []) if (g.take && g.t1 > g.t0) out.push({ set: d, title: s.title, take: g.take, t0: g.t0, t1: g.t1, name: (g.name || '').trim(), include: g.include !== false });
    }
    return out;
  }

  /** all pieces with their time, category and song, oldest first */
  function allPieces() {
    const lab = labels(), db = songsDb(), film = filmed();
    const songs = new Map(db.songs.map((s) => [s.id, s]));
    const out = [];
    for (const take of takes()) {
      let pieces;
      try { pieces = analysis(take); } catch (e) { console.error(`[practice] ${take.id}: ${e.message}`); continue; }
      for (const p of pieces) {
        const f = film.filter((g) => g.take === take.id && g.t0 < p.t1 && g.t1 > p.t0);
        out.push({ ...p, take: take.id, start_ms: take.start_ms + p.t0 * 1000, recording: f.length > 0, filmedAs: f.find((g) => g.include && g.name)?.name || '', label: lab[p.id] || null });
      }
    }
    // a song named in Piano Studio becomes a song here, with that take as its first reference
    let changed = false;
    for (const p of out) {
      if (!p.filmedAs || p.label) continue;
      const id = slug(p.filmedAs);
      if (!songs.has(id)) { const s = { id, name: p.filmedAs, status: 'known', created: new Date().toISOString(), from: 'piano-studio' }; db.songs.push(s); songs.set(id, s); }
      lab[p.id] = { song: id, by: 'piano-studio' }; p.label = lab[p.id]; changed = true;
    }
    if (changed) { writeJson(F.songs, db); writeJson(F.labels, lab); }
    identifyAll(out, db.songs);
    return out;
  }

  /** songs for the matcher: each with up to 4 of its named pieces as references (the longest first) */
  function libraryRefs(pieces, songs) {
    const byId = new Map(pieces.map((p) => [p.id, p]));
    return songs.map((s) => {
      const refs = pieces.filter((p) => p.label && p.label.song === s.id && p.fp && p.fp.length >= MATCH.min_frames)
        .sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0)).slice(0, 4);
      return { id: s.id, refs: refs.map((r) => ({ id: r.id, fp: byId.get(r.id).fp })) };
    }).filter((s) => s.refs.length);
  }

  /** unnamed music pieces -> the song they sound like. Scores are cached per song and its references. */
  function identifyAll(pieces, songs) {
    const lib = libraryRefs(pieces, songs);
    const cache = idCache();
    let dirty = false;
    for (const p of pieces) {
      p.song = p.label && p.label.song ? p.label.song : null;
      p.auto = false;
      if (p.song || (p.label && p.label.kind) || !isMusic(p) || !p.fp || p.fp.length < MATCH.min_frames) continue;
      const c = cache[p.id] || (cache[p.id] = {});
      for (const s of lib) {
        const sig = s.refs.map((r) => r.id).join(',');
        if (c[s.id] && c[s.id].sig === sig) continue;
        let best = 0;
        for (const r of s.refs) if (r.id !== p.id) best = Math.max(best, likeness(p.fp, r.fp));
        c[s.id] = { sig, score: best }; dirty = true;
      }
      const ranked = lib.map((s) => ({ song: s.id, score: c[s.id].score })).sort((a, b) => b.score - a.score);
      const top = ranked[0], runner = ranked[1];
      if (top && top.score >= MATCH.accept && (!runner || top.score >= runner.score * MATCH.margin)) { p.song = top.song; p.auto = true; p.matchScore = top.score; }
      else if (top && top.score >= MATCH.accept) { p.guess = top.song; p.matchScore = top.score; }
    }
    if (dirty) writeJson(F.ids, cache);
  }

  const isMusic = (p) => p.segs.some((s) => s.kind === 'music') && musicSeconds(p) >= Math.min(SONG_MIN_S, 0.6 * (p.t1 - p.t0));
  const musicSeconds = (p) => p.segs.filter((s) => s.kind === 'music').reduce((a, s) => a + s.t1 - s.t0, 0);

  /** one piece -> [{ cat, seconds, key, label, kind }] (its stretches, with corrections applied) */
  function stretches(p, songsById) {
    const kindFix = p.label && p.label.kind;
    if (kindFix === 'skip') return [{ cat: 'skip', seconds: p.t1 - p.t0 }];
    if (kindFix && kindFix !== 'song') return [{ cat: kindFix, seconds: p.t1 - p.t0, key: p.keyRoot }];
    const songCat = () => {
      const s = p.song && songsById.get(p.song);
      if (s) return s.status === 'new' ? 'new-song' : 'known-song';
      return musicSeconds(p) >= SONG_MIN_S || kindFix === 'song' ? 'unnamed' : 'free';
    };
    return p.segs.map((s) => {
      const sec = s.t1 - s.t0;
      if (TECH.has(s.kind)) return { cat: 'technique', seconds: sec, kind: s.kind, label: s.label, keys: s.keys, runs: s.runs };
      if (s.kind === 'lick' || s.kind === 'fragment') return { cat: 'learning', seconds: sec, kind: s.kind, key: s.key };
      return { cat: kindFix === 'song' || isMusic(p) ? songCat() : 'free', seconds: sec, kind: 'music', key: p.keyRoot };
    });
  }

  // ---- goals --------------------------------------------------------------------------------------------------------
  function goalsFor(week) {
    const g = readJson(F.goals, { weeks: {} });
    if (g.weeks[week]) return g.weeks[week];
    const earlier = Object.keys(g.weeks).filter((w) => w < week).sort().pop();
    return earlier ? g.weeks[earlier] : DEFAULT_GOALS;
  }
  function setGoals(week, goals) {
    const g = readJson(F.goals, { weeks: {} });
    g.weeks[week] = goals.map((x) => ({ id: x.id || slug(x.name), name: String(x.name).slice(0, 40), minutes: Math.max(0, Math.round(+x.minutes || 0)), counts: x.counts }));
    writeJson(F.goals, g);
    return g.weeks[week];
  }
  /** does this stretch of a piece count toward a goal? */
  function counts(goal, st, p) {
    const c = goal.counts || '';
    if (st.cat === 'skip') return false;
    if (c === 'recording') return p.recording;
    if (c === 'any') return true;
    if (c.startsWith('song:')) return p.song === c.slice(5);
    if (c.startsWith('key:')) { const k = +c.slice(4); return st.key === k || (st.keys || []).includes(k); }
    if (c.startsWith('style:')) return (p.style || []).includes(c.slice(6));
    return c.split('|').includes(st.cat);
  }

  // ---- the week ----------------------------------------------------------------------------------------------------
  function week(startDay, pre) {
    const t0 = new Date(`${startDay}T00:00:00`).getTime(), t1 = t0 + 7 * 864e5 + 3600e3; // the extra hour covers a DST week
    const all = pre || allPieces(); // first: it adds songs named in Piano Studio
    const db = songsDb(), songsById = new Map(db.songs.map((s) => [s.id, s]));
    const goals = goalsFor(startDay).map((g) => ({ ...g, seconds: 0 }));
    const days = {}; for (let i = 0; i < 7; i++) days[dayOf(t0 + i * 864e5 + 3600e3)] = {};
    let total = 0, offplan = 0;
    const cats = {}, keyboard = new Array(88).fill(0), songMin = {};
    const tech = {};
    const pieces = [];
    for (const p of all) {
      if (p.start_ms < t0 || p.start_ms >= t1) continue;
      const day = dayOf(p.start_ms), st = stretches(p, songsById);
      let pieceSec = 0, offSec = 0;
      for (const s of st) {
        if (s.cat === 'skip') continue;
        pieceSec += s.seconds;
        cats[s.cat] = (cats[s.cat] || 0) + s.seconds;
        if (days[day]) days[day][s.cat] = (days[day][s.cat] || 0) + s.seconds;
        let hit = false;
        for (const g of goals) if (counts(g, s, p)) { g.seconds += s.seconds; hit = true; }
        if (!hit) offSec += s.seconds;
        if (s.cat === 'technique') for (const r of s.runs || []) {
          const k = tech[r.label] || (tech[r.label] = { label: r.label, key: r.key, kind: r.kind, seconds: 0, nps: [], even: [] });
          k.seconds += r.t1 - r.t0; k.nps.push(r.nps); k.even.push(r.even);
        }
      }
      if (!pieceSec) continue;
      total += pieceSec; offplan += offSec;
      p.keys88.forEach((v, i) => { keyboard[i] += v; });
      if (p.song) songMin[p.song] = (songMin[p.song] || 0) + pieceSec;
      pieces.push(slim(p, st, songsById));
    }
    const songs = db.songs.map((s) => {
      const mine = all.filter((p) => p.song === s.id);
      const last = mine.length ? Math.max(...mine.map((p) => p.start_ms)) : null;
      const keyVotes = {}; mine.forEach((p) => { if (p.key) keyVotes[p.key] = (keyVotes[p.key] || 0) + (p.t1 - p.t0); });
      return { id: s.id, name: s.name, status: s.status, weekSeconds: songMin[s.id] || 0, plays: mine.filter((p) => p.t1 - p.t0 >= SONG_MIN_S).length,
        allSeconds: mine.reduce((a, p) => a + p.t1 - p.t0, 0), last, key: Object.entries(keyVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || null };
    }).sort((a, b) => b.weekSeconds - a.weekSeconds || (b.last || 0) - (a.last || 0));
    const inbox = all.filter((p) => !p.song && !(p.label && p.label.kind) && isMusic(p) && musicSeconds(p) >= SONG_MIN_S)
      .sort((a, b) => b.start_ms - a.start_ms).slice(0, 30).map((p) => slim(p, stretches(p, songsById), songsById));
    const techList = Object.values(tech).map((k) => ({ ...k, nps: +(k.nps.reduce((a, b) => a + b, 0) / k.nps.length).toFixed(1), even: +(k.even.reduce((a, b) => a + b, 0) / k.even.length).toFixed(2) })).sort((a, b) => b.seconds - a.seconds);
    const keys = { week: keyTally(all, t0, t1, songsById), month: keyTally(all, t1 - 28 * 864e5, t1, songsById) };
    return { week: startDay, total, offplan, goals, days, cats, keys, keyboard, songs, pieces: pieces.reverse(), inbox, technique: techList, streak: streak(all), drills: drillHistory(all) };
  }

  function slim(p, st, songsById) {
    const s = p.song && songsById.get(p.song);
    return { id: p.id, take: p.take, start_ms: p.start_ms, seconds: +(p.t1 - p.t0).toFixed(1), key: p.key, bpm: p.bpm, style: p.style,
      song: p.song, songName: s ? s.name : null, auto: p.auto, guess: p.guess && songsById.get(p.guess) ? songsById.get(p.guess).name : null,
      recording: p.recording, label: p.label, segs: st.map((x) => ({ cat: x.cat, seconds: +x.seconds.toFixed(1), label: x.label || null, kind: x.kind || null })) };
  }

  /** time in each key (by tonic, 0 = C), songs and technique apart. A named song counts in its usual key (the key of most
   *  of its takes), so one odd reading does not move it; free play and stop-start learning are left out. */
  function keyTally(all, from, to, songsById) {
    const songKey = {};
    for (const p of all) if (p.song && p.keyRoot != null) { const v = (songKey[p.song] ||= new Array(12).fill(0)); v[p.keyRoot] += p.t1 - p.t0; }
    const usual = (id) => { const v = songKey[id]; return v ? v.indexOf(Math.max(...v)) : null; };
    const songs = new Array(12).fill(0), tech = new Array(12).fill(0), names = {};
    for (const p of all) {
      if (p.start_ms < from || p.start_ms >= to) continue;
      for (const st of stretches(p, songsById)) {
        if (st.cat === 'technique') for (const r of st.runs || []) tech[r.key] += r.t1 - r.t0;
        else if (st.cat === 'new-song' || st.cat === 'known-song' || st.cat === 'unnamed') {
          const k = p.song ? usual(p.song) : p.keyRoot;
          if (k == null) continue;
          songs[k] += st.seconds;
          const n = p.song && songsById.get(p.song) ? songsById.get(p.song).name : null;
          if (n) (names[k] ||= new Set()).add(n);
        }
      }
    }
    return { songs, tech, names: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, [...v]])) };
  }

  /** days in a row with at least 10 minutes played, ending today (or yesterday, if today has nothing yet) */
  function streak(all) {
    const per = {};
    for (const p of all) if (!(p.label && p.label.kind === 'skip')) per[dayOf(p.start_ms)] = (per[dayOf(p.start_ms)] || 0) + p.t1 - p.t0;
    let n = 0, d = new Date(); d.setHours(12, 0, 0, 0);
    if ((per[dayOf(d.getTime())] || 0) < 600) d.setDate(d.getDate() - 1);
    while ((per[dayOf(d.getTime())] || 0) >= 600) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /** each drill type ("major scale") over the last 8 weeks: top notes a second per week, keys done */
  function drillHistory(all) {
    const since = Date.now() - 56 * 864e5, out = {};
    for (const p of all) {
      if (p.start_ms < since) continue;
      for (const s of p.segs) for (const r of s.runs || []) {
        const type = r.label.replace(/^[A-G][b#]?/, '').trim(), w = weekStart(p.start_ms), d = out[type] || (out[type] = {});
        const o = d[w] || (d[w] = { week: w, nps: 0, seconds: 0 });
        o.nps = Math.max(o.nps, r.nps); o.seconds += r.t1 - r.t0;
      }
    }
    return Object.fromEntries(Object.entries(out).map(([t, d]) => [t, Object.values(d).sort((a, b) => a.week.localeCompare(b.week))]));
  }

  /** the last n weeks: time by category and how full each goal got */
  function trends(n = 12) {
    const all = allPieces(), out = [];
    let w = weekStart(Date.now());
    for (let i = 0; i < n; i++) {
      const x = week(w, all);
      out.unshift({ week: w, total: x.total, cats: x.cats, goals: x.goals.map((g) => ({ name: g.name, counts: g.counts, pct: g.minutes ? g.seconds / (g.minutes * 60) : 0 })) });
      const d = new Date(`${w}T12:00:00`); d.setDate(d.getDate() - 7); w = dayOf(d.getTime());
    }
    return out;
  }

  /** technique over time: notes a second and evenness for one scale or pattern label, per day */
  function progress(label) {
    const out = {};
    for (const p of allPieces()) for (const s of p.segs) for (const r of s.runs || []) {
      if (r.label !== label) continue;
      const d = dayOf(p.start_ms), o = out[d] || (out[d] = { day: d, nps: [], even: [], seconds: 0 });
      o.nps.push(r.nps); o.even.push(r.even); o.seconds += r.t1 - r.t0;
    }
    return Object.values(out).sort((a, b) => a.day.localeCompare(b.day)).map((o) => ({ day: o.day, seconds: Math.round(o.seconds), nps: +Math.max(...o.nps).toFixed(1), even: +(o.even.reduce((a, b) => a + b, 0) / o.even.length).toFixed(2) }));
  }

  // ---- his edits ---------------------------------------------------------------------------------------------------
  function nameSong(pieceId, name, status) {
    const db = songsDb(), lab = labels();
    const id = slug(name);
    let s = db.songs.find((x) => x.id === id || x.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!s) { s = { id, name: String(name).trim().slice(0, 80), status: status || 'new', created: new Date().toISOString() }; db.songs.push(s); }
    else if (status) s.status = status;
    lab[pieceId] = { song: s.id, at: new Date().toISOString() };
    writeJson(F.songs, db); writeJson(F.labels, lab);
    return s;
  }
  function setKind(pieceId, kind) {
    const lab = labels();
    if (!kind) delete lab[pieceId]; else lab[pieceId] = { kind, at: new Date().toISOString() };
    writeJson(F.labels, lab);
  }
  function updateSong(id, patch) {
    const db = songsDb(), s = db.songs.find((x) => x.id === id);
    if (!s) return null;
    if (patch.status) s.status = patch.status === 'new' ? 'new' : 'known';
    if (patch.name) s.name = String(patch.name).trim().slice(0, 80);
    writeJson(F.songs, db);
    return s;
  }
  function pieceNotes(pieceId) {
    const [takeId, at] = pieceId.split('@');
    const take = takes().find((t) => t.id === takeId);
    if (!take) return null;
    const p = analysis(take).find((x) => x.id === pieceId);
    if (!p) return null;
    const m = takeNotes(take);
    return m.notes.filter((n) => n.t >= p.t0 && n.t < p.t1).map((n) => [+(n.t - p.t0).toFixed(3), n.note, +n.dur.toFixed(3), n.vel]);
  }

  return { root, DATA, takes, allPieces, week, trends, goalsFor, setGoals, nameSong, setKind, updateSong, pieceNotes, progress, songs: () => songsDb().songs, weekStart };
}

export { MAJOR };
