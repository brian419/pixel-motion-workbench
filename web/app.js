const $ = id => document.getElementById(id);
const fileInput = $('fileInput');
const sourceFrame = $('sourceFrame');
const outputFrame = $('outputFrame');
const sourceCanvas = $('sourceCanvas');
const outputCanvas = $('outputCanvas');
const sourceCtx = sourceCanvas.getContext('2d');
const outputCtx = outputCanvas.getContext('2d');
const changeImageButton = $('changeImageButton');
const toolBar = $('toolBar');
const clearSelectionButton = $('clearSelectionButton');
const fileMeta = $('fileMeta');
const selectionSummary = $('selectionSummary');
const selectionReadout = $('selectionReadout');
const pivotReadout = $('pivotReadout');
const toleranceInput = $('tolerance');
const toleranceReadout = $('toleranceReadout');
const rotationInput = $('rotation');
const translateXInput = $('translateX');
const translateYInput = $('translateY');
const exportButton = $('exportButton');
const status = $('status');
const zoomOutButton = $('zoomOutButton');
const zoomInButton = $('zoomInButton');
const zoomValue = $('zoomValue');

const originalCanvas = document.createElement('canvas');
const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
const partCanvas = document.createElement('canvas');
const partCtx = partCanvas.getContext('2d');

let loadedImage = null;
let fileName = '';
let tool = 'smart';
let pivot = null;
let zoom = 1;
let selection = null;
let lasso = [];
let drawingLasso = false;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function configureCanvases(width, height) {
  [sourceCanvas, outputCanvas, originalCanvas, maskCanvas, partCanvas].forEach(c => {
    c.width = width;
    c.height = height;
  });
  [sourceCtx, outputCtx, originalCtx, maskCtx, partCtx].forEach(ctx => { ctx.imageSmoothingEnabled = false; });
  selection = new Uint8Array(width * height);
}

function chooseDefaultZoom(width, height) {
  const largest = Math.max(width, height);
  if (largest <= 64) return 6;
  if (largest <= 128) return 4;
  if (largest <= 256) return 2;
  return 1;
}

function applyZoom() {
  if (!loadedImage) return;
  const w = Math.max(1, Math.round(sourceCanvas.width * zoom));
  const h = Math.max(1, Math.round(sourceCanvas.height * zoom));
  [sourceCanvas, outputCanvas].forEach(c => {
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
  });
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
}

function selectedCount() {
  if (!selection) return 0;
  let count = 0;
  for (const value of selection) count += value ? 1 : 0;
  return count;
}

function selectionBounds() {
  if (!selection) return null;
  let minX = sourceCanvas.width, minY = sourceCanvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < sourceCanvas.height; y++) {
    for (let x = 0; x < sourceCanvas.width; x++) {
      if (!selection[y * sourceCanvas.width + x]) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function updateSelectionReadout() {
  const count = selectedCount();
  const bounds = selectionBounds();
  selectionReadout.textContent = bounds ? `${count} pixels · ${bounds.width} × ${bounds.height}px` : 'Not selected';
  [rotationInput, translateXInput, translateYInput, exportButton].forEach(el => { el.disabled = !pivot || !count; });
}

function resetMotion() {
  pivot = null;
  lasso = [];
  drawingLasso = false;
  if (selection) selection.fill(0);
  rotationInput.value = '0';
  translateXInput.value = '0';
  translateYInput.value = '0';
  pivotReadout.textContent = 'Not set';
  selectionSummary.textContent = loadedImage ? 'Smart Click a connected region, then add or subtract pieces as needed.' : 'No image loaded yet.';
  updateSelectionReadout();
  renderAll();
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    loadedImage = image;
    fileName = file.name;
    configureCanvases(image.naturalWidth, image.naturalHeight);
    originalCtx.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
    originalCtx.drawImage(image, 0, 0);
    sourceFrame.classList.add('has-image');
    outputFrame.classList.add('has-image');
    changeImageButton.hidden = false;
    toolBar.hidden = false;
    zoom = chooseDefaultZoom(image.naturalWidth, image.naturalHeight);
    zoomOutButton.disabled = false;
    zoomInButton.disabled = false;
    fileMeta.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}px`;
    resetMotion();
    applyZoom();
    setTool('smart');
    setStatus('Image loaded. Smart Click a piece of the part you want to move.', 'success');
    URL.revokeObjectURL(url);
  };
  image.onerror = () => { URL.revokeObjectURL(url); setStatus('That image could not be opened.', 'error'); };
  image.src = url;
}

function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll('.tool-button').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
  if (['smart', 'add', 'subtract'].includes(tool)) {
    sourceCanvas.style.cursor = 'crosshair';
    const action = tool === 'smart' ? 'replace the selection with' : tool === 'add' ? 'add' : 'remove';
    selectionSummary.textContent = `Click a connected pixel region to ${action} that region.`;
  } else if (tool === 'lasso') {
    sourceCanvas.style.cursor = 'crosshair';
    selectionSummary.textContent = 'Draw a freehand lasso. It replaces the current smart selection.';
  } else if (tool === 'pivot') {
    sourceCanvas.style.cursor = 'cell';
    selectionSummary.textContent = 'Click the hinge or attachment point for the selected part.';
  } else {
    sourceCanvas.style.cursor = 'default';
    selectionSummary.textContent = 'Pan mode is reserved for linked viewport navigation. Use the scrollbars for now.';
  }
}

function canvasPoint(event) {
  const rect = sourceCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(sourceCanvas.width - 1, Math.floor((event.clientX - rect.left) * sourceCanvas.width / rect.width))),
    y: Math.max(0, Math.min(sourceCanvas.height - 1, Math.floor((event.clientY - rect.top) * sourceCanvas.height / rect.height)))
  };
}

function colorDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function floodRegion(startX, startY) {
  const w = originalCanvas.width, h = originalCanvas.height;
  const image = originalCtx.getImageData(0, 0, w, h).data;
  const seedIndex = (startY * w + startX) * 4;
  if (image[seedIndex + 3] < 16) return [];
  const seed = [image[seedIndex], image[seedIndex + 1], image[seedIndex + 2]];
  const threshold = Number(toleranceInput.value) * 4.42;
  const seen = new Uint8Array(w * h);
  const queue = [[startX, startY]];
  const result = [];
  seen[startY * w + startX] = 1;
  const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];

  while (queue.length) {
    const [x, y] = queue.shift();
    const i = (y * w + x) * 4;
    if (image[i + 3] < 16) continue;
    const pixel = [image[i], image[i + 1], image[i + 2]];
    if (colorDistance(pixel, seed) > threshold) continue;
    result.push(y * w + x);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!seen[ni]) { seen[ni] = 1; queue.push([nx, ny]); }
    }
  }
  return result;
}

function applyRegion(indices, mode) {
  if (mode === 'smart') selection.fill(0);
  for (const index of indices) selection[index] = mode === 'subtract' ? 0 : 1;
  pivot = null;
  pivotReadout.textContent = 'Not set';
  updateSelectionReadout();
  renderAll();
  setStatus(`${mode === 'subtract' ? 'Removed' : mode === 'add' ? 'Added' : 'Selected'} ${indices.length} connected pixels.`, 'success');
}

function buildMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (!selection || !selectedCount()) return;
  const image = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
  for (let i = 0; i < selection.length; i++) {
    if (!selection[i]) continue;
    const p = i * 4;
    image.data[p] = image.data[p + 1] = image.data[p + 2] = image.data[p + 3] = 255;
  }
  maskCtx.putImageData(image, 0, 0);
}

function buildPart() {
  partCtx.clearRect(0, 0, partCanvas.width, partCanvas.height);
  buildMask();
  partCtx.drawImage(originalCanvas, 0, 0);
  partCtx.globalCompositeOperation = 'destination-in';
  partCtx.drawImage(maskCanvas, 0, 0);
  partCtx.globalCompositeOperation = 'source-over';
}

function renderSource() {
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  if (!loadedImage) return;
  sourceCtx.drawImage(originalCanvas, 0, 0);
  if (selection && selectedCount()) {
    sourceCtx.save();
    sourceCtx.globalAlpha = 0.32;
    sourceCtx.fillStyle = '#2997ff';
    for (let y = 0; y < sourceCanvas.height; y++) for (let x = 0; x < sourceCanvas.width; x++) {
      if (selection[y * sourceCanvas.width + x]) sourceCtx.fillRect(x, y, 1, 1);
    }
    sourceCtx.restore();
  }
  if (drawingLasso && lasso.length > 1) {
    sourceCtx.save(); sourceCtx.strokeStyle = '#2997ff'; sourceCtx.lineWidth = Math.max(1, 1 / zoom);
    sourceCtx.beginPath(); sourceCtx.moveTo(lasso[0].x, lasso[0].y);
    for (let i = 1; i < lasso.length; i++) sourceCtx.lineTo(lasso[i].x, lasso[i].y);
    sourceCtx.stroke(); sourceCtx.restore();
  }
  if (pivot) {
    sourceCtx.save(); sourceCtx.strokeStyle = sourceCtx.fillStyle = '#ff3b30';
    const r = Math.max(2, 3 / zoom); sourceCtx.beginPath(); sourceCtx.arc(pivot.x, pivot.y, r, 0, Math.PI * 2); sourceCtx.fill();
    sourceCtx.beginPath(); sourceCtx.moveTo(pivot.x-r*2,pivot.y); sourceCtx.lineTo(pivot.x+r*2,pivot.y); sourceCtx.moveTo(pivot.x,pivot.y-r*2); sourceCtx.lineTo(pivot.x,pivot.y+r*2); sourceCtx.stroke(); sourceCtx.restore();
  }
}

function renderOutput() {
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  if (!loadedImage) return;
  outputCtx.drawImage(originalCanvas, 0, 0);
  if (!selection || !selectedCount()) return;
  buildPart(); buildMask();
  outputCtx.save(); outputCtx.globalCompositeOperation = 'destination-out'; outputCtx.drawImage(maskCanvas, 0, 0); outputCtx.restore();
  const bounds = selectionBounds();
  const activePivot = pivot || { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const angle = Number(rotationInput.value || 0) * Math.PI / 180;
  const dx = Number(translateXInput.value || 0), dy = Number(translateYInput.value || 0);
  outputCtx.save(); outputCtx.translate(activePivot.x + dx, activePivot.y + dy); outputCtx.rotate(angle); outputCtx.translate(-activePivot.x, -activePivot.y); outputCtx.drawImage(partCanvas, 0, 0); outputCtx.restore();
}

function renderAll() { renderSource(); renderOutput(); }

function lassoToSelection() {
  if (lasso.length < 3) return false;
  const temp = document.createElement('canvas'); temp.width = sourceCanvas.width; temp.height = sourceCanvas.height;
  const ctx = temp.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(lasso[0].x, lasso[0].y);
  for (let i = 1; i < lasso.length; i++) ctx.lineTo(lasso[i].x, lasso[i].y); ctx.closePath(); ctx.fill();
  const data = ctx.getImageData(0, 0, temp.width, temp.height).data; selection.fill(0);
  for (let i = 0; i < selection.length; i++) if (data[i * 4 + 3]) selection[i] = 1;
  return true;
}

sourceCanvas.addEventListener('pointerdown', event => {
  if (!loadedImage) return;
  const point = canvasPoint(event);
  if (['smart','add','subtract'].includes(tool)) {
    const region = floodRegion(point.x, point.y);
    if (!region.length) return setStatus('No opaque connected region was found there.', 'error');
    applyRegion(region, tool);
  } else if (tool === 'lasso') {
    sourceCanvas.setPointerCapture(event.pointerId); drawingLasso = true; lasso = [point]; renderSource();
  } else if (tool === 'pivot' && selectedCount()) {
    pivot = point; pivotReadout.textContent = `(${point.x}, ${point.y})`; updateSelectionReadout(); selectionSummary.textContent = 'Pivot set. Adjust rotation or translation.'; setStatus('Pivot set. Motion controls are ready.', 'success'); renderAll();
  }
});

sourceCanvas.addEventListener('pointermove', event => {
  if (!drawingLasso || tool !== 'lasso') return;
  const p = canvasPoint(event), last = lasso[lasso.length - 1];
  if (!last || Math.hypot(p.x-last.x,p.y-last.y) >= 0.5) { lasso.push(p); renderSource(); }
});

sourceCanvas.addEventListener('pointerup', event => {
  if (!drawingLasso || tool !== 'lasso') return;
  drawingLasso = false; if (sourceCanvas.hasPointerCapture(event.pointerId)) sourceCanvas.releasePointerCapture(event.pointerId);
  if (!lassoToSelection()) return setStatus('The lasso was too small.', 'error');
  pivot = null; pivotReadout.textContent = 'Not set'; updateSelectionReadout(); renderAll(); setStatus('Lasso selection created. Set the pivot next.', 'success');
});

[sourceFrame, outputFrame].forEach(frame => {
  frame.addEventListener('dragover', e => { e.preventDefault(); frame.classList.add('dragging'); });
  frame.addEventListener('dragleave', () => frame.classList.remove('dragging'));
  frame.addEventListener('drop', e => { e.preventDefault(); frame.classList.remove('dragging'); loadFile(e.dataTransfer.files[0]); });
});
sourceFrame.addEventListener('click', e => { if (!loadedImage && e.target !== sourceCanvas) fileInput.click(); });
changeImageButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
document.querySelectorAll('.tool-button').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
clearSelectionButton.addEventListener('click', () => { resetMotion(); setTool('smart'); setStatus('Selection cleared. Smart Click a new part.'); });
[rotationInput, translateXInput, translateYInput].forEach(input => input.addEventListener('input', () => { renderOutput(); setStatus('Candidate frame updated.', 'success'); }));
toleranceInput.addEventListener('input', () => { toleranceReadout.textContent = `${toleranceInput.value}. Lower values stay closer to the clicked color. Higher values cross more shading variation.`; });
zoomOutButton.addEventListener('click', () => { zoom = Math.max(0.25, zoom / 2); applyZoom(); renderAll(); });
zoomInButton.addEventListener('click', () => { zoom = Math.min(64, zoom * 2); applyZoom(); renderAll(); });
exportButton.addEventListener('click', () => {
  if (!loadedImage || !pivot || !selectedCount()) return;
  renderOutput(); const link = document.createElement('a'); const base = fileName.replace(/\.[^.]+$/, '') || 'frame'; link.download = `${base}-motion-frame.png`; link.href = outputCanvas.toDataURL('image/png'); link.click(); setStatus(`Exported ${link.download}.`, 'success');
});
