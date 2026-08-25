const fixButton = document.getElementById('fixButton');
const fixState = document.getElementById('fixState');
const fixStatus = document.getElementById('fixStatus');
let exposedAreaFixEnabled = false;
let lastRepairCount = 0;

const movedPartCanvas = document.createElement('canvas');
const movedPartCtx = movedPartCanvas.getContext('2d', { willReadFrequently: true });

const SELECTED_ALPHA_THRESHOLD = 16;
const MOVED_COVERAGE_THRESHOLD = 16;
const ATTACHMENT_SEARCH_RADIUS = 5;
const COLOR_SEARCH_RADIUS = 8;

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
      fixStatus.textContent = 'Select a part first. Repair is limited to the exposed attachment area near the stationary sprite.';
    } else if (exposedAreaFixEnabled && lastRepairCount > 0) {
      fixStatus.textContent = `Preview repair is active. ${lastRepairCount} exposed attachment pixel${lastRepairCount === 1 ? '' : 's'} repaired.`;
    } else if (exposedAreaFixEnabled) {
      fixStatus.textContent = 'Preview repair is active, but no exposed attachment pixels were detected for this motion.';
    } else {
      fixStatus.textContent = 'Off. Enable this after moving a part if its original attachment point leaves a transparent hole.';
    }
  }
}

function buildMovedPartFootprint() {
  const width = outputCanvas.width;
  const height = outputCanvas.height;
  movedPartCanvas.width = width;
  movedPartCanvas.height = height;
  movedPartCtx.imageSmoothingEnabled = false;
  movedPartCtx.clearRect(0, 0, width, height);

  buildPart();
  if (lasso.length < 3) return;

  const activePivot = pivot || (() => {
    const bounds = boundsFromLasso();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })();
  const angle = Number(rotationInput.value || 0) * Math.PI / 180;
  const dx = Number(translateXInput.value || 0);
  const dy = Number(translateYInput.value || 0);

  movedPartCtx.save();
  movedPartCtx.translate(activePivot.x + dx, activePivot.y + dy);
  movedPartCtx.rotate(angle);
  movedPartCtx.translate(-activePivot.x, -activePivot.y);
  movedPartCtx.drawImage(partCanvas, 0, 0);
  movedPartCtx.restore();
}

function pixelIsStationary(originalPixels, selectedPixels, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const p = (y * width + x) * 4;
  return originalPixels[p + 3] > 0 && selectedPixels[p + 3] <= SELECTED_ALPHA_THRESHOLD;
}

function isNearStationarySprite(originalPixels, selectedPixels, width, height, x, y) {
  for (let radius = 1; radius <= ATTACHMENT_SEARCH_RADIUS; radius += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        if (pixelIsStationary(originalPixels, selectedPixels, width, height, x + ox, y + oy)) {
          return true;
        }
      }
    }
  }
  return false;
}

function bestNearbyStationaryColor(originalPixels, selectedPixels, width, height, x, y) {
  for (let radius = 1; radius <= COLOR_SEARCH_RADIUS; radius += 1) {
    const candidates = new Map();

    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!pixelIsStationary(originalPixels, selectedPixels, width, height, nx, ny)) continue;

        const p = (ny * width + nx) * 4;
        const rgba = [
          originalPixels[p],
          originalPixels[p + 1],
          originalPixels[p + 2],
          originalPixels[p + 3]
        ];
        const key = rgba.join(',');
        const entry = candidates.get(key);
        if (entry) {
          entry.count += 1;
          entry.distance += Math.hypot(ox, oy);
        } else {
          candidates.set(key, {
            rgba,
            count: 1,
            distance: Math.hypot(ox, oy)
          });
        }
      }
    }

    if (candidates.size > 0) {
      let best = null;
      for (const entry of candidates.values()) {
        if (
          !best ||
          entry.count > best.count ||
          (entry.count === best.count && entry.distance < best.distance)
        ) {
          best = entry;
        }
      }
      return best.rgba;
    }
  }
  return null;
}

function repairExposedArea() {
  if (!loadedImage || !lasso || lasso.length < 3) {
    lastRepairCount = 0;
    return 0;
  }

  buildPart();
  buildMovedPartFootprint();

  const width = outputCanvas.width;
  const height = outputCanvas.height;
  const outputImage = outputCtx.getImageData(0, 0, width, height);
  const originalImage = originalCtx.getImageData(0, 0, width, height);
  const selectedImage = partCtx.getImageData(0, 0, width, height);
  const movedImage = movedPartCtx.getImageData(0, 0, width, height);

  const outputPixels = outputImage.data;
  const originalPixels = originalImage.data;
  const selectedPixels = selectedImage.data;
  const movedPixels = movedImage.data;
  let repairedCount = 0;

  // The old implementation only repaired pixels whose output alpha was exactly 0.
  // Canvas lasso edges are anti-aliased, so visibly damaged pixels can retain partial
  // alpha and never satisfy that test. Instead, detect the old opaque part footprint
  // directly and ask whether the transformed part still covers each source pixel.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      if (selectedPixels[p + 3] <= SELECTED_ALPHA_THRESHOLD) continue;
      if (movedPixels[p + 3] > MOVED_COVERAGE_THRESHOLD) continue;

      // Do not fill the whole old lever silhouette. Only repair pixels close to the
      // stationary sprite, which isolates the attachment/hinge hole while leaving the
      // lever's former path against transparent background transparent.
      if (!isNearStationarySprite(originalPixels, selectedPixels, width, height, x, y)) continue;

      const color = bestNearbyStationaryColor(
        originalPixels,
        selectedPixels,
        width,
        height,
        x,
        y
      );
      if (!color) continue;

      outputPixels[p] = color[0];
      outputPixels[p + 1] = color[1];
      outputPixels[p + 2] = color[2];
      outputPixels[p + 3] = color[3];
      repairedCount += 1;
    }
  }

  outputCtx.putImageData(outputImage, 0, 0);
  lastRepairCount = repairedCount;
  return repairedCount;
}

const baseRenderOutput = renderOutput;
renderOutput = function (...args) {
  baseRenderOutput(...args);
  if (exposedAreaFixEnabled) repairExposedArea();
  updateFixButton();
};

function refreshFixedPreview() {
  baseRenderOutput();
  if (exposedAreaFixEnabled) {
    repairExposedArea();
  } else {
    lastRepairCount = 0;
  }
  updateFixButton();
}

const baseResetMotion = resetMotion;
resetMotion = function (...args) {
  exposedAreaFixEnabled = false;
  lastRepairCount = 0;
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

// app.js renders first. This second pass immediately reapplies attachment repair as
// the user drags a motion slider or types a value, so Motion Preview is always live.
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
  lastRepairCount = 0;
  updateFixButton();
});

clearSelectionButton.addEventListener('click', () => {
  exposedAreaFixEnabled = false;
  lastRepairCount = 0;
  updateFixButton();
});

updateFixButton();
