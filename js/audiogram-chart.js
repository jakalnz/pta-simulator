import { FREQUENCIES, DB_MIN, DB_MAX } from './utils.js';

const PADDING = { top: 30, right: 20, bottom: 20, left: 40 };
const BC_OFFSET = 9;
const COLORS = {
  right: '#d21f1f',
  left: '#1f5fd2',
  grid: '#c9c9c9',
  gridMajor: '#8a8a8a',
  text: '#333333',
};

function freqToX(freq, width) {
  const minLog = Math.log10(FREQUENCIES[0]);
  const maxLog = Math.log10(FREQUENCIES[FREQUENCIES.length - 1]);
  const ratio = (Math.log10(freq) - minLog) / (maxLog - minLog);
  return PADDING.left + ratio * (width - PADDING.left - PADDING.right);
}

function levelToY(level, height) {
  const ratio = (level - DB_MIN) / (DB_MAX - DB_MIN);
  return PADDING.top + ratio * (height - PADDING.top - PADDING.bottom);
}

export function drawGrid(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.font = '11px sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    const y = levelToY(db, height);
    ctx.beginPath();
    ctx.strokeStyle = db % 20 === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(width - PADDING.right, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(db), PADDING.left - 8, y);
  }

  // Frequency labels sit at the top of the chart, above the grid.
  FREQUENCIES.forEach((freq) => {
    const x = freqToX(freq, width);
    ctx.beginPath();
    ctx.strokeStyle = COLORS.grid;
    ctx.moveTo(x, PADDING.top);
    ctx.lineTo(x, height - PADDING.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = freq >= 1000 ? `${freq / 1000}k` : String(freq);
    ctx.fillText(label, x, PADDING.top - 6);
  });

  ctx.restore();
}

/** No-response: a small straight arrow down from the symbol's lower-center edge. */
function drawNoResponseArrow(ctx, x, y, r) {
  const startY = y + r + 2;
  const endY = startY + 8;
  ctx.beginPath();
  ctx.moveTo(x, startY);
  ctx.lineTo(x, endY);
  ctx.moveTo(x - 4, endY - 4);
  ctx.lineTo(x, endY);
  ctx.lineTo(x + 4, endY - 4);
  ctx.stroke();
}

/**
 * Symbols follow the NZ/Australia convention (see Example Images/Symbols Key.png):
 * AC unmasked: right = open red circle,  left = blue cross (X)
 * AC masked:   right = solid red circle, left = blue double-stroked cross
 * BC unmasked: right = open red "<",     left = open blue ">" (open chevron)
 * BC masked:   right = outlined red "◁", left = outlined blue "▷" (closed
 *              triangle, same size as the unmasked chevron, outline only —
 *              not filled)
 * No response: small straight arrow appended to the lower-center edge of
 *              whichever symbol it belongs to.
 * AC symbols sit on the frequency gridline; BC symbols are offset off-axis —
 * right BC to the left of the line, left BC to the right.
 */
export function drawSymbol(ctx, point, width, height) {
  const baseX = freqToX(point.freq, width);
  const y = levelToY(point.level, height);
  const color = COLORS[point.ear];
  const r = 7;

  const x = point.mode === 'BC'
    ? baseX + (point.ear === 'right' ? -BC_OFFSET : BC_OFFSET)
    : baseX;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  if (point.mode === 'AC' && !point.masked) {
    if (point.ear === 'right') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      drawX(ctx, x, y, r, false);
    }
  } else if (point.mode === 'AC' && point.masked) {
    if (point.ear === 'right') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawX(ctx, x, y, r, true);
    }
  } else if (point.mode === 'BC' && !point.masked) {
    ctx.beginPath();
    if (point.ear === 'right') {
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x + r, y + r);
    } else {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x - r, y + r);
    }
    ctx.stroke();
  } else if (point.mode === 'BC' && point.masked) {
    // Same size/orientation as the unmasked chevron, but closed into an
    // outlined (not filled) triangle to mark it as masked.
    ctx.beginPath();
    if (point.ear === 'right') {
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x + r, y + r);
    } else {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x - r, y + r);
    }
    ctx.closePath();
    ctx.stroke();
  }

  if (point.noResponse) {
    drawNoResponseArrow(ctx, x, y, r);
  }

  ctx.restore();
}

function drawX(ctx, x, y, r, doubled) {
  const offsets = doubled ? [-1.4, 1.4] : [0];
  offsets.forEach((o) => {
    ctx.beginPath();
    ctx.moveTo(x - r + o, y - r);
    ctx.lineTo(x + r + o, y + r);
    ctx.moveTo(x + r + o, y - r);
    ctx.lineTo(x - r + o, y + r);
    ctx.stroke();
  });
}

/**
 * Connecting lines only ever join points within the same series: same ear,
 * same modality, and same masked/unmasked status. This mirrors the source
 * simulator (audiogramscript.js buildplots()), where masked and unmasked
 * thresholds are built from separate data columns and never share a line —
 * a masked point at 1000Hz must never be joined to an unmasked point at 2000Hz.
 * No-response points are excluded entirely, breaking the line at that frequency.
 *
 * A series can still have gaps at frequencies that were only tested with the
 * *other* masked status (e.g. unmasked at 1k and 8k, masked-only at 2k-6k).
 * Drawing straight through those gaps would visually cut across the masked
 * symbols in between as if they weren't there, so the line breaks wherever
 * an intervening frequency has AC data recorded under the other status.
 */
export function drawConnectingLines(ctx, points, width, height) {
  const series = {};
  const acByEarFreq = {}; // `${ear}|${freqIndex}` -> true, any AC status, for gap detection
  points.forEach((p) => {
    if (p.mode !== 'AC' || p.noResponse) return;
    const key = `${p.ear}|${p.masked}`;
    series[key] = series[key] || { ear: p.ear, pts: [] };
    series[key].pts.push(p);
    acByEarFreq[`${p.ear}|${FREQUENCIES.indexOf(p.freq)}`] = true;
  });

  Object.values(series).forEach(({ ear, pts }) => {
    const sorted = [...pts].sort((a, b) => FREQUENCIES.indexOf(a.freq) - FREQUENCIES.indexOf(b.freq));
    if (sorted.length < 2) return;
    ctx.save();
    ctx.strokeStyle = COLORS[ear];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let prevFreqIndex = null;
    sorted.forEach((p, i) => {
      const x = freqToX(p.freq, width);
      const y = levelToY(p.level, height);
      const freqIndex = FREQUENCIES.indexOf(p.freq);
      let hasGapData = false;
      if (prevFreqIndex !== null) {
        for (let fi = prevFreqIndex + 1; fi < freqIndex; fi += 1) {
          if (acByEarFreq[`${ear}|${fi}`]) {
            hasGapData = true;
            break;
          }
        }
      }
      if (i === 0 || hasGapData) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prevFreqIndex = freqIndex;
    });
    ctx.stroke();
    ctx.restore();
  });
}

export function renderAudiogram(canvasEl, points) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvasEl.clientWidth || 600;
  const cssHeight = canvasEl.clientHeight || 400;
  canvasEl.width = cssWidth * dpr;
  canvasEl.height = cssHeight * dpr;
  const ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawGrid(ctx, cssWidth, cssHeight);
  drawConnectingLines(ctx, points, cssWidth, cssHeight);
  points.forEach((p) => drawSymbol(ctx, p, cssWidth, cssHeight));
}
