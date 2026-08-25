import { Engine, fileToDataURL, loadImage } from './core.js';
import { Animator } from './animator.js';

import {
  saveCurrentProject,
  loadCurrentProject,
  broadcastProject
} from './bridge.js';


const q = selector =>
  document.querySelector(selector);


const stage = q('#stage');

const engine =
  new Engine(stage);

const animator =
  new Animator(engine);


let persistTimer = null;

let splitBackup = null;

let zoomPercent = 100;

let timelinePreviewActive = false;


/* =========================================================
   UTILIDADES
   ========================================================= */

function escapeHTML(value = '') {
  return String(value).replace(
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


function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}


function currentProject() {
  return engine.serialize();
}


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
   CAPAS
   ========================================================= */

function renderLayers() {
  const container =
    q('#layers');

  container.innerHTML = '';

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

    row.className =
      `layer${
        layer.id ===
        engine.selectedId
          ? ' active'
          : ''
      }`;


    const info =
      document.createElement(
        'div'
      );

    info.style.minWidth =
      '0';

    info.style.flex =
      '1';


    const identity = [
      layer.role || 'generic',

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
          layer.name || 'pieza'
        )}
      </strong>

      <small>
        ${escapeHTML(identity)}
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

        engine.draw();

        drawSelectionOverlay();

        queuePersist();
      }
    );


    row.appendChild(info);

    row.appendChild(eye);


    row.addEventListener(
      'click',
      () => {
        selectLayer(
          layer.id
        );
      }
    );


    container.appendChild(
      row
    );
  }
}


function selectLayer(id) {
  engine.selectedId =
    id;

  timelinePreviewActive =
    false;

  renderLayers();

  syncInspector();

  renderTimelineLists();

  engine.draw();

  drawSelectionOverlay();
}


q('#showAllLayers')
  .addEventListener(
    'click',
    () => {
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
      q(`#${id}`).value =
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


  q('#organicEnabled')
    .checked =
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
          layer.role ===
            'earL' ||
          layer.role ===
            'earR'
        ) &&
        !layer.organic.enabled
      ) {
        layer.organic.enabled =
          true;

        layer.organic
          .minInterval =
          2;

        layer.organic
          .maxInterval =
          3.5;

        layer.organic.amount =
          2.2;

        layer.organic.duration =
          0.28;

        layer.organic
          .doubleChance =
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

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


/* =========================================================
   CONTROLES DE CAPA
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
    La copia conserva su animación,
    pero después funciona de manera independiente.
  </p>
`;


const inspectorPanel =
  q('.inspector-panel');


inspectorPanel.insertBefore(
  layerActions,
  q('#runtimeStatus')
);


/* ---------------------------------------------------------
   CLONAR KEYFRAMES
   --------------------------------------------------------- */

function cloneLayerAnimation(
  sourceLayer,
  targetLayer,
  offsetX = 0,
  offsetY = 0
) {
  const sourceFrames =
    engine.animation
      .layerKeyframes?.[
        sourceLayer.id
      ] ||
    [];


  if (!sourceFrames.length) {
    return;
  }


  const cloned =
    JSON.parse(
      JSON.stringify(
        sourceFrames
      )
    );


  engine.animation
    .layerKeyframes[
      targetLayer.id
    ] =
    cloned.map(
      keyframe => ({
        ...keyframe,

        id:
          crypto.randomUUID(),

        x:
          keyframe.x !==
          undefined
            ? Number(
                keyframe.x
              ) +
              offsetX
            : keyframe.x,

        y:
          keyframe.y !==
          undefined
            ? Number(
                keyframe.y
              ) +
              offsetY
            : keyframe.y
      })
    );
}


/* ---------------------------------------------------------
   DUPLICAR
   --------------------------------------------------------- */

function duplicateSelectedLayer() {
  const source =
    engine.selected;


  if (!source) {
    alert(
      'Selecciona una capa primero.'
    );

    return;
  }


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
        JSON.parse(
          JSON.stringify(
            source.organic
          )
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


/* ---------------------------------------------------------
   FLIP H
   --------------------------------------------------------- */

q('#flipLayerX')
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


      layer.flipX =
        !layer.flipX;


      layer.base =
        engine.snapshot(
          layer
        );


      timelinePreviewActive =
        false;

      engine.resetRuntime();

      renderLayers();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


/* ---------------------------------------------------------
   FLIP V
   --------------------------------------------------------- */

q('#flipLayerY')
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


      layer.flipY =
        !layer.flipY;


      layer.base =
        engine.snapshot(
          layer
        );


      timelinePreviewActive =
        false;

      engine.resetRuntime();

      renderLayers();

      engine.draw();

      drawSelectionOverlay();

      queuePersist();
    }
  );


/* =========================================================
   MANIPULACIÓN DIRECTA DEL LIENZO
   ========================================================= */

let canvasInteraction = null;


/* ---------------------------------------------------------
   COORDENADAS DEL MOUSE → CANVAS
   --------------------------------------------------------- */

function pointerToCanvas(event) {
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


/* ---------------------------------------------------------
   IMAGEN LOCAL → MUNDO
   --------------------------------------------------------- */

function imagePointToWorld(
  layer,
  imageX,
  imageY
) {
  const scale =
    Number(
      layer.scale
    ) || 1;


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
      layer.pivotX
    ) *
    sx;


  const localY =
    (
      imageY -
      layer.pivotY
    ) *
    sy;


  const angle =
    layer.rotation *
    Math.PI /
    180;


  const cos =
    Math.cos(angle);

  const sin =
    Math.sin(angle);


  return {
    x:
      layer.x +
      localX * cos -
      localY * sin,

    y:
      layer.y +
      localX * sin +
      localY * cos
  };
}


/* ---------------------------------------------------------
   MUNDO → IMAGEN LOCAL
   --------------------------------------------------------- */

function worldPointToImage(
  layer,
  worldX,
  worldY
) {
  const dx =
    worldX -
    layer.x;

  const dy =
    worldY -
    layer.y;


  const angle =
    layer.rotation *
    Math.PI /
    180;


  const cos =
    Math.cos(angle);

  const sin =
    Math.sin(angle);


  const rotatedX =
    cos * dx +
    sin * dy;


  const rotatedY =
    -sin * dx +
    cos * dy;


  const scale =
    Math.max(
      0.0001,
      Math.abs(
        Number(
          layer.scale
        ) || 1
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
      layer.pivotX,

    y:
      rotatedY /
      sy +
      layer.pivotY
  };
}


/* ---------------------------------------------------------
   HIT TEST
   --------------------------------------------------------- */

function pointInsideLayer(
  layer,
  x,
  y
) {
  if (
    !layer.image ||
    !layer.visible
  ) {
    return false;
  }


  const local =
    worldPointToImage(
      layer,
      x,
      y
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
      engine.layers.length - 1;

    i >= 0;

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


/* ---------------------------------------------------------
   CAJA / HANDLES
   --------------------------------------------------------- */

function selectionGeometry(layer) {
  if (
    !layer?.image
  ) {
    return null;
  }


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
        layer.scale
      )
    );


  return {
    tl:
      imagePointToWorld(
        layer,
        -halfW,
        -halfH
      ),

    tr:
      imagePointToWorld(
        layer,
        halfW,
        -halfH
      ),

    br:
      imagePointToWorld(
        layer,
        halfW,
        halfH
      ),

    bl:
      imagePointToWorld(
        layer,
        -halfW,
        halfH
      ),

    topCenter:
      imagePointToWorld(
        layer,
        0,
        topY
      ),

    rotate:
      imagePointToWorld(
        layer,
        0,
        topY +
        outward *
        rotateDistance
      ),

    pivot: {
      x:
        layer.x,

      y:
        layer.y
    }
  };
}


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
    a.x - b.x,
    a.y - b.y
  );
}


function selectedHandleAtPoint(
  point
) {
  const layer =
    engine.selected;


  if (
    !layer ||
    !layer.visible
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


  const radius =
    handleRadiusCanvas() *
    1.55;


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

      point:
        geometry.pivot
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

      point:
        geometry.rotate
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

        point:
          geometry[name]
      };
    }
  }


  return null;
}


/* ---------------------------------------------------------
   DIBUJAR SELECCIÓN
   --------------------------------------------------------- */

function drawSelectionOverlay() {
  const layer =
    engine.selected;


  if (
    !layer ||
    !layer.image ||
    !layer.visible
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


  const ctx =
    stage.getContext('2d');


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


  ctx.save();


  ctx.lineWidth =
    lineWidth;


  ctx.strokeStyle =
    'rgba(209,124,255,.95)';


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


  /*
   * Línea hacia rotación
   */

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


  /*
   * Tiradores escala
   */

  for (
    const name
    of [
      'tl',
      'tr',
      'br',
      'bl'
    ]
  ) {
    const handle =
      geometry[name];


    ctx.beginPath();

    ctx.rect(
      handle.x -
      radius,
      handle.y -
      radius,
      radius * 2,
      radius * 2
    );

    ctx.fill();

    ctx.stroke();
  }


  /*
   * Tirador rotación
   */

  ctx.beginPath();

  ctx.arc(
    geometry.rotate.x,
    geometry.rotate.y,
    radius * 1.05,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.stroke();


  /*
   * Pivote
   */

  ctx.strokeStyle =
    'rgba(255,111,207,.95)';


  ctx.beginPath();

  ctx.arc(
    geometry.pivot.x,
    geometry.pivot.y,
    radius * 1.15,
    0,
    Math.PI * 2
  );

  ctx.stroke();


  ctx.beginPath();

  ctx.moveTo(
    geometry.pivot.x -
    radius * 1.7,
    geometry.pivot.y
  );

  ctx.lineTo(
    geometry.pivot.x +
    radius * 1.7,
    geometry.pivot.y
  );


  ctx.moveTo(
    geometry.pivot.x,
    geometry.pivot.y -
    radius * 1.7
  );

  ctx.lineTo(
    geometry.pivot.x,
    geometry.pivot.y +
    radius * 1.7
  );

  ctx.stroke();


  ctx.restore();
}


/* ---------------------------------------------------------
   FINALIZAR EDICIÓN
   --------------------------------------------------------- */

function finishCanvasTransform() {
  const layer =
    engine.selected;


  if (!layer) {
    return;
  }


  layer.base =
    engine.snapshot(
      layer
    );


  syncInspector();

  renderLayers();

  queuePersist();
}


/* ---------------------------------------------------------
   POINTER DOWN
   --------------------------------------------------------- */

stage.addEventListener(
  'pointerdown',
  event => {
    if (
      event.button !== 0
    ) {
      return;
    }


    /*
     * Al editar directamente,
     * salimos del preview temporal.
     */

    animator.pause();

    timelinePreviewActive =
      false;

    engine.resetRuntime();

    engine.draw();

    drawSelectionOverlay();


    const point =
      pointerToCanvas(
        event
      );


    /*
     * Primero revisamos los
     * handles de la capa actual.
     */

    const handle =
      selectedHandleAtPoint(
        point
      );


    if (handle) {
      const layer =
        engine.selected;


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

          startRotation:
            layer.rotation,

          startAngle:
            Math.atan2(
              point.y -
              layer.y,

              point.x -
              layer.x
            )
        };

        return;
      }


      if (
        handle.type ===
        'scale'
      ) {
        const startDistance =
          Math.max(
            1,
            Math.hypot(
              point.x -
              layer.x,

              point.y -
              layer.y
            )
          );


        canvasInteraction = {
          type:
            'scale',

          layerId:
            layer.id,

          startScale:
            layer.scale,

          startDistance
        };

        return;
      }


      if (
        handle.type ===
        'pivot'
      ) {
        canvasInteraction = {
          type:
            'pivot',

          layerId:
            layer.id,

          startPivotX:
            layer.pivotX,

          startPivotY:
            layer.pivotY,

          startX:
            layer.x,

          startY:
            layer.y
        };

        return;
      }
    }


    /*
     * Buscar imagen bajo el cursor.
     */

    const hit =
      layerAtPoint(
        point.x,
        point.y
      );


    if (!hit) {
      engine.selectedId =
        null;

      renderLayers();

      syncInspector();

      renderTimelineLists();

      engine.draw();

      return;
    }


    if (
      engine.selectedId !==
      hit.id
    ) {
      selectLayer(
        hit.id
      );
    }


    const layer =
      engine.selected;


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

      startX:
        layer.x,

      startY:
        layer.y
    };
  }
);


/* ---------------------------------------------------------
   POINTER MOVE
   --------------------------------------------------------- */

stage.addEventListener(
  'pointermove',
  event => {
    const point =
      pointerToCanvas(
        event
      );


    /*
     * Solo actualizar cursor
     * cuando no estamos arrastrando.
     */

    if (!canvasInteraction) {
      const handle =
        selectedHandleAtPoint(
          point
        );


      if (handle) {
        if (
          handle.type ===
          'rotate'
        ) {
          stage.style.cursor =
            'crosshair';

        } else if (
          handle.type ===
          'scale'
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


    const layer =
      engine.layers.find(
        item =>
          item.id ===
          canvasInteraction.layerId
      );


    if (!layer) {
      return;
    }


    /* -------------------------
       MOVER
       ------------------------- */

    if (
      canvasInteraction.type ===
      'move'
    ) {
      layer.x =
        canvasInteraction.startX +
        (
          point.x -
          canvasInteraction
            .startPointer.x
        );


      layer.y =
        canvasInteraction.startY +
        (
          point.y -
          canvasInteraction
            .startPointer.y
        );
    }


    /* -------------------------
       ESCALA
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
            layer.x,

            point.y -
            layer.y
          )
        );


      const ratio =
        currentDistance /
        canvasInteraction
          .startDistance;


      layer.scale =
        clamp(
          canvasInteraction
            .startScale *
          ratio,
          0.02,
          20
        );
    }


    /* -------------------------
       ROTAR
       ------------------------- */

    else if (
      canvasInteraction.type ===
      'rotate'
    ) {
      const angle =
        Math.atan2(
          point.y -
          layer.y,

          point.x -
          layer.x
        );


      let degrees =
        (
          angle -
          canvasInteraction
            .startAngle
        ) *
        180 /
        Math.PI;


      /*
       * Shift = saltos de 15°.
       */

      if (event.shiftKey) {
        degrees =
          Math.round(
            degrees / 15
          ) * 15;
      }


      layer.rotation =
        canvasInteraction
          .startRotation +
        degrees;
    }


    /* -------------------------
       PIVOTE
       ------------------------- */

    else if (
      canvasInteraction.type ===
      'pivot'
    ) {
      /*
       * Calculamos dónde está
       * el cursor en coordenadas
       * locales de la imagen.
       */

      const local =
        worldPointToImage(
          layer,
          point.x,
          point.y
        );


      const oldPivotX =
        layer.pivotX;

      const oldPivotY =
        layer.pivotY;


      const newPivotX =
        local.x;

      const newPivotY =
        local.y;


      /*
       * Mover el pivote SIN
       * mover visualmente la imagen.
       */

      const deltaPivotX =
        newPivotX -
        oldPivotX;


      const deltaPivotY =
        newPivotY -
        oldPivotY;


      const scale =
        layer.scale;


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


      const localDX =
        deltaPivotX *
        sx;


      const localDY =
        deltaPivotY *
        sy;


      const angle =
        layer.rotation *
        Math.PI /
        180;


      const cos =
        Math.cos(angle);

      const sin =
        Math.sin(angle);


      layer.x +=
        localDX * cos -
        localDY * sin;


      layer.y +=
        localDX * sin +
        localDY * cos;


      layer.pivotX =
        newPivotX;

      layer.pivotY =
        newPivotY;
    }


    layer.base =
      engine.snapshot(
        layer
      );


    syncInspector();

    engine.resetRuntime();

    engine.draw();

    drawSelectionOverlay();

    queuePersist();
  }
);


/* ---------------------------------------------------------
   POINTER UP
   --------------------------------------------------------- */

function endCanvasInteraction() {
  if (!canvasInteraction) {
    return;
  }


  finishCanvasTransform();

  canvasInteraction =
    null;


  stage.style.cursor =
    'default';


  engine.draw();

  drawSelectionOverlay();
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
          await loadImage(
            src
          );


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

        drawSelectionOverlay();


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
        'mikatsune-project-v0.2.3.json';


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

        drawSelectionOverlay();


        await persistProject({
          broadcast: true
        });

      } catch (error) {
        console.error(error);

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


  q('#zoomValue')
    .textContent =
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


      runtimeURL.searchParams.set(
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


  q('#timelineTime')
    .textContent =
    `${animator.currentTime.toFixed(2)} s`;


  q('#timelinePlay')
    .textContent =
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
    'z-index:2'
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


    q('#timelineTime')
      .textContent =
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

      drawSelectionOverlay();


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
          'La capa necesita Grupo y Estado.'
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
          'No hay un keyframe suficientemente cerca.'
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


function setSplitterTool(tool) {
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
    layer.image.naturalWidth ||
    layer.image.width;


  const height =
    layer.image.naturalHeight ||
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


  splitter.sourceCtx.clearRect(
    0,
    0,
    width,
    height
  );


  splitter.sourceCtx.drawImage(
    layer.image,
    0,
    0,
    width,
    height
  );


  splitter.maskCtx.clearRect(
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
    `Capa fuente: ${layer.name}`;


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
      q('#maskOpacity').value
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
    splitter.lassoPoints.length >
      1
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


function canvasPoint(event) {
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
      q('#brushSize').value
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


  context.restore();
}


function fillLasso(points) {
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


  const mask =
    splitter.maskCtx
      .getImageData(
        0,
        0,
        width,
        height
      ).data;


  const source =
    splitter.sourceCtx
      .getImageData(
        0,
        0,
        width,
        height
      ).data;


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


  if (
    maxX < 0
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


function extractCanvas(
  bounds,
  removeFromOriginal =
    false
) {
  const source =
    splitter.sourceCtx
      .getImageData(
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h
      );


  const mask =
    splitter.maskCtx
      .getImageData(
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h
      );


  const output =
    document.createElement(
      'canvas'
    );


  output.width =
    bounds.w;


  output.height =
    bounds.h;


  const context =
    output.getContext('2d');


  const result =
    context.createImageData(
      bounds.w,
      bounds.h
    );


  for (
    let i = 0;
    i <
      source.data.length;
    i += 4
  ) {
    const alpha =
      mask.data[
        i + 3
      ] / 255;


    result.data[i] =
      source.data[i];


    result.data[
      i + 1
    ] =
      source.data[
        i + 1
      ];


    result.data[
      i + 2
    ] =
      source.data[
        i + 2
      ];


    result.data[
      i + 3
    ] =
      Math.round(
        source.data[
          i + 3
        ] *
        alpha
      );


    if (
      removeFromOriginal &&
      alpha > 0
    ) {
      source.data[
        i + 3
      ] =
        Math.round(
          source.data[
            i + 3
          ] *
          (
            1 -
            alpha
          )
        );
    }
  }


  context.putImageData(
    result,
    0,
    0
  );


  if (removeFromOriginal) {
    splitter.sourceCtx.putImageData(
      source,
      bounds.x,
      bounds.y
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


  const temp =
    extractCanvas(
      bounds,
      false
    );


  const padding =
    18;


  const scale =
    Math.min(
      (
        canvas.width -
        padding * 2
      ) /
      bounds.w,

      (
        canvas.height -
        padding * 2
      ) /
      bounds.h
    );


  const drawWidth =
    bounds.w *
    scale;


  const drawHeight =
    bounds.h *
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
    `Selección: ${bounds.w}×${bounds.h}px`;
}


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


  const bounds =
    maskBounds();


  if (!bounds) {
    alert(
      'Todavía no hay una selección.'
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


  const cropCanvas =
    extractCanvas(
      bounds,
      remove
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
        q('#splitRole').value,

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
      splitter.maskCtx.clearRect(
        0,
        0,
        splitter.maskCanvas.width,
        splitter.maskCanvas.height
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
        splitter.sourceCanvas.width;


      const height =
        splitter.sourceCanvas.height;


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


      splitter.maskCtx.putImageData(
        mask,
        0,
        0
      );


      renderSplitter();

      renderSplitPreview();
    }
  );


splitter.display
  .addEventListener(
    'pointerdown',
    event => {
      const point =
        canvasPoint(
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
      if (
        !splitter.painting
      ) {
        return;
      }


      const point =
        canvasPoint(
          event
        );


      if (
        splitter.tool ===
        'lasso'
      ) {
        splitter.lassoPoints
          .push(point);

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

      drawSelectionOverlay();


      await persistProject({
        broadcast: true
      });
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
      saved?.layers?.length
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


  renderLayers();

  syncInspector();

  syncTimelineUI();

  renderTimelineLists();

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
