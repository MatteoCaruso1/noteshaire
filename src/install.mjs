#!/usr/bin/env node
// npm run install-app: makes Practice start with Windows (hidden) and puts a "Practice" shortcut on the desktop that opens
// the dashboard in its own window. Safe to run again.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).trim();
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const browser = BROWSERS.find((b) => fs.existsSync(b));

// the launcher: starts the server hidden (it quits by itself if one is already running); without /background it also opens the window
const vbs = `' Practice: starts the hidden server if it is not running; opens the dashboard window unless started with /background.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
node = "${process.execPath}"
If Not fso.FileExists(node) Then node = "node"
sh.Run """" & node & """ """ & dir & "\\src\\server.mjs""", 0, False
If WScript.Arguments.Count = 0 Then
  WScript.Sleep 1500
  ${browser ? `sh.Run """${browser.replace(/\//g, '\\')}"" --app=http://127.0.0.1:4320/ --window-size=980,940", 1, False` : 'sh.Run "http://127.0.0.1:4320/", 1, False'}
End If
`;
fs.writeFileSync(path.join(DIR, 'Practice.vbs'), vbs.replace(/\n/g, '\r\n'));

// the icon: three rising keys and a red one, drawn as a 64x64 32-bit icon
function icon() {
  const S = 64, px = Buffer.alloc(S * S * 4);
  const rect = (x0, y0, w, h, [r, g, b], rad = 0) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x0 + w - 1 - rad), cy = Math.min(Math.max(y, y0 + rad), y0 + h - 1 - rad);
      if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      const i = ((S - 1 - y) * S + x) * 4; px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = 255;
    }
  };
  rect(0, 0, 64, 64, [20, 21, 24], 14);
  rect(12, 38, 8, 14, [216, 52, 60], 2); rect(24, 28, 8, 24, [232, 230, 227], 2); rect(36, 20, 8, 32, [232, 230, 227], 2); rect(48, 12, 6, 40, [58, 61, 68], 2);
  const bmp = Buffer.alloc(40); bmp.writeUInt32LE(40, 0); bmp.writeInt32LE(S, 4); bmp.writeInt32LE(S * 2, 8); bmp.writeUInt16LE(1, 12); bmp.writeUInt16LE(32, 14);
  const mask = Buffer.alloc((S / 8) * S);
  const img = Buffer.concat([bmp, px, mask]);
  const head = Buffer.alloc(22); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); head[6] = S; head[7] = S; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(img.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, img]);
}
fs.writeFileSync(path.join(DIR, 'ui', 'practice.ico'), icon());

const shortcut = (where, args) => ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${where}'); $s.TargetPath = 'C:\\Windows\\System32\\wscript.exe'; $s.Arguments = '"${path.join(DIR, 'Practice.vbs')}" ${args}'; $s.WorkingDirectory = '${DIR}'; $s.IconLocation = '${path.join(DIR, 'ui', 'practice.ico')}'; $s.Description = 'Practice'; $s.Save(); 'ok'`);
const desktop = ps("[Environment]::GetFolderPath('Desktop')"), startup = ps("[Environment]::GetFolderPath('Startup')");
shortcut(path.join(desktop, 'Practice.lnk'), '');
shortcut(path.join(startup, 'Practice.lnk'), '/background');
console.log(`desktop shortcut: ${path.join(desktop, 'Practice.lnk')}\nstarts with Windows: ${path.join(startup, 'Practice.lnk')}`);

// and start it now
spawn('C:/Windows/System32/wscript.exe', [path.join(DIR, 'Practice.vbs'), '/background'], { detached: true, stdio: 'ignore' }).unref();
console.log('started: http://127.0.0.1:4320/');
