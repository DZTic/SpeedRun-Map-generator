document.addEventListener('DOMContentLoaded', () => {
  // Config
  const canvas = document.getElementById('map-canvas');
  const overlay = document.getElementById('canvas-placeholder');
  const btnGenerate = document.getElementById('btn-generate');
  const btnClear = document.getElementById('btn-clear');
  const widthInput = document.getElementById('grid-w');
  const heightInput = document.getElementById('grid-h');
  const seedInput = document.getElementById('seed-input');
  const btnRandomSeed = document.getElementById('btn-rand-seed');

  // Load params
  function getParams() {
    return {
      gridW: parseInt(widthInput.value) || 44,
      gridH: parseInt(heightInput.value) || 80,
      seed: seedInput.value || Math.random().toString(36).substring(2, 10),
      difficulty: document.querySelector('.seg-btn[data-group="diff"].active').dataset.val,
      style: document.querySelector('.seg-btn[data-group="style"].active').dataset.val,
      dash: document.getElementById('mec-dash').checked,
      slide: document.getElementById('mec-slide').checked,
      walljump: document.getElementById('mec-walljump').checked,
      trampoline: document.getElementById('mec-trampoline').checked,
      spikeDensity: parseFloat(document.getElementById('spike-density').value),
      deathzoneDensity: parseFloat(document.getElementById('dz-density').value)
    };
  }

  // Segment buttons
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const g = btn.dataset.group;
      document.querySelectorAll(`.seg-btn[data-group="${g}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Random seed
  btnRandomSeed.addEventListener('click', () => {
    seedInput.value = Math.random().toString(36).substring(2, 10);
  });

  // Clear
  btnClear.addEventListener('click', () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    overlay.style.display = 'flex';
  });

  // Generate
  btnGenerate.addEventListener('click', () => {
    const params = getParams();
    seedInput.value = params.seed; // update if empty

    overlay.style.display = 'none';

    // 1. Initialize core context
    const ctx = new MapContext(params);

    // 2. Generate Map Structure
    const pathGen = new PathGenerator(ctx);
    pathGen.generate();

    // 3. Generate Terrain & Carve Path
    const terrainGen = new TerrainGenerator(ctx);
    terrainGen.generate();

    // 4. Place Hazards & Decorate
    const decorator = new Decorator(ctx);
    decorator.generate();

    // 5. Render
    const renderer = new MapRenderer(canvas);
    renderer.render(ctx);
  });
});
