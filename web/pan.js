(() => {
  const sourceFrame = document.getElementById('sourceFrame');
  const sourceCanvas = document.getElementById('sourceCanvas');
  const moveViewButton = document.querySelector('[data-tool="pan"]');
  const selectionSummary = document.getElementById('selectionSummary');

  if (!sourceFrame || !sourceCanvas || !moveViewButton) return;

  let dragging = false;
  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  function moveViewActive() {
    return moveViewButton.classList.contains('active');
  }

  function syncCursor() {
    sourceFrame.classList.toggle('move-view-active', moveViewActive());
    if (!moveViewActive()) sourceFrame.classList.remove('is-panning');
  }

  moveViewButton.addEventListener('click', () => {
    syncCursor();
    selectionSummary.textContent = 'Drag anywhere in the Source Sprite view to move around while zoomed in. Switch back to Select Part when you are ready to lasso.';
  });

  document.querySelectorAll('.tool-button').forEach(button => {
    if (button === moveViewButton) return;
    button.addEventListener('click', syncCursor);
  });

  sourceFrame.addEventListener('pointerdown', event => {
    if (!moveViewActive()) return;

    event.preventDefault();
    dragging = true;
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startScrollLeft = sourceFrame.scrollLeft;
    startScrollTop = sourceFrame.scrollTop;
    sourceFrame.classList.add('is-panning');
    sourceFrame.setPointerCapture(event.pointerId);
  });

  sourceFrame.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId) return;

    event.preventDefault();
    sourceFrame.scrollLeft = startScrollLeft - (event.clientX - startClientX);
    sourceFrame.scrollTop = startScrollTop - (event.clientY - startClientY);
  });

  function stopPanning(event) {
    if (!dragging) return;
    if (event && pointerId !== null && event.pointerId !== pointerId) return;

    if (pointerId !== null && sourceFrame.hasPointerCapture(pointerId)) {
      sourceFrame.releasePointerCapture(pointerId);
    }
    dragging = false;
    pointerId = null;
    sourceFrame.classList.remove('is-panning');
  }

  sourceFrame.addEventListener('pointerup', stopPanning);
  sourceFrame.addEventListener('pointercancel', stopPanning);
  sourceFrame.addEventListener('lostpointercapture', () => {
    dragging = false;
    pointerId = null;
    sourceFrame.classList.remove('is-panning');
  });

  syncCursor();
})();
