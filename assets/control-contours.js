// SVG image rasters isolate fonts. Embed the site's Allo font as a cached data URL
// to keep the masks aligned with the visible glyphs.
const FONT_URL = new URL('./fonts/AlloVariable-400to700-Round35.ttf', import.meta.url);
let fontDataUrlPromise = null;
function loadFontDataUrl() {
  if (!fontDataUrlPromise) {
    fontDataUrlPromise = fetch(FONT_URL)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      }) : ''))
      .catch(() => '');
  }
  return fontDataUrlPromise;
}
const pending = new WeakMap();
const xml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));

// Flood the exterior only. Every remaining transparent pocket is an enclosed hole;
// filling those pockets preserves the original anti-aliased exterior and concave edges.
export function fillEnclosedHoles(pixels, width, height) {
  const count = width * height;
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const visit = index => {
    if (!outside[index] && pixels[index * 4 + 3] < 128) {
      outside[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < count - width) visit(index + width);
  }
  for (let i = 0; i < count; i++) {
    if (!outside[i]) pixels[i * 4 + 3] = 255;
  }
}

async function filledMask(markup, width, height) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  const scale = Math.min(16, Math.max(8, Math.ceil(devicePixelRatio * 4)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const raster = context.getImageData(0, 0, canvas.width, canvas.height);
  fillEnclosedHoles(raster.data, canvas.width, canvas.height);
  context.putImageData(raster, 0, 0);
  return canvas.toDataURL();
}

function applyMask(element, url) {
  element.style.maskImage = `url("${url}")`;
  element.style.webkitMaskImage = `url("${url}")`;
  element.classList.add('is-filled-contour');
}

export async function syncControlContour(control, source) {
  const shape = control.querySelector('.control-hover-shape');
  const style = getComputedStyle(source);
  const layout = getComputedStyle(control);
  const width = parseFloat(layout.width);
  const height = parseFloat(layout.height);
  const text = source.textContent;
  const gap = parseFloat(layout.getPropertyValue('--control-outline-gap')) || 3;
  // Measure the real HTML baseline, rather than estimating it from font metrics.
  // Normalize by the rendered scale so zoomed previews use the same CSS spacing.
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline';
  source.append(probe);
  const bounds = control.getBoundingClientRect();
  const baselineY = (probe.getBoundingClientRect().top - bounds.top) / (bounds.height / height);
  probe.remove();
  const key = `${text}|${width}|${height}|${style.fontSize}|${style.fontWeight}|${baselineY}|${gap}`;
  if (pending.get(shape)?.key === key) return;
  const update = { key };
  pending.set(shape, update);
  const fallback = shape.querySelector('text');
  if (fallback) { fallback.textContent = text; fallback.setAttribute('dy', baselineY - height / 2); }
  const fontDataUrl = await loadFontDataUrl();
  const fontFace = fontDataUrl ? `@font-face{font-family:Allo;src:url('${fontDataUrl}') format('truetype')}` : '';
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>${fontFace}text{font-family:Allo,Arial,sans-serif;font-size:${style.fontSize};font-weight:${style.fontWeight};font-variant-numeric:tabular-nums}</style>
    <text x="${width / 2}" y="${baselineY}" text-anchor="middle" fill="black" stroke="black" stroke-width="${gap * 2}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill">${xml(text)}</text>
  </svg>`;
  try {
    const url = await filledMask(markup, width, height);
    if (pending.get(shape) !== update) return;
    shape.replaceChildren();
    applyMask(shape, url);
  } catch { pending.delete(shape); /* Keep the rounded SVG fallback if rasterization is unavailable. */ }
}

export async function initIconContours(control) {
  const icons = [...control.querySelectorAll('.control-hover-shape svg')];
  const gap = parseFloat(getComputedStyle(control).getPropertyValue('--control-outline-gap')) || 3;
  const iconStroke = 1.8 + gap * 2 / (18 / 24);
  await Promise.all(icons.map(async icon => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="-4 -4 32 32"><g fill="black" stroke="black" stroke-width="${iconStroke}" stroke-linejoin="round" stroke-linecap="round">${icon.innerHTML}</g></svg>`;
    try {
      const url = await filledMask(markup, 24, 24);
      const shape = document.createElement('span');
      shape.className = `${icon.getAttribute('class')} control-icon-contour`;
      applyMask(shape, url);
      icon.replaceWith(shape);
    } catch { /* Keep the filled, rounded SVG icon fallback. */ }
  }));
}
