// Renders build/icon.png (512x512) using Electron. Run: npx electron build/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<html><body style="margin:0;background:transparent">
<canvas id="c" width="512" height="512"></canvas>
<script>
const g = document.getElementById('c').getContext('2d');
const r = 96;
g.fillStyle = '#0e1318';
g.beginPath(); g.roundRect(16, 16, 480, 480, r); g.fill();
g.strokeStyle = '#f0b429'; g.lineWidth = 10;
g.beginPath(); g.roundRect(21, 21, 470, 470, r - 5); g.stroke();
g.fillStyle = '#f0b429';
// dit
g.beginPath(); g.arc(150, 256, 46, 0, Math.PI * 2); g.fill();
// dah
g.beginPath(); g.roundRect(236, 210, 176, 92, 46); g.fill();
</script></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, 'icon.png');
  fs.writeFileSync(out, img.resize({ width: 512, height: 512 }).toPNG());
  console.log('wrote', out);
  app.quit();
});
