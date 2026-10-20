// Rounded highlights live behind the article text; the cursor only consumes their bounds.
export function createTextSelection(onChange) {
  const article = document.querySelector('.note-modal-review');
  const modal = article.closest('dialog');
  const scroller = article.closest('.note-modal-scroll');
  const layer = document.createElement('span');
  layer.className = 'text-selection-highlight';
  layer.setAttribute('aria-hidden', 'true');
  article.classList.add('has-custom-selection');
  const events = new AbortController();
  let frame = 0;
  let bounds = null;
  let signature = '';

  const inArticle = node => node && article.contains(node);
  const activeRange = () => {
    const selected = window.getSelection();
    if (!modal.open || !selected?.rangeCount || selected.isCollapsed) return null;
    const range = selected.getRangeAt(0);
    if (!range.intersectsNode(article)) return null;
    const whole = document.createRange();
    whole.selectNodeContents(article);
    const clipped = range.cloneRange();
    if (clipped.compareBoundaryPoints(Range.START_TO_START, whole) < 0) clipped.setStart(article, 0);
    if (clipped.compareBoundaryPoints(Range.END_TO_END, whole) > 0) clipped.setEnd(article, article.childNodes.length);
    return clipped;
  };

  function paint() {
    frame = 0;
    const range = activeRange();
    const rectangles = [];
    if (range) {
      const clip = scroller.getBoundingClientRect();
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.data.trim() || !range.intersectsNode(node)) continue;
        const fragment = document.createRange();
        fragment.setStart(node, node === range.startContainer ? range.startOffset : 0);
        fragment.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
        for (const box of fragment.getClientRects()) {
          const left = Math.max(clip.left, box.left), right = Math.min(clip.right, box.right);
          const top = Math.max(clip.top, box.top), bottom = Math.min(clip.bottom, box.bottom);
          if (right > left && bottom > top) rectangles.push({ left, right, top, bottom });
        }
      }
    }
    rectangles.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    rectangles.forEach(rect => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - rect.top) < 1 && Math.abs(last.bottom - rect.bottom) < 1 && rect.left <= last.right + 1) last.right = Math.max(last.right, rect.right);
      else lines.push({ ...rect });
    });
    // Two pixels horizontally and one vertically keep the highlight close to the words.
    const padded = lines.map(rect => ({ left: rect.left - 2, right: rect.right + 2, top: rect.top - 1, bottom: rect.bottom + 1 }));
    const nextSignature = JSON.stringify(padded);
    if (nextSignature === signature) return;
    signature = nextSignature;
    layer.replaceChildren();
    bounds = null;
    if (padded.length) {
      if (layer.parentElement !== article) article.append(layer);
      const origin = article.getBoundingClientRect();
      const style = getComputedStyle(article);
      const scaleX = origin.width / parseFloat(style.width) || 1;
      const scaleY = origin.height / parseFloat(style.height) || 1;
      padded.forEach(rect => {
        const mark = document.createElement('span');
        mark.style.cssText = `left:${(rect.left - origin.left) / scaleX}px;top:${(rect.top - origin.top) / scaleY}px;width:${(rect.right - rect.left) / scaleX}px;height:${(rect.bottom - rect.top) / scaleY}px;`;
        layer.append(mark);
      });
      const left = Math.min(...padded.map(r => r.left)), right = Math.max(...padded.map(r => r.right));
      const top = Math.min(...padded.map(r => r.top)), bottom = Math.max(...padded.map(r => r.bottom));
      bounds = { left, right, top, bottom, width: right - left, height: bottom - top };
    }
    onChange();
  }

  function update() { if (!frame) frame = requestAnimationFrame(paint); }
  function clear() {
    const selected = window.getSelection();
    if (selected?.rangeCount && selected.getRangeAt(0).intersectsNode(article)) selected.removeAllRanges();
    update();
  }

  function textAtPoint(x, y) {
    const caret = document.caretPositionFromPoint?.(x, y);
    const fallback = caret ? null : document.caretRangeFromPoint?.(x, y);
    const node = caret?.offsetNode || fallback?.startContainer;
    const offset = caret?.offset ?? fallback?.startOffset;
    if (node?.nodeType !== Node.TEXT_NODE || !inArticle(node) || !node.length) return false;
    return [offset, offset - 1].some(start => {
      if (start < 0 || start >= node.length) return false;
      const probe = document.createRange();
      probe.setStart(node, start);
      probe.setEnd(node, start + 1);
      const box = probe.getBoundingClientRect();
      return x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1;
    });
  }

  const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: events.signal });
  // A double click beside a paragraph must not select the nearest word or line.
  listen(article, 'mousedown', event => {
    if (event.button === 0 && !textAtPoint(event.clientX, event.clientY)) {
      clear();
      event.preventDefault();
    }
  });
  listen(document, 'pointerdown', event => { if (!article.contains(event.target)) clear(); }, { capture: true, passive: true });
  listen(document, 'selectionchange', update);
  listen(window, 'scroll', update, { capture: true, passive: true });
  listen(window, 'resize', update, { passive: true });
  listen(modal, 'close', clear);
  const observer = new MutationObserver(update);
  observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
  update();
  return {
    bounds: () => bounds,
    destroy() {
      cancelAnimationFrame(frame);
      events.abort();
      observer.disconnect();
      layer.remove();
      article.classList.remove('has-custom-selection');
    }
  };
}
