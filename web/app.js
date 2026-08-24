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
const segmentationStrengthInput = $('segmentationStrength');
const segmentationReadout = $('segmentationReadout');
const brushSizeInput = $('brushSize');
const brushReadout = $('brushReadout');
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
const roiCanvas = document.createElement('canvas');
const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });

let loadedImage = null;
let fileName = '';
let tool = 'rough';
let zoom = 1;
let pivot = null;
let selection = null;
let roiMask = null;
let includeSeeds = null;
let excludeSeeds = null;
let roughLasso = [];
let drawing = false;
let lastBrushPoint = null;
let sourcePixels = null;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function configureCanvases(width, height) {
  [sourceCanvas, outputCanvas, originalCanvas, maskCanvas, partCanvas, roiCanvas].forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });
  [sourceCtx, outputCtx, originalCtx, maskCtx, partCtx, roiCtx].forEach(ctx => {
    ctx.imageSmoothingEnabled = false;
  });
  selection = new Uint8Array(width * height);
  roiMask = new Uint8Array(width * height);
  includeSeeds = new Uint8Array(width * height);
  excludeSeeds = new Uint8Array(width * height);
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

function selectedCount() {
  if (!selection) return 0;
  let count = 0;
  for (const value of selection) count += value ? 1 : 0;
  return count;
}

function selectionBounds() {
  if (!selection) return null;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!selection[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function updateSelectionReadout() {
  const count = selectedCount();
  const bounds = selectionBounds();
  selectionReadout.textContent = bounds ? `${count} pixels · ${bounds.width} × ${bounds.height}px` : 'Not selected';
  const enabled = Boolean(pivot && count);
  [rotationInput, translateXInput, translateYInput, exportButton].forEach(el => { el.disabled = !enabled; });
}

function resetMotion() {
  pivot = null;
  roughLasso = [];
  drawing = false;
  lastBrushPoint = null;
  if (selection) selection.fill(0);
  if (roiMask) roiMask.fill(0);
  if (includeSeeds) includeSeeds.fill(0);
  if (excludeSeeds) excludeSeeds.fill(0);
  rotationInput.value = '0';
  translateXInput.value = '0';
  translateYInput.value = '0';
  pivotReadout.textContent = 'Not set';
  selectionSummary.textContent = loadedImage
    ? 'Draw one loose Rough Lasso around the complete moving part.'
    : 'No image loaded yet.';
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
    sourcePixels = originalCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
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
    setTool('rough');
    setStatus('Image loaded. Draw one loose lasso around the complete moving part.', 'success');
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

  if (tool === 'rough') {
    sourceCanvas.style.cursor = 'crosshair';
    selectionSummary.textContent = 'Draw one loose loop around the entire moving part. The algorithm will propose a unified mask.';
  } else if (tool === 'include') {
    sourceCanvas.style.cursor = 'crosshair';
    selectionSummary.textContent = 'Paint over missing part pixels. The green stroke is treated as definitely part of the object.';
  } else if (tool === 'exclude') {
    sourceCanvas.style.cursor = 'crosshair';
    selectionSummary.textContent = 'Paint over unwanted pixels. The red stroke is treated as definitely outside the moving part.';
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

function rasterizeRoughLasso() {
  if (roughLasso.length < 3) return false;
  roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
  roiCtx.fillStyle = '#fff';
  roiCtx.beginPath();
  roiCtx.moveTo(roughLasso[0].x + 0.5, roughLasso[0].y + 0.5);
  for (let i = 1; i < roughLasso.length; i += 1) {
    roiCtx.lineTo(roughLasso[i].x + 0.5, roughLasso[i].y + 0.5);
  }
  roiCtx.closePath();
  roiCtx.fill();

  const data = roiCtx.getImageData(0, 0, roiCanvas.width, roiCanvas.height).data;
  roiMask.fill(0);
  let count = 0;
  for (let i = 0; i < roiMask.length; i += 1) {
    if (data[i * 4 + 3] > 0) {
      roiMask[i] = 1;
      count += 1;
    }
  }
  return count >= 4;
}

function colorAt(index) {
  const pixel = index * 4;
  return [sourcePixels[pixel], sourcePixels[pixel + 1], sourcePixels[pixel + 2], sourcePixels[pixel + 3]];
}

function squaredColorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function collectBoundaryBackgroundSamples() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const samples = [];
  const radius = 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (roiMask[index]) continue;

      let nearRoi = false;
      for (let oy = -radius; oy <= radius && !nearRoi; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (roiMask[ny * width + nx]) {
            nearRoi = true;
            break;
          }
        }
      }

      if (nearRoi) {
        const color = colorAt(index);
        if (color[3] >= 16) samples.push(color);
      }
    }
  }

  return downsampleColors(samples, 280);
}

function collectForegroundSamples() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const explicit = [];
  const automatic = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!roiMask[index]) continue;
      const color = colorAt(index);
      if (color[3] < 16) continue;
      if (includeSeeds[index]) {
        explicit.push(color);
        continue;
      }

      let boundary = false;
      for (let oy = -2; oy <= 2 && !boundary; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !roiMask[ny * width + nx]) {
            boundary = true;
            break;
          }
        }
      }
      if (!boundary) automatic.push(color);
    }
  }

  const combined = explicit.length ? explicit.concat(downsampleColors(automatic, 180)) : automatic;
  return downsampleColors(combined, 320);
}

function collectExcludeSamples() {
  const samples = [];
  for (let i = 0; i < excludeSeeds.length; i += 1) {
    if (!excludeSeeds[i]) continue;
    const color = colorAt(i);
    if (color[3] >= 16) samples.push(color);
  }
  return downsampleColors(samples, 220);
}

function downsampleColors(colors, limit) {
  if (colors.length <= limit) return colors;
  const result = [];
  const step = colors.length / limit;
  for (let i = 0; i < limit; i += 1) result.push(colors[Math.floor(i * step)]);
  return result;
}

function nearestColorDistance(color, samples) {
  if (!samples.length) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const distance = squaredColorDistance(color, sample);
    if (distance < best) best = distance;
  }
  return best;
}

function smoothSelectionOnce(input) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const output = new Uint8Array(input);
  const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!roiMask[index] || includeSeeds[index] || excludeSeeds[index]) continue;
      let neighbors = 0;
      let selected = 0;
      for (const [ox, oy] of offsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (!roiMask[ni]) continue;
        neighbors += 1;
        selected += input[ni] ? 1 : 0;
      }
      if (neighbors >= 4) {
        if (selected >= Math.ceil(neighbors * 0.68)) output[index] = 1;
        if (selected <= Math.floor(neighbors * 0.22)) output[index] = 0;
      }
    }
  }
  return output;
}

function keepLargestSeededComponents(input) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const seen = new Uint8Array(input.length);
  const components = [];
  const offsets = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let i = 0; i < input.length; i += 1) {
    if (!input[i] || seen[i]) continue;
    const queue = [i];
    const component = [];
    let containsInclude = false;
    seen[i] = 1;

    for (let qi = 0; qi < queue.length; qi += 1) {
      const index = queue[qi];
      component.push(index);
      if (includeSeeds[index]) containsInclude = true;
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [ox, oy] of offsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (input[ni] && !seen[ni]) {
          seen[ni] = 1;
          queue.push(ni);
        }
      }
    }
    components.push({ pixels: component, containsInclude });
  }

  if (!components.length) return input;
  components.sort((a, b) => b.pixels.length - a.pixels.length);
  const output = new Uint8Array(input.length);
  const keep = components.filter((component, index) => component.containsInclude || index < 3);
  for (const component of keep) {
    for (const index of component.pixels) output[index] = 1;
  }
  for (let i = 0; i < includeSeeds.length; i += 1) {
    if (includeSeeds[i]) output[i] = 1;
    if (excludeSeeds[i]) output[i] = 0;
  }
  return output;
}

function runGuidedSegmentation() {
  if (!sourcePixels || !roiMask || !roiMask.some(Boolean)) return;

  const foregroundSamples = collectForegroundSamples();
  let backgroundSamples = collectBoundaryBackgroundSamples();
  backgroundSamples = backgroundSamples.concat(collectExcludeSamples());

  if (!foregroundSamples.length || !backgroundSamples.length) {
    selection.set(roiMask);
    for (let i = 0; i < selection.length; i += 1) {
      if (includeSeeds[i]) selection[i] = 1;
      if (excludeSeeds[i]) selection[i] = 0;
    }
    updateSelectionReadout();
    renderAll();
    return;
  }

  const strength = Number(segmentationStrengthInput.value) / 100;
  const result = new Uint8Array(selection.length);

  for (let i = 0; i < result.length; i += 1) {
    if (!roiMask[i]) continue;
    if (includeSeeds[i]) {
      result[i] = 1;
      continue;
    }
    if (excludeSeeds[i]) {
      result[i] = 0;
      continue;
    }

    const color = colorAt(i);
    if (color[3] < 16) continue;
    const fgDistance = nearestColorDistance(color, foregroundSamples);
    const bgDistance = nearestColorDistance(color, backgroundSamples);
    const bias = 0.82 + strength * 0.52;
    result[i] = fgDistance <= bgDistance * bias ? 1 : 0;
  }

  let smoothed = smoothSelectionOnce(result);
  smoothed = smoothSelectionOnce(smoothed);
  selection = keepLargestSeededComponents(smoothed);
  pivot = null;
  pivotReadout.textContent = 'Not set';
  updateSelectionReadout();
  renderAll();
}

function paintBrushPoint(point, target) {
  if (!roiMask || !roiMask.some(Boolean)) return;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const radius = Number(brushSizeInput.value);

  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox * ox + oy * oy > radius * radius) continue;
      const x = point.x + ox;
      const y = point.y + oy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = y * width + x;
      if (!roiMask[index]) continue;
      if (target === 'include') {
        includeSeeds[index] = 1;
        excludeSeeds[index] = 0;
      } else {
        excludeSeeds[index] = 1;
        includeSeeds[index] = 0;
      }
    }
  }
}

function paintBrushLine(from, to, target) {
  const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const steps = Math.ceil(distance * 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    paintBrushPoint({
      x: Math.round(from.x + (to.x - from.x) * t),
      y: Math.round(from.y + (to.y - from.y) * t)
    }, target);
  }
}

function buildMask() {
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (!selection || !selectedCount()) return;
  const image = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
  for (let i = 0; i < selection.length; i += 1) {
    if (!selection[i]) continue;
    const pixel = i * 4;
    image.data[pixel] = 255;
    image.data[pixel + 1] = 255;
    image.data[pixel + 2] = 255;
    image.data[pixel + 3] = 255;
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

  if (selectedCount()) {
    sourceCtx.save();
    sourceCtx.globalAlpha = 0.48;
    sourceCtx.drawImage(originalCanvas, 0, 0);
    sourceCtx.restore();
    sourceCtx.save();
    sourceCtx.globalAlpha = 1;
    buildPart();
    sourceCtx.drawImage(partCanvas, 0, 0);
    sourceCtx.restore();

    sourceCtx.save();
    sourceCtx.globalAlpha = 0.30;
    sourceCtx.fillStyle = '#2997ff';
    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        if (selection[y * sourceCanvas.width + x]) sourceCtx.fillRect(x, y, 1, 1);
      }
    }
    sourceCtx.restore();
  } else {
    sourceCtx.drawImage(originalCanvas, 0, 0);
  }

  if (roughLasso.length > 1) {
    sourceCtx.save();
    sourceCtx.strokeStyle = '#2997ff';
    sourceCtx.lineWidth = Math.max(1, 1 / zoom);
    sourceCtx.setLineDash([Math.max(2, 3 / zoom), Math.max(2, 2 / zoom)]);
    sourceCtx.beginPath();
    sourceCtx.moveTo(roughLasso[0].x + 0.5, roughLasso[0].y + 0.5);
    for (let i = 1; i < roughLasso.length; i += 1) sourceCtx.lineTo(roughLasso[i].x + 0.5, roughLasso[i].y + 0.5);
    if (!drawing) sourceCtx.closePath();
    sourceCtx.stroke();
    sourceCtx.restore();
  }

  if (includeSeeds) {
    sourceCtx.save();
    sourceCtx.globalAlpha = 0.78;
    for (let y = 0; y < sourceCanvas.height; y += 1) {
      for (let x = 0; x < sourceCanvas.width; x += 1) {
        const index = y * sourceCanvas.width + x;
        if (includeSeeds[index]) {
          sourceCtx.fillStyle = '#34c759';
          sourceCtx.fillRect(x, y, 1, 1);
        } else if (excludeSeeds[index]) {
          sourceCtx.fillStyle = '#ff3b30';
          sourceCtx.fillRect(x, y, 1, 1);
        }
      }
    }
    sourceCtx.restore();
  }

  if (pivot) {
    sourceCtx.save();
    sourceCtx.strokeStyle = sourceCtx.fillStyle = '#ff3b30';
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

function renderOutput() {
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  if (!loadedImage) return;
  outputCtx.drawImage(originalCanvas, 0, 0);
  if (!selection || !selectedCount()) return;

  buildPart();
  buildMask();
  outputCtx.save();
  outputCtx.globalCompositeOperation = 'destination-out';
  outputCtx.drawImage(maskCanvas, 0, 0);
  outputCtx.restore();

  const bounds = selectionBounds();
  const activePivot = pivot || { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
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
  const point = canvasPoint(event);

  if (tool === 'rough') {
    sourceCanvas.setPointerCapture(event.pointerId);
    drawing = true;
    roughLasso = [point];
    pivot = null;
    includeSeeds.fill(0);
    excludeSeeds.fill(0);
    selection.fill(0);
    renderSource();
    return;
  }

  if (tool === 'include' || tool === 'exclude') {
    if (!roiMask.some(Boolean)) {
      setStatus('Draw a Rough Lasso first.', 'error');
      return;
    }
    sourceCanvas.setPointerCapture(event.pointerId);
    drawing = true;
    lastBrushPoint = point;
    paintBrushPoint(point, tool);
    renderSource();
    return;
  }

  if (tool === 'pivot' && selectedCount()) {
    pivot = point;
    pivotReadout.textContent = `(${point.x}, ${point.y})`;
    updateSelectionReadout();
    selectionSummary.textContent = 'Pivot set. Adjust rotation or translation.';
    setStatus('Pivot set. Motion controls are ready.', 'success');
    renderAll();
  }
});

sourceCanvas.addEventListener('pointermove', event => {
  if (!drawing) return;
  const point = canvasPoint(event);

  if (tool === 'rough') {
    const last = roughLasso[roughLasso.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.5) {
      roughLasso.push(point);
      renderSource();
    }
    return;
  }

  if ((tool === 'include' || tool === 'exclude') && lastBrushPoint) {
    paintBrushLine(lastBrushPoint, point, tool);
    lastBrushPoint = point;
    renderSource();
  }
});

sourceCanvas.addEventListener('pointerup', event => {
  if (!drawing) return;
  drawing = false;
  if (sourceCanvas.hasPointerCapture(event.pointerId)) sourceCanvas.releasePointerCapture(event.pointerId);

  if (tool === 'rough') {
    if (!rasterizeRoughLasso()) {
      roughLasso = [];
      setStatus('The rough lasso was too small.', 'error');
      renderAll();
      return;
    }
    runGuidedSegmentation();
    setStatus('Proposed part mask created. Paint Include or Exclude only where it needs correction.', 'success');
    setTool('include');
    return;
  }

  if (tool === 'include' || tool === 'exclude') {
    lastBrushPoint = null;
    runGuidedSegmentation();
    setStatus(`${tool === 'include' ? 'Include' : 'Exclude'} guidance applied and mask recalculated.`, 'success');
  }
});

[sourceFrame, outputFrame].forEach(frame => {
  frame.addEventListener('dragover', event => {
    event.preventDefault();
    frame.classList.add('dragging');
  });
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
  setTool('rough');
  setStatus('Selection cleared. Draw a new Rough Lasso around a moving part.');
});

segmentationStrengthInput.addEventListener('input', () => {
  segmentationReadout.textContent = `${segmentationStrengthInput.value}. Higher values prefer stronger color separation from the pixels surrounding the rough lasso.`;
  if (roiMask && roiMask.some(Boolean)) {
    runGuidedSegmentation();
    setStatus('Segmentation strength updated.', 'success');
  }
});

brushSizeInput.addEventListener('input', () => {
  brushReadout.textContent = `${brushSizeInput.value} px. Include and Exclude strokes become hard guidance for the next mask calculation.`;
});

[rotationInput, translateXInput, translateYInput].forEach(input => {
  input.addEventListener('input', () => {
    renderOutput();
    setStatus('Candidate frame updated.', 'success');
  });
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
  if (!loadedImage || !pivot || !selectedCount()) return;
  renderOutput();
  const link = document.createElement('a');
  const base = fileName.replace(/\.[^.]+$/, '') || 'frame';
  link.download = `${base}-motion-frame.png`;
  link.href = outputCanvas.toDataURL('image/png');
  link.click();
  setStatus(`Exported ${link.download}.`, 'success');
});
