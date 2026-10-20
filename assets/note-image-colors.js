import { NOTE_IMAGE_PALETTES } from './note-image-palettes.js?v=1';

const cache = new Map();
const distance = (a, b) => a.reduce((sum, channel, i) => sum + (channel - b[i]) ** 2, 0);
const toLab = rgb => {
  const [r, g, b] = rgb.map(c => c / 255 <= .04045 ? c / 3294.6 : ((c / 255 + .055) / 1.055) ** 2.4);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s];
};

// Four representative colors, clustered perceptually instead of averaging into gray.
export function paletteFromPixels(pixels) {
  const histogram = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = (rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4);
    const bucket = histogram.get(key) || { rgb: [0, 0, 0], weight: 0 };
    rgb.forEach((value, c) => { bucket.rgb[c] += value; });
    bucket.weight++;
    histogram.set(key, bucket);
  }
  let samples = [...histogram.values()].map(({ rgb, weight }) => {
    const color = rgb.map(c => c / weight);
    return { rgb: color, lab: toLab(color), weight };
  });
  if (!samples.length) return null;
  // Avoid letting plain white borders or near-black letterboxing dominate a colored image.
  // Keep them for genuinely monochrome covers.
  const interior = samples.filter(sample => sample.lab[0] > .18 && sample.lab[0] < .94);
  if (interior.reduce((n, sample) => n + sample.weight, 0) > pixels.length / 4 * .15) samples = interior;
  samples.sort((a, b) => b.weight - a.weight);
  const centers = [samples[0].lab];
  while (centers.length < Math.min(4, samples.length)) {
    const next = samples.reduce((best, sample) => {
      const score = Math.min(...centers.map(center => distance(sample.lab, center))) * Math.sqrt(sample.weight);
      return score > best.score ? { score, sample } : best;
    }, { score: -1, sample: samples[0] });
    centers.push([...next.sample.lab]);
  }
  let groups;
  for (let iteration = 0; iteration < 10; iteration++) {
    groups = centers.map(() => ({ lab: [0, 0, 0], rgb: [0, 0, 0], weight: 0 }));
    samples.forEach(sample => {
      let closest = 0;
      centers.forEach((center, i) => { if (distance(sample.lab, center) < distance(sample.lab, centers[closest])) closest = i; });
      const group = groups[closest];
      group.weight += sample.weight;
      sample.lab.forEach((value, c) => { group.lab[c] += value * sample.weight; group.rgb[c] += sample.rgb[c] * sample.weight; });
    });
    groups.forEach((group, i) => { if (group.weight) centers[i] = group.lab.map(c => c / group.weight); });
  }
  const colors = groups.filter(group => group.weight).map(group => ({
    light: group.lab[0] / group.weight,
    color: `#${group.rgb.map(c => Math.round(c / group.weight).toString(16).padStart(2, '0')).join('')}`
  })).sort((a, b) => a.light - b.light).map(group => group.color);
  return Array.from({ length: 4 }, (_, i) => colors[Math.round(i * (colors.length - 1) / 3)]);
}

export async function imagePalette(image) {
  const url = new URL(image.getAttribute('src'), document.baseURI);
  const localKey = decodeURIComponent(url.pathname).match(/(?:^|\/)(assets\/covers\/.+)$/)?.[1];
  const bundled = localKey ? NOTE_IMAGE_PALETTES[localKey] : null;
  // Direct file browsing can block pixel reads. HTTP previews sample the current image,
  // so a replaced cover or a newly added note gets its actual colors too.
  if (url.protocol === 'file:' && bundled) return bundled;
  if (cache.has(url.href)) return cache.get(url.href);
  const pending = (async () => {
    try {
      await image.decode();
      if (image.src !== url.href || !image.naturalWidth) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 62;
      canvas.height = 87;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return bundled;
      const ratio = image.clientWidth / image.clientHeight || 124 / 174;
      let width = image.naturalWidth, height = image.naturalHeight;
      if (width / height > ratio) width = height * ratio;
      else height = width / ratio;
      context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, 62, 87);
      return paletteFromPixels(context.getImageData(0, 0, 62, 87).data) || bundled;
    } catch {
      return bundled;
    }
  })();
  cache.set(url.href, pending);
  const colors = await pending;
  if (!colors) cache.delete(url.href);
  return colors;
}
