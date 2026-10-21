// Keep the existing artwork and tint it with the sky's dominant palette color.
export function faviconColor(colors, dark) {
  const source = colors[1] || colors[0];
  const rgb = [1, 3, 5].map(offset => parseInt(source.slice(offset, offset + 2), 16));
  const luminance = channels => channels.reduce((sum, value, i) => {
    const channel = value / 255;
    return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const surface = dark ? luminance([23, 23, 23]) : 1;
  let adjusted = rgb;
  // Preserve the hue while keeping the small silhouette legible in either theme.
  for (let step = 0; step <= 20; step++) {
    adjusted = rgb.map(channel => Math.round(channel + ((dark ? 255 : 0) - channel) * step / 20));
    const light = luminance(adjusted);
    if ((Math.max(light, surface) + .05) / (Math.min(light, surface) + .05) >= 3) break;
  }
  return `#${adjusted.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function createGradientFavicon() {
  const icon = document.querySelector('link[rel="icon"]');
  if (!icon) return () => {};
  let markup = null;
  let latestColor = null;
  let paintedColor = null;
  let timer = null;
  const paint = () => {
    if (!markup || !latestColor || paintedColor === latestColor) return;
    const themed = markup.replace('</style>', `path:not(.background) { fill: ${latestColor}; }</style>`);
    icon.href = `data:image/svg+xml,${encodeURIComponent(themed)}`;
    paintedColor = latestColor;
  };
  fetch(icon.href).then(response => {
    if (!response.ok) throw new Error('Favicon unavailable');
    return response.text();
  }).then(source => { markup = source; paint(); }).catch(() => { /* Keep the static theme-aware icon. */ });
  return (colors, dark) => {
    latestColor = faviconColor(colors, dark);
    // Follow palette transitions without rewriting a browser resource every frame.
    if (timer === null && latestColor !== paintedColor) timer = setTimeout(() => { timer = null; paint(); }, 100);
  };
}
