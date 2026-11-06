# NoteshAIre (folder practice-log): read this first

Matteo's own practice tracker (asked for 2026-11-05). Every note he plays on the Nord Grand is recorded by Piano Studio
(ad-machine `scripts/piano/piano-studio.mjs`); this app reads those takes, works out what he practised, and fills his weekly
goals from what was played, never from what he says he played (his words: "there's no way to fake it"). The global
`~/.claude/CLAUDE.md` rules apply (do it yourself, push finished work, plain-word reports).

## His goals (week of 2026-11-02)
3 h technique (exercises he knows, drilled in different keys), 3 h standards new to his repertoire, 2 h recording for the
Red Grand Jazz channel, 1 h new material (new licks or runs over a progression, learned from a video). Goals are per week,
edited in the app (pencil by the bars), and carry to the next week.

## How it works
- `electron/main.mjs`: the desktop app (window, tray, start at login, updates). `src/server.mjs`: the local server; recorder
  mode `builtin` (src/recorder.mjs, any USB MIDI keyboard; everyone else) or `piano-studio` (his laptop, auto-detected).
  Old way: `node src/server.mjs` on http://127.0.0.1:4320 (laptop only). Starts with Windows hidden (Startup shortcut, made by
  `npm run install-app`), desktop shortcut "Practice" opens it in an Edge app window. Keeps Piano Studio running (Windows
  lets one program hold the Nord's MIDI port, so Piano Studio stays the only recorder) and restarts it after a code update
  only when idle (not recording, 20 min since playing, no video build).
- `src/analyze.mjs`: take -> pieces (4 s with no key struck) -> 12 s windows classified: scale, arpeggio, pattern (a figure
  moved; a lick taken through the keys), lick (same phrase repeated at one pitch = learning), fragment (stop-start), music.
  Technique runs are named per key ("Db major scale"); key (Krumhansl + the final chord), tempo, feel (Ballad / Medium /
  Up-tempo, Stride, Walking bass). Bump `VERSION` when the output changes: the cache rebuilds.
- `src/songs.mjs`: which song. Chroma every 1.5 s, compared 4 frames at a time with a local alignment, the query tried at
  5 speeds. He names a song once (New or Known); later takes are recognised. Songs he named in a Piano Studio set are
  imported as Known with that take as reference.
- `src/store.mjs`: his data in `C:/Users/matte/Videos/Piano Studio/practice/` (songs.json, labels.json, goals.json, cache/).
  Goal counts: technique, new-song, known-song, learning, recording (a take in any Piano Studio set), any, key:<0-11>,
  style:<tag>, song:<id>. A correction moves time between categories; it never adds time.
- `ui/`: one page, no build step. Kept terse on purpose (owner: "no description text when it's not necessary").
  Tabs (owner 2026-11-06): Songs, Technique, Noodling share one layout (keys wheel, keyboard heatmap, untouched keys,
  then the list: songs / drills / improv pieces with play buttons; new material sits under Noodling), then Log and Trends.

## Tests
`npm test` (about 2 s): generated practice with known answers (`tests/gen.mjs`) for every drill and feel, song matching
across feels and tempos, the weekly totals, and his real 2026-11-05 session when it is on the laptop (retries must match
their song, wrong songs must score under half). Add a case here for every misread he reports, using the real take.
Demo: `node tests/make-demo.mjs <folder>` then run the server with `PRACTICE_ROOT=<folder> PRACTICE_PORT=4321
PRACTICE_NO_RECORDER=1`.

## Measured (2026-11-05)
Generated practice: 99% of the time labelled right; every key and feel right; every song take matched, including a stride
take at 2.6x the tempo of the ballad it was named from. His Beatles session: weakest right match 0.208, strongest wrong 0.054.
Known rough edge: a lick taken through the keys with no breath between keys can report a few extra keys.

## One recording, two things (owner 2026-11-06)
He plays straight from a drill into a tune with no pause, and must never feel he has to pause for the tool. Pauses never
lose time (time adds up by kind; a short stretch within 30 s after a song carries on that song). Boundaries: his scissors in
the Log (cuts.json, click the bar to hear the moment, Join undoes it); once a song is named, `autoCuts` finds it inside any
longer unnamed piece and cuts around it (autocuts.json); a piece through 7+ keys that is no known song is offered as
"Through the keys?" with a Technique button. Texture or harmony change detection was measured on his real take
(ii-V-Is through the keys into Body and Soul) and is not reliable enough to cut on its own: do not add it without a new
measurement on real takes.

## Sharing (owner 2026-11-06)
Friends install from GitHub Releases (`.github/workflows/release.yml` builds Windows + Mac on a `v*` tag). Unsigned for now:
Windows shows SmartScreen ("More info" -> "Run anyway"), Mac needs "Open Anyway"; Windows copies auto-update
(electron-updater, installs when idle with the window closed), Mac copies get a "new version" notice. Friends' data lives in
the app's userData folder; nothing leaves the computer. First open shows a one-page tutorial (ui/index.html #welcome).
Release cadence: bump `version` in package.json, tag, push; batch changes, at most weekly, fixes same day.
His laptop runs the installed app too (piano-studio mode); `Practice.vbs` / `npm run install-app` is the old setup.
Repo: https://github.com/MatteoCaruso1/noteshaire (public). Friends' link: https://matteocaruso1.github.io/noteshaire/ (docs/index.html on
GitHub Pages: one button, Mac or Windows picked for them; files NoteshAIre-Mac.dmg (universal) and NoteshAIre-Windows.exe).
Mac signing (Developer ID Application, team RAPMF3U34U, valid to 2027-12-06): key, certificate and the secret values are
in `C:\Users\matte\Documents\NoteshAIre signing\` (never in the repo). The Mac build signs and notarizes once the five repo
secrets are set; until then it builds unsigned. GitHub's Mac runners sometimes have no capacity: re-push the tag.

## Owner notes 2026-11-06 (after using it)
Stay a desktop app (a web page can only hear the keyboard while the tab is open; Safari has no Web MIDI); updates reach
installed copies by themselves. One Noodling category (licks, stop-start, free play); noodling runs under 30 s are not
counted (NOODLE_MIN_S, bursts under a minute apart add up). Goals can count several kinds ("Known songs + Noodling");
his "Playing around" = known-song|noodling. Stats name only time in no goal ("Not in any goal", unnamed: "name them to
count"). Status: "<keyboard> connected", the text breathes green while notes come in (no red "Recording"). Weekly goals +
session goals (picked from weekly goals, capped at what is left, filled from play after the session starts, 12 h). Save
button when naming; play buttons in Log and Songs; Settings: keep recordings (friends; off = deleted after 7 days, stats
stay; always on with Piano Studio). First start: welcome -> glowing Weekly goals pencil "Start here" -> labelled editor ->
"Now just play" at the status.

## Listening through the microphone (owner 2026-11-06)
For acoustic pianos, voice, guitar, horns. Explicit consent: the person presses Listen, confirms, a red "Listening
through the microphone" bar shows with Stop; it stops by itself after 20 min with nothing heard. The window sends 20 s
pieces (+1 s overlap) to /api/mic/chunk; src/mic.mjs runs Spotify Basic Pitch (src/transcribe.mjs, TF.js WASM engine,
in a worker thread) and writes the notes as a take; no audio is saved. Measured (tests/verify-audio.mjs, `npm run
test:audio`, needs ffmpeg): sampled piano with room noise through the mic reads 100% right for scales (keys right),
arpeggios, lick drill, swing and ballad tunes; a tune heard through the mic matches its keyboard take (0.215 vs 0.003);
~4x faster than real time. Not yet measured on a real room/real piano/laptop mic. Settings: "I play" (piano, guitar,
voice, wind, other): only hides piano-only feel tags for now. Drums: no pitch, not supported. Packaging: asar off (the
worker cannot load modules from an asar); Mac Info.plist has NSMicrophoneUsageDescription and the audio-input
entitlement. Playback uses the Salamander Grand Piano samples (ui/piano, CC-BY 3.0 Alexander Holm, credited in Settings).
