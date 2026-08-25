/* =========================================================
   MK MIKATSUNE ENGINE
   Animation Core v0.2.2
   =========================================================

   Soporta:

   - Timeline
   - Keyframes de transformación
   - Interpolación suave
   - Keyframes de visibilidad
   - Grupo / Estado
   - Cambio de PNG por estados
   - Loop
   - Scrubbing
   - Movimiento orgánico
   - Intervalos aleatorios
   - Tics simples y dobles
   ========================================================= */


const clamp = (value, min, max) =>
  Math.max(
    min,
    Math.min(max, value)
  );


const lerp = (a, b, t) =>
  a + (b - a) * t;


const randomRange = (min, max) =>
  min + Math.random() * (max - min);


/* =========================================================
   EASING
   Movimiento suave entre fotogramas
   ========================================================= */

function smoothstep(t) {

  t = clamp(t, 0, 1);

  return (
    t *
    t *
    (3 - 2 * t)
  );
}


/* =========================================================
   NORMALIZAR KEYFRAME
   ========================================================= */

function normalizeKeyframe(raw = {}) {

  return {

    id:
      raw.id ||
      crypto.randomUUID(),

    time:
      Number(
        raw.time ?? 0
      ),

    x:
      raw.x,

    y:
      raw.y,

    scale:
      raw.scale,

    rotation:
      raw.rotation,

    opacity:
      raw.opacity,

    pivotX:
      raw.pivotX,

    pivotY:
      raw.pivotY,

    visible:
      raw.visible
  };
}


/* =========================================================
   NORMALIZAR KEYFRAME DE ESTADO
   ========================================================= */

function normalizeStateKeyframe(raw = {}) {

  return {

    id:
      raw.id ||
      crypto.randomUUID(),

    time:
      Number(
        raw.time ?? 0
      ),

    group:
      raw.group || '',

    state:
      raw.state || ''
  };
}


/* =========================================================
   ANIMATOR
   ========================================================= */

export class Animator {

  constructor(engine) {

    this.engine = engine;

    this.playing = false;

    this.currentTime = 0;

    this.lastFrameTime = null;

    this.animationFrame = null;

    this.onTimeChange = null;

    this.onPlayChange = null;

    this.manualStates =
      new Map();

    this._boundLoop =
      this._loop.bind(this);
  }


  /* =======================================================
     CONFIGURACIÓN GENERAL
     ======================================================= */

  get animation() {

    return this.engine.animation;
  }


  get duration() {

    return Math.max(
      0.1,
      Number(
        this.animation.duration || 10
      )
    );
  }


  setDuration(value) {

    const duration =
      clamp(
        Number(value) || 10,
        0.1,
        120
      );

    this.animation.duration =
      duration;


    if (
      this.currentTime >
      duration
    ) {

      this.currentTime =
        duration;
    }


    this.evaluate(
      this.currentTime,
      false
    );
  }


  setLoop(value) {

    this.animation.loop =
      Boolean(value);
  }


  /* =======================================================
     PLAY
     ======================================================= */

  play() {

    if (
      this.playing
    ) {
      return;
    }


    this.playing = true;

    this.lastFrameTime =
      performance.now();


    this.resetOrganic();


    this.animationFrame =
      requestAnimationFrame(
        this._boundLoop
      );


    this.onPlayChange?.(
      true
    );
  }


  /* =======================================================
     PAUSA
     ======================================================= */

  pause() {

    if (
      !this.playing
    ) {
      return;
    }


    this.playing =
      false;


    if (
      this.animationFrame
    ) {

      cancelAnimationFrame(
        this.animationFrame
      );
    }


    this.animationFrame =
      null;

    this.lastFrameTime =
      null;


    this.onPlayChange?.(
      false
    );
  }


  /* =======================================================
     STOP
     ======================================================= */

  stop() {

    this.pause();

    this.currentTime = 0;

    this.resetOrganic();

    this.evaluate(
      0,
      false
    );


    this.engine.draw();


    this.onTimeChange?.(
      this.currentTime
    );
  }


  /* =======================================================
     SEEK
     ======================================================= */

  seek(time) {

    this.currentTime =
      clamp(
        Number(time) || 0,
        0,
        this.duration
      );


    this.evaluate(
      this.currentTime,
      false
    );


    this.engine.draw();


    this.onTimeChange?.(
      this.currentTime
    );
  }


  /* =======================================================
     LOOP INTERNO
     ======================================================= */

  _loop(now) {

    if (
      !this.playing
    ) {
      return;
    }


    const delta =
      Math.min(
        0.1,
        (
          now -
          this.lastFrameTime
        ) / 1000
      );


    this.lastFrameTime =
      now;


    this.currentTime +=
      delta;


    if (
      this.currentTime >
      this.duration
    ) {

      if (
        this.animation.loop
      ) {

        this.currentTime =
          this.currentTime %
          this.duration;

      } else {

        this.currentTime =
          this.duration;

        this.pause();
      }
    }


    this.evaluate(
      this.currentTime,
      true,
      now
    );


    this.engine.draw();


    this.onTimeChange?.(
      this.currentTime
    );


    if (
      this.playing
    ) {

      this.animationFrame =
        requestAnimationFrame(
          this._boundLoop
        );
    }
  }


  /* =======================================================
     EVALUAR ANIMACIÓN
     ======================================================= */

  evaluate(
    time,
    organic = false,
    now = performance.now()
  ) {

    this.engine.resetRuntime();


    this.applyLayerKeyframes(
      time
    );


    this.applyStateKeyframes(
      time
    );


    this.applyManualStates();


    if (
      organic
    ) {

      this.applyOrganic(
        now
      );
    }
  }


  /* =======================================================
     KEYFRAMES DE CAPA
     ======================================================= */

  getLayerKeyframes(layerId) {

    const store =
      this.animation
        .layerKeyframes ||
      (
        this.animation
          .layerKeyframes = {}
      );


    const list =
      store[layerId] ||
      (
        store[layerId] = []
      );


    return list;
  }


  addLayerKeyframe(
    layer,
    time = this.currentTime
  ) {

    if (
      !layer
    ) {
      return null;
    }


    const list =
      this.getLayerKeyframes(
        layer.id
      );


    const keyframe =
      normalizeKeyframe({

        time,

        x:
          layer.x,

        y:
          layer.y,

        scale:
          layer.scale,

        rotation:
          layer.rotation,

        opacity:
          layer.opacity,

        pivotX:
          layer.pivotX,

        pivotY:
          layer.pivotY,

        visible:
          layer.visible
      });


    /*
     * Si ya existe un keyframe
     * prácticamente en el mismo
     * tiempo, lo reemplazamos.
     */

    const existingIndex =
      list.findIndex(
        item =>
          Math.abs(
            item.time -
            keyframe.time
          ) < 0.015
      );


    if (
      existingIndex >= 0
    ) {

      keyframe.id =
        list[
          existingIndex
        ].id;


      list[
        existingIndex
      ] =
        keyframe;

    } else {

      list.push(
        keyframe
      );
    }


    list.sort(
      (a, b) =>
        a.time - b.time
    );


    return keyframe;
  }


  removeNearestLayerKeyframe(
    layerId,
    time = this.currentTime,
    tolerance = 0.25
  ) {

    const list =
      this.getLayerKeyframes(
        layerId
      );


    if (
      !list.length
    ) {
      return false;
    }


    let bestIndex = -1;

    let bestDistance =
      Infinity;


    list.forEach(
      (keyframe, index) => {

        const distance =
          Math.abs(
            keyframe.time -
            time
          );


        if (
          distance <
          bestDistance
        ) {

          bestDistance =
            distance;

          bestIndex =
            index;
        }
      }
    );


    if (
      bestIndex < 0 ||
      bestDistance >
      tolerance
    ) {

      return false;
    }


    list.splice(
      bestIndex,
      1
    );


    return true;
  }


  applyLayerKeyframes(time) {

    for (
      const layer
      of this.engine.layers
    ) {

      const list =
        this.getLayerKeyframes(
          layer.id
        );


      if (
        !list.length
      ) {
        continue;
      }


      const sorted =
        [...list]
          .map(
            normalizeKeyframe
          )
          .sort(
            (a, b) =>
              a.time - b.time
          );


      /*
       * Antes del primer keyframe:
       * mantenemos la transformación
       * original de la capa.
       */

      if (
        time <
        sorted[0].time
      ) {
        continue;
      }


      /*
       * Después del último:
       * mantener último estado.
       */

      if (
        time >=
        sorted[
          sorted.length - 1
        ].time
      ) {

        this.applyKeyframeValues(
          layer,
          sorted[
            sorted.length - 1
          ]
        );

        continue;
      }


      let left = null;

      let right = null;


      for (
        let i = 0;
        i <
        sorted.length - 1;
        i++
      ) {

        if (
          time >=
          sorted[i].time &&
          time <=
          sorted[i + 1].time
        ) {

          left =
            sorted[i];

          right =
            sorted[i + 1];

          break;
        }
      }


      if (
        !left ||
        !right
      ) {
        continue;
      }


      const span =
        Math.max(
          0.0001,
          right.time -
          left.time
        );


      let t =
        (
          time -
          left.time
        ) /
        span;


      t =
        smoothstep(t);


      const runtime =
        layer.runtime;


      runtime.x =
        this.interpolateValue(
          left.x,
          right.x,
          layer.x,
          t
        );


      runtime.y =
        this.interpolateValue(
          left.y,
          right.y,
          layer.y,
          t
        );


      runtime.scale =
        this.interpolateValue(
          left.scale,
          right.scale,
          layer.scale,
          t
        );


      runtime.rotation =
        this.interpolateValue(
          left.rotation,
          right.rotation,
          layer.rotation,
          t
        );


      runtime.opacity =
        this.interpolateValue(
          left.opacity,
          right.opacity,
          layer.opacity,
          t
        );


      /*
       * Pivote:
       * también se puede animar.
       */

      if (
        left.pivotX !== undefined ||
        right.pivotX !== undefined
      ) {

        runtime.pivotX =
          this.interpolateValue(
            left.pivotX,
            right.pivotX,
            layer.pivotX,
            t
          );
      }


      if (
        left.pivotY !== undefined ||
        right.pivotY !== undefined
      ) {

        runtime.pivotY =
          this.interpolateValue(
            left.pivotY,
            right.pivotY,
            layer.pivotY,
            t
          );
      }


      /*
       * Visible no se interpola.
       * Es un cambio instantáneo.
       */

      runtime.visible =
        left.visible !== undefined
          ? left.visible
          : layer.visible;
    }
  }


  interpolateValue(
    a,
    b,
    fallback,
    t
  ) {

    const start =
      a !== undefined
        ? Number(a)
        : Number(fallback);


    const end =
      b !== undefined
        ? Number(b)
        : start;


    return lerp(
      start,
      end,
      t
    );
  }


  applyKeyframeValues(
    layer,
    keyframe
  ) {

    const runtime =
      layer.runtime;


    if (
      keyframe.x !== undefined
    ) {
      runtime.x =
        Number(keyframe.x);
    }


    if (
      keyframe.y !== undefined
    ) {
      runtime.y =
        Number(keyframe.y);
    }


    if (
      keyframe.scale !== undefined
    ) {
      runtime.scale =
        Number(
          keyframe.scale
        );
    }


    if (
      keyframe.rotation !== undefined
    ) {
      runtime.rotation =
        Number(
          keyframe.rotation
        );
    }


    if (
      keyframe.opacity !== undefined
    ) {
      runtime.opacity =
        Number(
          keyframe.opacity
        );
    }


    if (
      keyframe.visible !== undefined
    ) {
      runtime.visible =
        Boolean(
          keyframe.visible
        );
    }
  }


  /* =======================================================
     ESTADOS
     Ej:
       Grupo: Ojos
       Estado: Abierto
       Estado: Cerrado
     ======================================================= */

  addStateKeyframe(
    group,
    state,
    time = this.currentTime
  ) {

    group =
      String(
        group || ''
      ).trim();


    state =
      String(
        state || ''
      ).trim();


    if (
      !group ||
      !state
    ) {

      return null;
    }


    const list =
      this.animation
        .stateKeyframes ||
      (
        this.animation
          .stateKeyframes = []
      );


    const keyframe =
      normalizeStateKeyframe({

        time,

        group,

        state
      });


    /*
     * Un grupo solo puede tener
     * un estado en el mismo instante.
     */

    const existingIndex =
      list.findIndex(
        item =>
          item.group === group &&
          Math.abs(
            item.time -
            time
          ) < 0.015
      );


    if (
      existingIndex >= 0
    ) {

      keyframe.id =
        list[
          existingIndex
        ].id;


      list[
        existingIndex
      ] =
        keyframe;

    } else {

      list.push(
        keyframe
      );
    }


    list.sort(
      (a, b) =>
        a.time - b.time
    );


    return keyframe;
  }


  removeNearestStateKeyframe(
    time = this.currentTime,
    tolerance = 0.25
  ) {

    const list =
      this.animation
        .stateKeyframes ||
      [];


    if (
      !list.length
    ) {
      return false;
    }


    let index = -1;

    let distance =
      Infinity;


    list.forEach(
      (item, i) => {

        const current =
          Math.abs(
            item.time -
            time
          );


        if (
          current <
          distance
        ) {

          distance =
            current;

          index = i;
        }
      }
    );


    if (
      index < 0 ||
      distance >
      tolerance
    ) {

      return false;
    }


    list.splice(
      index,
      1
    );


    return true;
  }


  applyStateKeyframes(time) {

    const keyframes =
      (
        this.animation
          .stateKeyframes ||
        []
      )
        .map(
          normalizeStateKeyframe
        )
        .sort(
          (a, b) =>
            a.time - b.time
        );


    const activeStates =
      new Map();


    for (
      const keyframe
      of keyframes
    ) {

      if (
        keyframe.time >
        time
      ) {
        break;
      }


      if (
        keyframe.group &&
        keyframe.state
      ) {

        activeStates.set(
          keyframe.group,
          keyframe.state
        );
      }
    }


    for (
      const [
        group,
        state
      ]
      of activeStates
    ) {

      this.applyGroupState(
        group,
        state
      );
    }
  }


  /* =======================================================
     ACTIVAR ESTADO MANUAL
     ======================================================= */

  setGroupState(
    group,
    state
  ) {

    group =
      String(
        group || ''
      ).trim();


    state =
      String(
        state || ''
      ).trim();


    if (
      !group ||
      !state
    ) {
      return;
    }


    this.manualStates.set(
      group,
      state
    );


    this.evaluate(
      this.currentTime,
      false
    );


    this.engine.draw();
  }


  clearGroupState(group) {

    this.manualStates.delete(
      group
    );


    this.evaluate(
      this.currentTime,
      false
    );


    this.engine.draw();
  }


  applyManualStates() {

    for (
      const [
        group,
        state
      ]
      of this.manualStates
    ) {

      this.applyGroupState(
        group,
        state
      );
    }
  }


  applyGroupState(
    group,
    state
  ) {

    for (
      const layer
      of this.engine.layers
    ) {

      if (
        layer.group !==
        group
      ) {
        continue;
      }


      if (
        !layer.state
      ) {
        continue;
      }


      layer.runtime.visible =
        layer.state === state;
    }
  }


  /* =======================================================
     MOVIMIENTO ORGÁNICO
     ======================================================= */

  resetOrganic() {

    for (
      const layer
      of this.engine.layers
    ) {

      layer._organicRuntime =
        null;
    }
  }


  initializeOrganic(
    layer,
    now
  ) {

    const config =
      layer.organic;


    const min =
      Math.max(
        0.1,
        Number(
          config.minInterval ||
          2
        )
      );


    const max =
      Math.max(
        min,
        Number(
          config.maxInterval ||
          min
        )
      );


    layer._organicRuntime = {

      active:
        false,

      start:
        0,

      direction:
        Math.random() <
        0.5
          ? -1
          : 1,

      double:
        false,

      next:
        now +
        randomRange(
          min,
          max
        ) *
        1000
    };
  }


  scheduleNextOrganic(
    layer,
    now
  ) {

    const config =
      layer.organic;


    const min =
      Math.max(
        0.1,
        Number(
          config.minInterval ||
          2
        )
      );


    const max =
      Math.max(
        min,
        Number(
          config.maxInterval ||
          min
        )
      );


    const runtime =
      layer._organicRuntime;


    runtime.next =
      now +
      randomRange(
        min,
        max
      ) *
      1000;


    runtime.active =
      false;
  }


  applyOrganic(now) {

    for (
      const layer
      of this.engine.layers
    ) {

      const config =
        layer.organic;


      if (
        !config?.enabled
      ) {
        continue;
      }


      if (
        !layer._organicRuntime
      ) {

        this.initializeOrganic(
          layer,
          now
        );
      }


      const organic =
        layer._organicRuntime;


      /*
       * Esperando el próximo
       * movimiento.
       */

      if (
        !organic.active &&
        now >= organic.next
      ) {

        organic.active =
          true;

        organic.start =
          now;

        organic.direction =
          Math.random() <
          0.5
            ? -1
            : 1;


        organic.double =
          Math.random() <
          clamp(
            Number(
              config.doubleChance ??
              0
            ),
            0,
            1
          );
      }


      if (
        !organic.active
      ) {
        continue;
      }


      const duration =
        Math.max(
          0.08,
          Number(
            config.duration ||
            0.2
          )
        ) *
        1000;


      const elapsed =
        now -
        organic.start;


      const progress =
        elapsed /
        duration;


      /*
       * Terminó el tic.
       */

      if (
        progress >= 1
      ) {

        this.scheduleNextOrganic(
          layer,
          now
        );

        continue;
      }


      const amount =
        Number(
          config.amount ||
          0
        );


      let wave;


      if (
        organic.double
      ) {

        /*
         * Dos pequeños impulsos.
         */

        wave =
          Math.sin(
            progress *
            Math.PI *
            2
          );

      } else {

        /*
         * Un movimiento suave
         * que vuelve al origen.
         */

        wave =
          Math.sin(
            progress *
            Math.PI
          );
      }


      /*
       * Suavizar entrada/salida
       */

      const envelope =
        Math.sin(
          progress *
          Math.PI
        );


      const offset =
        amount *
        organic.direction *
        wave *
        envelope;


      const baseRotation =
        layer.runtime.rotation ??
        layer.rotation;


      layer.runtime.rotation =
        baseRotation +
        offset;
    }
  }


  /* =======================================================
     UTILIDADES
     ======================================================= */

  getKeyframesForSelectedLayer() {

    const layer =
      this.engine.selected;


    if (
      !layer
    ) {
      return [];
    }


    return this.getLayerKeyframes(
      layer.id
    );
  }


  getStateKeyframes() {

    return (
      this.animation
        .stateKeyframes ||
      []
    );
  }


  /* =======================================================
     RESET COMPLETO DE ANIMACIÓN
     No elimina capas.
     ======================================================= */

  clearAnimation() {

    this.pause();


    this.engine.animation = {

      duration: 10,

      loop: true,

      playOnRuntime: true,

      layerKeyframes: {},

      stateKeyframes: []
    };


    this.currentTime = 0;

    this.manualStates.clear();

    this.resetOrganic();


    this.engine.resetRuntime();

    this.engine.draw();


    this.onTimeChange?.(
      0
    );
  }
}
