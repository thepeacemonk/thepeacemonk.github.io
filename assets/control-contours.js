// SVG image rasters isolate fonts. Embed the site's small font to keep the masks
// aligned with the visible Poppins glyphs, including in local file previews.
const FONT = 'data:font/woff2;base64,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';
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
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>@font-face{font-family:Poppins;src:url('${FONT}')}text{font-family:Poppins;font-size:${style.fontSize};font-weight:${style.fontWeight};font-variant-numeric:tabular-nums}</style>
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
