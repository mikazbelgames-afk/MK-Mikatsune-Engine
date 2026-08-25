import {
  Engine,
  fileToDataURL,
  loadImage
} from './core.js';

import {
  Animator
} from './animator.js';

import {
  saveCurrentProject,
  loadCurrentProject,
  broadcastProject
} from './bridge.js';


/* =========================================================
   BASE
   ========================================================= */

const q = selector =>
  document.querySelector(selector);


const stage =
  q('#stage');


const engine =
  new Engine(stage);


const animator =
  new Animator(engine);


/* =========================================================
   ESTADO DEL EDITOR
   ========================================================= */

let persistTimer =
  null;

let splitBackup =
  null;

let zoomPercent =
  100;

let timelinePreviewActive =
  false;


/*
 * design
 * animation
 */

let editorMode =
  'design';


/*
 * Selección múltiple.
 *
 * engine.selectedId continúa siendo
 * la capa activa principal.
 */

const multiSelection =
  new Set();


/*
 * Referencia exacta a algo
 * seleccionado en Timeline.
 */

let selectedAnimationRef =
  null;


/*
 * Manipulación del canvas.
 */

let canvasInteraction =
  null;


/*
 * Historial.
 */

const undoStack =
  [];

let restoringHistory =
  false;


/* =========================================================
   UTILIDADES
   ========================================================= */

function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}


function escapeHTML(
  value = ''
) {
  return String(
    value
  ).replace(
    /[&<>'"]/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]
  );
}


function clonePlain(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function currentProject() {
  return engine.serialize();
}


/* =========================================================
   GUARDADO
   ========================================================= */

async function persistProject({
  broadcast = false
} = {}) {
  try {
    const project =
      currentProject();

    await saveCurrentProject(
      project
    );

    if (broadcast) {
      broadcastProject(
        project
      );
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
  clearTimeout(
    persistTimer
  );

  persistTimer =
    setTimeout(
      () => {
        persistProject({
          broadcast: true
        });
      },
      120
    );
}


/* =========================================================
   HISTORIAL / CTRL + Z
   ========================================================= */

function pushHistory() {
  if (
    restoringHistory
  ) {
    return;
  }

  try {
    undoStack.push(
      JSON.stringify(
        currentProject()
      )
    );

    /*
     * Data URLs pesan bastante.
     * No queremos llenar memoria.
     */
    if (
      undoStack.length >
      12
    ) {
      undoStack.shift();
    }

  } catch (error) {
    console.warn(
      'No se pudo guardar historial:',
      error
    );
  }
}


async function undoLastChange() {
  if (
    !undoStack.length
  ) {
    return;
  }

  const raw =
    undoStack.pop();

  if (!raw) {
    return;
  }

  restoringHistory =
    true;

  try {
    animator.pause();

    animator.manualStates
      .clear();

    const project =
      JSON.parse(raw);

    await engine.load(
      project
    );

    animator.currentTime =
      0;

    timelinePreviewActive =
      false;

    multiSelection.clear();

    selectedAnimationRef =
      null;

    updateSelectedAnimationLabel();

    syncModeUI();

    syncTimelineUI();

    renderLayers();

    syncInspector();

    renderTimelineLists();

    engine.resetRuntime();

    engine.draw();

    drawSelectionOverlay();

    await persistProject({
      broadcast: true
    });

  } catch (error) {
    console.error(
      'No se pudo deshacer:',
      error
    );

  } finally {
    restoringHistory =
      false;
  }
}


/* =========================================================
   MODO DISEÑO / ANIMACIÓN
   ========================================================= */

function setEditorMode(
  mode
) {
  if (
    mode !== 'design' &&
    mode !== 'animation'
  ) {
    return;
  }

  animator.pause();

  editorMode =
    mode;


  if (
    editorMode ===
    'design'
  ) {
    timelinePreviewActive =
      false;

    engine.resetRuntime();

  } else {
    timelinePreviewActive =
      true;

    animator.evaluate(
      animator.currentTime,
      false
    );
  }


  syncModeUI();

  syncInspector();

  engine.draw();

  drawSelectionOverlay();
}


function syncModeUI() {
  const design =
    editorMode ===
    'design';

  q('#modeDesign')
    .classList
    .toggle(
      'active',
      design
    );

  q('#modeAnimation')
    .classList
    .toggle(
      'active',
      !design
    );


  q('#editorModeLabel')
    .textContent =
    design
      ? 'Modo Diseño · no crea animación'
      : 'Modo Animación · edita keyframes';


  const subtitle =
    q('#inspectorSubtitle');

  if (
    multiSelection.size >
    1
  ) {
    subtitle.textContent =
      `${multiSelection.size} capas seleccionadas`;

  } else {
    subtitle.textContent =
      design
        ? 'Capa seleccionada · Diseño'
        : 'Pose del tiempo actual';
  }
}


q('#modeDesign')
  .addEventListener(
    'click',
    () => {
      setEditorMode(
        'design'
      );
    }
  );


q('#modeAnimation')
  .addEventListener(
    'click',
    () => {
      setEditorMode(
        'animation'
      );
    }
  );


/* =========================================================
   POSE EFECTIVA
   ========================================================= */

function getEffectivePose(
  layer
) {
  const runtime =
    layer.runtime ||
    {};

  const useRuntime =
    editorMode ===
      'animation' ||
    timelinePreviewActive ||
    animator.playing;


  return {
    x:
      useRuntime
        ? (
            runtime.x ??
            layer.x
          )
        : layer.x,

    y:
      useRuntime
        ? (
            runtime.y ??
            layer.y
          )
        : layer.y,

    scale:
      useRuntime
        ? (
            runtime.scale ??
            layer.scale
          )
        : layer.scale,

    rotation:
      useRuntime
        ? (
            runtime.rotation ??
            layer.rotation
          )
        : layer.rotation,

    opacity:
      useRuntime
        ? (
            runtime.opacity ??
            layer.opacity
          )
        : layer.opacity,

    pivotX:
      useRuntime
        ? (
            runtime.pivotX ??
            layer.pivotX
          )
        : layer.pivotX,

    pivotY:
      useRuntime
        ? (
            runtime.pivotY ??
            layer.pivotY
          )
        : layer.pivotY,

    visible:
      useRuntime
        ? (
            runtime.visible ??
            layer.visible
          )
        : layer.visible,

    flipX:
      layer.flipX ||
      false,

    flipY:
      layer.flipY ||
      false
  };
}


/* =========================================================
   KEYFRAMES
   ========================================================= */

function getLayerFrames(
  layerId
) {
  engine.animation
    .layerKeyframes =
    engine.animation
      .layerKeyframes ||
    {};

  engine.animation
    .layerKeyframes[
      layerId
    ] =
    engine.animation
      .layerKeyframes[
        layerId
      ] ||
    [];

  return engine.animation
    .layerKeyframes[
      layerId
    ];
}


function cloneLayerFrames(
  layerId
) {
  return clonePlain(
    getLayerFrames(
      layerId
    )
  ) || [];
}


function replaceLayerFrames(
  layerId,
  frames
) {
  engine.animation
    .layerKeyframes[
      layerId
    ] =
    clonePlain(frames) ||
    [];
}


/* =========================================================
   CREAR / ACTUALIZAR KEYFRAME
   ========================================================= */

function writePoseKeyframe(
  layer,
  pose,
  time =
    animator.currentTime
) {
  const list =
    getLayerFrames(
      layer.id
    );


  let keyframe =
    list.find(
      item =>
        Math.abs(
          Number(
            item.time
          ) -
          time
        ) <
        0.015
    );


  if (!keyframe) {
    keyframe = {
      id:
        crypto.randomUUID(),

      time
    };

    list.push(
      keyframe
    );
  }


  Object.assign(
    keyframe,
    {
      x:
        pose.x,

      y:
        pose.y,

      scale:
        pose.scale,

      rotation:
        pose.rotation,

      opacity:
        pose.opacity,

      pivotX:
        pose.pivotX,

      pivotY:
        pose.pivotY,

      visible:
        pose.visible
    }
  );


  list.sort(
    (a, b) =>
      a.time -
      b.time
  );


  return keyframe;
}


/* =========================================================
   DISEÑO:
   TRANSFORMAR ANIMACIÓN EXISTENTE
   ========================================================= */

function shiftLayerFrames(
  layerId,
  dx,
  dy
) {
  const frames =
    getLayerFrames(
      layerId
    );

  for (
    const frame
    of frames
  ) {
    if (
      frame.x !==
      undefined
    ) {
      frame.x =
        Number(
          frame.x
        ) +
        dx;
    }

    if (
      frame.y !==
      undefined
    ) {
      frame.y =
        Number(
          frame.y
        ) +
        dy;
    }
  }
}


function scaleLayerFrames(
  layerId,
  factor
) {
  const frames =
    getLayerFrames(
      layerId
    );

  for (
    const frame
    of frames
  ) {
    if (
      frame.scale !==
      undefined
    ) {
      frame.scale =
        Number(
          frame.scale
        ) *
        factor;
    }
  }
}


function rotateLayerFrames(
  layerId,
  degrees
) {
  const frames =
    getLayerFrames(
      layerId
    );

  for (
    const frame
    of frames
  ) {
    if (
      frame.rotation !==
      undefined
    ) {
      frame.rotation =
        Number(
          frame.rotation
        ) +
        degrees;
    }
  }
}


/* =========================================================
   CAPAS
   ========================================================= */

function isMultiSelected(
  layerId
) {
  return multiSelection.has(
    layerId
  );
}


function clearMultiSelection() {
  multiSelection.clear();

  syncModeUI();
}


function selectSingleLayer(
  id
) {
  multiSelection.clear();

  engine.selectedId =
    id;

  timelinePreviewActive =
    editorMode ===
    'animation';

  renderLayers();

  syncInspector();

  renderTimelineLists();

  syncModeUI();

  engine.draw();

  drawSelectionOverlay();
}


function toggleMultiLayer(
  id
) {
  if (
    multiSelection.has(
      id
    )
  ) {
    multiSelection.delete(
      id
    );

  } else {
    multiSelection.add(
      id
    );
  }


  if (
    multiSelection.size
  ) {
    engine.selectedId =
      id;

  } else {
    engine.selectedId =
      null;
  }


  renderLayers();

  syncInspector();

  renderTimelineLists();

  syncModeUI();

  engine.draw();

  drawSelectionOverlay();
}


function renderLayers() {
  const container =
    q('#layers');

  container.innerHTML =
    '';


  const ordered =
    [...engine.layers]
      .reverse();


  for (
    const layer
    of ordered
  ) {
    const row =
      document.createElement(
        'div'
      );


    const classes =
      ['layer'];


    if (
      layer.id ===
      engine.selectedId
    ) {
      classes.push(
        'active'
      );
    }


    if (
      isMultiSelected(
        layer.id
      )
    ) {
      classes.push(
        'multi-selected'
      );
    }


    row.className =
      classes.join(' ');


    const info =
      document.createElement(
        'div'
      );

    info.style.minWidth =
      '0';

    info.style.flex =
      '1';


    const identity = [
      layer.role ||
        'generic',

      layer.group
        ? `Grupo: ${layer.group}`
        : '',

      layer.state
        ? `Estado: ${layer.state}`
        : '',

      layer.flipX
        ? '↔ H'
        : '',

      layer.flipY
        ? '↕ V'
        : ''
    ]
      .filter(Boolean)
      .join(' · ');


    info.innerHTML = `
      <strong>
        ${escapeHTML(
          layer.name ||
          'pieza'
        )}
      </strong>

      <small>
        ${escapeHTML(
          identity
        )}
      </small>
    `;


    const eye =
      document.createElement(
        'button'
      );

    eye.type =
      'button';

    eye.title =
      layer.visible
        ? 'Ocultar capa'
        : 'Mostrar capa';

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

        pushHistory();

        layer.visible =
          !layer.visible;

        layer.base.visible =
          layer.visible;

        if (
          layer.id ===
          engine.selectedId
        ) {
          q('#visible')
            .checked =
            layer.visible;
        }

        renderLayers();

        engine.draw();

        drawSelectionOverlay();

        queuePersist();
      }
    );


    row.appendChild(
      info
    );

    row.appendChild(
      eye
    );


    row.addEventListener(
      'click',
      event => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          toggleMultiLayer(
            layer.id
          );

        } else {
          selectSingleLayer(
            layer.id
          );
        }
      }
    );


    container.appendChild(
      row
    );
  }
}


/* =========================================================
   SELECCIONAR TODAS
   ========================================================= */

q('#selectAllLayers')
  .addEventListener(
    'click',
    () => {
      multiSelection.clear();

      for (
        const layer
        of engine.layers
      ) {
        multiSelection.add(
          layer.id
        );
      }

      engine.selectedId =
        engine.layers
          .at(-1)?.id ||
        null;

      renderLayers();

      syncInspector();

      syncModeUI();

      engine.draw();

      drawSelectionOverlay();
    }
  );


q('#clearLayerSelection')
  .addEventListener(
    'click',
    () => {
      multiSelection.clear();

      engine.selectedId =
        null;

      renderLayers();

      syncInspector();

      renderTimelineLists();

      syncModeUI();

      engine.draw();
    }
  );


/* =========================================================
   VISIBILIDAD GLOBAL
   ========================================================= */

q('#showAllLayers')
  .addEventListener(
    'click',
    () => {
      pushHistory();

      for (
        const layer
        of engine.layers
      ) {
        layer.visible =
          true;

        layer.base.visible =
          true;
      }

      renderLayers();

      syncInspector();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


q('#hideAllLayers')
  .addEventListener(
    'click',
    () => {
      pushHistory();

      for (
        const layer
        of engine.layers
      ) {
        layer.visible =
          false;

        layer.base.visible =
          false;
      }

      renderLayers();

      syncInspector();

      engine.draw();

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
      q(`#${id}`)
        .value =
        '';
    }

    q('#role').value =
      'generic';

    q('#visible').checked =
      false;

    q('#organicEnabled')
      .checked =
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


  const pose =
    getEffectivePose(
      layer
    );


  q('#name').value =
    layer.name ||
    '';

  q('#role').value =
    layer.role ||
    'generic';

  q('#group').value =
    layer.group ||
    '';

  q('#state').value =
    layer.state ||
    '';

  q('#visible').checked =
    layer.visible !==
    false;


  q('#x').value =
    Number(
      pose.x
    ).toFixed(2);

  q('#y').value =
    Number(
      pose.y
    ).toFixed(2);

  q('#scale').value =
    Number(
      pose.scale
    ).toFixed(4);

  q('#rotation').value =
    Number(
      pose.rotation
    ).toFixed(2);

  q('#pivotX').value =
    Number(
      pose.pivotX
    ).toFixed(2);

  q('#pivotY').value =
    Number(
      pose.pivotY
    ).toFixed(2);


  const organic =
    layer.organic ||
    {};


  q('#organicEnabled')
    .checked =
    Boolean(
      organic.enabled
    );

  q('#organicMin').value =
    organic.minInterval ??
    2;

  q('#organicMax').value =
    organic.maxInterval ??
    3.5;

  q('#organicAmount').value =
    organic.amount ??
    2;

  q('#organicDuration').value =
    organic.duration ??
    0.28;

  q('#organicDouble').value =
    Math.round(
      (
        organic.doubleChance ??
        0.2
      ) *
      100
    );
}


/* =========================================================
   INSPECTOR · TRANSFORMACIÓN
   ========================================================= */

function updateDesignTransform(
  layer,
  property,
  newValue
) {
  if (!layer) {
    return;
  }


  const oldValue =
    Number(
      layer[property]
    );


  if (
    property === 'x'
  ) {
    const delta =
      newValue -
      oldValue;

    layer.x =
      newValue;

    shiftLayerFrames(
      layer.id,
      delta,
      0
    );

  } else if (
    property === 'y'
  ) {
    const delta =
      newValue -
      oldValue;

    layer.y =
      newValue;

    shiftLayerFrames(
      layer.id,
      0,
      delta
    );

  } else if (
    property === 'scale'
  ) {
    const safeOld =
      Math.max(
        0.0001,
        Math.abs(
          oldValue
        )
      );

    const factor =
      newValue /
      safeOld;

    layer.scale =
      newValue;

    scaleLayerFrames(
      layer.id,
      factor
    );

    if (
      layer.breathing
    ) {
      layer.breathing.y =
        Number(
          layer.breathing.y ||
          0
        ) *
        factor;
    }

  } else if (
    property ===
    'rotation'
  ) {
    const delta =
      newValue -
      oldValue;

    layer.rotation =
      newValue;

    rotateLayerFrames(
      layer.id,
      delta
    );
  }


  layer.base =
    engine.snapshot(
      layer
    );


  timelinePreviewActive =
    false;

  engine.resetRuntime();

  engine.draw();

  drawSelectionOverlay();

  queuePersist();
}


function updateAnimationTransform(
  layer,
  property,
  newValue
) {
  if (!layer) {
    return;
  }


  animator.pause();

  timelinePreviewActive =
    true;


  animator.evaluate(
    animator.currentTime,
    false
  );


  const pose =
    getEffectivePose(
      layer
    );


  pose[property] =
    newValue;


  writePoseKeyframe(
    layer,
    pose,
    animator.currentTime
  );


  animator.seek(
    animator.currentTime
  );


  renderTimelineLists();

  engine.draw();

  drawSelectionOverlay();

  queuePersist();
}


for (
  const property
  of [
    'x',
    'y',
    'scale',
    'rotation'
  ]
) {
  const input =
    q(`#${property}`);


  input.addEventListener(
    'focus',
    () => {
      pushHistory();
    }
  );


  input.addEventListener(
    'input',
    event => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }


      let value =
        Number(
          event.target.value
        );


      if (
        property ===
        'scale'
      ) {
        value =
          Math.max(
            0.02,
            value
          );
      }


      if (
        editorMode ===
        'design'
      ) {
        updateDesignTransform(
          layer,
          property,
          value
        );

      } else {
        updateAnimationTransform(
          layer,
          property,
          value
        );
      }
    }
  );
}


/* =========================================================
   PIVOTE
   Siempre es configuración del rig.
   No genera animación.
   ========================================================= */

function changePivotKeepingVisual(
  layer,
  newPivotX,
  newPivotY
) {
  const oldPivotX =
    layer.pivotX;

  const oldPivotY =
    layer.pivotY;


  const dx =
    newPivotX -
    oldPivotX;

  const dy =
    newPivotY -
    oldPivotY;


  const scaleX =
    layer.scale *
    (
      layer.flipX
        ? -1
        : 1
    );

  const scaleY =
    layer.scale *
    (
      layer.flipY
        ? -1
        : 1
    );


  const localDX =
    dx *
    scaleX;

  const localDY =
    dy *
    scaleY;


  const angle =
    layer.rotation *
    Math.PI /
    180;


  const cos =
    Math.cos(
      angle
    );

  const sin =
    Math.sin(
      angle
    );


  layer.x +=
    localDX *
    cos -
    localDY *
    sin;

  layer.y +=
    localDX *
    sin +
    localDY *
    cos;


  layer.pivotX =
    newPivotX;

  layer.pivotY =
    newPivotY;


  /*
   * Ajustar también cada pose
   * animada.
   */

  const frames =
    getLayerFrames(
      layer.id
    );


  for (
    const frame
    of frames
  ) {
    const frameScale =
      Number(
        frame.scale ??
        layer.scale
      );


    const frameRotation =
      Number(
        frame.rotation ??
        layer.rotation
      );


    const sx =
      frameScale *
      (
        layer.flipX
          ? -1
          : 1
      );

    const sy =
      frameScale *
      (
        layer.flipY
          ? -1
          : 1
      );


    const fdx =
      dx *
      sx;

    const fdy =
      dy *
      sy;


    const a =
      frameRotation *
      Math.PI /
      180;


    const fc =
      Math.cos(a);

    const fs =
      Math.sin(a);


    if (
      frame.x !==
      undefined
    ) {
      frame.x =
        Number(
          frame.x
        ) +
        fdx *
        fc -
        fdy *
        fs;
    }


    if (
      frame.y !==
      undefined
    ) {
      frame.y =
        Number(
          frame.y
        ) +
        fdx *
        fs +
        fdy *
        fc;
    }


    frame.pivotX =
      Number(
        frame.pivotX ??
        oldPivotX
      ) +
      dx;


    frame.pivotY =
      Number(
        frame.pivotY ??
        oldPivotY
      ) +
      dy;
  }


  layer.base =
    engine.snapshot(
      layer
    );


  engine.resetRuntime();

  timelinePreviewActive =
    false;

  engine.draw();

  drawSelectionOverlay();

  queuePersist();
}


for (
  const property
  of [
    'pivotX',
    'pivotY'
  ]
) {
  q(`#${property}`)
    .addEventListener(
      'focus',
      () => {
        pushHistory();
      }
    );


  q(`#${property}`)
    .addEventListener(
      'input',
      event => {
        const layer =
          engine.selected;

        if (!layer) {
          return;
        }


        const value =
          Number(
            event.target.value
          );


        changePivotKeepingVisual(
          layer,

          property ===
          'pivotX'
            ? value
            : layer.pivotX,

          property ===
          'pivotY'
            ? value
            : layer.pivotY
        );


        syncInspector();
      }
    );
}


/* =========================================================
   METADATA
   ========================================================= */

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


      pushHistory();


      layer.role =
        event.target.value;


      if (
        (
          layer.role ===
          'earL' ||
          layer.role ===
          'earR'
        ) &&
        !layer.organic
          ?.enabled
      ) {
        layer.organic = {
          enabled:
            true,

          minInterval:
            2,

          maxInterval:
            3.5,

          amount:
            2.2,

          duration:
            0.28,

          doubleChance:
            0.28
        };
      }


      renderLayers();

      syncInspector();

      queuePersist();
    }
  );


for (
  const id
  of [
    'group',
    'state'
  ]
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

      pushHistory();

      layer.visible =
        event.target.checked;

      layer.base.visible =
        layer.visible;

      renderLayers();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


/* =========================================================
   ESTADOS
   ========================================================= */

q('#activateState')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;


      if (
        !layer?.group
          ?.trim() ||
        !layer.state
          ?.trim()
      ) {
        alert(
          'Esta capa necesita Grupo y Estado. Ejemplo: Grupo “Ojos”, Estado “Cerrado”.'
        );

        return;
      }


      pushHistory();


      const group =
        layer.group.trim();

      const state =
        layer.state.trim();


      for (
        const item
        of engine.layers
      ) {
        if (
          item.group
            ?.trim() !==
            group ||
          !item.state
            ?.trim()
        ) {
          continue;
        }

        item.visible =
          item.state
            .trim() ===
          state;

        item.base.visible =
          item.visible;
      }


      animator.manualStates
        .set(
          group,
          state
        );


      renderLayers();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


/* =========================================================
   CAPA:
   DUPLICAR / FLIP
   ========================================================= */

const layerActions =
  document.createElement(
    'section'
  );


layerActions.className =
  'inspector-section';


layerActions.innerHTML = `
  <h3>Capa</h3>

  <div
    style="
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:6px;
    "
  >

    <button
      id="duplicateLayer"
      type="button"
      style="grid-column:1 / -1;"
    >
      ⧉ Duplicar con animación
    </button>

    <button
      id="flipLayerX"
      type="button"
    >
      ↔ Voltear H
    </button>

    <button
      id="flipLayerY"
      type="button"
    >
      ↕ Voltear V
    </button>

  </div>

  <p class="hint">
    El duplicado conserva la animación,
    pero queda completamente independiente.
  </p>
`;


const inspectorPanel =
  q('.inspector-panel');


inspectorPanel.insertBefore(
  layerActions,
  q('#runtimeStatus')
);


/* =========================================================
   DUPLICAR ANIMACIÓN
   ========================================================= */

function cloneLayerAnimation(
  sourceLayer,
  targetLayer,
  offsetX = 0,
  offsetY = 0
) {
  const sourceFrames =
    cloneLayerFrames(
      sourceLayer.id
    );


  if (
    !sourceFrames.length
  ) {
    return;
  }


  const cloned =
    sourceFrames.map(
      frame => ({
        ...frame,

        id:
          crypto.randomUUID(),

        x:
          frame.x !==
          undefined
            ? Number(
                frame.x
              ) +
              offsetX
            : frame.x,

        y:
          frame.y !==
          undefined
            ? Number(
                frame.y
              ) +
              offsetY
            : frame.y
      })
    );


  replaceLayerFrames(
    targetLayer.id,
    cloned
  );
}


/* =========================================================
   DUPLICAR CAPA
   ========================================================= */

function duplicateSelectedLayer() {
  const source =
    engine.selected;


  if (!source) {
    alert(
      'Selecciona una capa primero.'
    );

    return;
  }


  pushHistory();


  const offsetX =
    24;

  const offsetY =
    24;


  const duplicate =
    engine.addLayer({
      name:
        `${source.name} copia`,

      role:
        source.role,

      group:
        source.group,

      state:
        source.state,

      src:
        source.src,

      image:
        source.image,

      x:
        source.x +
        offsetX,

      y:
        source.y +
        offsetY,

      scale:
        source.scale,

      rotation:
        source.rotation,

      opacity:
        source.opacity,

      pivotX:
        source.pivotX,

      pivotY:
        source.pivotY,

      flipX:
        source.flipX,

      flipY:
        source.flipY,

      visible:
        source.visible,

      organic:
        clonePlain(
          source.organic
        ),

      breathing:
        clonePlain(
          source.breathing
        )
    });


  cloneLayerAnimation(
    source,
    duplicate,
    offsetX,
    offsetY
  );


  duplicate.base =
    engine.snapshot(
      duplicate
    );


  animator.resetOrganic();

  multiSelection.clear();

  engine.selectedId =
    duplicate.id;

  timelinePreviewActive =
    false;

  renderLayers();

  syncInspector();

  renderTimelineLists();

  engine.resetRuntime();

  engine.draw();

  drawSelectionOverlay();

  queuePersist();
}


q('#duplicateLayer')
  .addEventListener(
    'click',
    duplicateSelectedLayer
  );


/* =========================================================
   FLIP
   ========================================================= */

q('#flipLayerX')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      pushHistory();

      layer.flipX =
        !layer.flipX;

      layer.base =
        engine.snapshot(
          layer
        );

      engine.resetRuntime();

      timelinePreviewActive =
        false;

      renderLayers();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


q('#flipLayerY')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }

      pushHistory();

      layer.flipY =
        !layer.flipY;

      layer.base =
        engine.snapshot(
          layer
        );

      engine.resetRuntime();

      timelinePreviewActive =
        false;

      renderLayers();

      engine.draw();

      drawSelectionOverlay();

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
  '8px 14px 4px';


inspectorPanel.insertBefore(
  organicOpen,
  q('#runtimeStatus')
);


function openOrganicPanel() {
  if (
    !engine.selected
  ) {
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
        q('#organicMin')
          .value
      ) ||
      2
    );


  let max =
    Math.max(
      0.1,
      Number(
        q('#organicMax')
          .value
      ) ||
      3.5
    );


  if (
    max <
    min
  ) {
    [
      min,
      max
    ] =
    [
      max,
      min
    ];
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
        ) ||
        0
      ),

    duration:
      Math.max(
        0.08,
        Number(
          q('#organicDuration')
            .value
        ) ||
        0.28
      ),

    doubleChance:
      clamp(
        (
          Number(
            q('#organicDouble')
              .value
          ) ||
          0
        ) /
        100,
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
    id ===
    'organicEnabled'
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
      q('#file')
        .click();
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
        pushHistory();


        const src =
          await fileToDataURL(
            file
          );


        const image =
          await loadImage(
            src
          );


        const layer =
          engine.addLayer({
            name:
              file.name.replace(
                /\.[^.]+$/,
                ''
              ),

            src,

            image
          });


        multiSelection.clear();

        engine.selectedId =
          layer.id;

        timelinePreviewActive =
          false;


        renderLayers();

        syncInspector();

        renderTimelineLists();

        engine.draw();

        drawSelectionOverlay();


        await persistProject({
          broadcast: true
        });

      } catch (error) {
        console.error(
          error
        );

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
   GUARDAR / ABRIR
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
        'mikatsune-project-v0.2.5.json';


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
      q('#loadFile')
        .click();
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
        pushHistory();


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


        editorMode =
          'design';

        multiSelection.clear();

        selectedAnimationRef =
          null;

        timelinePreviewActive =
          false;


        updateSelectedAnimationLabel();

        syncModeUI();

        syncTimelineUI();

        renderLayers();

        syncInspector();

        renderTimelineLists();

        engine.draw();

        drawSelectionOverlay();


        await persistProject({
          broadcast: true
        });

      } catch (error) {
        console.error(
          error
        );

        alert(
          'No se pudo abrir el proyecto.'
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

function clampZoom(
  value
) {
  return clamp(
    Math.round(
      value /
      5
    ) *
    5,
    25,
    200
  );
}


function applyZoom(
  value,
  {
    keepCenter =
      true
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
    viewport.clientWidth /
    2;


  const centerY =
    viewport.scrollTop +
    viewport.clientHeight /
    2;


  const relX =
    oldWidth
      ? centerX /
        oldWidth
      : 0.5;


  const relY =
    oldHeight
      ? centerY /
        oldHeight
      : 0.5;


  zoomPercent =
    clampZoom(
      value
    );


  const factor =
    zoomPercent /
    100;


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


  q('#zoomValue')
    .textContent =
    `${zoomPercent}%`;


  if (
    keepCenter
  ) {
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

            newWidth *
            relX -
            viewport.clientWidth /
            2
          );


        viewport.scrollTop =
          Math.max(
            0,

            newHeight *
            relY -
            viewport.clientHeight /
            2
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
    ) *
    100;


  applyZoom(
    Math.min(
      100,
      fit
    ),
    {
      keepCenter:
        false
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
        zoomPercent -
        10
      );
    }
  );


q('#zoomIn')
  .addEventListener(
    'click',
    () => {
      applyZoom(
        zoomPercent +
        10
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
          event.deltaY <
          0
            ? 10
            : -10
        )
      );
    },
    {
      passive:
        false
    }
  );


/* =========================================================
   COORDENADAS CANVAS
   ========================================================= */

function pointerToCanvas(
  event
) {
  const rect =
    stage.getBoundingClientRect();


  return {
    x:
      (
        event.clientX -
        rect.left
      ) *
      stage.width /
      rect.width,

    y:
      (
        event.clientY -
        rect.top
      ) *
      stage.height /
      rect.height
  };
}


/* =========================================================
   TRANSFORMACIONES GEOMÉTRICAS
   ========================================================= */

function imagePointToWorld(
  layer,
  imageX,
  imageY,
  pose =
    getEffectivePose(
      layer
    )
) {
  const scale =
    Number(
      pose.scale
    ) ||
    1;


  const sx =
    scale *
    (
      layer.flipX
        ? -1
        : 1
    );


  const sy =
    scale *
    (
      layer.flipY
        ? -1
        : 1
    );


  const localX =
    (
      imageX -
      pose.pivotX
    ) *
    sx;


  const localY =
    (
      imageY -
      pose.pivotY
    ) *
    sy;


  const angle =
    pose.rotation *
    Math.PI /
    180;


  const cos =
    Math.cos(
      angle
    );


  const sin =
    Math.sin(
      angle
    );


  return {
    x:
      pose.x +
      localX *
      cos -
      localY *
      sin,

    y:
      pose.y +
      localX *
      sin +
      localY *
      cos
  };
}


function worldPointToImage(
  layer,
  worldX,
  worldY,
  pose =
    getEffectivePose(
      layer
    )
) {
  const dx =
    worldX -
    pose.x;


  const dy =
    worldY -
    pose.y;


  const angle =
    pose.rotation *
    Math.PI /
    180;


  const cos =
    Math.cos(
      angle
    );


  const sin =
    Math.sin(
      angle
    );


  const rotatedX =
    cos *
    dx +
    sin *
    dy;


  const rotatedY =
    -sin *
    dx +
    cos *
    dy;


  const scale =
    Math.max(
      0.0001,

      Math.abs(
        Number(
          pose.scale
        ) ||
        1
      )
    );


  const sx =
    scale *
    (
      layer.flipX
        ? -1
        : 1
    );


  const sy =
    scale *
    (
      layer.flipY
        ? -1
        : 1
    );


  return {
    x:
      rotatedX /
      sx +
      pose.pivotX,

    y:
      rotatedY /
      sy +
      pose.pivotY
  };
}


/* =========================================================
   HIT TEST
   ========================================================= */

function pointInsideLayer(
  layer,
  x,
  y
) {
  if (
    !layer.image
  ) {
    return false;
  }


  const pose =
    getEffectivePose(
      layer
    );


  if (
    !pose.visible
  ) {
    return false;
  }


  const local =
    worldPointToImage(
      layer,
      x,
      y,
      pose
    );


  const halfW =
    layer.image.width /
    2;


  const halfH =
    layer.image.height /
    2;


  return (
    local.x >=
      -halfW &&
    local.x <=
      halfW &&
    local.y >=
      -halfH &&
    local.y <=
      halfH
  );
}


function layerAtPoint(
  x,
  y
) {
  for (
    let i =
      engine.layers.length -
      1;

    i >=
      0;

    i--
  ) {
    const layer =
      engine.layers[i];

    if (
      pointInsideLayer(
        layer,
        x,
        y
      )
    ) {
      return layer;
    }
  }

  return null;
}


/* =========================================================
   SELECCIÓN SIMPLE
   ========================================================= */

function selectionGeometry(
  layer
) {
  if (
    !layer?.image
  ) {
    return null;
  }


  const pose =
    getEffectivePose(
      layer
    );


  const halfW =
    layer.image.width /
    2;


  const halfH =
    layer.image.height /
    2;


  const topY =
    layer.flipY
      ? halfH
      : -halfH;


  const outward =
    layer.flipY
      ? 1
      : -1;


  const rotateDistance =
    48 /
    Math.max(
      0.15,
      Math.abs(
        pose.scale
      )
    );


  return {
    tl:
      imagePointToWorld(
        layer,
        -halfW,
        -halfH,
        pose
      ),

    tr:
      imagePointToWorld(
        layer,
        halfW,
        -halfH,
        pose
      ),

    br:
      imagePointToWorld(
        layer,
        halfW,
        halfH,
        pose
      ),

    bl:
      imagePointToWorld(
        layer,
        -halfW,
        halfH,
        pose
      ),

    topCenter:
      imagePointToWorld(
        layer,
        0,
        topY,
        pose
      ),

    rotate:
      imagePointToWorld(
        layer,
        0,
        topY +
        outward *
        rotateDistance,
        pose
      ),

    pivot: {
      x:
        pose.x,

      y:
        pose.y
    }
  };
}


/* =========================================================
   BOUNDS MULTISELECCIÓN
   ========================================================= */

function selectedMultiLayers() {
  return engine.layers.filter(
    layer =>
      multiSelection.has(
        layer.id
      )
  );
}


function multiBounds() {
  const layers =
    selectedMultiLayers();


  if (
    layers.length <
    2
  ) {
    return null;
  }


  let minX =
    Infinity;

  let minY =
    Infinity;

  let maxX =
    -Infinity;

  let maxY =
    -Infinity;


  for (
    const layer
    of layers
  ) {
    const geometry =
      selectionGeometry(
        layer
      );

    if (!geometry) {
      continue;
    }


    for (
      const point
      of [
        geometry.tl,
        geometry.tr,
        geometry.br,
        geometry.bl
      ]
    ) {
      minX =
        Math.min(
          minX,
          point.x
        );

      minY =
        Math.min(
          minY,
          point.y
        );

      maxX =
        Math.max(
          maxX,
          point.x
        );

      maxY =
        Math.max(
          maxY,
          point.y
        );
    }
  }


  if (
    !Number.isFinite(
      minX
    )
  ) {
    return null;
  }


  const center = {
    x:
      (
        minX +
        maxX
      ) /
      2,

    y:
      (
        minY +
        maxY
      ) /
      2
  };


  return {
    minX,
    minY,
    maxX,
    maxY,
    center,

    tl: {
      x:
        minX,

      y:
        minY
    },

    tr: {
      x:
        maxX,

      y:
        minY
    },

    br: {
      x:
        maxX,

      y:
        maxY
    },

    bl: {
      x:
        minX,

      y:
        maxY
    },

    topCenter: {
      x:
        center.x,

      y:
        minY
    },

    rotate: {
      x:
        center.x,

      y:
        minY -
        55
    }
  };
}


/* =========================================================
   HANDLES
   ========================================================= */

function handleRadiusCanvas() {
  return (
    9 *
    100 /
    Math.max(
      25,
      zoomPercent
    )
  );
}


function distance(
  a,
  b
) {
  return Math.hypot(
    a.x -
    b.x,

    a.y -
    b.y
  );
}


function selectedHandleAtPoint(
  point
) {
  const radius =
    handleRadiusCanvas() *
    1.6;


  /*
   * Multiselección.
   */

  if (
    multiSelection.size >
    1
  ) {
    const bounds =
      multiBounds();

    if (!bounds) {
      return null;
    }


    if (
      distance(
        point,
        bounds.rotate
      ) <=
      radius *
      1.2
    ) {
      return {
        type:
          'multi-rotate',

        bounds
      };
    }


    for (
      const name
      of [
        'tl',
        'tr',
        'br',
        'bl'
      ]
    ) {
      if (
        distance(
          point,
          bounds[name]
        ) <=
        radius
      ) {
        return {
          type:
            'multi-scale',

          corner:
            name,

          bounds
        };
      }
    }


    if (
      point.x >=
        bounds.minX &&
      point.x <=
        bounds.maxX &&
      point.y >=
        bounds.minY &&
      point.y <=
        bounds.maxY
    ) {
      return {
        type:
          'multi-move',

        bounds
      };
    }


    return null;
  }


  /*
   * Selección simple.
   */

  const layer =
    engine.selected;


  if (
    !layer ||
    !layer.image
  ) {
    return null;
  }


  const geometry =
    selectionGeometry(
      layer
    );


  if (!geometry) {
    return null;
  }


  if (
    distance(
      point,
      geometry.pivot
    ) <=
    radius
  ) {
    return {
      type:
        'pivot',

      geometry
    };
  }


  if (
    distance(
      point,
      geometry.rotate
    ) <=
    radius *
    1.2
  ) {
    return {
      type:
        'rotate',

      geometry
    };
  }


  for (
    const name
    of [
      'tl',
      'tr',
      'br',
      'bl'
    ]
  ) {
    if (
      distance(
        point,
        geometry[name]
      ) <=
      radius
    ) {
      return {
        type:
          'scale',

        corner:
          name,

        geometry
      };
    }
  }


  return null;
}


/* =========================================================
   DIBUJAR OVERLAY
   ========================================================= */

function drawSquareHandle(
  ctx,
  point,
  radius
) {
  ctx.beginPath();

  ctx.rect(
    point.x -
    radius,

    point.y -
    radius,

    radius *
    2,

    radius *
    2
  );

  ctx.fill();

  ctx.stroke();
}


function drawSelectionOverlay() {
  const ctx =
    stage.getContext(
      '2d'
    );


  const radius =
    handleRadiusCanvas();


  const lineWidth =
    Math.max(
      1,

      1.5 *
      100 /
      Math.max(
        25,
        zoomPercent
      )
    );


  /*
   * MULTI
   */

  if (
    multiSelection.size >
    1
  ) {
    const bounds =
      multiBounds();

    if (!bounds) {
      return;
    }


    ctx.save();

    ctx.lineWidth =
      lineWidth;

    ctx.strokeStyle =
      'rgba(255,121,201,.95)';

    ctx.fillStyle =
      '#fff7fc';


    ctx.setLineDash(
      [
        8,
        5
      ]
    );


    ctx.strokeRect(
      bounds.minX,
      bounds.minY,

      bounds.maxX -
      bounds.minX,

      bounds.maxY -
      bounds.minY
    );


    ctx.setLineDash(
      []
    );


    ctx.beginPath();

    ctx.moveTo(
      bounds.topCenter.x,
      bounds.topCenter.y
    );

    ctx.lineTo(
      bounds.rotate.x,
      bounds.rotate.y
    );

    ctx.stroke();


    for (
      const point
      of [
        bounds.tl,
        bounds.tr,
        bounds.br,
        bounds.bl
      ]
    ) {
      drawSquareHandle(
        ctx,
        point,
        radius
      );
    }


    ctx.beginPath();

    ctx.arc(
      bounds.rotate.x,
      bounds.rotate.y,
      radius *
      1.1,
      0,
      Math.PI *
      2
    );

    ctx.fill();

    ctx.stroke();

    ctx.restore();

    return;
  }


  /*
   * SIMPLE
   */

  const layer =
    engine.selected;


  if (
    !layer ||
    !layer.image
  ) {
    return;
  }


  const pose =
    getEffectivePose(
      layer
    );


  if (
    !pose.visible
  ) {
    return;
  }


  const geometry =
    selectionGeometry(
      layer
    );


  if (!geometry) {
    return;
  }


  ctx.save();


  ctx.lineWidth =
    lineWidth;


  ctx.strokeStyle =
    editorMode ===
    'animation'
      ? 'rgba(255,121,201,.95)'
      : 'rgba(209,124,255,.95)';


  ctx.fillStyle =
    '#fff7fc';


  ctx.beginPath();

  ctx.moveTo(
    geometry.tl.x,
    geometry.tl.y
  );

  ctx.lineTo(
    geometry.tr.x,
    geometry.tr.y
  );

  ctx.lineTo(
    geometry.br.x,
    geometry.br.y
  );

  ctx.lineTo(
    geometry.bl.x,
    geometry.bl.y
  );

  ctx.closePath();

  ctx.stroke();


  ctx.beginPath();

  ctx.moveTo(
    geometry.topCenter.x,
    geometry.topCenter.y
  );

  ctx.lineTo(
    geometry.rotate.x,
    geometry.rotate.y
  );

  ctx.stroke();


  for (
    const point
    of [
      geometry.tl,
      geometry.tr,
      geometry.br,
      geometry.bl
    ]
  ) {
    drawSquareHandle(
      ctx,
      point,
      radius
    );
  }


  ctx.beginPath();

  ctx.arc(
    geometry.rotate.x,
    geometry.rotate.y,
    radius *
    1.05,
    0,
    Math.PI *
    2
  );

  ctx.fill();

  ctx.stroke();


  /*
   * Pivote.
   */

  ctx.strokeStyle =
    'rgba(255,111,207,.95)';


  ctx.beginPath();

  ctx.arc(
    geometry.pivot.x,
    geometry.pivot.y,
    radius *
    1.15,
    0,
    Math.PI *
    2
  );

  ctx.stroke();


  ctx.beginPath();

  ctx.moveTo(
    geometry.pivot.x -
    radius *
    1.7,
    geometry.pivot.y
  );

  ctx.lineTo(
    geometry.pivot.x +
    radius *
    1.7,
    geometry.pivot.y
  );


  ctx.moveTo(
    geometry.pivot.x,
    geometry.pivot.y -
    radius *
    1.7
  );

  ctx.lineTo(
    geometry.pivot.x,
    geometry.pivot.y +
    radius *
    1.7
  );

  ctx.stroke();


  ctx.restore();
}


/* =========================================================
   SNAPSHOT PARA DRAG
   ========================================================= */

function snapshotSelectionForTransform() {
  const layers =
    multiSelection.size >
      1
      ? selectedMultiLayers()
      : (
          engine.selected
            ? [
                engine.selected
              ]
            : []
        );


  return layers.map(
    layer => ({
      id:
        layer.id,

      layer:
        {
          x:
            layer.x,

          y:
            layer.y,

          scale:
            layer.scale,

          rotation:
            layer.rotation,

          pivotX:
            layer.pivotX,

          pivotY:
            layer.pivotY,

          breathing:
            clonePlain(
              layer.breathing
            )
        },

      frames:
        cloneLayerFrames(
          layer.id
        )
    })
  );
}


/* =========================================================
   MULTI · MOVER
   ========================================================= */

function applyMultiMove(
  snapshot,
  dx,
  dy
) {
  for (
    const item
    of snapshot
  ) {
    const layer =
      engine.layers.find(
        current =>
          current.id ===
          item.id
      );

    if (!layer) {
      continue;
    }


    layer.x =
      item.layer.x +
      dx;

    layer.y =
      item.layer.y +
      dy;


    const frames =
      clonePlain(
        item.frames
      ) ||
      [];


    for (
      const frame
      of frames
    ) {
      if (
        frame.x !==
        undefined
      ) {
        frame.x =
          Number(
            frame.x
          ) +
          dx;
      }


      if (
        frame.y !==
        undefined
      ) {
        frame.y =
          Number(
            frame.y
          ) +
          dy;
      }
    }


    replaceLayerFrames(
      layer.id,
      frames
    );


    layer.base =
      engine.snapshot(
        layer
      );
  }
}


/* =========================================================
   MULTI · ESCALAR
   ========================================================= */

function applyMultiScale(
  snapshot,
  center,
  factor
) {
  factor =
    clamp(
      factor,
      0.02,
      30
    );


  for (
    const item
    of snapshot
  ) {
    const layer =
      engine.layers.find(
        current =>
          current.id ===
          item.id
      );

    if (!layer) {
      continue;
    }


    layer.x =
      center.x +
      (
        item.layer.x -
        center.x
      ) *
      factor;


    layer.y =
      center.y +
      (
        item.layer.y -
        center.y
      ) *
      factor;


    layer.scale =
      item.layer.scale *
      factor;


    const frames =
      clonePlain(
        item.frames
      ) ||
      [];


    for (
      const frame
      of frames
    ) {
      if (
        frame.x !==
        undefined
      ) {
        frame.x =
          center.x +
          (
            Number(
              frame.x
            ) -
            center.x
          ) *
          factor;
      }


      if (
        frame.y !==
        undefined
      ) {
        frame.y =
          center.y +
          (
            Number(
              frame.y
            ) -
            center.y
          ) *
          factor;
      }


      if (
        frame.scale !==
        undefined
      ) {
        frame.scale =
          Number(
            frame.scale
          ) *
          factor;
      }
    }


    replaceLayerFrames(
      layer.id,
      frames
    );


    /*
     * Escalar amplitud vertical
     * de respiración.
     */

    if (
      item.layer.breathing
    ) {
      layer.breathing =
        clonePlain(
          item.layer.breathing
        );

      layer.breathing.y =
        Number(
          layer.breathing.y ||
          0
        ) *
        factor;
    }


    layer.base =
      engine.snapshot(
        layer
      );
  }
}


/* =========================================================
   ROTAR PUNTO
   ========================================================= */

function rotatePointAround(
  x,
  y,
  center,
  radians
) {
  const dx =
    x -
    center.x;

  const dy =
    y -
    center.y;


  const cos =
    Math.cos(
      radians
    );

  const sin =
    Math.sin(
      radians
    );


  return {
    x:
      center.x +
      dx *
      cos -
      dy *
      sin,

    y:
      center.y +
      dx *
      sin +
      dy *
      cos
  };
}


/* =========================================================
   MULTI · ROTAR
   ========================================================= */

function applyMultiRotation(
  snapshot,
  center,
  degrees
) {
  const radians =
    degrees *
    Math.PI /
    180;


  for (
    const item
    of snapshot
  ) {
    const layer =
      engine.layers.find(
        current =>
          current.id ===
          item.id
      );

    if (!layer) {
      continue;
    }


    const position =
      rotatePointAround(
        item.layer.x,
        item.layer.y,
        center,
        radians
      );


    layer.x =
      position.x;

    layer.y =
      position.y;


    layer.rotation =
      item.layer.rotation +
      degrees;


    const frames =
      clonePlain(
        item.frames
      ) ||
      [];


    for (
      const frame
      of frames
    ) {
      if (
        frame.x !==
          undefined &&
        frame.y !==
          undefined
      ) {
        const point =
          rotatePointAround(
            Number(
              frame.x
            ),
            Number(
              frame.y
            ),
            center,
            radians
          );

        frame.x =
          point.x;

        frame.y =
          point.y;
      }


      if (
        frame.rotation !==
        undefined
      ) {
        frame.rotation =
          Number(
            frame.rotation
          ) +
          degrees;
      }
    }


    replaceLayerFrames(
      layer.id,
      frames
    );


    layer.base =
      engine.snapshot(
        layer
      );
  }
}


/* =========================================================
   CANVAS POINTER DOWN
   ========================================================= */

stage.addEventListener(
  'pointerdown',
  event => {
    if (
      event.button !==
      0
    ) {
      return;
    }


    animator.pause();


    const point =
      pointerToCanvas(
        event
      );


    /*
     * MULTI siempre es una
     * transformación de Diseño.
     */

    if (
      multiSelection.size >
      1
    ) {
      if (
        editorMode !==
        'design'
      ) {
        alert(
          'La transformación de varias capas se hace en Modo Diseño para evitar crear animaciones accidentales.'
        );

        return;
      }


      const handle =
        selectedHandleAtPoint(
          point
        );


      if (
        !handle ||
        !handle.type
          .startsWith(
            'multi-'
          )
      ) {
        return;
      }


      pushHistory();


      const bounds =
        handle.bounds;


      const snapshot =
        snapshotSelectionForTransform();


      const startDistance =
        Math.max(
          1,

          Math.hypot(
            point.x -
            bounds.center.x,

            point.y -
            bounds.center.y
          )
        );


      const startAngle =
        Math.atan2(
          point.y -
          bounds.center.y,

          point.x -
          bounds.center.x
        );


      canvasInteraction = {
        type:
          handle.type,

        startPointer:
          point,

        bounds,

        snapshot,

        startDistance,

        startAngle
      };


      stage.setPointerCapture(
        event.pointerId
      );

      return;
    }


    /*
     * Preparar pose si estamos
     * animando.
     */

    if (
      editorMode ===
      'animation'
    ) {
      timelinePreviewActive =
        true;

      animator.evaluate(
        animator.currentTime,
        false
      );
    }


    const handle =
      selectedHandleAtPoint(
        point
      );


    /*
     * HANDLE capa actual.
     */

    if (handle) {
      const layer =
        engine.selected;

      if (!layer) {
        return;
      }


      pushHistory();


      const startPose =
        getEffectivePose(
          layer
        );


      stage.setPointerCapture(
        event.pointerId
      );


      if (
        handle.type ===
        'rotate'
      ) {
        canvasInteraction = {
          type:
            'rotate',

          layerId:
            layer.id,

          startPose:
            clonePlain(
              startPose
            ),

          startAngle:
            Math.atan2(
              point.y -
              startPose.y,

              point.x -
              startPose.x
            )
        };

        return;
      }


      if (
        handle.type ===
        'scale'
      ) {
        canvasInteraction = {
          type:
            'scale',

          layerId:
            layer.id,

          startPose:
            clonePlain(
              startPose
            ),

          startDistance:
            Math.max(
              1,

              Math.hypot(
                point.x -
                startPose.x,

                point.y -
                startPose.y
              )
            )
        };

        return;
      }


      if (
        handle.type ===
        'pivot'
      ) {
        /*
         * El pivote siempre es
         * configuración de rig.
         */

        if (
          editorMode !==
          'design'
        ) {
          alert(
            'El pivote se modifica en Modo Diseño porque pertenece al rig, no a una animación.'
          );

          return;
        }


        canvasInteraction = {
          type:
            'pivot',

          layerId:
            layer.id,

          startPose:
            clonePlain(
              startPose
            ),

          startFrames:
            cloneLayerFrames(
              layer.id
            )
        };

        return;
      }
    }


    /*
     * Buscar capa.
     */

    const hit =
      layerAtPoint(
        point.x,
        point.y
      );


    if (!hit) {
      multiSelection.clear();

      engine.selectedId =
        null;

      renderLayers();

      syncInspector();

      renderTimelineLists();

      syncModeUI();

      engine.draw();

      return;
    }


    if (
      engine.selectedId !==
      hit.id
    ) {
      selectSingleLayer(
        hit.id
      );
    }


    const layer =
      engine.selected;


    pushHistory();


    const startPose =
      getEffectivePose(
        layer
      );


    stage.setPointerCapture(
      event.pointerId
    );


    canvasInteraction = {
      type:
        'move',

      layerId:
        layer.id,

      startPointer:
        point,

      startPose:
        clonePlain(
          startPose
        )
    };
  }
);


/* =========================================================
   CANVAS POINTER MOVE
   ========================================================= */

stage.addEventListener(
  'pointermove',
  event => {
    const point =
      pointerToCanvas(
        event
      );


    /*
     * CURSOR
     */

    if (
      !canvasInteraction
    ) {
      const handle =
        selectedHandleAtPoint(
          point
        );


      if (handle) {
        if (
          handle.type
            .includes(
              'rotate'
            )
        ) {
          stage.style.cursor =
            'crosshair';

        } else if (
          handle.type
            .includes(
              'scale'
            )
        ) {
          stage.style.cursor =
            'nwse-resize';

        } else {
          stage.style.cursor =
            'move';
        }

        return;
      }


      stage.style.cursor =
        layerAtPoint(
          point.x,
          point.y
        )
          ? 'move'
          : 'default';

      return;
    }


    /*
     * MULTI MOVE
     */

    if (
      canvasInteraction.type ===
      'multi-move'
    ) {
      const dx =
        point.x -
        canvasInteraction
          .startPointer.x;


      const dy =
        point.y -
        canvasInteraction
          .startPointer.y;


      applyMultiMove(
        canvasInteraction
          .snapshot,
        dx,
        dy
      );


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();

      return;
    }


    /*
     * MULTI SCALE
     */

    if (
      canvasInteraction.type ===
      'multi-scale'
    ) {
      const center =
        canvasInteraction
          .bounds.center;


      const currentDistance =
        Math.max(
          1,

          Math.hypot(
            point.x -
            center.x,

            point.y -
            center.y
          )
        );


      const factor =
        currentDistance /
        canvasInteraction
          .startDistance;


      applyMultiScale(
        canvasInteraction
          .snapshot,
        center,
        factor
      );


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();

      return;
    }


    /*
     * MULTI ROTATE
     */

    if (
      canvasInteraction.type ===
      'multi-rotate'
    ) {
      const center =
        canvasInteraction
          .bounds.center;


      const angle =
        Math.atan2(
          point.y -
          center.y,

          point.x -
          center.x
        );


      let degrees =
        (
          angle -
          canvasInteraction
            .startAngle
        ) *
        180 /
        Math.PI;


      if (
        event.shiftKey
      ) {
        degrees =
          Math.round(
            degrees /
            15
          ) *
          15;
      }


      applyMultiRotation(
        canvasInteraction
          .snapshot,
        center,
        degrees
      );


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();

      return;
    }


    /*
     * CAPA SIMPLE.
     */

    const layer =
      engine.layers.find(
        item =>
          item.id ===
          canvasInteraction
            .layerId
      );


    if (!layer) {
      return;
    }


    const startPose =
      canvasInteraction
        .startPose;


    const pose =
      clonePlain(
        startPose
      );


    /* -------------------------
       MOVE
       ------------------------- */

    if (
      canvasInteraction.type ===
      'move'
    ) {
      pose.x =
        startPose.x +
        (
          point.x -
          canvasInteraction
            .startPointer.x
        );


      pose.y =
        startPose.y +
        (
          point.y -
          canvasInteraction
            .startPointer.y
        );
    }


    /* -------------------------
       SCALE
       ------------------------- */

    else if (
      canvasInteraction.type ===
      'scale'
    ) {
      const currentDistance =
        Math.max(
          1,

          Math.hypot(
            point.x -
            startPose.x,

            point.y -
            startPose.y
          )
        );


      const ratio =
        currentDistance /
        canvasInteraction
          .startDistance;


      pose.scale =
        clamp(
          startPose.scale *
          ratio,
          0.02,
          20
        );
    }


    /* -------------------------
       ROTATE
       ------------------------- */

    else if (
      canvasInteraction.type ===
      'rotate'
    ) {
      const angle =
        Math.atan2(
          point.y -
          startPose.y,

          point.x -
          startPose.x
        );


      let degrees =
        (
          angle -
          canvasInteraction
            .startAngle
        ) *
        180 /
        Math.PI;


      if (
        event.shiftKey
      ) {
        degrees =
          Math.round(
            degrees /
            15
          ) *
          15;
      }


      pose.rotation =
        startPose.rotation +
        degrees;
    }


    /* -------------------------
       PIVOT
       ------------------------- */

    else if (
      canvasInteraction.type ===
      'pivot'
    ) {
      const local =
        worldPointToImage(
          layer,
          point.x,
          point.y,
          startPose
        );


      const newPivotX =
        local.x;

      const newPivotY =
        local.y;


      const dx =
        newPivotX -
        startPose.pivotX;


      const dy =
        newPivotY -
        startPose.pivotY;


      const sx =
        startPose.scale *
        (
          layer.flipX
            ? -1
            : 1
        );


      const sy =
        startPose.scale *
        (
          layer.flipY
            ? -1
            : 1
        );


      const localDX =
        dx *
        sx;

      const localDY =
        dy *
        sy;


      const angle =
        startPose.rotation *
        Math.PI /
        180;


      const cos =
        Math.cos(
          angle
        );

      const sin =
        Math.sin(
          angle
        );


      pose.x =
        startPose.x +
        localDX *
        cos -
        localDY *
        sin;


      pose.y =
        startPose.y +
        localDX *
        sin +
        localDY *
        cos;


      pose.pivotX =
        newPivotX;

      pose.pivotY =
        newPivotY;
    }


    /*
     * DISEÑO
     */

    if (
      editorMode ===
      'design'
    ) {
      /*
       * Empezar siempre desde
       * la pose original del drag.
       */

      const oldX =
        layer.x;

      const oldY =
        layer.y;

      const oldScale =
        layer.scale;

      const oldRotation =
        layer.rotation;


      if (
        canvasInteraction.type ===
        'move'
      ) {
        const dx =
          pose.x -
          startPose.x;

        const dy =
          pose.y -
          startPose.y;


        layer.x =
          pose.x;

        layer.y =
          pose.y;


        const frames =
          clonePlain(
            canvasInteraction
              .startFrames ||
            cloneLayerFrames(
              layer.id
            )
          ) ||
          [];


        /*
         * La primera vez guardamos
         * los frames originales.
         */
        if (
          !canvasInteraction
            .startFrames
        ) {
          canvasInteraction
            .startFrames =
            cloneLayerFrames(
              layer.id
            );
        }


        const originalFrames =
          clonePlain(
            canvasInteraction
              .startFrames
          ) ||
          [];


        for (
          const frame
          of originalFrames
        ) {
          if (
            frame.x !==
            undefined
          ) {
            frame.x =
              Number(
                frame.x
              ) +
              dx;
          }

          if (
            frame.y !==
            undefined
          ) {
            frame.y =
              Number(
                frame.y
              ) +
              dy;
          }
        }


        replaceLayerFrames(
          layer.id,
          originalFrames
        );

      } else if (
        canvasInteraction.type ===
        'scale'
      ) {
        if (
          !canvasInteraction
            .startFrames
        ) {
          canvasInteraction
            .startFrames =
            cloneLayerFrames(
              layer.id
            );
        }


        const factor =
          pose.scale /
          Math.max(
            0.0001,
            startPose.scale
          );


        layer.scale =
          pose.scale;


        const frames =
          clonePlain(
            canvasInteraction
              .startFrames
          ) ||
          [];


        for (
          const frame
          of frames
        ) {
          if (
            frame.scale !==
            undefined
          ) {
            frame.scale =
              Number(
                frame.scale
              ) *
              factor;
          }
        }


        replaceLayerFrames(
          layer.id,
          frames
        );

      } else if (
        canvasInteraction.type ===
        'rotate'
      ) {
        if (
          !canvasInteraction
            .startFrames
        ) {
          canvasInteraction
            .startFrames =
            cloneLayerFrames(
              layer.id
            );
        }


        const delta =
          pose.rotation -
          startPose.rotation;


        layer.rotation =
          pose.rotation;


        const frames =
          clonePlain(
            canvasInteraction
              .startFrames
          ) ||
          [];


        for (
          const frame
          of frames
        ) {
          if (
            frame.rotation !==
            undefined
          ) {
            frame.rotation =
              Number(
                frame.rotation
              ) +
              delta;
          }
        }


        replaceLayerFrames(
          layer.id,
          frames
        );

      } else if (
        canvasInteraction.type ===
        'pivot'
      ) {
        layer.x =
          pose.x;

        layer.y =
          pose.y;

        layer.pivotX =
          pose.pivotX;

        layer.pivotY =
          pose.pivotY;
      }


      layer.base =
        engine.snapshot(
          layer
        );


      timelinePreviewActive =
        false;

      engine.resetRuntime();
    }


    /*
     * ANIMACIÓN
     */

    else {
      layer.runtime = {
        ...layer.runtime,

        x:
          pose.x,

        y:
          pose.y,

        scale:
          pose.scale,

        rotation:
          pose.rotation,

        opacity:
          pose.opacity,

        pivotX:
          pose.pivotX,

        pivotY:
          pose.pivotY,

        visible:
          pose.visible
      };
    }


    syncInspector();

    engine.draw();

    drawSelectionOverlay();

    queuePersist();
  }
);


/* =========================================================
   TERMINAR INTERACCIÓN
   ========================================================= */

function endCanvasInteraction() {
  if (
    !canvasInteraction
  ) {
    return;
  }


  /*
   * MULTI ya fue aplicado
   * directamente en Diseño.
   */

  if (
    canvasInteraction.type
      .startsWith(
        'multi-'
      )
  ) {
    canvasInteraction =
      null;

    renderLayers();

    syncInspector();

    syncModeUI();

    engine.draw();

    drawSelectionOverlay();

    queuePersist();

    return;
  }


  const layer =
    engine.layers.find(
      item =>
        item.id ===
        canvasInteraction
          .layerId
    );


  if (
    layer &&
    editorMode ===
    'animation' &&
    canvasInteraction.type !==
    'pivot'
  ) {
    const pose =
      getEffectivePose(
        layer
      );


    writePoseKeyframe(
      layer,
      pose,
      animator.currentTime
    );


    timelinePreviewActive =
      true;


    animator.seek(
      animator.currentTime
    );


    renderTimelineLists();
  }


  canvasInteraction =
    null;

  stage.style.cursor =
    'default';


  syncInspector();

  renderLayers();

  engine.draw();

  drawSelectionOverlay();

  queuePersist();
}


stage.addEventListener(
  'pointerup',
  endCanvasInteraction
);


stage.addEventListener(
  'pointercancel',
  endCanvasInteraction
);


/* =========================================================
   TIMELINE
   ========================================================= */

function animationDuration() {
  return Math.max(
    0.5,

    Number(
      engine.animation
        .duration
    ) ||
    10
  );
}


function syncTimelineUI() {
  const duration =
    animationDuration();


  q('#timelineDuration')
    .value =
    duration;


  q('#timelineScrub')
    .max =
    duration;


  q('#timelineScrub')
    .value =
    clamp(
      animator.currentTime,
      0,
      duration
    );


  q('#timelineLoop')
    .checked =
    engine.animation.loop !==
    false;


  q('#timelineRuntime')
    .checked =
    engine.animation
      .playOnRuntime !==
    false;


  q('#timelineTime')
    .textContent =
    `${animator.currentTime.toFixed(2)} s`;


  q('#timelinePlay')
    .textContent =
    animator.playing
      ? '⏸'
      : '▶';
}


/* =========================================================
   SELECCIÓN DE ANIMACIÓN
   ========================================================= */

function updateSelectedAnimationLabel() {
  const label =
    q('#selectedAnimationLabel');


  if (
    !selectedAnimationRef
  ) {
    label.textContent =
      'Ninguna animación seleccionada';

    return;
  }


  label.textContent =
    selectedAnimationRef
      .label ||
    'Animación seleccionada';
}


function keyChip(
  label,
  time,
  kind,
  reference
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
      ) *
      100,
      0,
      100
    );


  button.type =
    'button';


  button.title =
    `${label} · ${time.toFixed(2)} s`;


  button.textContent =
    kind ===
    'state'
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
    'z-index:2'
  ].join(';');


  if (
    selectedAnimationRef &&
    selectedAnimationRef.id ===
      reference.id &&
    selectedAnimationRef.kind ===
      reference.kind
  ) {
    button.style.borderColor =
      '#ff79c9';

    button.style.boxShadow =
      '0 0 0 2px rgba(255,121,201,.2)';
  }


  button.addEventListener(
    'click',
    () => {
      selectedAnimationRef = {
        ...reference,
        label
      };


      updateSelectedAnimationLabel();


      timelinePreviewActive =
        true;


      animator.pause();

      animator.seek(
        time
      );


      if (
        editorMode !==
        'animation'
      ) {
        setEditorMode(
          'animation'
        );
      }


      syncTimelineUI();

      renderTimelineLists();

      syncInspector();
    }
  );


  return button;
}


/* =========================================================
   DIBUJAR TIMELINE
   ========================================================= */

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
      ? getLayerFrames(
          selected.id
        )
      : [];


  if (
    !layerFrames.length
  ) {
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
            a.time -
            b.time
        )
    ) {
      layerBox.appendChild(
        keyChip(
          selected
            ? `${selected.name} · Transformación`
            : 'Transformación',

          Number(
            keyframe.time
          ),

          'layer',

          {
            kind:
              'layer-keyframe',

            layerId:
              selected.id,

            id:
              keyframe.id
          }
        )
      );
    }
  }


  const stateFrames =
    [
      ...(
        engine.animation
          .stateKeyframes ||
        []
      )
    ].sort(
      (a, b) =>
        a.time -
        b.time
    );


  if (
    !stateFrames.length
  ) {
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
          `${keyframe.group} / ${keyframe.state}`,

          Number(
            keyframe.time
          ),

          'state',

          {
            kind:
              'state-keyframe',

            id:
              keyframe.id
          }
        )
      );
    }
  }


  updateSelectedAnimationLabel();
}


/* =========================================================
   TIMELINE CALLBACKS
   ========================================================= */

animator.onTimeChange =
  time => {
    q('#timelineScrub')
      .value =
      time;


    q('#timelineTime')
      .textContent =
      `${time.toFixed(2)} s`;


    if (
      editorMode ===
      'animation'
    ) {
      syncInspector();
    }
  };


animator.onPlayChange =
  () => {
    syncTimelineUI();
  };


q('#timelineDuration')
  .addEventListener(
    'change',
    event => {
      pushHistory();

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
      engine.animation.loop =
        event.target.checked;

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

      syncInspector();

      engine.draw();

      drawSelectionOverlay();
    }
  );


q('#timelinePlay')
  .addEventListener(
    'click',
    () => {
      timelinePreviewActive =
        true;


      if (
        animator.playing
      ) {
        animator.pause();

      } else {
        if (
          animator.currentTime >=
          animationDuration()
        ) {
          animator.seek(
            0
          );
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
        editorMode ===
        'animation';


      if (
        editorMode ===
        'design'
      ) {
        engine.resetRuntime();
      }


      engine.draw();

      drawSelectionOverlay();

      syncTimelineUI();

      syncInspector();

      renderTimelineLists();
    }
  );


/* =========================================================
   CREAR KEYFRAME
   ========================================================= */

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


      pushHistory();


      animator.evaluate(
        animator.currentTime,
        false
      );


      const pose =
        getEffectivePose(
          layer
        );


      const keyframe =
        writePoseKeyframe(
          layer,
          pose,
          animator.currentTime
        );


      selectedAnimationRef = {
        kind:
          'layer-keyframe',

        layerId:
          layer.id,

        id:
          keyframe.id,

        label:
          `${layer.name} · Transformación`
      };


      setEditorMode(
        'animation'
      );


      animator.seek(
        animator.currentTime
      );


      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   CREAR ESTADO
   ========================================================= */

q('#addStateKeyframe')
  .addEventListener(
    'click',
    () => {
      const layer =
        engine.selected;


      if (
        !layer?.group
          ?.trim() ||
        !layer.state
          ?.trim()
      ) {
        alert(
          'La capa necesita Grupo y Estado.'
        );

        return;
      }


      pushHistory();


      const keyframe =
        animator.addStateKeyframe(
          layer.group.trim(),
          layer.state.trim(),
          animator.currentTime
        );


      if (
        keyframe
      ) {
        selectedAnimationRef = {
          kind:
            'state-keyframe',

          id:
            keyframe.id,

          label:
            `${layer.group.trim()} / ${layer.state.trim()}`
        };
      }


      setEditorMode(
        'animation'
      );


      animator.seek(
        animator.currentTime
      );


      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   BORRAR KEYFRAME EXACTO
   ========================================================= */

function deleteAnimationReference(
  reference
) {
  if (!reference) {
    return false;
  }


  if (
    reference.kind ===
    'layer-keyframe'
  ) {
    const list =
      getLayerFrames(
        reference.layerId
      );


    const index =
      list.findIndex(
        item =>
          item.id ===
          reference.id
      );


    if (
      index >=
      0
    ) {
      list.splice(
        index,
        1
      );

      return true;
    }
  }


  if (
    reference.kind ===
    'state-keyframe'
  ) {
    const list =
      engine.animation
        .stateKeyframes ||
      [];


    const index =
      list.findIndex(
        item =>
          item.id ===
          reference.id
      );


    if (
      index >=
      0
    ) {
      list.splice(
        index,
        1
      );

      return true;
    }
  }


  return false;
}


/* =========================================================
   ELIMINAR KEY
   ========================================================= */

q('#deleteKeyframe')
  .addEventListener(
    'click',
    () => {
      pushHistory();


      let removed =
        false;


      /*
       * Si hay uno seleccionado,
       * borrar exactamente ese.
       */

      if (
        selectedAnimationRef
      ) {
        removed =
          deleteAnimationReference(
            selectedAnimationRef
          );
      }


      /*
       * Si no, buscar cercano.
       */

      if (!removed) {
        const layer =
          engine.selected;


        if (layer) {
          removed =
            animator
              .removeNearestLayerKeyframe(
                layer.id,
                animator.currentTime,
                0.25
              );
        }


        if (!removed) {
          removed =
            animator
              .removeNearestStateKeyframe(
                animator.currentTime,
                0.25
              );
        }
      }


      if (!removed) {
        alert(
          'No hay ningún keyframe seleccionado o suficientemente cerca.'
        );

        return;
      }


      selectedAnimationRef =
        null;


      updateSelectedAnimationLabel();

      animator.seek(
        animator.currentTime
      );

      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   BORRAR ANIMACIÓN SELECCIONADA
   ========================================================= */

q('#deleteSelectedAnimation')
  .addEventListener(
    'click',
    () => {
      if (
        !selectedAnimationRef
      ) {
        alert(
          'Selecciona primero un ◆ o ◇ en la Timeline.'
        );

        return;
      }


      pushHistory();


      const removed =
        deleteAnimationReference(
          selectedAnimationRef
        );


      if (!removed) {
        alert(
          'Esa animación ya no existe.'
        );

        selectedAnimationRef =
          null;

        updateSelectedAnimationLabel();

        return;
      }


      selectedAnimationRef =
        null;


      animator.seek(
        animator.currentTime
      );


      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   BORRAR ANIMACIONES DE UNA CAPA
   ========================================================= */

q('#deleteLayerAnimation')
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


      const frames =
        getLayerFrames(
          layer.id
        );


      if (
        !frames.length
      ) {
        alert(
          'Esta capa no tiene keyframes de transformación.'
        );

        return;
      }


      const confirmed =
        confirm(
          `¿Eliminar todos los keyframes de "${layer.name}"?\n\nLas demás capas no se modificarán.`
        );


      if (!confirmed) {
        return;
      }


      pushHistory();


      engine.animation
        .layerKeyframes[
          layer.id
        ] =
        [];


      selectedAnimationRef =
        null;


      timelinePreviewActive =
        false;


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      renderTimelineLists();

      queuePersist();
    }
  );


/* =========================================================
   DESACTIVAR RESPIRACIÓN + TICS
   ========================================================= */

q('#disableLayerMotion')
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


      pushHistory();


      if (
        !layer.organic
      ) {
        layer.organic =
          {};
      }


      layer.organic.enabled =
        false;


      const breathing =
        animator.getBreathingConfig(
          layer
        );


      layer.breathing = {
        ...breathing,
        enabled:
          false
      };


      layer._organicRuntime =
        null;


      animator.resetOrganic();

      timelinePreviewActive =
        false;


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      syncInspector();

      queuePersist();
    }
  );


/* =========================================================
   BORRAR TODAS LAS ANIMACIONES
   ========================================================= */

q('#deleteAllAnimations')
  .addEventListener(
    'click',
    () => {
      const confirmed =
        confirm(
          '⚠ ¿BORRAR TODAS LAS ANIMACIONES DEL PROYECTO?\n\nSe eliminarán:\n• todos los keyframes\n• todos los cambios de estado\n• respiración\n• tics orgánicos\n\nLas capas y sus posiciones de Diseño permanecerán intactas.'
        );


      if (!confirmed) {
        return;
      }


      const second =
        confirm(
          'Última confirmación: ¿realmente quieres borrar TODA la animación?'
        );


      if (!second) {
        return;
      }


      pushHistory();


      animator.pause();


      engine.animation
        .layerKeyframes =
        {};


      engine.animation
        .stateKeyframes =
        [];


      for (
        const layer
        of engine.layers
      ) {
        if (
          !layer.organic
        ) {
          layer.organic =
            {};
        }


        layer.organic.enabled =
          false;


        const breathing =
          animator.getBreathingConfig(
            layer
          );


        layer.breathing = {
          ...breathing,
          enabled:
            false
        };


        layer._organicRuntime =
          null;
      }


      animator.manualStates
        .clear();


      animator.resetOrganic();


      selectedAnimationRef =
        null;


      timelinePreviewActive =
        false;


      editorMode =
        'design';


      engine.resetRuntime();

      engine.draw();

      drawSelectionOverlay();

      syncModeUI();

      syncInspector();

      renderTimelineLists();

      queuePersist();
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
          'El navegador bloqueó la ventana.';

        return;
      }


      status.textContent =
        'Preparando runtime…';


      const saved =
        await persistProject({
          broadcast: true
        });


      if (!saved) {
        win.close();

        status.textContent =
          'No se pudo preparar el runtime.';

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
        () => {
          broadcastProject(
            currentProject()
          );
        },
        400
      );


      setTimeout(
        () => {
          broadcastProject(
            currentProject()
          );
        },
        1100
      );
    }
  );


/* =========================================================
   SEPARADOR DE CAPAS
   ========================================================= */

const splitter = {
  targetId:
    null,

  tool:
    'brush',

  painting:
    false,

  lastPoint:
    null,

  lassoPoints:
    [],

  sourceCanvas:
    document.createElement(
      'canvas'
    ),

  maskCanvas:
    document.createElement(
      'canvas'
    ),

  sourceCtx:
    null,

  maskCtx:
    null,

  display:
    q('#splitterCanvas'),

  displayCtx:
    q('#splitterCanvas')
      .getContext(
        '2d'
      ),

  preview:
    q('#splitPreview'),

  previewCtx:
    q('#splitPreview')
      .getContext(
        '2d'
      )
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


/* =========================================================
   SPLITTER · HERRAMIENTAS
   ========================================================= */

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
      tool ===
      'brush'
    );


  q('#toolErase')
    .classList
    .toggle(
      'active',
      tool ===
      'erase'
    );


  q('#toolLasso')
    .classList
    .toggle(
      'active',
      tool ===
      'lasso'
    );


  renderSplitter();
}


/* =========================================================
   SPLITTER · ABRIR
   ========================================================= */

function openSplitter() {
  const layer =
    engine.selected;


  if (
    !layer?.image
  ) {
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
    layer.group ||
    '';


  q('#splitState').value =
    layer.state ||
    '';


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
    .add(
      'open'
    );


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
    .remove(
      'open'
    );


  q('#splitterModal')
    .setAttribute(
      'aria-hidden',
      'true'
    );


  q('#splitterCursor')
    .hidden =
    true;
}


/* =========================================================
   SPLITTER · RENDER
   ========================================================= */

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
    ) /
    100;


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
      .length >
      1
  ) {
    context.save();


    context.strokeStyle =
      '#ffffff';


    context.lineWidth =
      Math.max(
        1,
        width /
        900 *
        2
      );


    context.setLineDash(
      [
        8,
        6
      ]
    );


    context.beginPath();


    context.moveTo(
      splitter
        .lassoPoints[0]
        .x,

      splitter
        .lassoPoints[0]
        .y
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


/* =========================================================
   SPLITTER · COORDENADAS
   ========================================================= */

function splitterCanvasPoint(
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


/* =========================================================
   SPLITTER · PINCEL
   ========================================================= */

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
    context.globalCompositeOperation =
      'destination-out';

    context.strokeStyle =
      'rgba(0,0,0,1)';

    context.fillStyle =
      'rgba(0,0,0,1)';

  } else {
    context.globalCompositeOperation =
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
    from.x ===
      to.x &&
    from.y ===
      to.y
  ) {
    context.beginPath();

    context.arc(
      from.x,
      from.y,
      size /
      2,
      0,
      Math.PI *
      2
    );

    context.fill();
  }


  context.restore();
}


/* =========================================================
   SPLITTER · LAZO
   ========================================================= */

function fillLasso(
  points
) {
  if (
    points.length <
    3
  ) {
    return;
  }


  const context =
    splitter.maskCtx;


  context.save();


  context.globalCompositeOperation =
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


/* =========================================================
   SPLITTER · BOUNDS
   ========================================================= */

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
    let y =
      0;
    y <
      height;
    y++
  ) {
    for (
      let x =
        0;
      x <
        width;
      x++
    ) {
      const index =
        (
          y *
          width +
          x
        ) *
        4;


      if (
        mask[
          index +
          3
        ] >
          10 &&
        source[
          index +
          3
        ] >
          0
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


  if (
    maxX <
    0
  ) {
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


/* =========================================================
   SPLITTER · EXPANDIR BOUNDS
   ========================================================= */

function expandBounds(
  bounds,
  padding
) {
  const width =
    splitter
      .sourceCanvas
      .width;


  const height =
    splitter
      .sourceCanvas
      .height;


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
      right -
      x,

    h:
      bottom -
      y,

    count:
      bounds.count
  };
}


/* =========================================================
   SPLITTER · DILATACIÓN SUAVE
   ========================================================= */

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
        y -
        radius
      );

    yy <=
      Math.min(
        height -
        1,
        y +
        radius
      );

    yy++
  ) {
    for (
      let xx =
        Math.max(
          0,
          x -
          radius
        );

      xx <=
        Math.min(
          width -
          1,
          x +
          radius
        );

      xx++
    ) {
      const alpha =
        mask[
          (
            yy *
            width +
            xx
          ) *
          4 +
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


  return maximum /
    255;
}


/* =========================================================
   SPLITTER · EXTRAER
   ========================================================= */

function extractCanvas(
  bounds,
  removeFromOriginal =
    false,
  cleanupPx =
    0
) {
  const width =
    splitter
      .sourceCanvas
      .width;


  const height =
    splitter
      .sourceCanvas
      .height;


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
    let yy =
      0;
    yy <
      bounds.h;
    yy++
  ) {
    const sourceY =
      bounds.y +
      yy;


    for (
      let xx =
        0;
      xx <
        bounds.w;
      xx++
    ) {
      const sourceX =
        bounds.x +
        xx;


      const sourceIndex =
        (
          sourceY *
          width +
          sourceX
        ) *
        4;


      const outputIndex =
        (
          yy *
          bounds.w +
          xx
        ) *
        4;


      const sourceAlpha =
        sourceData.data[
          sourceIndex +
          3
        ] /
        255;


      if (
        sourceAlpha <=
        0
      ) {
        continue;
      }


      const maskAlpha =
        cleanupRadius >
        0
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
            ] /
            255;


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
        outputIndex +
        1
      ] =
        sourceData.data[
          sourceIndex +
          1
        ];


      outputData.data[
        outputIndex +
        2
      ] =
        sourceData.data[
          sourceIndex +
          2
        ];


      outputData.data[
        outputIndex +
        3
      ] =
        Math.round(
          sourceAlpha *
          maskAlpha *
          255
        );
    }
  }


  outputContext
    .putImageData(
      outputData,
      0,
      0
    );


  if (
    removeFromOriginal
  ) {
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
        width -
        1,

        bounds.x +
        bounds.w -
        1 +
        radius
      );


    const y1 =
      Math.min(
        height -
        1,

        bounds.y +
        bounds.h -
        1 +
        radius
      );


    for (
      let y =
        y0;
      y <=
        y1;
      y++
    ) {
      for (
        let x =
          x0;
        x <=
          x1;
        x++
      ) {
        const index =
          (
            y *
            width +
            x
          ) *
          4;


        if (
          sourceData.data[
            index +
            3
          ] ===
          0
        ) {
          continue;
        }


        const coverage =
          radius >
          0
            ? expandedMaskAlpha(
                maskData.data,
                width,
                height,
                x,
                y,
                radius
              )
            : maskData.data[
                index +
                3
              ] /
              255;


        if (
          coverage <=
          0
        ) {
          continue;
        }


        const originalAlpha =
          sourceData.data[
            index +
            3
          ] /
          255;


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
          index +
          3
        ] =
          remaining <
          0.02
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


/* =========================================================
   SPLITTER · PREVIEW
   ========================================================= */

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
    ) ||
    0;


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
        padding *
        2
      ) /
      outputBounds.w,

      (
        canvas.height -
        padding *
        2
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
    ) /
    2,

    (
      canvas.height -
      drawHeight
    ) /
    2,

    drawWidth,
    drawHeight
  );


  q('#splitInfo')
    .textContent =
    `Selección: ${bounds.w}×${bounds.h}px · ${bounds.count.toLocaleString()} píxeles`;
}


/* =========================================================
   SPLITTER · EXTRAER CAPA
   ========================================================= */

async function extractSelectedLayer() {
  const sourceLayer =
    engine.layers.find(
      layer =>
        layer.id ===
        splitter.targetId
    );


  if (!sourceLayer) {
    return;
  }


  const selectionBounds =
    maskBounds();


  if (!selectionBounds) {
    alert(
      'Todavía no hay una selección.'
    );

    return;
  }


  pushHistory();


  splitBackup =
    currentProject();


  q('#undoSplit')
    .disabled =
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
    ) ||
    0;


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


  if (
    remove
  ) {
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
    bounds.w /
    2;


  const cropCenterY =
    bounds.y +
    bounds.h /
    2;


  const localOffsetX =
    cropCenterX -
    originalWidth /
    2;


  const localOffsetY =
    cropCenterY -
    originalHeight /
    2;


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

      flipX:
        sourceLayer.flipX,

      flipY:
        sourceLayer.flipY,

      visible:
        true
    });


  newLayer.base =
    engine.snapshot(
      newLayer
    );


  multiSelection.clear();

  engine.selectedId =
    newLayer.id;


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


/* =========================================================
   SPLITTER · BOTONES
   ========================================================= */

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
    () => {
      setSplitterTool(
        'brush'
      );
    }
  );


q('#toolErase')
  .addEventListener(
    'click',
    () => {
      setSplitterTool(
        'erase'
      );
    }
  );


q('#toolLasso')
  .addEventListener(
    'click',
    () => {
      setSplitterTool(
        'lasso'
      );
    }
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
        let index =
          0;
        index <
          source.data.length;
        index +=
          4
      ) {
        if (
          source.data[
            index +
            3
          ] ===
          0
        ) {
          continue;
        }


        mask.data[
          index
        ] =
          255;


        mask.data[
          index +
          1
        ] =
          105;


        mask.data[
          index +
          2
        ] =
          212;


        mask.data[
          index +
          3
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


/* =========================================================
   SPLITTER · POINTER
   ========================================================= */

splitter.display
  .addEventListener(
    'pointerdown',
    event => {
      if (
        event.button !==
        0
      ) {
        return;
      }


      splitter.display
        .setPointerCapture(
          event.pointerId
        );


      const point =
        splitterCanvasPoint(
          event
        );


      splitter.painting =
        true;


      splitter.lastPoint =
        point;


      if (
        splitter.tool ===
        'lasso'
      ) {
        splitter.lassoPoints =
          [
            point
          ];

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
          splitter.display
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
        splitterCanvasPoint(
          event
        );


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
            splitter.display
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
            .push(
              point
            );
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


/* =========================================================
   DESHACER SEPARACIÓN
   ========================================================= */

q('#undoSplit')
  .addEventListener(
    'click',
    async () => {
      if (
        !splitBackup
      ) {
        return;
      }


      const backup =
        splitBackup;


      splitBackup =
        null;


      q('#undoSplit')
        .disabled =
        true;


      animator.pause();

      animator.currentTime =
        0;

      animator.manualStates
        .clear();


      await engine.load(
        backup
      );


      multiSelection.clear();

      timelinePreviewActive =
        false;


      renderLayers();

      syncInspector();

      syncTimelineUI();

      renderTimelineLists();

      engine.draw();

      drawSelectionOverlay();


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
    /*
     * ESC
     */

    if (
      event.key ===
      'Escape'
    ) {
      if (
        q('#splitterModal')
          .classList
          .contains(
            'open'
          )
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


      if (
        multiSelection.size
      ) {
        multiSelection.clear();

        renderLayers();

        syncModeUI();

        engine.draw();

        drawSelectionOverlay();
      }
    }


    /*
     * CTRL + Z
     */

    if (
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key
        .toLowerCase() ===
        'z'
    ) {
      event.preventDefault();

      undoLastChange();
    }


    /*
     * CTRL + A
     *
     * Solo si no estamos
     * escribiendo en un input.
     */

    if (
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      event.key
        .toLowerCase() ===
        'a' &&
      ![
        'INPUT',
        'TEXTAREA',
        'SELECT'
      ].includes(
        document.activeElement
          ?.tagName
      )
    ) {
      event.preventDefault();

      q('#selectAllLayers')
        .click();
    }
  }
);


/* =========================================================
   PREVIEW
   ========================================================= */

function previewFrame(
  now
) {
  /*
   * Mientras arrastramos,
   * nosotros controlamos runtime.
   */

  if (
    !animator.playing &&
    !canvasInteraction
  ) {
    const evaluationTime =
      timelinePreviewActive
        ? animator.currentTime
        : -1;


    /*
     * Respiración y tics
     * siguen visibles si están
     * habilitados.
     */

    animator.evaluate(
      evaluationTime,
      true,
      now
    );


    engine.draw();

    drawSelectionOverlay();
  }


  requestAnimationFrame(
    previewFrame
  );
}


/* =========================================================
   ARRANQUE
   ========================================================= */

async function boot() {
  try {
    const saved =
      await loadCurrentProject();


    if (
      saved?.layers
        ?.length
    ) {
      await engine.load(
        saved
      );
    }

  } catch (error) {
    console.warn(
      'No se pudo restaurar el proyecto:',
      error
    );
  }


  editorMode =
    'design';


  multiSelection.clear();


  selectedAnimationRef =
    null;


  renderLayers();

  syncInspector();

  syncModeUI();

  syncTimelineUI();

  renderTimelineLists();

  updateSelectedAnimationLabel();


  engine.draw();

  drawSelectionOverlay();


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
