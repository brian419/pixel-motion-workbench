const fixButton = document.getElementById('fixButton');
const fixState = document.getElementById('fixState');
const fixStatus = document.getElementById('fixStatus');
let exposedAreaFixEnabled = false;
let lastRepairCount = 0;

const movedPartCanvas = document.createElement('canvas');
const movedPartCtx = movedPartCanvas.getContext('2d', { willReadFrequently: true });

const ALPHA_THRESHOLD = 24;
const REPAIR_RADIUS = 6;
const PATCH_RADIUS = 2;
const SEARCH_RADIUS = 12;
const MIN_PATCH_SAMPLES = 4;

function updateFixButton() {
  if (!fixButton) return;
  const ready = Boolean(loadedImage && pivot && lasso && lasso.length >= 3);
  fixButton.disabled = !ready;
  fixButton.textContent = exposedAreaFixEnabled ? 'Disable Fix' : 'Fix Exposed Area';
  fixButton.classList.toggle('is-active', exposedAreaFixEnabled);

  if (fixState) {
    fixState.textContent = exposedAreaFixEnabled ? 'On' : 'Off';
    fixState.classList.toggle('is-on', exposedAreaFixEnabled);
  }

  if (fixStatus) {
    if (!ready) {
      fixStatus.textContent = 'Set a pivot first. Repair reconstructs only the small vacated attachment area around that pivot.';
    } else if (exposedAreaFixEnabled && lastRepairCount > 0) {
      fixStatus.textContent = `Preview repair is active. ${lastRepairCount} pivot-area pixel${lastRepairCount === 1 ? '' : 's'} reconstructed from nearby sprite patches.`;
    } else if (exposedAreaFixEnabled) {
      fixStatus.textContent = 'Preview repair is active, but this motion did not expose pixels inside the pivot repair area.';
    } else {
      fixStatus.textContent = 'Off. Enable this if moving the selected part exposes a small hole at its pivot or attachment point.';
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

function insideImage(width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function isOldSelectedPixel(selectedPixels, width, x, y) {
  const p = (y * width + x) * 4;
  return selectedPixels[p + 3] > ALPHA_THRESHOLD;
}

function isStationarySourcePixel(selectedPixels, width, x, y) {
  const p = (y * width + x) * 4;
  return selectedPixels[p + 3] <= ALPHA_THRESHOLD;
}

function hasStationaryNeighbor(selectedPixels, width, height, x, y, radius = 2) {
  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (!insideImage(width, height, nx, ny)) continue;
      if (isStationarySourcePixel(selectedPixels, width, nx, ny)) return true;
    }
  }
  return false;
}

function buildRepairMask(selectedPixels, movedPixels, width, height) {
  const target = new Uint8Array(width * height);
  if (!pivot) return target;

  const minX = Math.max(0, Math.floor(pivot.x - REPAIR_RADIUS));
  const maxX = Math.min(width - 1, Math.ceil(pivot.x + REPAIR_RADIUS));
  const minY = Math.max(0, Math.floor(pivot.y - REPAIR_RADIUS));
  const maxY = Math.min(height - 1, Math.ceil(pivot.y + REPAIR_RADIUS));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - pivot.x;
      const dy = y + 0.5 - pivot.y;
      if (Math.hypot(dx, dy) > REPAIR_RADIUS) continue;

      const pixelIndex = y * width + x;
      const p = pixelIndex * 4;
      if (!isOldSelectedPixel(selectedPixels, width, x, y)) continue;
      if (movedPixels[p + 3] > ALPHA_THRESHOLD) continue;

      if (!hasStationaryNeighbor(selectedPixels, width, height, x, y, 2)) continue;
      target[pixelIndex] = 1;
    }
  }

  return target;
}

function patchScore(
  targetX,
  targetY,
  candidateX,
  candidateY,
  workingPixels,
  originalPixels,
  selectedPixels,
  movedPixels,
  targetMask,
  unresolved,
  width,
  height
) {
  let score = 0;
  let samples = 0;

  for (let oy = -PATCH_RADIUS; oy <= PATCH_RADIUS; oy += 1) {
    for (let ox = -PATCH_RADIUS; ox <= PATCH_RADIUS; ox += 1) {
      const tx = targetX + ox;
      const ty = targetY + oy;
      const cx = candidateX + ox;
      const cy = candidateY + oy;
      if (!insideImage(width, height, tx, ty) || !insideImage(width, height, cx, cy)) continue;

      const targetIndex = ty * width + tx;
      const candidateIndex = cy * width + cx;
      const tp = targetIndex * 4;
      const cp = candidateIndex * 4;

      if (targetMask[targetIndex] && unresolved[targetIndex]) continue;
      if (movedPixels[tp + 3] > ALPHA_THRESHOLD) continue;
      if (selectedPixels[cp + 3] > ALPHA_THRESHOLD) continue;

      const ta = workingPixels[tp + 3];
      const ca = originalPixels[cp + 3];
      const alphaMismatch = Math.abs(ta - ca);
      score += alphaMismatch * alphaMismatch * 2;

      if (ta > ALPHA_THRESHOLD && ca > ALPHA_THRESHOLD) {
        const dr = workingPixels[tp] - originalPixels[cp];
        const dg = workingPixels[tp + 1] - originalPixels[cp + 1];
        const db = workingPixels[tp + 2] - originalPixels[cp + 2];
        score += dr * dr + dg * dg + db * db;
      }

      samples += 1;
    }
  }

  if (samples < MIN_PATCH_SAMPLES) return Number.POSITIVE_INFINITY;
  const distancePenalty = Math.hypot(candidateX - targetX, candidateY - targetY) * 12;
  return score / samples + distancePenalty;
}

function findBestPatchColor(
  targetX,
  targetY,
  workingPixels,
  originalPixels,
  selectedPixels,
  movedPixels,
  targetMask,
  unresolved,
  width,
  height
) {
  let bestScore = Number.POSITIVE_INFINITY;
  let bestColor = null;

  const minX = Math.max(0, targetX - SEARCH_RADIUS);
  const maxX = Math.min(width - 1, targetX + SEARCH_RADIUS);
  const minY = Math.max(0, targetY - SEARCH_RADIUS);
  const maxY = Math.min(height - 1, targetY + SEARCH_RADIUS);

  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      if (!isStationarySourcePixel(selectedPixels, width, cx, cy)) continue;

      const score = patchScore(
        targetX,
        targetY,
        cx,
        cy,
        workingPixels,
        originalPixels,
        selectedPixels,
        movedPixels,
        targetMask,
        unresolved,
        width,
        height
      );
      if (score >= bestScore) continue;

      const cp = (cy * width + cx) * 4;
      bestScore = score;
      bestColor = [
        originalPixels[cp],
        originalPixels[cp + 1],
        originalPixels[cp + 2],
        originalPixels[cp + 3]
      ];
    }
  }

  return bestColor;
}

function knownNeighborCount(targetMask, unresolved, width, height, x, y) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = x + ox;
      const ny = y + oy;
      if (!insideImage(width, height, nx, ny)) continue;
      const index = ny * width + nx;
      if (!targetMask[index] || !unresolved[index]) count += 1;
    }
  }
  return count;
}

function repairExposedArea() {
  if (!loadedImage || !pivot || !lasso || lasso.length < 3) {
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

  const workingPixels = new Uint8ClampedArray(outputImage.data);
  const originalPixels = originalImage.data;
  const selectedPixels = selectedImage.data;
  const movedPixels = movedImage.data;
  const targetMask = buildRepairMask(selectedPixels, movedPixels, width, height);
  const unresolved = new Uint8Array(targetMask);

  let remaining = unresolved.reduce((sum, value) => sum + value, 0);
  let repairedCount = 0;

  while (remaining > 0) {
    let bestTargetIndex = -1;
    let bestKnownCount = -1;

    for (let index = 0; index < unresolved.length; index += 1) {
      if (!unresolved[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      const knownCount = knownNeighborCount(targetMask, unresolved, width, height, x, y);
      if (knownCount > bestKnownCount) {
        bestKnownCount = knownCount;
        bestTargetIndex = index;
      }
    }

    if (bestTargetIndex < 0) break;
    const targetX = bestTargetIndex % width;
    const targetY = Math.floor(bestTargetIndex / width);
    const color = findBestPatchColor(
      targetX,
      targetY,
      workingPixels,
      originalPixels,
      selectedPixels,
      movedPixels,
      targetMask,
      unresolved,
      width,
      height
    );

    if (!color) {
      unresolved[bestTargetIndex] = 0;
      remaining -= 1;
      continue;
    }

    const p = bestTargetIndex * 4;
    workingPixels[p] = color[0];
    workingPixels[p + 1] = color[1];
    workingPixels[p + 2] = color[2];
    workingPixels[p + 3] = color[3];
    unresolved[bestTargetIndex] = 0;
    remaining -= 1;
    repairedCount += 1;
  }

  outputImage.data.set(workingPixels);
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

const baseResetMotion = resetMotion;
resetMotion = function (...args) {
  exposedAreaFixEnabled = false;
  lastRepairCount = 0;
  const result = baseResetMotion(...args);
  updateFixButton();
  return result;
};

fixButton.addEventListener('click', () => {
  if (!loadedImage || !pivot || !lasso || lasso.length < 3) {
    updateFixButton();
    return;
  }

  exposedAreaFixEnabled = !exposedAreaFixEnabled;
  lastRepairCount = 0;
  renderOutput();
});

sourceCanvas.addEventListener('pointerdown', () => {
  if (tool !== 'select' || !exposedAreaFixEnabled) return;
  exposedAreaFixEnabled = false;
  lastRepairCount = 0;
  updateFixButton();
});

updateFixButton();
