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
- `src/server.mjs`: the app, http://127.0.0.1:4320 (laptop only). Starts with Windows hidden (Startup shortcut, made by
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
