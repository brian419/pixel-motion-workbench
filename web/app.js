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
const motionType = document.getElementById('motionType');
const motionTypeNote = document.getElementById('motionTypeNote');
const screenRotationControl = document.getElementById('screenRotationControl');
const translationControl = document.getElementById('translationControl');
const depthAngleControl = document.getElementById('depthAngleControl');
const perspectiveControl = document.getElementById('perspectiveControl');
const rotationInput = document.getElementById('rotation');
const translateXInput = document.getElementById('translateX');
const translateYInput = document.getElementById('translateY');
const depthAngleInput = document.getElementById('depthAngle');
const depthAngleNumber = document.getElementById('depthAngleNumber');
const perspectiveInput = document.getElementById('perspective');
const perspectiveReadout = document.getElementById('perspectiveReadout');
const exportButton = document.getElementById('exportButton');
const status = document.getElementById('status');
const zoomOutButton = document.getElementById('zoomOutButton');
const zoomInButton = document.getElementById('zoomInButton');
const zoomValue = document.getElementById('zoomValue');

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
let zoom = 1;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function setMotionControlsEnabled(enabled) {
  motionType.disabled = !enabled;
  exportButton.disabled = !enabled;
  const screen = motionType.value === 'screen';
  rotationInput.disabled = !enabled || !screen;
  translateXInput.disabled = !enabled || !screen;
  translateYInput.disabled = !enabled || !screen;
  depthAngleInput.disabled = !enabled || screen;
  depthAngleNumber.disabled = !enabled || screen;
  perspectiveInput.disabled = !enabled || screen;
}

function updateMotionTypeUI() {
  const depth = motionType.value === 'depth';
  screenRotationControl.hidden = depth;
  translationControl.hidden = depth;
  depthAngleControl.hidden = !depth;
  perspectiveControl.hidden = !depth;
  motionTypeNote.textContent = depth
    ? 'Depth flip keeps the hinge fixed and simulates a lever moving toward the viewer, through the midpoint, and downward.'
    : 'Screen rotation preserves the original first-version behavior.';
  setMotionControlsEnabled(Boolean(pivot));
  renderOutput();
}

function resetMotion() {
  lasso = [];
  pivot = null;
  drawingLasso = false;
  motionType.value = 'screen';
  rotationInput.value = '0';
  translateXInput.value = '0';
  translateYInput.value = '0';
  depthAngleInput.value = '0';
  depthAngleNumber.value = '0';
  perspectiveInput.value = '20';
  perspectiveReadout.textContent = '20% width emphasis near the camera-facing midpoint.';
  setMotionControlsEnabled(false);
  selectionReadout.textContent = 'Not selected';
  pivotReadout.textContent = 'Not set';
  selectionSummary.textContent = loadedImage ? 'Draw a lasso around only the rigid part you want to move.' : 'No image loaded yet.';
  updateMotionTypeUI();
  renderAll();
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
  const width = Math.max(1, Math.round(sourceCanvas.width * zoom));
  const height = Math.max(1, Math.round(sourceCanvas.height * zoom));
  [sourceCanvas, outputCanvas].forEach(canvas => {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  });
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
}

function configureCanvases(width, height) {
  [sourceCanvas, outputCanvas, originalCanvas, maskCanvas, partCanvas].forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });
  sourceCtx.imageSmoothingEnabled = false;
  outputCtx.imageSmoothingEnabled = false;
  originalCtx.imageSmoothingEnabled = false;
  maskCtx.imageSmoothingEnabled = false;
  partCtx.imageSmoothingEnabled = false;
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
    zoom = chooseDefaultZoom(image.naturalWidth, image.naturalHeight);
    zoomOutButton.disabled = false;
    zoomInButton.disabled = false;
    fileMeta.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}px`;
    resetMotion();
    applyZoom();
    setTool('select');
    setStatus('Image loaded. Draw a lasso around only the moving rigid part.', 'success');
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
    selectionSummary.textContent = lasso.length >= 3 ? 'Selection ready. Redraw it at any time, or set the pivot.' : 'Draw a loose lasso around only the rigid part you want to move.';
  } else if (tool === 'pivot') {
    sourceCanvas.style.cursor = 'cell';
    selectionSummary.textContent = 'Click the exact hinge or attachment point. This point remains fixed during a depth flip.';
  } else {
    sourceCanvas.style.cursor = 'default';
    selectionSummary.textContent = 'Pan mode is reserved for linked viewport navigation. Use the scrollbars for now.';
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
    sourceCtx.lineWidth = Math.max(1, 1 / zoom);
    sourceCtx.setLineDash([Math.max(2, 3 / zoom), Math.max(2, 2 / zoom)]);
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
    sourceCtx.lineWidth = Math.max(1, 1 / zoom);
    const r = Math.max(2, 3 / zoom);
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

function drawScreenTransform(activePivot) {
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

function drawDepthFlip(activePivot) {
  const angleDegrees = Number(depthAngleInput.value || 0);
  const radians = angleDegrees * Math.PI / 180;

  // Orthographic hinge approximation: the visible lever length follows cos(theta).
  // Positive at 0°, zero at 90°, negative after 90°, which naturally flips it below the hinge.
  let yScale = Math.cos(radians);

  // Avoid a mathematically zero-height frame so the camera-facing midpoint remains visible.
  const minimumDepthThickness = 0.08;
  if (Math.abs(yScale) < minimumDepthThickness) {
    yScale = (yScale < 0 ? -1 : 1) * minimumDepthThickness;
  }

  // Give the part a small width emphasis as it points toward the viewer.
  const perspectiveStrength = Number(perspectiveInput.value || 0) / 100;
  const towardViewer = Math.sin(radians);
  const xScale = 1 + perspectiveStrength * Math.abs(towardViewer);

  outputCtx.save();
  outputCtx.translate(activePivot.x, activePivot.y);
  outputCtx.scale(xScale, yScale);
  outputCtx.translate(-activePivot.x, -activePivot.y);
  outputCtx.drawImage(partCanvas, 0, 0);
  outputCtx.restore();
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

  if (motionType.value === 'depth') {
    drawDepthFlip(activePivot);
  } else {
    drawScreenTransform(activePivot);
  }
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
    setMotionControlsEnabled(false);
    renderAll();
  } else if (tool === 'pivot' && lasso.length >= 3) {
    pivot = canvasPoint(event);
    pivotReadout.textContent = `(${Math.round(pivot.x)}, ${Math.round(pivot.y)})`;
    setMotionControlsEnabled(true);
    selectionSummary.textContent = 'Pivot set. Choose a motion type and adjust the candidate frame.';
    setStatus('Pivot set. Motion controls are ready.', 'success');
    renderAll();
  }
});

sourceCanvas.addEventListener('pointermove', event => {
  if (!drawingLasso || tool !== 'select') return;
  const point = canvasPoint(event);
  const last = lasso[lasso.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.5) {
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
    setMotionControlsEnabled(false);
    selectionSummary.textContent = 'Selection ready. Click Set Pivot, then click its exact hinge or attachment point.';
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
  setStatus('Selection cleared. Draw a new lasso around a rigid part.');
});

motionType.addEventListener('change', () => {
  updateMotionTypeUI();
  setStatus(motionType.value === 'depth' ? 'Depth flip mode selected. Move the slider toward 180° to pull the lever down.' : 'Screen rotation mode selected.', 'success');
});

[rotationInput, translateXInput, translateYInput].forEach(input => {
  input.addEventListener('input', () => {
    renderOutput();
    setStatus('Candidate frame updated.', 'success');
  });
});

function setDepthAngle(value) {
  const safe = Math.max(0, Math.min(180, Number(value) || 0));
  depthAngleInput.value = String(safe);
  depthAngleNumber.value = String(safe);
  renderOutput();
  setStatus(`Depth flip updated to ${safe}°.`, 'success');
}

depthAngleInput.addEventListener('input', () => setDepthAngle(depthAngleInput.value));
depthAngleNumber.addEventListener('input', () => setDepthAngle(depthAngleNumber.value));
perspectiveInput.addEventListener('input', () => {
  perspectiveReadout.textContent = `${perspectiveInput.value}% width emphasis near the camera-facing midpoint.`;
  renderOutput();
  setStatus('Perspective strength updated.', 'success');
});

zoomOutButton.addEventListener('click', () => {
  zoom = Math.max(0.25, zoom / 2);
  applyZoom();
  renderAll();
});
zoomInButton.addEventListener('click', () => {
  zoom = Math.min(64, zoom * 2);
  applyZoom();
  renderAll();
});

exportButton.addEventListener('click', () => {
  if (!loadedImage || !pivot || lasso.length < 3) return;
  renderOutput();
  const link = document.createElement('a');
  const base = fileName.replace(/\.[^.]+$/, '') || 'frame';
  const suffix = motionType.value === 'depth' ? `depth-${depthAngleInput.value}` : 'motion';
  link.download = `${base}-${suffix}-frame.png`;
  link.href = outputCanvas.toDataURL('image/png');
  link.click();
  setStatus(`Exported ${link.download}.`, 'success');
});
