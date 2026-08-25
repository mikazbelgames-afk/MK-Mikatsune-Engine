import { Engine, fileToDataURL, loadImage } from './core.js';
import { Animator } from './animator.js';
import {
  saveCurrentProject,
  loadCurrentProject,
  broadcastProject
} from './bridge.js';

const q = selector => document.querySelector(selector);

const stage = q('#stage');
const engine = new Engine(stage);
const animator = new Animator(engine);

let persistTimer = null;
let splitBackup = null;
let zoomPercent = 100;
let timelinePreviewActive = false;

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[char]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentProject() {
  return engine.serialize();
}

async function persistProject({ broadcast = false } = {}) {
  try {
    const project = currentProject();

    await saveCurrentProject(project);

    if (broadcast) {
      broadcastProject(project);
    }

    return true;
  } catch (error) {
    console.error(
      'No se pudo guardar el proyecto actual:',
      error
    );

    return false;
  }
}

function queuePersist() {
  clearTimeout(persistTimer);

  persistTimer = setTimeout(() => {
    persistProject({
      broadcast: true
    });
  }, 120);
}


/* =========================================================
   CAPAS
   ========================================================= */

function renderLayers() {
  const container = q('#layers');

  container.innerHTML = '';

  const ordered =
    [...engine.layers].reverse();

  for (const layer of ordered) {
    const row =
      document.createElement('div');

    row.className =
      `layer${
        layer.id === engine.selectedId
          ? ' active'
          : ''
      }`;

    const info =
      document.createElement('div');

    info.style.minWidth = '0';
    info.style.flex = '1';

    const identity = [
      layer.role || 'generic',

      layer.group
        ? `Grupo: ${layer.group}`
        : '',

      layer.state
        ? `Estado: ${layer.state}`
        : ''
    ]
      .filter(Boolean)
      .join(' · ');

    info.innerHTML = `
      <strong>
        ${escapeHTML(layer.name || 'pieza')}
      </strong>

      <small>
        ${escapeHTML(identity)}
      </small>
    `;

    const eye =
      document.createElement('button');

    eye.type = 'button';

    eye.title =
      layer.visible
        ? 'Ocultar capa'
        : 'Mostrar capa';

    eye.setAttribute(
      'aria-label',
      eye.title
    );

    eye.textContent =
      layer.visible
        ? '👁'
        : '◉';

    eye.style.cssText = [
      'width:32px',
      'height:28px',
      'padding:0',
      'margin:0',
      'flex:0 0 auto',
      layer.visible
        ? ''
        : 'opacity:.45'
    ].join(';');

    eye.addEventListener(
      'click',
      event => {
        event.stopPropagation();

        layer.visible =
          !layer.visible;

        layer.base.visible =
          layer.visible;

        if (
          layer.id ===
          engine.selectedId
        ) {
          q('#visible').checked =
            layer.visible;
        }

        renderLayers();

        queuePersist();
      }
    );

    row.appendChild(info);
    row.appendChild(eye);

    row.addEventListener(
      'click',
      () => {
        engine.selectedId =
          layer.id;

        timelinePreviewActive =
          false;

        renderLayers();

        syncInspector();

        renderTimelineLists();
      }
    );

    container.appendChild(row);
  }
}


q('#showAllLayers')
  .addEventListener(
    'click',
    () => {
      for (
        const layer
        of engine.layers
      ) {
        layer.visible = true;
        layer.base.visible = true;
      }

      renderLayers();
      syncInspector();
      queuePersist();
    }
  );


q('#hideAllLayers')
  .addEventListener(
    'click',
    () => {
      for (
        const layer
        of engine.layers
      ) {
        layer.visible = false;
        layer.base.visible = false;
      }

      renderLayers();
      syncInspector();
      queuePersist();
    }
  );


/* =========================================================
   INSPECTOR
   ========================================================= */

const inspectorTextIds = [
  'name',
  'group',
  'state',
  'x',
  'y',
  'scale',
  'rotation',
  'pivotX',
  'pivotY'
];


function syncInspector() {
  const layer =
    engine.selected;

  if (!layer) {
    for (
      const id
      of inspectorTextIds
    ) {
      q(`#${id}`).value = '';
    }

    q('#role').value =
      'generic';

    q('#visible').checked =
      false;

    q('#organicEnabled').checked =
      false;

    q('#organicMin').value =
      2;

    q('#organicMax').value =
      3.5;

    q('#organicAmount').value =
      2;

    q('#organicDuration').value =
      0.28;

    q('#organicDouble').value =
      20;

    return;
  }

  q('#name').value =
    layer.name || '';

  q('#role').value =
    layer.role || 'generic';

  q('#group').value =
    layer.group || '';

  q('#state').value =
    layer.state || '';

  q('#visible').checked =
    layer.visible !== false;

  q('#x').value =
    layer.x;

  q('#y').value =
    layer.y;

  q('#scale').value =
    layer.scale;

  q('#rotation').value =
    layer.rotation;

  q('#pivotX').value =
    layer.pivotX;

  q('#pivotY').value =
    layer.pivotY;

  const organic =
    layer.organic || {};

  q('#organicEnabled').checked =
    Boolean(
      organic.enabled
    );

  q('#organicMin').value =
    organic.minInterval ?? 2;

  q('#organicMax').value =
    organic.maxInterval ?? 3.5;

  q('#organicAmount').value =
    organic.amount ?? 2;

  q('#organicDuration').value =
    organic.duration ?? 0.28;

  q('#organicDouble').value =
    Math.round(
      (
        organic.doubleChance ??
        0.2
      ) * 100
    );
}


function markTransformChanged() {
  const layer =
    engine.selected;

  if (!layer) {
    return;
  }

  layer.base =
    engine.snapshot(layer);

  timelinePreviewActive =
    false;

  engine.resetRuntime();

  engine.draw();

  queuePersist();
}


for (
  const key
  of [
    'x',
    'y',
    'scale',
    'rotation',
    'pivotX',
    'pivotY'
  ]
) {
  q(`#${key}`)
    .addEventListener(
      'input',
      event => {
        const layer =
          engine.selected;

        if (!layer) {
          return;
        }

        layer[key] =
          Number(
            event.target.value
          );

        markTransformChanged();
      }
    );
}


q('#name')
  .addEventListener(
    'input',
    event => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      layer.name =
        event.target.value
          .trimStart() ||
        'pieza';

      renderLayers();

      queuePersist();
    }
  );


q('#role')
  .addEventListener(
    'change',
    event => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      layer.role =
        event.target.value;

      if (
        (
          layer.role === 'earL' ||
          layer.role === 'earR'
        ) &&
        !layer.organic.enabled
      ) {
        layer.organic.enabled =
          true;

        layer.organic.minInterval =
          2;

        layer.organic.maxInterval =
          3.5;

        layer.organic.amount =
          2.2;

        layer.organic.duration =
          0.28;

        layer.organic.doubleChance =
          0.28;

        layer._organicRuntime =
          null;
      }

      renderLayers();

      syncInspector();

      queuePersist();
    }
  );


for (
  const id
  of ['group', 'state']
) {
  q(`#${id}`)
    .addEventListener(
      'input',
      event => {
        const layer =
          engine.selected;

        if (!layer) {
          return;
        }

        layer[id] =
          event.target.value;

        renderLayers();

        renderTimelineLists();

        queuePersist();
      }
    );
}


q('#visible')
  .addEventListener(
    'change',
    event => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      layer.visible =
        event.target.checked;

      layer.base.visible =
        layer.visible;

      renderLayers();

      queuePersist();
    }
  );


q('#activateState')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (
        !layer?.group?.trim() ||
        !layer.state?.trim()
      ) {
        alert(
          'Esta capa necesita Grupo y Estado. Ejemplo: Grupo “Ojos”, Estado “Cerrado”.'
        );

        return;
      }

      const group =
        layer.group.trim();

      const state =
        layer.state.trim();

      for (
        const item
        of engine.layers
      ) {
        if (
          item.group?.trim() !==
            group ||
          !item.state?.trim()
        ) {
          continue;
        }

        item.visible =
          item.state.trim() ===
          state;

        item.base.visible =
          item.visible;
      }

      animator.manualStates.set(
        group,
        state
      );

      timelinePreviewActive =
        false;

      renderLayers();

      syncInspector();

      queuePersist();
    }
  );


/* =========================================================
   MOVIMIENTO ORGÁNICO
   ========================================================= */

const organicPanel =
  q('#organicPanel');

const processHeader =
  organicPanel.querySelector(
    '.process-header'
  );


const organicClose =
  document.createElement(
    'button'
  );

organicClose.type =
  'button';

organicClose.textContent =
  '✕ Cerrar';

organicClose.style.width =
  'auto';

processHeader.appendChild(
  organicClose
);


const organicOpen =
  document.createElement(
    'button'
  );

organicOpen.id =
  'openOrganic';

organicOpen.type =
  'button';

organicOpen.textContent =
  '⚙ Movimiento orgánico';

organicOpen.style.margin =
  '12px 14px 4px';


const inspectorPanel =
  q('.inspector-panel');

inspectorPanel.insertBefore(
  organicOpen,
  q('#runtimeStatus')
);


function openOrganicPanel() {
  if (!engine.selected) {
    alert(
      'Selecciona una capa primero.'
    );

    return;
  }

  syncInspector();

  organicPanel.hidden =
    false;
}


function closeOrganicPanel() {
  organicPanel.hidden =
    true;
}


organicOpen.addEventListener(
  'click',
  openOrganicPanel
);


organicClose.addEventListener(
  'click',
  closeOrganicPanel
);


organicPanel.addEventListener(
  'click',
  event => {
    if (
      event.target ===
      organicPanel
    ) {
      closeOrganicPanel();
    }
  }
);


function updateOrganicFromUI() {
  const layer =
    engine.selected;

  if (!layer) {
    return;
  }

  let min =
    Math.max(
      0.1,
      Number(
        q('#organicMin').value
      ) || 2
    );

  let max =
    Math.max(
      0.1,
      Number(
        q('#organicMax').value
      ) || 3.5
    );

  if (max < min) {
    [min, max] =
      [max, min];
  }

  layer.organic = {
    enabled:
      q('#organicEnabled')
        .checked,

    minInterval:
      min,

    maxInterval:
      max,

    amount:
      Math.max(
        0,
        Number(
          q('#organicAmount')
            .value
        ) || 0
      ),

    duration:
      Math.max(
        0.08,
        Number(
          q('#organicDuration')
            .value
        ) || 0.28
      ),

    doubleChance:
      clamp(
        (
          Number(
            q('#organicDouble')
              .value
          ) || 0
        ) / 100,
        0,
        1
      )
  };

  layer._organicRuntime =
    null;

  queuePersist();
}


for (
  const id
  of [
    'organicEnabled',
    'organicMin',
    'organicMax',
    'organicAmount',
    'organicDuration',
    'organicDouble'
  ]
) {
  const eventName =
    id === 'organicEnabled'
      ? 'change'
      : 'input';

  q(`#${id}`)
    .addEventListener(
      eventName,
      updateOrganicFromUI
    );
}


/* =========================================================
   CARGAR PNG
   ========================================================= */

q('#add')
  .addEventListener(
    'click',
    () => {
      q('#file').click();
    }
  );


q('#file')
  .addEventListener(
    'change',
    async event => {
      const file =
        event.target
          .files?.[0];

      if (!file) {
        return;
      }

      try {
        const src =
          await fileToDataURL(
            file
          );

        const image =
          await loadImage(src);

        engine.addLayer({
          name:
            file.name.replace(
              /\.[^.]+$/,
              ''
            ),

          src,
          image
        });

        timelinePreviewActive =
          false;

        renderLayers();

        syncInspector();

        renderTimelineLists();

        engine.draw();

        await persistProject({
          broadcast: true
        });

      } catch (error) {
        console.error(error);

        alert(
          'No se pudo cargar la imagen.'
        );

      } finally {
        event.target.value =
          '';
      }
    }
  );


/* =========================================================
   GUARDAR / ABRIR PROYECTO
   ========================================================= */

q('#save')
  .addEventListener(
    'click',
    () => {
      const blob =
        new Blob(
          [
            JSON.stringify(
              currentProject(),
              null,
              2
            )
          ],
          {
            type:
              'application/json'
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          'a'
        );

      anchor.href =
        url;

      anchor.download =
        'mikatsune-project-v0.2.2.json';

      anchor.click();

      setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          );
        },
        0
      );
    }
  );


q('#load')
  .addEventListener(
    'click',
    () => {
      q('#loadFile').click();
    }
  );


q('#loadFile')
  .addEventListener(
    'change',
    async event => {
      const file =
        event.target
          .files?.[0];

      if (!file) {
        return;
      }

      try {
        const data =
          JSON.parse(
            await file.text()
          );

        animator.pause();

        animator.currentTime =
          0;

        animator.manualStates
          .clear();

        await engine.load(
          data
        );

        timelinePreviewActive =
          false;

        syncTimelineUI();

        renderLayers();

        syncInspector();

        renderTimelineLists();

        engine.draw();

        await persistProject({
          broadcast: true
        });

      } catch (error) {
        console.error(error);

        alert(
          'No se pudo abrir el proyecto. Revisa que sea un JSON válido de MK Mikatsune Engine.'
        );

      } finally {
        event.target.value =
          '';
      }
    }
  );


/* =========================================================
   ZOOM
   ========================================================= */

function clampZoom(value) {
  return clamp(
    Math.round(
      value / 5
    ) * 5,
    25,
    200
  );
}


function applyZoom(
  value,
  {
    keepCenter = true
  } = {}
) {
  const viewport =
    q('#stageViewport');

  const shell =
    q('#stageShell');

  const oldRect =
    shell.getBoundingClientRect();

  const oldWidth =
    oldRect.width ||
    engine.canvas.width;

  const oldHeight =
    oldRect.height ||
    engine.canvas.height;

  const centerX =
    viewport.scrollLeft +
    viewport.clientWidth / 2;

  const centerY =
    viewport.scrollTop +
    viewport.clientHeight / 2;

  const relX =
    oldWidth
      ? centerX / oldWidth
      : 0.5;

  const relY =
    oldHeight
      ? centerY / oldHeight
      : 0.5;

  zoomPercent =
    clampZoom(value);

  const factor =
    zoomPercent / 100;

  shell.style.width =
    `${
      engine.canvas.width *
      factor
    }px`;

  shell.style.height =
    `${
      engine.canvas.height *
      factor
    }px`;

  q('#zoomRange').value =
    zoomPercent;

  q('#zoomValue').textContent =
    `${zoomPercent}%`;

  if (keepCenter) {
    requestAnimationFrame(
      () => {
        const newWidth =
          engine.canvas.width *
          factor;

        const newHeight =
          engine.canvas.height *
          factor;

        viewport.scrollLeft =
          Math.max(
            0,
            newWidth * relX -
            viewport.clientWidth / 2
          );

        viewport.scrollTop =
          Math.max(
            0,
            newHeight * relY -
            viewport.clientHeight / 2
          );
      }
    );
  }
}


function fitStage() {
  const viewport =
    q('#stageViewport');

  const padding =
    44;

  const availableWidth =
    Math.max(
      100,
      viewport.clientWidth -
      padding
    );

  const availableHeight =
    Math.max(
      100,
      viewport.clientHeight -
      padding
    );

  const fit =
    Math.min(
      availableWidth /
        engine.canvas.width,

      availableHeight /
        engine.canvas.height
    ) * 100;

  applyZoom(
    Math.min(
      100,
      fit
    ),
    {
      keepCenter: false
    }
  );

  requestAnimationFrame(
    () => {
      viewport.scrollLeft =
        0;

      viewport.scrollTop =
        0;
    }
  );
}


q('#zoomRange')
  .addEventListener(
    'input',
    event => {
      applyZoom(
        Number(
          event.target.value
        )
      );
    }
  );


q('#zoomOut')
  .addEventListener(
    'click',
    () => {
      applyZoom(
        zoomPercent - 10
      );
    }
  );


q('#zoomIn')
  .addEventListener(
    'click',
    () => {
      applyZoom(
        zoomPercent + 10
      );
    }
  );


q('#zoomFit')
  .addEventListener(
    'click',
    fitStage
  );


q('#stageViewport')
  .addEventListener(
    'wheel',
    event => {
      if (
        !(
          event.ctrlKey ||
          event.metaKey
        )
      ) {
        return;
      }

      event.preventDefault();

      applyZoom(
        zoomPercent +
        (
          event.deltaY < 0
            ? 10
            : -10
        )
      );
    },
    {
      passive: false
    }
  );


/* =========================================================
   RUNTIME
   ========================================================= */

q('#runtime')
  .addEventListener(
    'click',
    async () => {
      const status =
        q('#runtimeStatus');

      const win =
        window.open(
          'about:blank',
          '_blank'
        );

      if (!win) {
        status.textContent =
          'El navegador bloqueó la ventana. Permite pop-ups para este sitio.';

        return;
      }

      status.textContent =
        'Preparando runtime…';

      const saved =
        await persistProject({
          broadcast: true
        });

      if (!saved) {
        status.textContent =
          'No se pudo preparar el runtime.';

        win.close();

        return;
      }

      const runtimeURL =
        new URL(
          './runtime.html',
          location.href
        );

      runtimeURL
        .searchParams
        .set(
          'source',
          'current'
        );

      win.location.href =
        runtimeURL.href;

      status.textContent =
        'Runtime abierto.';

      setTimeout(
        () =>
          broadcastProject(
            currentProject()
          ),
        400
      );

      setTimeout(
        () =>
          broadcastProject(
            currentProject()
          ),
        1100
      );
    }
  );


/* =========================================================
   TIMELINE
   ========================================================= */

function animationDuration() {
  return Math.max(
    0.5,
    Number(
      engine.animation.duration
    ) || 10
  );
}


function syncTimelineUI() {
  const duration =
    animationDuration();

  q('#timelineDuration').value =
    duration;

  q('#timelineScrub').max =
    duration;

  q('#timelineScrub').value =
    clamp(
      animator.currentTime,
      0,
      duration
    );

  q('#timelineLoop').checked =
    engine.animation.loop !==
    false;

  q('#timelineRuntime').checked =
    engine.animation
      .playOnRuntime !==
    false;

  q('#timelineTime').textContent =
    `${
      animator.currentTime
        .toFixed(2)
    } s`;

  q('#timelinePlay').textContent =
    animator.playing
      ? '⏸'
      : '▶';
}


function keyChip(
  label,
  time,
  kind = 'layer'
) {
  const button =
    document.createElement(
      'button'
    );

  const duration =
    animationDuration();

  const left =
    clamp(
      (
        time /
        duration
      ) * 100,
      0,
      100
    );

  button.type =
    'button';

  button.title =
    `${label} · ${time.toFixed(2)} s`;

  button.textContent =
    kind === 'state'
      ? '◇'
      : '◆';

  button.style.cssText = [
    'position:absolute',
    `left:calc(${left}% - 9px)`,
    'top:7px',
    'width:18px',
    'height:22px',
    'padding:0',
    'margin:0',
    'font-size:10px',
    'z-index:2',
    Math.abs(
      time -
      animator.currentTime
    ) < 0.04
      ? 'border-color:#d17cff'
      : ''
  ].join(';');

  button.addEventListener(
    'click',
    () => {
      timelinePreviewActive =
        true;

      animator.pause();

      animator.seek(time);

      syncTimelineUI();

      renderTimelineLists();
    }
  );

  return button;
}


function renderTimelineLists() {
  const layerBox =
    q('#layerKeyframeList');

  const stateBox =
    q('#stateKeyframeList');

  layerBox.innerHTML =
    '';

  stateBox.innerHTML =
    '';

  const selected =
    engine.selected;

  const layerFrames =
    selected
      ? animator
          .getLayerKeyframes(
            selected.id
          )
      : [];

  if (!layerFrames.length) {
    const empty =
      document.createElement(
        'span'
      );

    empty.textContent =
      'Sin keyframes';

    empty.style.cssText =
      'color:#766985;font-size:9px;position:absolute;left:8px;top:10px;';

    layerBox.appendChild(
      empty
    );

  } else {
    for (
      const keyframe
      of [...layerFrames]
        .sort(
          (a, b) =>
            a.time - b.time
        )
    ) {
      layerBox.appendChild(
        keyChip(
          'Keyframe',
          keyframe.time,
          'layer'
        )
      );
    }
  }

  const stateFrames =
    [
      ...animator
        .getStateKeyframes()
    ]
      .sort(
        (a, b) =>
          a.time - b.time
      );

  if (!stateFrames.length) {
    const empty =
      document.createElement(
        'span'
      );

    empty.textContent =
      'Sin estados';

    empty.style.cssText =
      'color:#766985;font-size:9px;position:absolute;left:8px;top:10px;';

    stateBox.appendChild(
      empty
    );

  } else {
    for (
      const keyframe
      of stateFrames
    ) {
      stateBox.appendChild(
        keyChip(
          `${keyframe.group}: ${keyframe.state}`,
          keyframe.time,
          'state'
        )
      );
    }
  }
}


animator.onTimeChange =
  time => {
    q('#timelineScrub').value =
      time;

    q('#timelineTime').textContent =
      `${time.toFixed(2)} s`;
  };


animator.onPlayChange =
  () => {
    syncTimelineUI();
  };


q('#timelineDuration')
  .addEventListener(
    'change',
    event => {
      animator.setDuration(
        event.target.value
      );

      syncTimelineUI();

      renderTimelineLists();

      queuePersist();
    }
  );


q('#timelineLoop')
  .addEventListener(
    'change',
    event => {
      animator.setLoop(
        event.target.checked
      );

      queuePersist();
    }
  );


q('#timelineRuntime')
  .addEventListener(
    'change',
    event => {
      engine.animation
        .playOnRuntime =
        event.target.checked;

      queuePersist();
    }
  );


q('#timelineScrub')
  .addEventListener(
    'input',
    event => {
      timelinePreviewActive =
        true;

      animator.pause();

      animator.seek(
        Number(
          event.target.value
        )
      );

      syncTimelineUI();

      renderTimelineLists();
    }
  );


q('#timelinePlay')
  .addEventListener(
    'click',
    () => {
      timelinePreviewActive =
        true;

      if (animator.playing) {
        animator.pause();

      } else {
        if (
          animator.currentTime >=
          animationDuration()
        ) {
          animator.seek(0);
        }

        animator.play();
      }

      syncTimelineUI();
    }
  );


q('#timelineStop')
  .addEventListener(
    'click',
    () => {
      animator.stop();

      timelinePreviewActive =
        false;

      engine.resetRuntime();

      engine.draw();

      syncTimelineUI();

      renderTimelineLists();
    }
  );


q('#addKeyframe')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (!layer) {
        alert(
          'Selecciona una capa primero.'
        );

        return;
      }

      animator.addLayerKeyframe(
        layer,
        animator.currentTime
      );

      timelinePreviewActive =
        true;

      animator.seek(
        animator.currentTime
      );

      renderTimelineLists();

      queuePersist();
    }
  );


q('#addStateKeyframe')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (
        !layer?.group?.trim() ||
        !layer.state?.trim()
      ) {
        alert(
          'La capa necesita Grupo y Estado. Ejemplo: Grupo “Ojos”, Estado “Cerrado”.'
        );

        return;
      }

      animator.addStateKeyframe(
        layer.group.trim(),
        layer.state.trim(),
        animator.currentTime
      );

      timelinePreviewActive =
        true;

      animator.seek(
        animator.currentTime
      );

      renderTimelineLists();

      queuePersist();
    }
  );


q('#deleteKeyframe')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      const removedLayer =
        animator
          .removeNearestLayerKeyframe(
            layer.id,
            animator.currentTime,
            0.25
          );

      let removedState =
        false;

      if (!removedLayer) {
        removedState =
          animator
            .removeNearestStateKeyframe(
              animator.currentTime,
              0.25
            );
      }

      if (
        !removedLayer &&
        !removedState
      ) {
        alert(
          'No hay un keyframe suficientemente cerca del cursor de tiempo.'
        );

        return;
      }

      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   SEPARADOR DE CAPAS
   ========================================================= */

const splitter = {
  targetId: null,

  tool: 'brush',

  painting: false,

  lastPoint: null,

  lassoPoints: [],

  sourceCanvas:
    document.createElement(
      'canvas'
    ),

  maskCanvas:
    document.createElement(
      'canvas'
    ),

  sourceCtx: null,

  maskCtx: null,

  display:
    q('#splitterCanvas'),

  displayCtx:
    q('#splitterCanvas')
      .getContext('2d'),

  preview:
    q('#splitPreview'),

  previewCtx:
    q('#splitPreview')
      .getContext('2d')
};


splitter.sourceCtx =
  splitter.sourceCanvas
    .getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


splitter.maskCtx =
  splitter.maskCanvas
    .getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


function setSplitterTool(
  tool
) {
  splitter.tool =
    tool;

  splitter.painting =
    false;

  splitter.lastPoint =
    null;

  splitter.lassoPoints =
    [];

  q('#toolBrush')
    .classList
    .toggle(
      'active',
      tool === 'brush'
    );

  q('#toolErase')
    .classList
    .toggle(
      'active',
      tool === 'erase'
    );

  q('#toolLasso')
    .classList
    .toggle(
      'active',
      tool === 'lasso'
    );

  renderSplitter();
}


function openSplitter() {
  const layer =
    engine.selected;

  if (!layer?.image) {
    alert(
      'Primero selecciona una capa con imagen.'
    );

    return;
  }

  splitter.targetId =
    layer.id;

  const width =
    layer.image
      .naturalWidth ||
    layer.image.width;

  const height =
    layer.image
      .naturalHeight ||
    layer.image.height;

  for (
    const canvas
    of [
      splitter.sourceCanvas,
      splitter.maskCanvas,
      splitter.display
    ]
  ) {
    canvas.width =
      width;

    canvas.height =
      height;
  }

  splitter.sourceCtx
    .clearRect(
      0,
      0,
      width,
      height
    );

  splitter.sourceCtx
    .drawImage(
      layer.image,
      0,
      0,
      width,
      height
    );

  splitter.maskCtx
    .clearRect(
      0,
      0,
      width,
      height
    );

  q('#splitName').value =
    `${layer.name} · parte`;

  q('#splitRole').value =
    layer.role ||
    'generic';

  q('#splitGroup').value =
    layer.group || '';

  q('#splitState').value =
    layer.state || '';

  q('#splitterSubtitle')
    .textContent =
    `Capa fuente: ${layer.name} · ${width}×${height}px`;

  q('#splitInfo')
    .textContent =
    'Pinta una zona para ver la vista previa.';

  setSplitterTool(
    'brush'
  );

  renderSplitter();

  renderSplitPreview();

  q('#splitterModal')
    .classList
    .add('open');

  q('#splitterModal')
    .setAttribute(
      'aria-hidden',
      'false'
    );
}


function closeSplitter() {
  splitter.painting =
    false;

  splitter.targetId =
    null;

  q('#splitterModal')
    .classList
    .remove('open');

  q('#splitterModal')
    .setAttribute(
      'aria-hidden',
      'true'
    );

  q('#splitterCursor').hidden =
    true;
}


function renderSplitter() {
  const context =
    splitter.displayCtx;

  const width =
    splitter.display.width;

  const height =
    splitter.display.height;

  context.clearRect(
    0,
    0,
    width,
    height
  );

  context.drawImage(
    splitter.sourceCanvas,
    0,
    0
  );

  context.save();

  context.globalAlpha =
    Number(
      q('#maskOpacity')
        .value
    ) / 100;

  context.drawImage(
    splitter.maskCanvas,
    0,
    0
  );

  context.restore();

  if (
    splitter.tool ===
      'lasso' &&
    splitter.lassoPoints
      .length > 1
  ) {
    context.save();

    context.strokeStyle =
      '#ffffff';

    context.lineWidth =
      Math.max(
        1,
        width / 900 * 2
      );

    context.setLineDash(
      [8, 6]
    );

    context.beginPath();

    context.moveTo(
      splitter
        .lassoPoints[0].x,

      splitter
        .lassoPoints[0].y
    );

    for (
      const point
      of splitter
        .lassoPoints
        .slice(1)
    ) {
      context.lineTo(
        point.x,
        point.y
      );
    }

    context.stroke();

    context.restore();
  }
}


function canvasPoint(
  event
) {
  const rect =
    splitter.display
      .getBoundingClientRect();

  return {
    x:
      (
        event.clientX -
        rect.left
      ) *
      splitter.display.width /
      rect.width,

    y:
      (
        event.clientY -
        rect.top
      ) *
      splitter.display.height /
      rect.height
  };
}


function drawBrushSegment(
  from,
  to
) {
  const context =
    splitter.maskCtx;

  const size =
    Number(
      q('#brushSize')
        .value
    );

  context.save();

  if (
    splitter.tool ===
    'erase'
  ) {
    context
      .globalCompositeOperation =
      'destination-out';

    context.strokeStyle =
      'rgba(0,0,0,1)';

    context.fillStyle =
      'rgba(0,0,0,1)';

  } else {
    context
      .globalCompositeOperation =
      'source-over';

    context.strokeStyle =
      '#ff69d4';

    context.fillStyle =
      '#ff69d4';
  }

  context.lineWidth =
    size;

  context.lineCap =
    'round';

  context.lineJoin =
    'round';

  context.beginPath();

  context.moveTo(
    from.x,
    from.y
  );

  context.lineTo(
    to.x,
    to.y
  );

  context.stroke();

  if (
    from.x === to.x &&
    from.y === to.y
  ) {
    context.beginPath();

    context.arc(
      from.x,
      from.y,
      size / 2,
      0,
      Math.PI * 2
    );

    context.fill();
  }

  context.restore();
}


function fillLasso(
  points
) {
  if (
    points.length < 3
  ) {
    return;
  }

  const context =
    splitter.maskCtx;

  context.save();

  context
    .globalCompositeOperation =
    'source-over';

  context.fillStyle =
    '#ff69d4';

  context.beginPath();

  context.moveTo(
    points[0].x,
    points[0].y
  );

  for (
    const point
    of points.slice(1)
  ) {
    context.lineTo(
      point.x,
      point.y
    );
  }

  context.closePath();

  context.fill();

  context.restore();
}


function maskBounds() {
  const width =
    splitter.maskCanvas.width;

  const height =
    splitter.maskCanvas.height;

  if (
    !width ||
    !height
  ) {
    return null;
  }

  const mask =
    splitter.maskCtx
      .getImageData(
        0,
        0,
        width,
        height
      )
      .data;

  const source =
    splitter.sourceCtx
      .getImageData(
        0,
        0,
        width,
        height
      )
      .data;

  let minX =
    width;

  let minY =
    height;

  let maxX =
    -1;

  let maxY =
    -1;

  let count =
    0;

  for (
    let y = 0;
    y < height;
    y++
  ) {
    for (
      let x = 0;
      x < width;
      x++
    ) {
      const index =
        (
          y * width +
          x
        ) * 4;

      if (
        mask[
          index + 3
        ] > 10 &&
        source[
          index + 3
        ] > 0
      ) {
        minX =
          Math.min(
            minX,
            x
          );

        minY =
          Math.min(
            minY,
            y
          );

        maxX =
          Math.max(
            maxX,
            x
          );

        maxY =
          Math.max(
            maxY,
            y
          );

        count++;
      }
    }
  }

  if (maxX < 0) {
    return null;
  }

  return {
    x:
      minX,

    y:
      minY,

    w:
      maxX -
      minX +
      1,

    h:
      maxY -
      minY +
      1,

    count
  };
}


function expandBounds(
  bounds,
  padding
) {
  const width =
    splitter.sourceCanvas.width;

  const height =
    splitter.sourceCanvas.height;

  const pad =
    clamp(
      Math.round(
        padding
      ),
      0,
      3
    );

  const x =
    Math.max(
      0,
      bounds.x -
      pad
    );

  const y =
    Math.max(
      0,
      bounds.y -
      pad
    );

  const right =
    Math.min(
      width,
      bounds.x +
      bounds.w +
      pad
    );

  const bottom =
    Math.min(
      height,
      bounds.y +
      bounds.h +
      pad
    );

  return {
    x,
    y,

    w:
      right - x,

    h:
      bottom - y,

    count:
      bounds.count
  };
}


function expandedMaskAlpha(
  mask,
  width,
  height,
  x,
  y,
  radius
) {
  let maximum =
    0;

  for (
    let yy =
      Math.max(
        0,
        y - radius
      );

    yy <=
      Math.min(
        height - 1,
        y + radius
      );

    yy++
  ) {
    for (
      let xx =
        Math.max(
          0,
          x - radius
        );

      xx <=
        Math.min(
          width - 1,
          x + radius
        );

      xx++
    ) {
      const alpha =
        mask[
          (
            yy * width +
            xx
          ) * 4 +
          3
        ];

      maximum =
        Math.max(
          maximum,
          alpha
        );

      if (
        maximum ===
        255
      ) {
        return 1;
      }
    }
  }

  return maximum / 255;
}


function extractCanvas(
  bounds,
  removeFromOriginal = false,
  cleanupPx = 0
) {
  const width =
    splitter.sourceCanvas.width;

  const height =
    splitter.sourceCanvas.height;

  const sourceData =
    splitter.sourceCtx
      .getImageData(
        0,
        0,
        width,
        height
      );

  const maskData =
    splitter.maskCtx
      .getImageData(
        0,
        0,
        width,
        height
      );

  const cleanupRadius =
    clamp(
      Math.round(
        cleanupPx
      ),
      0,
      3
    );

  const output =
    document.createElement(
      'canvas'
    );

  output.width =
    bounds.w;

  output.height =
    bounds.h;

  const outputContext =
    output.getContext(
      '2d'
    );

  const outputData =
    outputContext
      .createImageData(
        bounds.w,
        bounds.h
      );


  for (
    let yy = 0;
    yy < bounds.h;
    yy++
  ) {
    const sourceY =
      bounds.y + yy;

    for (
      let xx = 0;
      xx < bounds.w;
      xx++
    ) {
      const sourceX =
        bounds.x + xx;

      const sourceIndex =
        (
          sourceY *
          width +
          sourceX
        ) * 4;

      const outputIndex =
        (
          yy *
          bounds.w +
          xx
        ) * 4;

      const sourceAlpha =
        sourceData.data[
          sourceIndex +
          3
        ] / 255;

      if (
        sourceAlpha <=
        0
      ) {
        continue;
      }

      const maskAlpha =
        cleanupRadius > 0
          ? expandedMaskAlpha(
              maskData.data,
              width,
              height,
              sourceX,
              sourceY,
              cleanupRadius
            )
          : maskData.data[
              sourceIndex +
              3
            ] / 255;

      if (
        maskAlpha <=
        0
      ) {
        continue;
      }

      outputData.data[
        outputIndex
      ] =
        sourceData.data[
          sourceIndex
        ];

      outputData.data[
        outputIndex + 1
      ] =
        sourceData.data[
          sourceIndex + 1
        ];

      outputData.data[
        outputIndex + 2
      ] =
        sourceData.data[
          sourceIndex + 2
        ];

      outputData.data[
        outputIndex + 3
      ] =
        Math.round(
          sourceAlpha *
          maskAlpha *
          255
        );
    }
  }

  outputContext.putImageData(
    outputData,
    0,
    0
  );


  if (removeFromOriginal) {
    const radius =
      cleanupRadius;

    const x0 =
      Math.max(
        0,
        bounds.x -
        radius
      );

    const y0 =
      Math.max(
        0,
        bounds.y -
        radius
      );

    const x1 =
      Math.min(
        width - 1,
        bounds.x +
        bounds.w -
        1 +
        radius
      );

    const y1 =
      Math.min(
        height - 1,
        bounds.y +
        bounds.h -
        1 +
        radius
      );


    for (
      let y = y0;
      y <= y1;
      y++
    ) {
      for (
        let x = x0;
        x <= x1;
        x++
      ) {
        const index =
          (
            y * width +
            x
          ) * 4;

        if (
          sourceData.data[
            index + 3
          ] === 0
        ) {
          continue;
        }

        const coverage =
          radius > 0
            ? expandedMaskAlpha(
                maskData.data,
                width,
                height,
                x,
                y,
                radius
              )
            : maskData.data[
                index + 3
              ] / 255;

        if (
          coverage <=
          0
        ) {
          continue;
        }

        const originalAlpha =
          sourceData.data[
            index + 3
          ] / 255;

        const remaining =
          originalAlpha *
          (
            1 -
            Math.min(
              1,
              coverage *
              1.12
            )
          );

        sourceData.data[
          index + 3
        ] =
          remaining < 0.02
            ? 0
            : Math.round(
                remaining *
                255
              );
      }
    }

    splitter.sourceCtx
      .putImageData(
        sourceData,
        0,
        0
      );
  }

  return output;
}


function renderSplitPreview() {
  const context =
    splitter.previewCtx;

  const canvas =
    splitter.preview;

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const bounds =
    maskBounds();

  if (!bounds) {
    q('#splitInfo')
      .textContent =
      'Pinta una zona para ver la vista previa.';

    return;
  }

  const cleanup =
    Number(
      q('#edgeCleanup')
        .value
    ) || 0;

  const outputBounds =
    expandBounds(
      bounds,
      cleanup
    );

  const temp =
    extractCanvas(
      outputBounds,
      false,
      cleanup
    );

  const padding =
    18;

  const scale =
    Math.min(
      (
        canvas.width -
        padding * 2
      ) /
      outputBounds.w,

      (
        canvas.height -
        padding * 2
      ) /
      outputBounds.h
    );

  const drawWidth =
    outputBounds.w *
    scale;

  const drawHeight =
    outputBounds.h *
    scale;

  context.drawImage(
    temp,

    (
      canvas.width -
      drawWidth
    ) / 2,

    (
      canvas.height -
      drawHeight
    ) / 2,

    drawWidth,
    drawHeight
  );

  q('#splitInfo')
    .textContent =
    `Selección: ${bounds.w}×${bounds.h}px · ${bounds.count.toLocaleString()} píxeles visibles`;
}


async function extractSelectedLayer() {
  const sourceLayer =
    engine.layers.find(
      layer =>
        layer.id ===
        splitter.targetId
    );

  if (!sourceLayer) {
    alert(
      'La capa fuente ya no existe.'
    );

    closeSplitter();

    return;
  }

  const selectionBounds =
    maskBounds();

  if (!selectionBounds) {
    alert(
      'Todavía no hay una selección para extraer.'
    );

    return;
  }

  splitBackup =
    currentProject();

  q('#undoSplit').disabled =
    false;

  const originalWidth =
    sourceLayer.image.width;

  const originalHeight =
    sourceLayer.image.height;

  const remove =
    q('#removeOriginal')
      .checked;

  const cleanup =
    Number(
      q('#edgeCleanup')
        .value
    ) || 0;

  const bounds =
    expandBounds(
      selectionBounds,
      cleanup
    );

  const cropCanvas =
    extractCanvas(
      bounds,
      remove,
      cleanup
    );

  const cropSrc =
    cropCanvas.toDataURL(
      'image/png'
    );

  const cropImage =
    await loadImage(
      cropSrc
    );


  if (remove) {
    const sourceSrc =
      splitter.sourceCanvas
        .toDataURL(
          'image/png'
        );

    sourceLayer.src =
      sourceSrc;

    sourceLayer.image =
      await loadImage(
        sourceSrc
      );

    sourceLayer.base =
      engine.snapshot(
        sourceLayer
      );
  }


  const cropCenterX =
    bounds.x +
    bounds.w / 2;

  const cropCenterY =
    bounds.y +
    bounds.h / 2;

  const localOffsetX =
    cropCenterX -
    originalWidth / 2;

  const localOffsetY =
    cropCenterY -
    originalHeight / 2;


  const newLayer =
    engine.addLayer({
      name:
        q('#splitName')
          .value
          .trim() ||
        'Pieza separada',

      role:
        q('#splitRole')
          .value,

      group:
        q('#splitGroup')
          .value
          .trim(),

      state:
        q('#splitState')
          .value
          .trim(),

      src:
        cropSrc,

      image:
        cropImage,

      x:
        sourceLayer.x,

      y:
        sourceLayer.y,

      scale:
        sourceLayer.scale,

      rotation:
        sourceLayer.rotation,

      opacity:
        sourceLayer.opacity,

      pivotX:
        sourceLayer.pivotX -
        localOffsetX,

      pivotY:
        sourceLayer.pivotY -
        localOffsetY,

      visible:
        true
    });


  newLayer.base =
    engine.snapshot(
      newLayer
    );

  timelinePreviewActive =
    false;

  renderLayers();

  syncInspector();

  renderTimelineLists();

  closeSplitter();

  await persistProject({
    broadcast: true
  });
}


q('#splitLayer')
  .addEventListener(
    'click',
    openSplitter
  );


q('#splitClose')
  .addEventListener(
    'click',
    closeSplitter
  );


q('#splitCancel')
  .addEventListener(
    'click',
    closeSplitter
  );


q('#extractLayer')
  .addEventListener(
    'click',
    extractSelectedLayer
  );


q('#toolBrush')
  .addEventListener(
    'click',
    () =>
      setSplitterTool(
        'brush'
      )
  );


q('#toolErase')
  .addEventListener(
    'click',
    () =>
      setSplitterTool(
        'erase'
      )
  );


q('#toolLasso')
  .addEventListener(
    'click',
    () =>
      setSplitterTool(
        'lasso'
      )
  );


q('#clearMask')
  .addEventListener(
    'click',
    () => {
      splitter.maskCtx
        .clearRect(
          0,
          0,
          splitter
            .maskCanvas
            .width,
          splitter
            .maskCanvas
            .height
        );

      renderSplitter();

      renderSplitPreview();
    }
  );


q('#selectVisible')
  .addEventListener(
    'click',
    () => {
      const width =
        splitter
          .sourceCanvas
          .width;

      const height =
        splitter
          .sourceCanvas
          .height;

      const source =
        splitter.sourceCtx
          .getImageData(
            0,
            0,
            width,
            height
          );

      const mask =
        splitter.maskCtx
          .createImageData(
            width,
            height
          );

      for (
        let index = 0;
        index <
          source.data.length;
        index += 4
      ) {
        if (
          source.data[
            index + 3
          ] === 0
        ) {
          continue;
        }

        mask.data[index] =
          255;

        mask.data[
          index + 1
        ] =
          105;

        mask.data[
          index + 2
        ] =
          212;

        mask.data[
          index + 3
        ] =
          255;
      }

      splitter.maskCtx
        .clearRect(
          0,
          0,
          width,
          height
        );

      splitter.maskCtx
        .putImageData(
          mask,
          0,
          0
        );

      renderSplitter();

      renderSplitPreview();
    }
  );


q('#brushSize')
  .addEventListener(
    'input',
    event => {
      q('#brushSizeValue')
        .textContent =
        `${event.target.value} px`;
    }
  );


q('#maskOpacity')
  .addEventListener(
    'input',
    event => {
      q('#maskOpacityValue')
        .textContent =
        `${event.target.value}%`;

      renderSplitter();
    }
  );


q('#edgeCleanup')
  .addEventListener(
    'input',
    event => {
      q('#edgeCleanupValue')
        .textContent =
        `${event.target.value} px`;

      renderSplitPreview();
    }
  );


splitter.display
  .addEventListener(
    'pointerdown',
    event => {
      if (
        event.button !== 0
      ) {
        return;
      }

      splitter.display
        .setPointerCapture(
          event.pointerId
        );

      const point =
        canvasPoint(event);

      splitter.painting =
        true;

      splitter.lastPoint =
        point;

      if (
        splitter.tool ===
        'lasso'
      ) {
        splitter.lassoPoints =
          [point];

      } else {
        drawBrushSegment(
          point,
          point
        );

        renderSplitter();
      }
    }
  );


splitter.display
  .addEventListener(
    'pointermove',
    event => {
      const rect =
        splitter.display
          .getBoundingClientRect();

      const cursor =
        q('#splitterCursor');

      if (
        splitter.tool ===
          'brush' ||
        splitter.tool ===
          'erase'
      ) {
        const cssSize =
          Number(
            q('#brushSize')
              .value
          ) *
          rect.width /
          splitter
            .display
            .width;

        cursor.hidden =
          false;

        cursor.style.left =
          `${event.clientX}px`;

        cursor.style.top =
          `${event.clientY}px`;

        cursor.style.width =
          `${cssSize}px`;

        cursor.style.height =
          `${cssSize}px`;

      } else {
        cursor.hidden =
          true;
      }

      if (
        !splitter.painting
      ) {
        return;
      }

      const point =
        canvasPoint(event);

      if (
        splitter.tool ===
        'lasso'
      ) {
        const previous =
          splitter
            .lassoPoints
            .at(-1);

        const minStep =
          Math.max(
            2,
            splitter
              .display
              .width /
            700
          );

        if (
          !previous ||
          Math.hypot(
            point.x -
            previous.x,

            point.y -
            previous.y
          ) >=
          minStep
        ) {
          splitter
            .lassoPoints
            .push(point);
        }

      } else {
        drawBrushSegment(
          splitter.lastPoint,
          point
        );

        splitter.lastPoint =
          point;
      }

      renderSplitter();
    }
  );


function finishSplitterPointer() {
  if (
    !splitter.painting
  ) {
    return;
  }

  splitter.painting =
    false;

  if (
    splitter.tool ===
    'lasso'
  ) {
    fillLasso(
      splitter.lassoPoints
    );

    splitter.lassoPoints =
      [];
  }

  splitter.lastPoint =
    null;

  renderSplitter();

  renderSplitPreview();
}


splitter.display
  .addEventListener(
    'pointerup',
    finishSplitterPointer
  );


splitter.display
  .addEventListener(
    'pointercancel',
    finishSplitterPointer
  );


splitter.display
  .addEventListener(
    'pointerleave',
    () => {
      q('#splitterCursor')
        .hidden =
        true;
    }
  );


q('#undoSplit')
  .addEventListener(
    'click',
    async () => {
      if (!splitBackup) {
        return;
      }

      const backup =
        splitBackup;

      splitBackup =
        null;

      q('#undoSplit').disabled =
        true;

      animator.pause();

      animator.currentTime =
        0;

      animator.manualStates
        .clear();

      await engine.load(
        backup
      );

      timelinePreviewActive =
        false;

      renderLayers();

      syncInspector();

      syncTimelineUI();

      renderTimelineLists();

      engine.draw();

      await persistProject({
        broadcast: true
      });
    }
  );


/* =========================================================
   TECLADO
   ========================================================= */

document.addEventListener(
  'keydown',
  event => {
    if (
      event.key ===
      'Escape'
    ) {
      if (
        q('#splitterModal')
          .classList
          .contains('open')
      ) {
        closeSplitter();

        return;
      }

      if (
        !organicPanel.hidden
      ) {
        closeOrganicPanel();

        return;
      }
    }

    if (
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key
        .toLowerCase() ===
        'z'
    ) {
      if (
        !q('#splitterModal')
          .classList
          .contains('open') &&
        splitBackup
      ) {
        event.preventDefault();

        q('#undoSplit')
          .click();
      }
    }
  }
);


/* =========================================================
   PREVIEW
   ========================================================= */

function previewFrame(now) {
  if (!animator.playing) {
    const evaluationTime =
      timelinePreviewActive
        ? animator.currentTime
        : -1;

    animator.evaluate(
      evaluationTime,
      true,
      now
    );

    engine.draw();
  }

  requestAnimationFrame(
    previewFrame
  );
}


/* =========================================================
   RESET LEGACY
   ========================================================= */

q('#reset')
  ?.addEventListener(
    'click',
    () => {
      animator.stop();

      animator.manualStates
        .clear();

      timelinePreviewActive =
        false;

      for (
        const layer
        of engine.layers
      ) {
        Object.assign(
          layer,
          layer.base
        );

        layer.runtime = {};

        layer._organicRuntime =
          null;
      }

      syncInspector();

      syncTimelineUI();

      renderLayers();

      renderTimelineLists();

      engine.draw();

      queuePersist();
    }
  );


/* =========================================================
   ARRANQUE
   ========================================================= */

async function boot() {
  try {
    const saved =
      await loadCurrentProject();

    if (
      saved?.layers?.length
    ) {
      await engine.load(
        saved
      );
    }

  } catch (error) {
    console.warn(
      'No se pudo restaurar el proyecto actual:',
      error
    );
  }

  renderLayers();

  syncInspector();

  syncTimelineUI();

  renderTimelineLists();

  engine.draw();

  requestAnimationFrame(
    fitStage
  );

  requestAnimationFrame(
    previewFrame
  );
}


window.addEventListener(
  'resize',
  () => {
    requestAnimationFrame(
      fitStage
    );
  }
);


boot();
