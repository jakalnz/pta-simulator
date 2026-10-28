/**
 * Freehand, line, arrow and text notes drawn over the audiogram or the
 * masking chart (after the annotations in Wilding's PTA_Sim). Points are
 * stored as fractions of the canvas (0–1) so notes stay in place when the
 * chart is resized or redrawn. Session-only: not saved in links or JSON.
 */

export const ANNOTATION_COLOURS = [
  ['#111111', 'Black'],
  ['#d21f1f', 'Red'],
  ['#1f5fd2', 'Blue'],
  ['#2e7d32', 'Green'],
  ['#e07b00', 'Orange'],
];

export function createAnnotationStore() {
  let items = [];
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());
  return {
    add(item) { items.push(item); emit(); },
    undo() { items.pop(); emit(); },
    clear() { items = []; emit(); },
    items: () => items,
    onChange: (fn) => listeners.push(fn),
  };
}

function drawArrowHead(ctx, from, to, size) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - size * Math.cos(angle - Math.PI / 7), to[1] - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to[0] - size * Math.cos(angle + Math.PI / 7), to[1] - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

// Draws items on a canvas context whose drawing area is width × height.
export function drawAnnotations(ctx, items, width, height) {
  items.forEach((item) => {
    const pts = item.points.map(([x, y]) => [x * width, y * height]);
    ctx.save();
    ctx.strokeStyle = item.colour;
    ctx.fillStyle = item.colour;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (item.tool === 'text') {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, pts[0][0], pts[0][1]);
    } else if (pts.length > 1) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      if (item.tool === 'arrow') drawArrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], 12);
    }
    ctx.restore();
  });
}

/**
 * Lets the user draw on `canvas` while `isActive()` is true. Tool, colour
 * and text come from `getSettings()`. `view` tags each item (e.g. which
 * audiogram it was drawn on) and may be a function. `redraw(preview)`
 * repaints the canvas with an in-progress item.
 */
export function attachAnnotator(canvas, { store, isActive, getSettings, view, redraw }) {
  let drawing = null;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!isActive()) return;
    e.preventDefault();
    const { tool, colour, text } = getSettings();
    if (tool === 'text') {
      if (text.trim()) store.add({ tool, colour, text: text.trim(), points: [at(e)], view: typeof view === 'function' ? view() : view });
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    drawing = { tool, colour, points: [at(e), at(e)], view: typeof view === 'function' ? view() : view };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    if (drawing.tool === 'pen') drawing.points.push(at(e));
    else drawing.points[1] = at(e);
    redraw(drawing);
  });
  const finish = () => {
    if (!drawing) return;
    const item = drawing;
    drawing = null;
    const [a, b] = [item.points[0], item.points[item.points.length - 1]];
    if (item.tool === 'pen' || Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.005) store.add(item);
    else redraw(null);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

/**
 * Builds the tool bar (tool buttons, text box, colour, undo, clear) inside
 * `container`. Returns getSettings() for attachAnnotator.
 */
export function buildAnnotationToolbar(container, store) {
  const state = { tool: 'pen', colour: ANNOTATION_COLOURS[0][0] };
  container.classList.add('annotation-toolbar');
  const tools = [['pen', 'Freehand'], ['line', 'Line'], ['arrow', 'Arrow'], ['text', 'Text']];
  const toolButtons = tools.map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(id === state.tool));
    b.addEventListener('click', () => {
      state.tool = id;
      toolButtons.forEach((x, i) => x.setAttribute('aria-pressed', String(tools[i][0] === id)));
      textInput.hidden = id !== 'text';
      if (id === 'text') textInput.focus();
    });
    return b;
  });
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.placeholder = 'Type, then click to place';
  textInput.hidden = true;
  textInput.size = 18;
  const colour = document.createElement('select');
  colour.setAttribute('aria-label', 'Annotation colour');
  ANNOTATION_COLOURS.forEach(([v, l]) => colour.appendChild(new Option(l, v)));
  colour.addEventListener('change', () => { state.colour = colour.value; });
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = 'Undo';
  undo.addEventListener('click', () => store.undo());
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear notes';
  clear.addEventListener('click', () => { if (store.items().length && window.confirm('Clear all notes on this chart?')) store.clear(); });
  container.append(...toolButtons, textInput, colour, undo, clear);
  return () => ({ tool: state.tool, colour: state.colour, text: textInput.value });
}
