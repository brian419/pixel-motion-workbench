/*
 * Depth rendering enhancements for Pixel Motion Workbench.
 *
 * This layer intentionally leaves the original rigid motion implementation intact.
 * It replaces only the depth-mode renderer at runtime, so the earlier working
 * screen-rotation behavior remains available and the previous implementation is
 * still recoverable from Git history.
 */

(function () {
  const repairCanvas = document.createElement('canvas');
  const repairCtx = repairCanvas.getContext('2d');

  function ensureRepairCanvas() {
    if (repairCanvas.width !== originalCanvas.width || repairCanvas.height !== originalCanvas.height) {
      repairCanvas.width = originalCanvas.width;
      repairCanvas.height = originalCanvas.height;
      repairCtx.imageSmoothingEnabled = false;
    }
  }

  function rotatePoint(x, y, center, radians) {
    const dx = x - center.x;
    const dy = y - center.y;
    return {
      x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians)
    };
  }

  function buildRevealedFill() {
    ensureRepairCanvas();
    repairCtx.clearRect(0, 0, repairCanvas.width, repairCanvas.height);
    repairCtx.drawImage(originalCanvas, 0, 0);

    if (lasso.length < 3) return;

    buildMask();

    const width = originalCanvas.width;
    const height = originalCanvas.height;
    const source = originalCtx.getImageData(0, 0, width, height);
    const mask = maskCtx.getImageData(0, 0, width, height);
    const repaired = new Uint8ClampedArray(source.data);

    // Remove the selected part in the repair buffer. The hole is then filled only
    // from neighboring pixels that were outside the selection, so no lever pixels
    // are copied back into the newly revealed machine surface.
    for (let i = 0; i < repaired.length; i += 4) {
      if (mask.data[i + 3] > 0) repaired[i + 3] = 0;
    }

    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];

    // Palette-aware-ish local propagation. This is deliberately deterministic and
    // conservative. It is not AI inpainting yet, but it prevents obvious empty
    // holes behind the moving part and gives us a clean baseline for later models.
    for (let pass = 0; pass < 18; pass += 1) {
      let changed = false;
      const next = new Uint8ClampedArray(repaired);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          if (mask.data[index + 3] === 0 || repaired[index + 3] !== 0) continue;

          const candidates = [];
          for (const [ox, oy] of offsets) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = (ny * width + nx) * 4;
            if (repaired[n + 3] === 0) continue;
            candidates.push({
              r: repaired[n],
              g: repaired[n + 1],
              b: repaired[n + 2],
              a: repaired[n + 3]
            });
          }

          if (!candidates.length) continue;

          // Prefer an existing neighboring pixel rather than averaging into a new
          // anti-aliased color. Pick the medoid-like candidate closest to the local
          // mean so output remains visually consistent with the source palette.
          const mean = candidates.reduce((acc, c) => ({
            r: acc.r + c.r,
            g: acc.g + c.g,
            b: acc.b + c.b
          }), { r: 0, g: 0, b: 0 });
          mean.r /= candidates.length;
          mean.g /= candidates.length;
          mean.b /= candidates.length;

          let best = candidates[0];
          let bestDistance = Infinity;
          for (const c of candidates) {
            const d = (c.r - mean.r) ** 2 + (c.g - mean.g) ** 2 + (c.b - mean.b) ** 2;
            if (d < bestDistance) {
              bestDistance = d;
              best = c;
            }
          }

          next[index] = best.r;
          next[index + 1] = best.g;
          next[index + 2] = best.b;
          next[index + 3] = best.a;
          changed = true;
        }
      }

      repaired.set(next);
      if (!changed) break;
    }

    const image = new ImageData(repaired, width, height);
    repairCtx.putImageData(image, 0, 0);
  }

  function estimateMovingTip(bounds, activePivot) {
    const image = partCtx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
    const samples = [];
    let maxDistance = 0;

    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const i = (y * bounds.width + x) * 4;
        if (image.data[i + 3] === 0) continue;

        const px = bounds.x + x + 0.5;
        const py = bounds.y + y + 0.5;
        const distance = Math.hypot(px - activePivot.x, py - activePivot.y);
        maxDistance = Math.max(maxDistance, distance);
        samples.push({
          x: px,
          y: py,
          distance,
          r: image.data[i],
          g: image.data[i + 1],
          b: image.data[i + 2],
          a: image.data[i + 3]
        });
      }
    }

    if (!samples.length || maxDistance < 1) return null;

    const tipPixels = samples.filter(pixel => pixel.distance >= maxDistance * 0.78);
    if (!tipPixels.length) return null;

    const total = tipPixels.reduce((acc, p) => {
      acc.x += p.x;
      acc.y += p.y;
      acc.r += p.r;
      acc.g += p.g;
      acc.b += p.b;
      acc.a += p.a;
      return acc;
    }, { x: 0, y: 0, r: 0, g: 0, b: 0, a: 0 });

    return {
      x: total.x / tipPixels.length,
      y: total.y / tipPixels.length,
      distance: maxDistance,
      radius: Math.max(1.5, Math.sqrt(tipPixels.length) * 0.33),
      color: {
        r: Math.round(total.r / tipPixels.length),
        g: Math.round(total.g / tipPixels.length),
        b: Math.round(total.b / tipPixels.length),
        a: Math.round(total.a / tipPixels.length)
      }
    };
  }

  function drawTipFrontFace(info, activePivot, projectedLengthFactor, perspectiveStrength, towardViewer, spinRadians) {
    if (!info || towardViewer < 0.08) return;

    const distanceY = info.y - activePivot.y;
    const normalizedDistance = Math.min(1, Math.abs(distanceY) / Math.max(1, info.distance));
    const nearScale = 1 + perspectiveStrength * 1.8 * towardViewer * Math.max(0.7, normalizedDistance);

    const projectedX = activePivot.x + (info.x - activePivot.x) * nearScale;
    const projectedY = activePivot.y + distanceY * projectedLengthFactor;
    const center = rotatePoint(projectedX, projectedY, activePivot, spinRadians);

    // The front face grows as it turns toward the viewer. It is intentionally small
    // at shallow angles and strongest near 90 degrees.
    const radiusX = Math.max(1.5, info.radius * (0.82 + towardViewer * (0.9 + perspectiveStrength * 0.8)));
    const radiusY = Math.max(1.2, info.radius * (0.72 + towardViewer * 0.42));
    const c = info.color;

    outputCtx.save();
    outputCtx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0.45, c.a / 255)})`;
    outputCtx.strokeStyle = `rgba(${Math.round(c.r * 0.38)}, ${Math.round(c.g * 0.38)}, ${Math.round(c.b * 0.38)}, 0.92)`;
    outputCtx.lineWidth = 1;
    outputCtx.beginPath();
    outputCtx.ellipse(center.x, center.y, radiusX, radiusY, spinRadians, 0, Math.PI * 2);
    outputCtx.fill();
    outputCtx.stroke();

    // Tiny highlight gives the synthesized cap a readable face without introducing
    // a large smooth gradient that would fight the pixel-art source.
    outputCtx.globalAlpha = 0.32;
    outputCtx.fillStyle = '#ffffff';
    outputCtx.beginPath();
    outputCtx.ellipse(
      center.x - radiusX * 0.28,
      center.y - radiusY * 0.26,
      Math.max(0.55, radiusX * 0.18),
      Math.max(0.45, radiusY * 0.15),
      spinRadians,
      0,
      Math.PI * 2
    );
    outputCtx.fill();
    outputCtx.restore();
  }

  function enhancedDepthFlip(activePivot) {
    const depthDegrees = Number(depthAngleInput.value || 0);
    const depthRadians = depthDegrees * Math.PI / 180;
    const spinRadians = Number(rotationInput.value || 0) * Math.PI / 180;
    const bounds = boundsFromLasso();
    if (!bounds) return;

    const cosine = Math.cos(depthRadians);
    const towardViewer = Math.max(0, Math.sin(depthRadians));
    const perspectiveStrength = Number(perspectiveInput.value || 0) / 100;

    const minimumProjectedLength = 0.16 * towardViewer;
    let projectedLengthFactor = cosine;
    if (Math.abs(projectedLengthFactor) < minimumProjectedLength) {
      projectedLengthFactor = (depthDegrees <= 90 ? 1 : -1) * minimumProjectedLength;
    }

    const topDistance = Math.abs(bounds.y - activePivot.y);
    const bottomDistance = Math.abs(bounds.y + bounds.height - activePivot.y);
    const maxDistance = Math.max(1, topDistance, bottomDistance);
    const thicknessPixels = Math.max(0, Math.round((1 + perspectiveStrength * 5) * towardViewer));
    const sideSign = spinRadians < -0.03 ? -1 : 1;
    const strips = [];

    for (let sourceY = Math.max(0, bounds.y); sourceY < Math.min(partCanvas.height, bounds.y + bounds.height + 1); sourceY += 1) {
      const distanceFromPivot = sourceY + 0.5 - activePivot.y;
      const normalizedDistance = Math.min(1, Math.abs(distanceFromPivot) / maxDistance);
      const nearScale = 1 + perspectiveStrength * 1.8 * towardViewer * normalizedDistance;

      const projectedY = activePivot.y + distanceFromPivot * projectedLengthFactor;
      const originalCenterX = bounds.x + bounds.width / 2;
      const projectedX = activePivot.x + (originalCenterX - activePivot.x) * nearScale;
      const center = rotatePoint(projectedX, projectedY, activePivot, spinRadians);

      strips.push({
        sourceY,
        normalizedDistance,
        center,
        width: Math.max(1, bounds.width * nearScale),
        height: Math.max(1, nearScale * 0.95)
      });
    }

    strips.sort((a, b) => a.normalizedDistance - b.normalizedDistance);

    outputCtx.save();
    outputCtx.imageSmoothingEnabled = false;

    for (const strip of strips) {
      // Dark offset copy acts as the newly visible side wall of the lever. The
      // offset grows toward the camera-facing end, making the volume readable.
      if (thicknessPixels > 0) {
        const sideX = sideSign * thicknessPixels * 0.72 * strip.normalizedDistance;
        const sideY = thicknessPixels * 0.24 * strip.normalizedDistance;

        outputCtx.save();
        outputCtx.translate(strip.center.x + sideX, strip.center.y + sideY);
        outputCtx.rotate(spinRadians);
        outputCtx.filter = 'brightness(0.55) saturate(0.9)';
        outputCtx.drawImage(
          partCanvas,
          bounds.x,
          strip.sourceY,
          bounds.width,
          1,
          -strip.width / 2,
          -strip.height / 2,
          strip.width,
          strip.height
        );
        outputCtx.filter = 'none';
        outputCtx.restore();
      }

      outputCtx.save();
      outputCtx.translate(strip.center.x, strip.center.y);
      outputCtx.rotate(spinRadians);
      outputCtx.drawImage(
        partCanvas,
        bounds.x,
        strip.sourceY,
        bounds.width,
        1,
        -strip.width / 2,
        -strip.height / 2,
        strip.width,
        strip.height
      );
      outputCtx.restore();
    }

    outputCtx.restore();

    drawTipFrontFace(
      estimateMovingTip(bounds, activePivot),
      activePivot,
      projectedLengthFactor,
      perspectiveStrength,
      towardViewer,
      spinRadians
    );
  }

  // Preserve the original screen-rotation path. Only depth mode receives the new
  // background repair + volume synthesis treatment.
  const originalRenderOutput = window.renderOutput;
  window.renderOutput = function renderOutputWithDepthSynthesis() {
    if (motionType.value !== 'depth' || !loadedImage || lasso.length < 3) {
      return originalRenderOutput();
    }

    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    buildPart();
    buildMask();
    buildRevealedFill();
    outputCtx.drawImage(repairCanvas, 0, 0);

    const activePivot = pivot || (() => {
      const bounds = boundsFromLasso();
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    })();

    enhancedDepthFlip(activePivot);
  };

  // Existing event handlers call the global identifier, which resolves to the
  // replaced global function in classic scripts. Re-render once if a selection is
  // already present after a hot refresh.
  if (loadedImage) window.renderOutput();
})();
