const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svgPath = path.join(__dirname, '..', 'Mididaw.svg');
const rawSvg = fs.readFileSync(svgPath, 'utf8');

function renderSvg(svgString, width) {
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

const assetsDir = path.join(__dirname, '..', 'assets', 'images');

// 1. logo.png - Clean high-res transparent logo for in-app headers
fs.writeFileSync(path.join(assetsDir, 'logo.png'), renderSvg(rawSvg, 512));

// 2. icon.png - 1024x1024 app icon with dark background
const iconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="220" fill="#090d16"/>
  <g transform="translate(102, 102) scale(0.8)">
    ${rawSvg.replace(/<svg[^>]*>|<\/svg>/gi, '')}
  </g>
</svg>
`;
fs.writeFileSync(path.join(assetsDir, 'icon.png'), renderSvg(iconSvg, 1024));

// 3. android-icon-foreground.png
const adaptiveForegroundSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(204, 204) scale(0.6)">
    ${rawSvg.replace(/<svg[^>]*>|<\/svg>/gi, '')}
  </g>
</svg>
`;
fs.writeFileSync(path.join(assetsDir, 'android-icon-foreground.png'), renderSvg(adaptiveForegroundSvg, 1024));

// 4. splash-icon.png
fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), renderSvg(rawSvg, 512));

// 5. favicon.png
fs.writeFileSync(path.join(assetsDir, 'favicon.png'), renderSvg(rawSvg, 64));

console.log('✅ High-quality logo and icons generated!');
