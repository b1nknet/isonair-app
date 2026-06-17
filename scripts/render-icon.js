// Rasterize src/img/icon.svg into build/icon.png at 1024×1024.
// electron-builder consumes build/icon.png and auto-generates the platform
// formats (.icns for macOS, .ico for Windows). We have no standalone SVG
// rasterizer on the build machines, so we render with the Electron that's
// already a devDependency: load the SVG in an offscreen window and capture it.
//
//   npm run icon
//
// Re-run this whenever src/img/icon.svg changes, then commit build/icon.png.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const SRC = path.join(__dirname, '..', 'src', 'img', 'icon.svg');
const OUT = path.join(__dirname, '..', 'build', 'icon.png');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SRC, 'utf8');
  // Force the SVG to fill the canvas; corners outside the rounded rect stay
  // transparent so the icon isn't a hard square.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:${SIZE}px;height:${SIZE}px}
  </style></head><body>${svg}</body></html>`;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // Give the compositor a beat to paint before capturing.
  await new Promise((r) => setTimeout(r, 300));

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, image.toPNG());

  console.log(`Wrote ${OUT} (${image.getSize().width}×${image.getSize().height})`);
  app.quit();
});
