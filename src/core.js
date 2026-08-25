export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });
}


export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);

    image.onerror = () =>
      reject(
        new Error(
          'No se pudo cargar la imagen.'
        )
      );

    image.src = src;
  });
}


/* =========================================================
   MOVIMIENTO ORGÁNICO
   ========================================================= */

function defaultOrganic(role = 'generic') {
  const isEar =
    role === 'earL' ||
    role === 'earR';

  return {
    enabled: isEar,

    minInterval: 2,

    maxInterval: 3.5,

    amount:
      isEar
        ? 2.2
        : 1.5,

    duration: 0.28,

    doubleChance: 0.28
  };
}


function normalizeOrganic(raw, role) {
  const base =
    defaultOrganic(role);

  return {
    enabled:
      raw?.enabled ??
      base.enabled,

    minInterval:
      Number(
        raw?.minInterval ??
        base.minInterval
      ),

    maxInterval:
      Number(
        raw?.maxInterval ??
        base.maxInterval
      ),

    amount:
      Number(
        raw?.amount ??
        base.amount
      ),

    duration:
      Number(
        raw?.duration ??
        base.duration
      ),

    doubleChance:
      Number(
        raw?.doubleChance ??
        base.doubleChance
      )
  };
}


/* =========================================================
   ANIMACIÓN
   ========================================================= */

function emptyAnimation() {
  return {
    duration: 10,

    loop: true,

    playOnRuntime: true,

    layerKeyframes: {},

    stateKeyframes: []
  };
}


/* =========================================================
   MOTOR
   ========================================================= */

export class Engine {

  constructor(canvas) {
    this.canvas =
      canvas;

    this.ctx =
      canvas.getContext(
        '2d'
      );

    this.layers = [];

    this.selectedId = null;

    this.animation =
      emptyAnimation();
  }


  /* -------------------------------------------------------
     CAPA SELECCIONADA
     ------------------------------------------------------- */

  get selected() {
    return (
      this.layers.find(
        layer =>
          layer.id ===
          this.selectedId
      ) ||
      null
    );
  }


  /* -------------------------------------------------------
     AÑADIR CAPA
     ------------------------------------------------------- */

  addLayer(options = {}) {
    const role =
      options.role ||
      'generic';


    const layer = {
      id:
        options.id ||
        crypto.randomUUID(),

      name:
        options.name ||
        'pieza',

      role,

      group:
        options.group ||
        '',

      state:
        options.state ||
        '',

      src:
        options.src,

      image:
        options.image,

      x:
        options.x ??
        540,

      y:
        options.y ??
        540,

      scale:
        options.scale ??
        1,

      rotation:
        options.rotation ??
        0,

      opacity:
        options.opacity ??
        1,

      pivotX:
        options.pivotX ??
        0,

      pivotY:
        options.pivotY ??
        0,

      /*
       * Volteo NO destructivo.
       *
       * No modifica el PNG.
       * Cada capa mantiene sus
       * propios valores.
       */

      flipX:
        options.flipX ??
        false,

      flipY:
        options.flipY ??
        false,

      visible:
        options.visible ??
        true,

      organic:
        normalizeOrganic(
          options.organic,
          role
        ),

      runtime: {},

      _organicRuntime: null
    };


    layer.base =
      this.snapshot(layer);


    this.layers.push(layer);

    this.selectedId =
      layer.id;


    return layer;
  }


  /* -------------------------------------------------------
     SNAPSHOT
     ------------------------------------------------------- */

  snapshot(layer) {
    return {
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

      flipX:
        Boolean(
          layer.flipX
        ),

      flipY:
        Boolean(
          layer.flipY
        ),

      visible:
        layer.visible
    };
  }


  /* -------------------------------------------------------
     RESET TEMPORAL
     ------------------------------------------------------- */

  resetRuntime() {
    for (
      const layer
      of this.layers
    ) {
      layer.runtime = {};
    }
  }


  /* -------------------------------------------------------
     DIBUJAR
     ------------------------------------------------------- */

  draw() {
    const ctx =
      this.ctx;


    ctx.clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );


    for (
      const layer
      of this.layers
    ) {
      if (!layer.image) {
        continue;
      }


      const runtime =
        layer.runtime ||
        {};


      const visible =
        runtime.visible ??
        layer.visible;


      if (!visible) {
        continue;
      }


      const x =
        runtime.x ??
        layer.x;


      const y =
        runtime.y ??
        layer.y;


      const scale =
        runtime.scale ??
        layer.scale;


      const rotation =
        runtime.rotation ??
        layer.rotation;


      const opacity =
        runtime.opacity ??
        layer.opacity;


      const pivotX =
        runtime.pivotX ??
        layer.pivotX;


      const pivotY =
        runtime.pivotY ??
        layer.pivotY;


      const flipX =
        runtime.flipX ??
        layer.flipX ??
        false;


      const flipY =
        runtime.flipY ??
        layer.flipY ??
        false;


      const scaleX =
        scale *
        (
          flipX
            ? -1
            : 1
        );


      const scaleY =
        scale *
        (
          flipY
            ? -1
            : 1
        );


      ctx.save();


      ctx.globalAlpha =
        opacity;


      /*
       * El punto X/Y representa
       * la posición mundial
       * del pivote.
       */

      ctx.translate(
        x,
        y
      );


      ctx.rotate(
        rotation *
        Math.PI /
        180
      );


      /*
       * El volteo se aplica
       * únicamente durante
       * el render.
       *
       * El PNG original NO cambia.
       */

      ctx.scale(
        scaleX,
        scaleY
      );


      ctx.translate(
        -pivotX,
        -pivotY
      );


      ctx.drawImage(
        layer.image,

        -layer.image.width / 2,

        -layer.image.height / 2
      );


      ctx.restore();
    }
  }


  /* -------------------------------------------------------
     GUARDAR PROYECTO
     ------------------------------------------------------- */

  serialize() {
    return {
      version:
        '0.2.3',

      layers:
        this.layers.map(
          layer => ({
            id:
              layer.id,

            name:
              layer.name,

            role:
              layer.role,

            group:
              layer.group ||
              '',

            state:
              layer.state ||
              '',

            src:
              layer.src,

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

            /*
             * IMPORTANTE:
             * cada duplicado guarda
             * su propio volteo.
             */

            flipX:
              Boolean(
                layer.flipX
              ),

            flipY:
              Boolean(
                layer.flipY
              ),

            visible:
              layer.visible,

            organic: {
              ...layer.organic
            }
          })
        ),

      animation:
        JSON.parse(
          JSON.stringify(
            this.animation
          )
        )
    };
  }


  /* -------------------------------------------------------
     ABRIR PROYECTO
     ------------------------------------------------------- */

  async load(data) {
    this.layers = [];


    for (
      const raw
      of data?.layers ||
      []
    ) {
      if (!raw?.src) {
        continue;
      }


      const image =
        await loadImage(
          raw.src
        );


      const layer =
        this.addLayer({
          ...raw,

          /*
           * Compatibilidad con
           * proyectos anteriores.
           */

          flipX:
            raw.flipX ??
            false,

          flipY:
            raw.flipY ??
            false,

          image
        });


      layer.id =
        raw.id ||
        layer.id;


      layer.base =
        this.snapshot(
          layer
        );
    }


    this.animation = {
      ...emptyAnimation(),

      ...(
        data?.animation ||
        {}
      )
    };


    this.animation.layerKeyframes =
      this.animation
        .layerKeyframes ||
      {};


    this.animation.stateKeyframes =
      Array.isArray(
        this.animation
          .stateKeyframes
      )
        ? this.animation
            .stateKeyframes
        : [];


    this.selectedId =
      this.layers
        .at(-1)?.id ||
      null;
  }
}
