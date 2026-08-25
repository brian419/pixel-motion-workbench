const fixButton = document.getElementById('fixButton');
let exposedAreaFixEnabled = false;

function updateFixButton() {
  if (!fixButton) return;
  const ready = Boolean(loadedImage && lasso && lasso.length >= 3);
  fixButton.disabled = !ready;
  fixButton.textContent = exposedAreaFixEnabled ? 'Fix Enabled' : 'Fix Exposed Area';
  fixButton.classList.toggle('is-active', exposedAreaFixEnabled);
}

function mostCommonNeighborColor(pixels, width, height, x, y) {
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
    const index = (ny * width + nx) * 4;
    if (pixels[index + 3] === 0) continue;

    const key = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        count: 1,
        rgba: [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]
      });
    }
  }

  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.rgba : null;
}

function repairExposedArea() {
  if (!loadedImage || !lasso || lasso.length < 3) return;

  buildMask();
  const width = outputCanvas.width;
  const height = outputCanvas.height;
  const outputImage = outputCtx.getImageData(0, 0, width, height);
  const originalImage = originalCtx.getImageData(0, 0, width, height);
  const maskImage = maskCtx.getImageData(0, 0, width, height);
  const repaired = new Uint8ClampedArray(outputImage.data);

  // Only pixels that originally belonged to the selected opaque part are eligible
  // for repair. Transparent background inside a loose lasso stays transparent.
  const eligible = new Uint8Array(width * height);
  for (let i = 0; i < eligible.length; i += 1) {
    const p = i * 4;
    if (maskImage.data[p + 3] > 0 && originalImage.data[p + 3] > 0) {
      eligible[i] = 1;
    }
  }

  // Grow exact neighboring sprite colors inward. This avoids blur and keeps the
  // repaired area on the existing pixel-art palette instead of inventing averages.
  for (let pass = 0; pass < 32; pass += 1) {
    let changed = false;
    const next = new Uint8ClampedArray(repaired);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        if (!eligible[pixelIndex]) continue;

        const p = pixelIndex * 4;
        if (repaired[p + 3] !== 0) continue;

        const color = mostCommonNeighborColor(repaired, width, height, x, y);
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

const baseResetMotion = resetMotion;
resetMotion = function (...args) {
  exposedAreaFixEnabled = false;
  const result = baseResetMotion(...args);
  updateFixButton();
  return result;
};

fixButton.addEventListener('click', () => {
  if (!loadedImage || !lasso || lasso.length < 3) {
    setStatus('Select a part before using Fix Exposed Area.', 'error');
    updateFixButton();
    return;
  }

  exposedAreaFixEnabled = !exposedAreaFixEnabled;
  renderOutput();
  setStatus(
    exposedAreaFixEnabled
      ? 'Fix enabled. Exposed pixels are filled from nearby existing sprite colors.'
      : 'Fix disabled. The original transparent exposed area is shown.',
    'success'
  );
});

updateFixButton();
