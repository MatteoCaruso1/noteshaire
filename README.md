# NoteshAIre

Set what you want to practise this week. Play. NoteshAIre listens to your keyboard and fills the bars from what you
actually played: scales and drills, songs (named once, recognised after), licks and noodling, keys you skip.

## Get it

**[Download NoteshAIre](https://matteocaruso1.github.io/noteshaire/)** (one button: it picks Mac or Windows for you)

- **Mac:** open the downloaded file, drag NoteshAIre into Applications, open it.
- **Windows:** open the downloaded file. If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.

You need a keyboard or digital piano with a USB (MIDI) connection. Plug it in and the dot at the top of the app turns
green. NoteshAIre starts with your computer and keeps listening from the tray (menu bar on a Mac) when its window is
closed. Everything stays on your computer; nothing is sent anywhere.

## Updates

Windows copies update themselves (checked every few hours, installed when you are not playing). On a Mac, NoteshAIre tells
you when a new version is out and links to the download.

---

For development: `npm install`, `npm start` (the app), `npm test`, `npm run dist:win` (installer in `dist/`). A release is
built by pushing a tag (`git tag v1.0.1 && git push --tags`, see `.github/workflows/release.yml`). See CLAUDE.md.
