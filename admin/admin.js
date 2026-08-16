const DRAFT_KEY = 'peace-notes-draft';
const THEME_KEY = 'peace-admin-theme';
const RATABLE = new Set(['movie', 'series', 'game', 'book', 'manga', 'album', 'other']);
const STAR_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
const MAX_IMAGE_SIDE = 900;

const dom = {
  categoryList: document.querySelector('.category-list'),
  form: document.querySelector('.note-form'),
  emptyState: document.querySelector('.empty-state'),
  starInput: document.querySelector('.star-input'),
  ratingField: document.querySelector('.rating-field'),
  imageList: document.querySelector('.image-list'),
  pathInput: document.querySelector('.path-input'),
  fileInput: document.querySelector('.file-input'),
  jsonInput: document.querySelector('.json-input'),
  dirtyFlag: document.querySelector('.dirty-flag'),
  toast: document.querySelector('.toast'),
  lock: document.querySelector('.lock'),
  lockBox: document.querySelector('.lock-box'),
  lockInput: document.querySelector('.lock-input'),
  lockConfirm: document.querySelector('.lock-confirm'),
  lockSubmit: document.querySelector('.lock-submit'),
  lockError: document.querySelector('.lock-error'),
  lockMsg: document.querySelector('.lock-msg'),
  lockHint: document.querySelector('.lock-hint'),
  githubSheet: document.querySelector('.github-sheet'),
};

let state = { version: 1, categories: [], notes: [] };
let selectedId = null;
let toastTimer = null;

/* ---------- helpers ---------- */

function starIcon(filled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', STAR_PATH);
  svg.appendChild(path);
  return svg;
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 2400);
}

function slugify(value) {
  return (value || 'note')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'note';
}

function uniqueId(base, taken) {
  let id = base;
  let n = 2;
  while (taken.includes(id)) { id = `${base}-${n}`; n += 1; }
  return id;
}

function selectedNote() {
  return state.notes.find((note) => note.id === selectedId) || null;
}

function isDataImage(src) {
  return typeof src === 'string' && src.startsWith('data:');
}

/* ---------- persistence ---------- */

function persist() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  dom.dirtyFlag.hidden = false;
}

function normalize(data) {
  return {
    version: data.version || 1,
    categories: (data.categories || []).map((category) => ({
      id: category.id || uniqueId(slugify(category.title), []),
      title: category.title || 'Untitled category',
      emptyText: category.emptyText || '',
    })),
    notes: (data.notes || []).map((note) => ({
      id: note.id || slugify(note.title),
      categoryId: note.categoryId || '',
      title: note.title || 'Untitled note',
      type: note.type || 'other',
      creator: note.creator || '',
      rating: Number(note.rating) || 0,
      images: (note.images || []).filter(Boolean),
      review: note.review || '',
    })),
  };
}

async function loadPublished() {
  const response = await fetch('../notes.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`notes.json returned ${response.status}`);
  return normalize(await response.json());
}

async function boot() {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      state = normalize(JSON.parse(draft));
      dom.dirtyFlag.hidden = false;
      render();
      return;
    } catch (error) {
      toast('Draft was unreadable, loading published notes.');
    }
  }
  try {
    state = await loadPublished();
  } catch (error) {
    toast('Could not load ../notes.json — starting empty.');
  }
  render();
}

/* ---------- sidebar ---------- */

function renderSidebar() {
  dom.categoryList.textContent = '';
  state.categories.forEach((category, categoryIndex) => {
    const box = document.createElement('div');
    box.className = 'category';

    const head = document.createElement('div');
    head.className = 'category-head';

    const title = document.createElement('input');
    title.className = 'category-title';
    title.type = 'text';
    title.value = category.title;
    title.addEventListener('input', () => {
      category.title = title.value;
      persist();
    });
    head.appendChild(title);

    head.appendChild(miniButton('↑', 'Move category up', categoryIndex === 0, () => {
      moveInArray(state.categories, categoryIndex, categoryIndex - 1);
      persist();
      render();
    }));
    head.appendChild(miniButton('↓', 'Move category down', categoryIndex === state.categories.length - 1, () => {
      moveInArray(state.categories, categoryIndex, categoryIndex + 1);
      persist();
      render();
    }));
    head.appendChild(miniButton('✕', 'Delete category', false, () => deleteCategory(category), 'remove'));

    box.appendChild(head);

    const notes = state.notes.filter((note) => note.categoryId === category.id);
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'note-empty';
      empty.textContent = 'No notes yet.';
      box.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'category-notes';
      notes.forEach((note, noteIndex) => {
        const row = document.createElement('div');
        row.className = 'note-row';

        const select = document.createElement('button');
        select.type = 'button';
        select.className = note.id === selectedId ? 'note-select is-active' : 'note-select';
        select.textContent = note.title || 'Untitled note';
        select.addEventListener('click', () => {
          selectedId = note.id;
          render();
        });
        row.appendChild(select);

        row.appendChild(miniButton('↑', 'Move note up', noteIndex === 0, () => {
          moveNote(note, -1);
          persist();
          render();
        }));
        row.appendChild(miniButton('↓', 'Move note down', noteIndex === notes.length - 1, () => {
          moveNote(note, 1);
          persist();
          render();
        }));

        list.appendChild(row);
      });
      box.appendChild(list);
    }

    dom.categoryList.appendChild(box);
  });
}

function miniButton(label, ariaLabel, disabled, onClick, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mini ${extraClass}`.trim();
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function moveInArray(array, from, to) {
  if (to < 0 || to >= array.length) return;
  const [item] = array.splice(from, 1);
  array.splice(to, 0, item);
}

function moveNote(note, direction) {
  const from = state.notes.indexOf(note);
  let to = from + direction;
  while (to >= 0 && to < state.notes.length && state.notes[to].categoryId !== note.categoryId) {
    to += direction;
  }
  if (to < 0 || to >= state.notes.length) return;
  moveInArray(state.notes, from, to);
}

function deleteCategory(category) {
  const notes = state.notes.filter((note) => note.categoryId === category.id);
  const message = notes.length
    ? `Delete "${category.title}" and its ${notes.length} note(s)?`
    : `Delete "${category.title}"?`;
  if (!confirm(message)) return;
  state.categories = state.categories.filter((item) => item !== category);
  state.notes = state.notes.filter((note) => note.categoryId !== category.id);
  if (!state.notes.some((note) => note.id === selectedId)) selectedId = null;
  persist();
  render();
}

/* ---------- editor ---------- */

function renderEditor() {
  const note = selectedNote();
  dom.form.hidden = !note;
  dom.emptyState.hidden = Boolean(note);
  if (!note) return;

  const fields = dom.form.elements;
  fields.title.value = note.title;
  fields.creator.value = note.creator;
  fields.review.value = note.review;
  fields.type.value = note.type;

  const categorySelect = fields.categoryId;
  categorySelect.textContent = '';
  state.categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.title;
    categorySelect.appendChild(option);
  });
  categorySelect.value = note.categoryId;

  dom.ratingField.hidden = !RATABLE.has(note.type);
  renderStars(note);
  renderImages(note);
}

function renderStars(note) {
  dom.starInput.textContent = '';
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = value <= note.rating ? 'star-button is-on' : 'star-button';
    button.setAttribute('aria-label', `${value} star${value > 1 ? 's' : ''}`);
    button.setAttribute('aria-pressed', String(value <= note.rating));
    button.appendChild(starIcon(value <= note.rating));
    button.addEventListener('click', () => {
      note.rating = note.rating === value ? 0 : value;
      persist();
      renderStars(note);
    });
    button.addEventListener('pointerenter', () => {
      dom.starInput.querySelectorAll('.star-button').forEach((el, index) => {
        el.classList.toggle('is-hover', index < value);
      });
    });
    dom.starInput.appendChild(button);
  }

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'mini star-clear';
  clear.textContent = note.rating ? `${note.rating}/5 · clear` : 'no rating';
  clear.addEventListener('click', () => {
    note.rating = 0;
    persist();
    renderStars(note);
  });
  dom.starInput.appendChild(clear);
}

function renderImages(note) {
  dom.imageList.textContent = '';
  note.images.forEach((src, index) => {
    const row = document.createElement('div');
    row.className = 'image-row';

    const img = document.createElement('img');
    img.src = isDataImage(src) ? src : `../${src}`;
    img.alt = '';
    row.appendChild(img);

    const name = document.createElement('span');
    name.className = 'image-name';
    name.textContent = isDataImage(src) ? `embedded image (${Math.round(src.length / 1365)} KB)` : src;
    row.appendChild(name);

    if (index === 0) {
      const tag = document.createElement('span');
      tag.className = 'cover-tag';
      tag.textContent = 'cover';
      row.appendChild(tag);
    }

    if (isDataImage(src)) {
      row.appendChild(miniButton('save as file', 'Save this photo to disk', false, () => {
        const extension = src.slice(11, src.indexOf(';')) || 'png';
        downloadHref(src, `${slugify(note.title)}-${index + 1}.${extension}`);
      }));
    }

    row.appendChild(miniButton('↑', 'Move photo up', index === 0, () => {
      moveInArray(note.images, index, index - 1);
      persist();
      renderImages(note);
    }));
    row.appendChild(miniButton('↓', 'Move photo down', index === note.images.length - 1, () => {
      moveInArray(note.images, index, index + 1);
      persist();
      renderImages(note);
    }));
    row.appendChild(miniButton('✕', 'Remove photo', false, () => {
      note.images.splice(index, 1);
      persist();
      renderImages(note);
    }, 'remove'));

    dom.imageList.appendChild(row);
  });

  if (!note.images.length) {
    const empty = document.createElement('p');
    empty.className = 'note-empty';
    empty.textContent = 'No photos yet.';
    dom.imageList.appendChild(empty);
  }
}

function render() {
  renderSidebar();
  renderEditor();
}

/* ---------- form bindings ---------- */

dom.form.addEventListener('input', (event) => {
  const note = selectedNote();
  if (!note) return;
  const { name, value } = event.target;
  if (!name) return;
  note[name] = value;
  if (name === 'title') renderSidebar();
  if (name === 'type') {
    dom.ratingField.hidden = !RATABLE.has(note.type);
    if (!RATABLE.has(note.type)) note.rating = 0;
  }
  if (name === 'categoryId') render();
  persist();
});

dom.form.addEventListener('submit', (event) => event.preventDefault());

dom.starInput.addEventListener('pointerleave', () => {
  dom.starInput.querySelectorAll('.star-button').forEach((el) => el.classList.remove('is-hover'));
});

/* ---------- images ---------- */

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not decode image'));
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const webp = canvas.toDataURL('image/webp', 0.85);
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addFiles(files) {
  const note = selectedNote();
  if (!note) return;
  for (const file of files) {
    try {
      note.images.push(await resizeImage(file));
    } catch (error) {
      toast(`${file.name}: ${error.message}`);
    }
  }
  persist();
  renderImages(note);
  toast('Photo added.');
}

dom.fileInput.addEventListener('change', () => {
  if (dom.fileInput.files.length) addFiles([...dom.fileInput.files]);
  dom.fileInput.value = '';
});

/* ---------- import / export ---------- */

function downloadHref(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function exportJson() {
  return `${JSON.stringify(state, null, 2)}\n`;
}

dom.jsonInput.addEventListener('change', () => {
  const file = dom.jsonInput.files[0];
  dom.jsonInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalize(JSON.parse(reader.result));
      selectedId = null;
      persist();
      render();
      toast('JSON imported.');
    } catch (error) {
      toast('That file is not valid notes JSON.');
    }
  };
  reader.readAsText(file);
});

/* ---------- pin lock ---------- */

const PIN_STORE = 'peace-admin-pin';
const PIN_SESSION = 'peace-admin-unlocked';
const PIN_FAILS = 'peace-admin-fails';
const PIN_UNTIL = 'peace-admin-locked-until';

let setupMode = false;
let booted = false;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pinConfig() {
  const fromFile = window.ADMIN_PIN || {};
  if (fromFile.hash && fromFile.salt) return fromFile;
  try {
    const local = JSON.parse(localStorage.getItem(PIN_STORE) || 'null');
    if (local && local.hash && local.salt) return local;
  } catch (error) {
    /* ignore unreadable local pin */
  }
  return null;
}

async function derivePin(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(bits);
}

function lockError(message) {
  dom.lockError.textContent = message;
  dom.lockError.hidden = !message;
}

function cooldownLeft() {
  const until = Number(localStorage.getItem(PIN_UNTIL) || 0);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

function showLock({ setup }) {
  setupMode = setup;
  document.body.classList.add('is-locked');
  dom.lockConfirm.hidden = !setup;
  dom.lockConfirm.value = '';
  dom.lockInput.value = '';
  dom.lockInput.placeholder = setup ? 'New PIN' : 'PIN';
  dom.lockSubmit.textContent = setup ? 'Set PIN' : 'Unlock';
  dom.lockMsg.textContent = setup
    ? 'Choose a PIN of at least four characters. Only you should know it.'
    : 'Enter your PIN to edit.';
  dom.lockHint.textContent = setup
    ? 'The PIN is stored as a PBKDF2 hash. Anyone who reads this page’s source can bypass the screen, so treat it as a lock on the door, not a vault — your notes can only change in the repository, and that still needs your commit or token.'
    : '';
  lockError('');
  dom.lockInput.focus();
}

function unlock(config) {
  sessionStorage.setItem(PIN_SESSION, config.hash);
  localStorage.removeItem(PIN_FAILS);
  localStorage.removeItem(PIN_UNTIL);
  document.body.classList.remove('is-locked');
  if (!booted) {
    booted = true;
    boot();
  }
}

async function handleLockSubmit(event) {
  event.preventDefault();
  const pin = dom.lockInput.value;
  if (!crypto.subtle) {
    lockError('PIN needs a secure page — open the site over https or on localhost.');
    return;
  }

  if (setupMode) {
    if (pin.length < 4) {
      lockError('Use at least four characters.');
      return;
    }
    if (pin !== dom.lockConfirm.value) {
      lockError('The two PINs do not match.');
      return;
    }
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const iterations = 250000;
    const config = { salt, hash: await derivePin(pin, salt, iterations), iterations };
    localStorage.setItem(PIN_STORE, JSON.stringify(config));
    downloadPinFile(config);
    unlock(config);
    toast('PIN set — replace admin/pin.js with the download and commit it.');
    return;
  }

  const wait = cooldownLeft();
  if (wait) {
    lockError(`Too many attempts. Try again in ${wait}s.`);
    return;
  }

  const config = pinConfig();
  const hash = await derivePin(pin, config.salt, config.iterations || 250000);
  if (hash === config.hash) {
    unlock(config);
    return;
  }

  const fails = Number(localStorage.getItem(PIN_FAILS) || 0) + 1;
  localStorage.setItem(PIN_FAILS, String(fails));
  if (fails >= 5) localStorage.setItem(PIN_UNTIL, String(Date.now() + (fails - 4) * 30000));
  dom.lockInput.value = '';
  lockError(fails >= 5 ? `Wrong PIN. Locked for ${(fails - 4) * 30}s.` : 'Wrong PIN.');
}

function downloadPinFile(config) {
  const body = `/* PIN for /admin. Generated by the admin screen — safe to commit, it holds no plain PIN. */\n`
    + `window.ADMIN_PIN = {\n`
    + `  salt: '${config.salt}',\n`
    + `  hash: '${config.hash}',\n`
    + `  iterations: ${config.iterations},\n`
    + `};\n`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
  downloadHref(url, 'pin.js');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

dom.lockBox.addEventListener('submit', handleLockSubmit);

function startLock() {
  const config = pinConfig();
  if (!config) {
    showLock({ setup: true });
    return;
  }
  if (sessionStorage.getItem(PIN_SESSION) === config.hash) {
    unlock(config);
    return;
  }
  showLock({ setup: false });
}

/* ---------- github publishing ---------- */

const GH_STORE = 'peace-admin-github';

function defaultGithub() {
  const host = location.hostname;
  const owner = host.endsWith('.github.io') ? host.split('.')[0] : '';
  return { token: '', owner, repo: host.endsWith('.github.io') ? host : '', branch: 'main' };
}

function githubConfig() {
  const raw = localStorage.getItem(GH_STORE) || sessionStorage.getItem(GH_STORE);
  if (!raw) return defaultGithub();
  try {
    return { ...defaultGithub(), ...JSON.parse(raw) };
  } catch (error) {
    return defaultGithub();
  }
}

function saveGithubConfig(config, remember) {
  const raw = JSON.stringify(config);
  localStorage.removeItem(GH_STORE);
  sessionStorage.removeItem(GH_STORE);
  (remember ? localStorage : sessionStorage).setItem(GH_STORE, raw);
}

async function gh(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Token rejected — check or regenerate it.');
    if (response.status === 404) throw new Error('Repository not found, or the token lacks Contents access.');
    throw new Error(data.message || `GitHub error ${response.status}`);
  }
  return data;
}

function utf8ToBase64(text) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

async function publish() {
  const config = githubConfig();
  if (!config.token || !config.owner || !config.repo) {
    toast('Add a token first.');
    openGithubSheet();
    return;
  }

  const base = `/repos/${config.owner}/${config.repo}`;
  const branch = config.branch || 'main';
  const uploads = [];
  const stamp = Date.now().toString(36).slice(-4);

  state.notes.forEach((note) => {
    note.images.forEach((src, index) => {
      if (!isDataImage(src)) return;
      const extension = src.slice(11, src.indexOf(';')) || 'png';
      const path = `assets/covers/${slugify(note.title)}-${index + 1}-${stamp}.${extension}`;
      uploads.push({ path, base64: src.slice(src.indexOf(',') + 1), note, index });
    });
  });

  toast(uploads.length ? `Publishing ${uploads.length} photo(s) and notes.json…` : 'Publishing notes.json…');

  try {
    const ref = await gh(config, `${base}/git/ref/heads/${branch}`);
    const parent = ref.object.sha;
    const parentCommit = await gh(config, `${base}/git/commits/${parent}`);

    const tree = [];
    for (const upload of uploads) {
      const blob = await gh(config, `${base}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: upload.base64, encoding: 'base64' }),
      });
      tree.push({ path: upload.path, mode: '100644', type: 'blob', sha: blob.sha });
      upload.note.images[upload.index] = upload.path;
    }

    tree.push({ path: 'notes.json', mode: '100644', type: 'blob', content: exportJson() });

    const newTree = await gh(config, `${base}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
    });
    const commit = await gh(config, `${base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: uploads.length ? `Update notes and ${uploads.length} photo(s)` : 'Update notes',
        tree: newTree.sha,
        parents: [parent],
      }),
    });
    await gh(config, `${base}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    persist();
    renderEditor();
    dom.dirtyFlag.hidden = true;
    toast('Published. GitHub Pages rebuilds in about a minute.');
  } catch (error) {
    const message = /fast forward/i.test(error.message)
      ? 'The branch moved on GitHub. Use “Reload published”, redo the edit, then publish again.'
      : error.message;
    toast(message);
  }
}

function openGithubSheet() {
  const config = githubConfig();
  const fields = dom.githubSheet.querySelector('form').elements;
  fields.token.value = config.token;
  fields.owner.value = config.owner;
  fields.repo.value = config.repo;
  fields.branch.value = config.branch || 'main';
  fields.remember.checked = Boolean(localStorage.getItem(GH_STORE));
  dom.githubSheet.showModal();
}

/* ---------- toolbar ---------- */

const actions = {
  'add-category': () => {
    const title = prompt('Category name', 'New category');
    if (!title) return;
    state.categories.push({
      id: uniqueId(slugify(title), state.categories.map((category) => category.id)),
      title,
      emptyText: '',
    });
    persist();
    render();
  },
  'add-note': () => {
    if (!state.categories.length) {
      toast('Create a category first.');
      return;
    }
    const current = selectedNote();
    const note = {
      id: uniqueId('untitled-note', state.notes.map((item) => item.id)),
      categoryId: current ? current.categoryId : state.categories[0].id,
      title: 'Untitled note',
      type: 'movie',
      creator: '',
      rating: 0,
      images: [],
      review: '',
    };
    state.notes.push(note);
    selectedId = note.id;
    persist();
    render();
    dom.form.elements.title.focus();
    dom.form.elements.title.select();
  },
  'delete-note': () => {
    const note = selectedNote();
    if (!note || !confirm(`Delete "${note.title}"?`)) return;
    state.notes = state.notes.filter((item) => item !== note);
    selectedId = null;
    persist();
    render();
  },
  'add-path': () => {
    const note = selectedNote();
    const value = dom.pathInput.value.trim();
    if (!note || !value) return;
    note.images.push(value.replace(/^\.?\//, ''));
    dom.pathInput.value = '';
    persist();
    renderImages(note);
  },
  'add-file': () => dom.fileInput.click(),
  import: () => dom.jsonInput.click(),
  reload: async () => {
    if (!confirm('Discard the local draft and reload the published notes.json?')) return;
    try {
      state = await loadPublished();
      localStorage.removeItem(DRAFT_KEY);
      dom.dirtyFlag.hidden = true;
      selectedId = null;
      render();
      toast('Published notes reloaded.');
    } catch (error) {
      toast(error.message);
    }
  },
  copy: async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      toast('JSON copied to clipboard.');
    } catch (error) {
      toast('Clipboard blocked — use Download instead.');
    }
  },
  download: () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadHref(url, 'notes.json');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Downloaded — replace notes.json at the repo root and commit.');
  },
  theme: () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark');
  },
  lock: () => {
    sessionStorage.removeItem(PIN_SESSION);
    showLock({ setup: false });
  },
  pin: () => {
    sessionStorage.removeItem(PIN_SESSION);
    showLock({ setup: true });
  },
  publish,
  github: openGithubSheet,
  'github-cancel': () => dom.githubSheet.close(),
  'github-save': () => {
    const fields = dom.githubSheet.querySelector('form').elements;
    saveGithubConfig({
      token: fields.token.value.trim(),
      owner: fields.owner.value.trim(),
      repo: fields.repo.value.trim(),
      branch: fields.branch.value.trim() || 'main',
    }, fields.remember.checked);
    dom.githubSheet.close();
    toast('Token saved in this browser.');
  },
  'github-clear': () => {
    localStorage.removeItem(GH_STORE);
    sessionStorage.removeItem(GH_STORE);
    dom.githubSheet.close();
    toast('Token forgotten.');
  },
};

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const action = actions[trigger.dataset.action];
  if (action) action();
});

dom.pathInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    actions['add-path']();
  }
});

const storedTheme = localStorage.getItem(THEME_KEY);
document.documentElement.dataset.theme = storedTheme
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

startLock();
