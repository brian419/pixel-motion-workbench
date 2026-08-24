const fileInput = document.getElementById('fileInput');
const sourceFrame = document.getElementById('sourceFrame');
const outputFrame = document.getElementById('outputFrame');
const sourceCanvas = document.getElementById('sourceCanvas');
const outputCanvas = document.getElementById('outputCanvas');
const sourceCtx = sourceCanvas.getContext('2d');
const outputCtx = outputCanvas.getContext('2d');
const changeImageButton = document.getElementById('changeImageButton');
const toolBar = document.getElementById('toolBar');
const clearSelectionButton = document.getElementById('clearSelectionButton');
const fileMeta = document.getElementById('fileMeta');
const selectionSummary = document.getElementById('selectionSummary');
const selectionReadout = document.getElementById('selectionReadout');
const pivotReadout = document.getElementById('pivotReadout');
const rotationInput = document.getElementById('rotation');
const rotationSlider = document.getElementById('rotationSlider');
const translateXInput = document.getElementById('translateX');
const translateXSlider = document.getElementById('translateXSlider');
const translateYInput = document.getElementById('translateY');
const translateYSlider = document.getElementById('translateYSlider');
const exportButton = document.getElementById('exportButton');
const folderButton = document.getElementById('folderButton');
const folderPath = document.getElementById('folderPath');
const outputName = document.getElementById('outputName');
const status = document.getElementById('status');
const zoomOutButton = document.getElementById('zoomOutButton');
const zoomInButton = document.getElementById('zoomInButton');
const zoomValue = document.getElementById('zoomValue');
const sourceZoomOutButton = document.getElementById('sourceZoomOutButton');
const sourceZoomInButton = document.getElementById('sourceZoomInButton');
const sourceZoomValue = document.getElementById('sourceZoomValue');

const originalCanvas = document.createElement('canvas');
const originalCtx = originalCanvas.getContext('2d');
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');
const partCanvas = document.createElement('canvas');
const partCtx = partCanvas.getContext('2d');

let loadedImage = null;
let fileName = '';
let tool = 'select';
let lasso = [];
let drawingLasso = false;
let pivot = null;
let sourceZoom = 1;
let outputZoom = 1;
let outputFolderChosen = false;

const motionControls = [
  rotationInput,
  rotationSlider,
  translateXInput,
  translateXSlider,
  translateYInput,
  translateYSlider,
];

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function updateExportAvailability() {
  exportButton.disabled = !(loadedImage && pivot && lasso.length >= 3 && outputFolderChosen);
}

function setMotionEnabled(enabled) {
  motionControls.forEach(el => { el.disabled = !enabled; });
  updateExportAvailability();
}

function setMotionValue(numberInput, sliderInput, value) {
  const numeric = Number(value) || 0;
  numberInput.value = String(numeric);
  const sliderMin = Number(sliderInput.min);
  const sliderMax = Number(sliderInput.max);
  sliderInput.value = String(Math.max(sliderMin, Math.min(sliderMax, numeric)));
}

function resetMotion() {
  lasso = [];
  pivot = null;
  drawingLasso = false;
  setMotionValue(rotationInput, rotationSlider, 0);
  setMotionValue(translateXInput, translateXSlider, 0);
  setMotionValue(translateYInput, translateYSlider, 0);
  setMotionEnabled(false);
  selectionReadout.textContent = 'Not selected';
  pivotReadout.textContent = 'Not set';
  selectionSummary.textContent = loadedImage ? 'Zoom in if needed, then draw a lasso around the rigid part you want to move.' : 'No image loaded yet.';
  renderAll();
}

function chooseDefaultZoom(width, height) {
  const largest = Math.max(width, height);
  if (largest <= 64) return 6;
  if (largest <= 128) return 4;
  if (largest <= 256) return 2;
  return 1;
}

function applySourceZoom() {
  if (!loadedImage) return;
  sourceCanvas.style.width = `${Math.max(1, Math.round(sourceCanvas.width * sourceZoom))}px`;
  sourceCanvas.style.height = `${Math.max(1, Math.round(sourceCanvas.height * sourceZoom))}px`;
  sourceZoomValue.textContent = `${Math.round(sourceZoom * 100)}%`;
  renderSource();
}

function applyOutputZoom() {
  if (!loadedImage) return;
  outputCanvas.style.width = `${Math.max(1, Math.round(outputCanvas.width * outputZoom))}px`;
  outputCanvas.style.height = `${Math.max(1, Math.round(outputCanvas.height * outputZoom))}px`;
  zoomValue.textContent = `${Math.round(outputZoom * 100)}%`;
}

function configureCanvases(width, height) {
  [sourceCanvas, outputCanvas, originalCanvas, maskCanvas, partCanvas].forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });
  [sourceCtx, outputCtx, originalCtx, maskCtx, partCtx].forEach(ctx => {
    ctx.imageSmoothingEnabled = false;
  });
}

function defaultOutputName(name) {
  const base = name.replace(/\.[^.]+$/, '') || 'frame';
  return `${base}-motion-frame.png`;
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    loadedImage = image;
    fileName = file.name;
    configureCanvases(image.naturalWidth, image.naturalHeight);
    originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    originalCtx.drawImage(image, 0, 0);
    sourceFrame.classList.add('has-image');
    outputFrame.classList.add('has-image');
    changeImageButton.hidden = false;
    toolBar.hidden = false;
    const initialZoom = chooseDefaultZoom(image.naturalWidth, image.naturalHeight);
    sourceZoom = initialZoom;
    outputZoom = initialZoom;
    [zoomOutButton, zoomInButton, sourceZoomOutButton, sourceZoomInButton].forEach(button => { button.disabled = false; });
    fileMeta.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}px`;
    outputName.value = defaultOutputName(file.name);
    resetMotion();
    applySourceZoom();
    applyOutputZoom();
    setTool('select');
    setStatus(outputFolderChosen ? 'Image loaded. Zoom if needed, then select a rigid part.' : 'Image loaded. Zoom if needed, select a part, and choose an output folder.', 'success');
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('That image could not be opened.', 'error');
  };
  image.src = url;
}

function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll('.tool-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
  if (tool === 'select') {
    sourceCanvas.style.cursor = 'crosshair';
    selectionSummary.textContent = lasso.length >= 3 ? 'Selection ready. Redraw it at any time, or set the pivot.' : 'Zoom in if needed, then draw a lasso around the rigid part you want to move.';
  } else if (tool === 'pivot') {
    sourceCanvas.style.cursor = 'cell';
    selectionSummary.textContent = 'Click the hinge or attachment point for the selected part.';
  } else {
    sourceCanvas.style.cursor = 'default';
    selectionSummary.textContent = 'Use the scrollbars to navigate while zoomed in, then return to Select Part or Set Pivot.';
  }
}

function canvasPoint(event) {
  const rect = sourceCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (sourceCanvas.width / rect.width);
  const y = (event.clientY - rect.top) * (sourceCanvas.height / rect.height);
  return {
    x: Math.max(0, Math.min(sourceCanvas.width - 1, x)),
    y: Math.max(0, Math.min(sourceCanvas.height - 1, y))
  };
}

function buildMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (lasso.length < 3) return;
  maskCtx.fillStyle = '#fff';
  maskCtx.beginPath();
  maskCtx.moveTo(lasso[0].x, lasso[0].y);
  for (let i = 1; i < lasso.length; i += 1) maskCtx.lineTo(lasso[i].x, lasso[i].y);
  maskCtx.closePath();
  maskCtx.fill();
}

function buildPart() {
  partCtx.clearRect(0, 0, partCanvas.width, partCanvas.height);
  if (lasso.length < 3) return;
  buildMask();
  partCtx.drawImage(originalCanvas, 0, 0);
  partCtx.globalCompositeOperation = 'destination-in';
  partCtx.drawImage(maskCanvas, 0, 0);
  partCtx.globalCompositeOperation = 'source-over';
}

function boundsFromLasso() {
  if (lasso.length < 3) return null;
  const xs = lasso.map(point => point.x);
  const ys = lasso.map(point => point.y);
  return {
    x: Math.floor(Math.min(...xs)),
    y: Math.floor(Math.min(...ys)),
    width: Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs))),
    height: Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys)))
  };
}

function renderSource() {
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  if (!loadedImage) return;
  sourceCtx.drawImage(originalCanvas, 0, 0);
  if (lasso.length >= 2) {
    sourceCtx.save();
    sourceCtx.strokeStyle = '#2997ff';
    sourceCtx.lineWidth = Math.max(1, 1 / sourceZoom);
    sourceCtx.setLineDash([Math.max(1, 3 / sourceZoom), Math.max(1, 2 / sourceZoom)]);
    sourceCtx.beginPath();
    sourceCtx.moveTo(lasso[0].x, lasso[0].y);
    for (let i = 1; i < lasso.length; i += 1) sourceCtx.lineTo(lasso[i].x, lasso[i].y);
    if (!drawingLasso && lasso.length >= 3) sourceCtx.closePath();
    sourceCtx.stroke();
    sourceCtx.restore();
  }
  if (pivot) {
    sourceCtx.save();
    sourceCtx.strokeStyle = '#ff3b30';
    sourceCtx.fillStyle = '#ff3b30';
    sourceCtx.lineWidth = Math.max(1, 1 / sourceZoom);
    const r = Math.max(1.25, 3 / sourceZoom);
    sourceCtx.beginPath();
    sourceCtx.arc(pivot.x, pivot.y, r, 0, Math.PI * 2);
    sourceCtx.fill();
    sourceCtx.beginPath();
    sourceCtx.moveTo(pivot.x - r * 2, pivot.y);
    sourceCtx.lineTo(pivot.x + r * 2, pivot.y);
    sourceCtx.moveTo(pivot.x, pivot.y - r * 2);
    sourceCtx.lineTo(pivot.x, pivot.y + r * 2);
    sourceCtx.stroke();
    sourceCtx.restore();
  }
}

function renderOutput() {
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  if (!loadedImage) return;
  outputCtx.drawImage(originalCanvas, 0, 0);
  if (lasso.length < 3) return;

  buildPart();
  buildMask();

  outputCtx.save();
  outputCtx.globalCompositeOperation = 'destination-out';
  outputCtx.drawImage(maskCanvas, 0, 0);
  outputCtx.restore();

  const activePivot = pivot || (() => {
    const bounds = boundsFromLasso();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })();
  const angle = Number(rotationInput.value || 0) * Math.PI / 180;
  const dx = Number(translateXInput.value || 0);
  const dy = Number(translateYInput.value || 0);

  outputCtx.save();
  outputCtx.translate(activePivot.x + dx, activePivot.y + dy);
  outputCtx.rotate(angle);
  outputCtx.translate(-activePivot.x, -activePivot.y);
  outputCtx.drawImage(partCanvas, 0, 0);
  outputCtx.restore();
}

function renderAll() {
  renderSource();
  renderOutput();
}

sourceCanvas.addEventListener('pointerdown', event => {
  if (!loadedImage) return;
  if (tool === 'select') {
    sourceCanvas.setPointerCapture(event.pointerId);
    drawingLasso = true;
    lasso = [canvasPoint(event)];
    pivot = null;
    setMotionEnabled(false);
    renderAll();
  } else if (tool === 'pivot' && lasso.length >= 3) {
    pivot = canvasPoint(event);
    pivotReadout.textContent = `(${Math.round(pivot.x)}, ${Math.round(pivot.y)})`;
    setMotionEnabled(true);
    selectionSummary.textContent = 'Pivot set. Adjust rotation or translation with the sliders or exact values.';
    setStatus(outputFolderChosen ? 'Pivot set. Motion controls and export are ready.' : 'Pivot set. Choose an output folder before exporting.', 'success');
    renderAll();
  }
});

sourceCanvas.addEventListener('pointermove', event => {
  if (!drawingLasso || tool !== 'select') return;
  const point = canvasPoint(event);
  const last = lasso[lasso.length - 1];
  const minimumDistance = Math.max(0.08, 0.5 / sourceZoom);
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minimumDistance) {
    lasso.push(point);
    renderSource();
  }
});

sourceCanvas.addEventListener('pointerup', event => {
  if (!drawingLasso || tool !== 'select') return;
  drawingLasso = false;
  if (sourceCanvas.hasPointerCapture(event.pointerId)) sourceCanvas.releasePointerCapture(event.pointerId);
  if (lasso.length < 3) {
    lasso = [];
    setStatus('The selection was too small. Draw a loop around the part.', 'error');
  } else {
    const bounds = boundsFromLasso();
    selectionReadout.textContent = `${bounds.width} × ${bounds.height}px region near (${bounds.x}, ${bounds.y})`;
    pivotReadout.textContent = 'Not set';
    setMotionEnabled(false);
    selectionSummary.textContent = 'Selection ready. Click Set Pivot, then click its hinge or attachment point.';
    setStatus('Part selected. Set its pivot next.', 'success');
  }
  renderAll();
});

[sourceFrame, outputFrame].forEach(frame => {
  frame.addEventListener('dragover', event => { event.preventDefault(); frame.classList.add('dragging'); });
  frame.addEventListener('dragleave', () => frame.classList.remove('dragging'));
  frame.addEventListener('drop', event => {
    event.preventDefault();
    frame.classList.remove('dragging');
    loadFile(event.dataTransfer.files[0]);
  });
});

sourceFrame.addEventListener('click', event => {
  if (!loadedImage && event.target !== sourceCanvas) fileInput.click();
});
changeImageButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

document.querySelectorAll('.tool-button').forEach(button => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

clearSelectionButton.addEventListener('click', () => {
  resetMotion();
  setTool('select');
  setStatus('Selection cleared. Zoom if needed, then draw a new lasso around a rigid part.');
});

function bindMotionPair(numberInput, sliderInput) {
  sliderInput.addEventListener('input', () => {
    numberInput.value = sliderInput.value;
    renderOutput();
    setStatus('Candidate frame updated.', 'success');
  });
  numberInput.addEventListener('input', () => {
    const value = Number(numberInput.value || 0);
    sliderInput.value = String(Math.max(Number(sliderInput.min), Math.min(Number(sliderInput.max), value)));
    renderOutput();
    setStatus('Candidate frame updated.', 'success');
  });
}

bindMotionPair(rotationInput, rotationSlider);
bindMotionPair(translateXInput, translateXSlider);
bindMotionPair(translateYInput, translateYSlider);

function changeSourceZoom(multiplier) {
  sourceZoom = Math.max(0.25, Math.min(64, sourceZoom * multiplier));
  applySourceZoom();
}
function changeOutputZoom(multiplier) {
  outputZoom = Math.max(0.25, Math.min(64, outputZoom * multiplier));
  applyOutputZoom();
}
sourceZoomOutButton.addEventListener('click', () => changeSourceZoom(0.5));
sourceZoomInButton.addEventListener('click', () => changeSourceZoom(2));
zoomOutButton.addEventListener('click', () => changeOutputZoom(0.5));
zoomInButton.addEventListener('click', () => changeOutputZoom(2));

folderButton.addEventListener('click', async () => {
  folderButton.disabled = true;
  setStatus('Opening folder chooser...');
  try {
    const response = await fetch('/api/choose-folder', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not choose a folder.');
    if (data.cancelled) {
      setStatus('Folder selection cancelled.');
      return;
    }
    outputFolderChosen = true;
    folderPath.textContent = data.path;
    updateExportAvailability();
    setStatus('Output folder selected.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not choose an output folder.', 'error');
  } finally {
    folderButton.disabled = false;
  }
});

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG frame.')), 'image/png');
  });
}

exportButton.addEventListener('click', async () => {
  if (!loadedImage || !pivot || lasso.length < 3 || !outputFolderChosen) return;
  renderOutput();
  exportButton.disabled = true;
  setStatus('Saving candidate frame...');
  try {
    const blob = await canvasToBlob(outputCanvas);
    const form = new FormData();
    form.append('frame', blob, 'frame.png');
    form.append('output_name', outputName.value.trim() || defaultOutputName(fileName));
    const response = await fetch('/api/export-frame', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save the frame.');
    outputName.value = data.filename;
    setStatus(`Saved ${data.filename} to ${data.path}.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Could not save the candidate frame.', 'error');
  } finally {
    updateExportAvailability();
  }
});
