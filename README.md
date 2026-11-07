# NoteshAIre

Set what you want to practise this week. Play. NoteshAIre listens and fills the bars from what you actually played:
scales and drills, songs (named once, recognised after), licks and noodling, keys you skip. For digital pianos (by USB)
and, through the microphone while you press Listen, acoustic pianos, guitar, voice, sax and more.

## Get it

**[Download NoteshAIre](https://matteocaruso1.github.io/noteshaire/)** (one button: it picks Mac or Windows for you)

- **Mac:** open the downloaded file, drag NoteshAIre into Applications, open it.
- **Windows:** open the downloaded file. If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.

A digital piano connects by USB: plug it in and the dot at the top of the app turns green. Any other instrument, or
your voice: press Listen. NoteshAIre hears it through the microphone only until you press Stop, and saves no audio. NoteshAIre starts with your computer and keeps listening from the tray (menu bar on a Mac) when its window is
closed. Everything stays on your computer; nothing is sent anywhere.

## Updates

Windows copies update themselves (checked every few hours, installed when you are not playing). On a Mac, NoteshAIre tells
you when a new version is out and links to the download.

---

For development: `npm install`, `npm start` (the app), `npm test`, `npm run dist:win` (installer in `dist/`). A release is
built by pushing a tag (`git tag v1.0.1 && git push --tags`, see `.github/workflows/release.yml`). See CLAUDE.md.
