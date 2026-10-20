import { createGradientASCII, INTRO_SECONDS } from './gradient-ascii.js?v=22';

import { createLocalWeather, weatherStyle } from './local-weather.js?v=7';

const localWeather = createLocalWeather();
const container = document.querySelector('.ambient-background');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const brazilColors = ['#1938a5', '#ffdc00', '#00ad50', '#00ad50'];
const country = document.querySelector('.country-wrap');
let countryHovered = false;
let countryFocused = false;

// Hour anchors use the visitor's clock. Interpolation keeps dawn and dusk gradual.
const palettes = [
  { hour: 0, name: 'night', dark: ['#304ab8', '#8badff', '#597eea', '#a5dcff'], light: ['#2724cb', '#6397ff', '#415bff', '#2ebdff'] },
  { hour: 5, name: 'dawn', dark: ['#9b49ae', '#ffac81', '#eb70a4', '#ffda91'], light: ['#8628d6', '#ffb332', '#ec369a', '#ff7538'] },
  { hour: 9, name: 'morning', dark: ['#087fbd', '#8ae8ed', '#22bed5', '#c2f5d8'], light: ['#046bbb', '#52e7ed', '#05aacf', '#26c9b6'] },
  { hour: 14, name: 'afternoon', dark: ['#285bd6', '#91d9ff', '#36b4e8', '#b6f0ef'], light: ['#1e3fd8', '#7fdcff', '#1299f0', '#2c61f3'] },
  { hour: 18, name: 'sunset', dark: ['#9b46b2', '#ffa459', '#f06f99', '#ffd278'], light: ['#a52ac9', '#ffb12e', '#f24682', '#ff7339'] },
  { hour: 21, name: 'evening', dark: ['#5143b2', '#b7a1ff', '#8874e5', '#a5caff'], light: ['#5225db', '#ba78ff', '#8b46ed', '#466bff'] },
  { hour: 24, name: 'night', dark: ['#304ab8', '#8badff', '#597eea', '#a5dcff'], light: ['#2724cb', '#6397ff', '#415bff', '#2ebdff'] }
];

const mixColor = (from, to, amount) => {
  const channels = [1, 3, 5].map((offset) => Math.round(
    parseInt(from.slice(offset, offset + 2), 16) * (1 - amount) +
    parseInt(to.slice(offset, offset + 2), 16) * amount
  ).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
};

let renderer = null;
let currentSettings;
let displayedColors = null;
let targetColors = null;
let paletteFrame = 0;
let displayedFlagMix = 0;
let displayedRepeatReveal = 0;
let targetFlagMix = 0;

const paintColors = (colors, flagMix, repeatReveal) => {
  displayedColors = colors;
  displayedFlagMix = flagMix;
  displayedRepeatReveal = repeatReveal;
  currentSettings = { ...currentSettings, colors, flagMix, repeatReveal };
  container.style.setProperty('--ambient-edge', colors[0]);
  container.style.setProperty('--ambient-sky', colors[1]);
  renderer?.update(currentSettings);
};

const transitionColors = (colors, flagMix) => {
  const unchanged = targetColors?.join(',') === colors.join(',') && targetFlagMix === flagMix;
  targetColors = colors;
  targetFlagMix = flagMix;
  if (!displayedColors || motionPreference.matches || document.hidden) {
    cancelAnimationFrame(paletteFrame);
    paletteFrame = 0;
    paintColors(colors, flagMix, flagMix);
    return;
  }
  if (unchanged) return;
  cancelAnimationFrame(paletteFrame);
  // Start from the color actually on screen so quick enters/exits never jump.
  const from = [...displayedColors];
  const fromFlagMix = displayedFlagMix;
  const fromRepeatReveal = displayedRepeatReveal;
  const textDuration = flagMix === 1 ? INTRO_SECONDS * 1000 : 700;
  const start = performance.now();
  const frame = (now) => {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / 700);
    const textProgress = Math.min(1, elapsed / textDuration);
    const textEased = textProgress * textProgress * (3 - 2 * textProgress);
    const eased = progress * progress * (3 - 2 * progress);
    paintColors(from.map((color, i) => mixColor(color, colors[i], eased)), fromFlagMix + (flagMix - fromFlagMix) * eased, fromRepeatReveal + (flagMix - fromRepeatReveal) * textEased);
    paletteFrame = progress < 1 || textProgress < 1 ? requestAnimationFrame(frame) : 0;
  };
  paletteFrame = requestAnimationFrame(frame);
};

const pageMessages = {
  home: 'welcome, wanderer',
  projects: 'welcome to my projects',
  tools: 'welcome to my tools',
  notes: 'welcome to my notes'
};
let currentPage = Object.hasOwn(pageMessages, location.hash.slice(1)) ? location.hash.slice(1) : 'home';
const syncAppearance = () => {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const index = palettes.findIndex((palette, i) => i < palettes.length - 1 && hour >= palette.hour && hour < palettes[i + 1].hour);
  const start = palettes[index];
  const end = palettes[index + 1];
  const progress = (hour - start.hour) / (end.hour - start.hour);
  const choice = document.documentElement.dataset.theme;
  const dark = choice === 'dark' || (choice !== 'light' && systemDark.matches);
  const mode = dark ? 'dark' : 'light';
  const brazil = currentPage === 'home' && (countryHovered || countryFocused);
  const weather = localWeather.current();
  const atmosphere = weatherStyle(brazil ? null : weather, dark);
  const timeColors = start[mode].map((color, i) => mixColor(color, end[mode][i], progress));
  const colors = brazil ? brazilColors : timeColors.map((color, i) => atmosphere.colors ? mixColor(color, atmosphere.colors[i], atmosphere.strength) : color);
  currentSettings = { colors: displayedColors || colors, flagMix: displayedFlagMix, repeatText: 'brasil', repeatReveal: displayedRepeatReveal, lightMode: !dark, speed: atmosphere.speed, grain: atmosphere.grain, flicker: 0, density: 1, glyphOpacity: .65, softness: atmosphere.softness, flow: atmosphere.flow, glow: 0, message: pageMessages[currentPage] };
  container.dataset.timeOfDay = start.name;
  container.dataset.mode = mode;
  container.dataset.weather = weather?.kind || 'unknown';
  container.dataset.palette = brazil ? 'brazil' : 'time';
  renderer?.update(currentSettings);
  transitionColors(colors, brazil ? 1 : 0);
};

localWeather.subscribe(syncAppearance);
syncAppearance();
renderer = createGradientASCII(container, currentSettings);
window.addEventListener('peace:pagechange', (event) => {
  currentPage = Object.hasOwn(pageMessages, event.detail?.page) ? event.detail.page : 'home';
  countryHovered = false;
  countryFocused = false;
  syncAppearance();
  renderer?.replay();
});
country.addEventListener('pointerenter', (event) => {
  if (event.pointerType === 'touch') return;
  countryHovered = true;
  syncAppearance();
});
country.addEventListener('pointerleave', () => {
  countryHovered = false;
  syncAppearance();
});
country.addEventListener('focusin', () => {
  countryFocused = true;
  syncAppearance();
});
country.addEventListener('focusout', (event) => {
  if (country.contains(event.relatedTarget)) return;
  countryFocused = false;
  syncAppearance();
});
window.addEventListener('blur', () => {
  countryHovered = false;
  countryFocused = false;
  syncAppearance();
});
const themeObserver = new MutationObserver(syncAppearance);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
systemDark.addEventListener('change', syncAppearance);
motionPreference.addEventListener('change', syncAppearance);
setInterval(syncAppearance, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    countryHovered = false;
    countryFocused = false;
  }
  syncAppearance();
});
window.addEventListener('pageshow', syncAppearance);
window.addEventListener('focus', syncAppearance);

// A lost graphics context falls back to the same palette; restore the renderer if possible.
const canvas = container.querySelector('canvas');
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  container.classList.remove('has-renderer');
});
canvas.addEventListener('webglcontextrestored', () => {
  renderer?.destroy();
  renderer = createGradientASCII(container, currentSettings);
});
