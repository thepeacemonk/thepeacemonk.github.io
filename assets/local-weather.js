import { syncControlContour, initIconContours } from './control-contours.js?v=2';

// Weather uses only an approximate network location; no device-location prompt.
// Data sources: Open-Meteo (https://open-meteo.com/) and GeoJS (https://www.geojs.io/).
const CACHE_KEY = 'peace-local-weather-v2';
export const WEATHER_MAX_AGE = 30 * 60_000;
const REFRESH_INTERVAL = 15 * 60_000;

export function weatherCondition(code) {
  if (code === 0 || code === 1) return { kind: 'clear', label: code === 0 ? 'Clear sky' : 'Mostly clear' };
  if (code === 2 || code === 3) return { kind: 'cloudy', label: code === 2 ? 'Partly cloudy' : 'Overcast' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { kind: 'rain', label: 'Drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { kind: 'rain', label: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { kind: 'snow', label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { kind: 'storm', label: 'Thunderstorm' };
  return { kind: 'unknown', label: 'Current weather' };
}

export function approximateCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid location');
  return { latitude: Math.round(latitude * 10) / 10, longitude: Math.round(longitude * 10) / 10 };
}

export function weatherURL(position) {
  const coords = approximateCoordinates(position.latitude, position.longitude);
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ ...coords, current: 'temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m', timezone: 'auto', forecast_days: '1' });
  return url.href;
}

export function parseWeather(data, fetchedAt = Date.now()) {
  const current = data?.current;
  if (!current || !Number.isFinite(current.temperature_2m) || current.temperature_2m < -100 || current.temperature_2m > 70 || !Number.isInteger(current.weather_code) || ![0, 1].includes(current.is_day)) throw new Error('Invalid weather');
  return { temperature: current.temperature_2m, code: current.weather_code, cloud: Math.min(100, Math.max(0, Number(current.cloud_cover) || 0)), wind: Math.max(0, Number(current.wind_speed_10m) || 0), isDay: current.is_day === 1, fetchedAt, ...weatherCondition(current.weather_code) };
}

export function weatherStyle(weather, dark) {
  const base = { strength: 0, speed: .5, grain: .025, softness: .5, flow: .5, flicker: .12 };
  if (!weather) return base;
  const profiles = {
    cloudy: { dark: ['#345879', '#a5bccd', '#557fa3', '#bdd4dc'], light: ['#3c6fa1', '#b9d5e8', '#779dbb', '#a4c9dc'], strength: .30 + weather.cloud / 250, speed: .28, softness: .8 },
    fog: { dark: ['#41697e', '#a8d0d4', '#7096ad', '#c1dce2'], light: ['#527f9b', '#b9dfe4', '#79acbf', '#b4d5e3'], strength: .7, speed: .18, softness: .95 },
    rain: { dark: ['#1b4377', '#6498cc', '#367cad', '#93c5df'], light: ['#184d9c', '#80b5ec', '#3787c6', '#9dcfe6'], strength: .7, speed: .58, grain: .04, flow: .7, softness: .75 },
    snow: { dark: ['#4285be', '#c7edf4', '#78c4dc', '#e0eafc'], light: ['#377fc0', '#b5e9f5', '#66c3df', '#c6d6fa'], strength: .75, speed: .24, grain: .035, softness: .85 },
    storm: { dark: ['#30296d', '#8090c9', '#4a5d9d', '#a7b4e3'], light: ['#423398', '#92a5df', '#526bc0', '#b5c4f0'], strength: .8, speed: .6, grain: .045, flow: .8, flicker: .08 }
  };
  const profile = profiles[weather.kind];
  return profile ? { ...base, ...profile, colors: profile[dark ? 'dark' : 'light'] } : base;
}

export function formatTemperature(celsius, fahrenheit = false) {
  return `${Math.round(fahrenheit ? celsius * 9 / 5 + 32 : celsius)}°${fahrenheit ? 'F' : 'C'}`;
}

export function formatLocalTime(date, twelveHour = false) {
  return new Intl.DateTimeFormat(twelveHour ? 'en-US' : undefined, {
    hour: '2-digit', minute: '2-digit', ...(twelveHour ? { hour12: true } : { hourCycle: 'h23' })
  }).format(date);
}

export function createLocalWeather() {
  const clock = document.querySelector('.local-clock');
  const clockButton = document.querySelector('.clock-toggle');
  const widget = document.querySelector('.weather-widget');
  const button = widget.querySelector('.weather-button');
  const value = widget.querySelector('.weather-value');
  initIconContours(document.querySelector('.theme-toggle'));
  const listeners = new Set();
  let weather = null;
  let busy = false;
  let clockTimer;
  const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const savePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences still work for this page. */ } };
  let twelveHour = readPreference('peace-clock-format') === '12';
  let fahrenheit = readPreference('peace-temperature-unit') === 'F';
  const fresh = () => weather && Date.now() - weather.fetchedAt >= 0 && Date.now() - weather.fetchedAt < WEATHER_MAX_AGE ? weather : null;
  const emit = () => listeners.forEach(listener => listener(fresh()));

  const updateClock = () => {
    clearTimeout(clockTimer);
    const now = new Date();
    // Recreate the formatter so changes to the computer's time zone take effect.
    clock.textContent = formatLocalTime(now, twelveHour);
    syncControlContour(clockButton, clock);
    clock.dateTime = now.toISOString();
    clockButton.setAttribute('aria-label', `Your local time, ${clock.textContent}. Switch to ${twelveHour ? '24-hour' : 'AM/PM'} format`);
    clockButton.setAttribute('aria-pressed', String(twelveHour));
    if (!document.hidden) clockTimer = setTimeout(updateClock, 60_000 - now.getTime() % 60_000 + 50);
  };
  const render = () => {
    const current = fresh();
    value.textContent = current ? formatTemperature(current.temperature, fahrenheit) : busy ? '…' : 'Weather';
    syncControlContour(button, value);
    button.setAttribute('aria-label', current ? `${current.label}, ${value.textContent}. Switch to ${fahrenheit ? 'Celsius' : 'Fahrenheit'}` : busy ? `Loading local weather. Switch to ${fahrenheit ? 'Celsius' : 'Fahrenheit'}` : `Weather unavailable. Switch to ${fahrenheit ? 'Celsius' : 'Fahrenheit'} and retry`);
    button.setAttribute('aria-busy', String(busy));
    button.setAttribute('aria-pressed', String(fahrenheit));
    widget.dataset.condition = current?.kind || 'unavailable';
  };
  const save = () => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(weather)); } catch { /* Storage may be disabled. */ }
  };
  const json = async url => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Service unavailable');
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const refresh = async () => {
    if (busy || document.hidden) return;
    busy = true;
    render();
    try {
      const data = await json('https://get.geojs.io/v1/ip/geo.json');
      if (typeof data.latitude !== 'string' || !data.latitude.trim() || typeof data.longitude !== 'string' || !data.longitude.trim()) throw new Error('Location unavailable');
      const position = approximateCoordinates(Number(data.latitude), Number(data.longitude));
      weather = parseWeather(await json(weatherURL(position)));
      save();
    } catch { /* Keep a recent reading, or show the unavailable state without inventing weather. */ }
    finally { busy = false; render(); emit(); }
  };
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (cached && Number.isFinite(cached.fetchedAt) && Date.now() - cached.fetchedAt >= 0 && Date.now() - cached.fetchedAt < WEATHER_MAX_AGE) {
      weather = parseWeather({ current: { temperature_2m: cached.temperature, weather_code: cached.code, cloud_cover: cached.cloud, is_day: cached.isDay ? 1 : 0, wind_speed_10m: cached.wind } }, cached.fetchedAt);
    }
  } catch { /* Invalid or inaccessible cache falls back to a fresh lookup. */ }
  clockButton.addEventListener('click', () => {
    twelveHour = !twelveHour;
    savePreference('peace-clock-format', twelveHour ? '12' : '24');
    updateClock();
  });
  button.addEventListener('click', () => {
    fahrenheit = !fahrenheit;
    savePreference('peace-temperature-unit', fahrenheit ? 'F' : 'C');
    render();
    if (!fresh()) refresh();
  });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'peace-clock-format') { twelveHour = readPreference('peace-clock-format') === '12'; updateClock(); }
    if (event.key === null || event.key === 'peace-temperature-unit') { fahrenheit = readPreference('peace-temperature-unit') === 'F'; render(); }
  });
  document.addEventListener('visibilitychange', () => {
    updateClock();
    if (!document.hidden) { render(); emit(); if (!fresh() || Date.now() - weather.fetchedAt >= REFRESH_INTERVAL) refresh(); }
  });
  window.addEventListener('pageshow', () => { updateClock(); render(); emit(); if (!fresh()) refresh(); });
  window.addEventListener('focus', updateClock);
  window.addEventListener('online', refresh);
  document.fonts.ready.then(() => { syncControlContour(clockButton, clock); syncControlContour(button, value); });
  setInterval(() => {
    if (document.hidden) return;
    render(); emit();
    if (!fresh() || Date.now() - weather.fetchedAt >= REFRESH_INTERVAL) refresh();
  }, 60_000);
  updateClock();
  render();
  if (!fresh() || Date.now() - weather.fetchedAt >= REFRESH_INTERVAL) refresh();
  return { current: fresh, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
