const fixButton = document.getElementById('fixButton');
const fixState = document.getElementById('fixState');
const fixStatus = document.getElementById('fixStatus');
let exposedAreaFixEnabled = false;

const movedMaskCanvas = document.createElement('canvas');
const movedMaskCtx = movedMaskCanvas.getContext('2d', { willReadFrequently: true });

function updateFixButton() {
  if (!fixButton) return;
  const ready = Boolean(loadedImage && lasso && lasso.length >= 3);
  fixButton.disabled = !ready;
  fixButton.textContent = exposedAreaFixEnabled ? 'Disable Fix' : 'Fix Exposed Area';
  fixButton.classList.toggle('is-active', exposedAreaFixEnabled);

  if (fixState) {
    fixState.textContent = exposedAreaFixEnabled ? 'On' : 'Off';
    fixState.classList.toggle('is-on', exposedAreaFixEnabled);
  }

  if (fixStatus) {
    if (!ready) {
      fixStatus.textContent = 'Select a part first. The repair only affects pixels exposed by moving that selection.';
    } else if (exposedAreaFixEnabled) {
      fixStatus.textContent = 'Preview repair is active. Rotation and translation changes update the repaired preview immediately.';
    } else {
      fixStatus.textContent = 'Off. Enable this after moving a part if its original attachment area leaves a transparent hole.';
    }
  }
}

function mostCommonNeighborColor(pixels, movedMask, width, height, x, y) {
  const counts = new Map();
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
  ];

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

    const pixelIndex = ny * width + nx;
    const p = pixelIndex * 4;
    if (pixels[p + 3] === 0) continue;

    // Do not let the newly moved lever/part seed the repair. The fill should be
    // inferred from the stationary sprite colors surrounding the old attachment area.
    if (movedMask[p + 3] > 0) continue;

    const key = `${pixels[p]},${pixels[p + 1]},${pixels[p + 2]},${pixels[p + 3]}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        count: 1,
        rgba: [pixels[p], pixels[p + 1], pixels[p + 2], pixels[p + 3]]
      });
    }
  }

  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.rgba : null;
}

function buildMovedMask() {
  const width = outputCanvas.width;
  const height = outputCanvas.height;
  movedMaskCanvas.width = width;
  movedMaskCanvas.height = height;
  movedMaskCtx.imageSmoothingEnabled = false;
  movedMaskCtx.clearRect(0, 0, width, height);

  buildMask();
  if (lasso.length < 3) return;

  const activePivot = pivot || (() => {
    const bounds = boundsFromLasso();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })();
  const angle = Number(rotationInput.value || 0) * Math.PI / 180;
  const dx = Number(translateXInput.value || 0);
  const dy = Number(translateYInput.value || 0);

  movedMaskCtx.save();
  movedMaskCtx.translate(activePivot.x + dx, activePivot.y + dy);
  movedMaskCtx.rotate(angle);
  movedMaskCtx.translate(-activePivot.x, -activePivot.y);
  movedMaskCtx.drawImage(maskCanvas, 0, 0);
  movedMaskCtx.restore();
}

function repairExposedArea() {
  if (!loadedImage || !lasso || lasso.length < 3) return;

  buildMask();
  buildMovedMask();

  const width = outputCanvas.width;
  const height = outputCanvas.height;
  const outputImage = outputCtx.getImageData(0, 0, width, height);
  const originalImage = originalCtx.getImageData(0, 0, width, height);
  const maskImage = maskCtx.getImageData(0, 0, width, height);
  const movedMaskImage = movedMaskCtx.getImageData(0, 0, width, height);
  const repaired = new Uint8ClampedArray(outputImage.data);

  // Repair only opaque source pixels that were actually removed by the transform.
  // Transparent background accidentally enclosed by a loose lasso is left alone.
  const eligible = new Uint8Array(width * height);
  for (let i = 0; i < eligible.length; i += 1) {
    const p = i * 4;
    if (
      maskImage.data[p + 3] > 0 &&
      originalImage.data[p + 3] > 0 &&
      outputImage.data[p + 3] === 0
    ) {
      eligible[i] = 1;
    }
  }

  // Grow exact existing sprite colors from the stationary boundary inward. No
  // interpolation is used, so the preview remains on the existing pixel-art palette.
  for (let pass = 0; pass < 32; pass += 1) {
    let changed = false;
    const next = new Uint8ClampedArray(repaired);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        if (!eligible[pixelIndex]) continue;

        const p = pixelIndex * 4;
        if (repaired[p + 3] !== 0) continue;

        const color = mostCommonNeighborColor(
          repaired,
          movedMaskImage.data,
          width,
          height,
          x,
          y
        );
        if (!color) continue;

        next[p] = color[0];
        next[p + 1] = color[1];
        next[p + 2] = color[2];
        next[p + 3] = color[3];
        changed = true;
      }
    }

    repaired.set(next);
    if (!changed) break;
  }

  outputImage.data.set(repaired);
  outputCtx.putImageData(outputImage, 0, 0);
}

const baseRenderOutput = renderOutput;
renderOutput = function (...args) {
  baseRenderOutput(...args);
  if (exposedAreaFixEnabled) repairExposedArea();
  updateFixButton();
};

function refreshFixedPreview() {
  baseRenderOutput();
  if (exposedAreaFixEnabled) repairExposedArea();
  updateFixButton();
}

const baseResetMotion = resetMotion;
resetMotion = function (...args) {
  exposedAreaFixEnabled = false;
  const result = baseResetMotion(...args);
  updateFixButton();
  return result;
};

fixButton.addEventListener('click', () => {
  if (!loadedImage || !lasso || lasso.length < 3) {
    updateFixButton();
    return;
  }

  exposedAreaFixEnabled = !exposedAreaFixEnabled;
  refreshFixedPreview();
});

// These listeners run after app.js has updated the normal motion preview. Applying
// the repair again here guarantees the user sees the fixed pixels live while dragging.
[
  rotationInput,
  rotationSlider,
  translateXInput,
  translateXSlider,
  translateYInput,
  translateYSlider
].forEach(control => {
  control.addEventListener('input', () => {
    if (!exposedAreaFixEnabled) return;
    requestAnimationFrame(refreshFixedPreview);
  });
});

sourceCanvas.addEventListener('pointerdown', () => {
  if (tool !== 'select' || !exposedAreaFixEnabled) return;
  exposedAreaFixEnabled = false;
  updateFixButton();
});

clearSelectionButton.addEventListener('click', () => {
  exposedAreaFixEnabled = false;
  updateFixButton();
});

updateFixButton();
