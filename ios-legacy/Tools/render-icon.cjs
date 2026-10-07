/* Rasterize the supplied Wix vector brand mark; no generated image content. */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const project = path.resolve(__dirname, '..');
const output = path.join(project, 'Mazraaty', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon.png');
sharp(fs.readFileSync(path.join(project, 'BrandMark.svg')))
  .resize(1024, 1024)
  .flatten({ background: '#EAF5EF' })
  .removeAlpha()
  .png()
  .toFile(output)
  .then(info => console.log(JSON.stringify({ output, width: info.width, height: info.height, channels: info.channels })))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
