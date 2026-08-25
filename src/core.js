export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(reader.result);

    reader.onerror = () =>
      reject(reader.error);

    reader.readAsDataURL(file);
  });
}


export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () =>
      resolve(image);

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
   UTILIDADES
   ========================================================= */

function clonePlain(value) {
  if (
    value == null
  ) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(value)
  );
}


/* =========================================================
   ROOT PRINCIPAL
   ========================================================= */

/*
 * Mikatsune Root
 *
 * Es el padre global del personaje.
 *
 * IMPORTANTE:
 * Los valores iniciales forman una
 * transformación identidad.
 *
 * x/y y pivotX/pivotY están en el
 * centro del canvas, así que:
 *
 * escala 1
 * rotación 0
 *
 * = visualmente no cambia nada.
 */

function defaultRoot(
  canvasWidth = 1080,
  canvasHeight = 1080
) {
  const centerX =
    canvasWidth / 2;

  const centerY =
    canvasHeight / 2;

  return {
    id:
      'mikatsune-root',

    name:
      'Mikatsune Root',

    x:
      centerX,

    y:
      centerY,

    scale:
      1,

    rotation:
      0,

    opacity:
      1,

    pivotX:
      centerX,

    pivotY:
      centerY,

    visible:
      true,

    runtime:
      {},

    base:
      {
        x:
          centerX,

        y:
          centerY,

        scale:
          1,

        rotation:
          0,

        opacity:
          1,

        pivotX:
          centerX,

        pivotY:
          centerY,

        visible:
          true
      }
  };
}


function normalizeRoot(
  raw,
  canvasWidth = 1080,
  canvasHeight = 1080
) {
  const base =
    defaultRoot(
      canvasWidth,
      canvasHeight
    );

  const root = {
    id:
      'mikatsune-root',

    name:
      raw?.name ||
      'Mikatsune Root',

    x:
      Number(
        raw?.x ??
        base.x
      ),

    y:
      Number(
        raw?.y ??
        base.y
      ),

    scale:
      Number(
        raw?.scale ??
        base.scale
      ),

    rotation:
      Number(
        raw?.rotation ??
        base.rotation
      ),

    opacity:
      Number(
        raw?.opacity ??
        base.opacity
      ),

    pivotX:
      Number(
        raw?.pivotX ??
        base.pivotX
      ),

    pivotY:
      Number(
        raw?.pivotY ??
        base.pivotY
      ),

    visible:
      raw?.visible ??
      true,

    runtime:
      {},

    base:
      {}
  };


  root.base = {
    x:
      root.x,

    y:
      root.y,

    scale:
      root.scale,

    rotation:
      root.rotation,

    opacity:
      root.opacity,

    pivotX:
      root.pivotX,

    pivotY:
      root.pivotY,

    visible:
      root.visible
  };


  return root;
}


/* =========================================================
   MOVIMIENTO ORGÁNICO
   ========================================================= */

function defaultOrganic(
  role = 'generic'
) {
  const isEar =
    role === 'earL' ||
    role === 'earR';

  return {
    enabled:
      isEar,

    minInterval:
      2,

    maxInterval:
      3.5,

    amount:
      isEar
        ? 2.2
        : 1.5,

    duration:
      0.28,

    doubleChance:
      0.28
  };
}


function normalizeOrganic(
  raw,
  role
) {
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
    duration:
      10,

    loop:
      true,

    playOnRuntime:
      true,

    layerKeyframes:
      {},

    stateKeyframes:
      [],

    /*
     * Reservado desde ahora
     * para la futura animación
     * del Mikatsune Root.
     */
    rootKeyframes:
      []
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

    /*
     * Padre global permanente.
     */
    this.root =
      defaultRoot(
        canvas.width,
        canvas.height
      );

    this.layers =
      [];

    this.selectedId =
      null;

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
     ROOT
     ------------------------------------------------------- */

  getRootPose() {
    const runtime =
      this.root.runtime ||
      {};

    return {
      x:
        runtime.x ??
        this.root.x,

      y:
        runtime.y ??
        this.root.y,

      scale:
        runtime.scale ??
        this.root.scale,

      rotation:
        runtime.rotation ??
        this.root.rotation,

      opacity:
        runtime.opacity ??
        this.root.opacity,

      pivotX:
        runtime.pivotX ??
        this.root.pivotX,

      pivotY:
        runtime.pivotY ??
        this.root.pivotY,

      visible:
        runtime.visible ??
        this.root.visible
    };
  }


  snapshotRoot() {
    return {
      x:
        this.root.x,

      y:
        this.root.y,

      scale:
        this.root.scale,

      rotation:
        this.root.rotation,

      opacity:
        this.root.opacity,

      pivotX:
        this.root.pivotX,

      pivotY:
        this.root.pivotY,

      visible:
        this.root.visible
    };
  }


  resetRoot() {
    this.root =
      defaultRoot(
        this.canvas.width,
        this.canvas.height
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

      breathing:
        clonePlain(
          options.breathing
        ),

      runtime:
        {},

      _organicRuntime:
        null
    };


    layer.base =
      this.snapshot(
        layer
      );


    this.layers.push(
      layer
    );


    this.selectedId =
      layer.id;


    return layer;
  }


  /* -------------------------------------------------------
     SNAPSHOT CAPA
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
    /*
     * Limpiar también el runtime
     * del Root.
     */
    this.root.runtime =
      {};


    for (
      const layer
      of this.layers
    ) {
      layer.runtime =
        {};
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


    /*
     * =====================================================
     * ROOT PRINCIPAL
     * =====================================================
     *
     * Todo lo dibujado después hereda:
     *
     * posición
     * escala
     * rotación
     * opacidad
     *
     * del Mikatsune Root.
     */

    const root =
      this.getRootPose();


    if (
      root.visible ===
      false
    ) {
      return;
    }


    ctx.save();


    ctx.globalAlpha =
      root.opacity;


    ctx.translate(
      root.x,
      root.y
    );


    ctx.rotate(
      root.rotation *
      Math.PI /
      180
    );


    ctx.scale(
      root.scale,
      root.scale
    );


    ctx.translate(
      -root.pivotX,
      -root.pivotY
    );


    /*
     * =====================================================
     * CAPAS HIJAS
     * =====================================================
     */

    for (
      const layer
      of this.layers
    ) {
      if (
        !layer.image
      ) {
        continue;
      }


      const runtime =
        layer.runtime ||
        {};


      const visible =
        runtime.visible ??
        layer.visible;


      if (
        !visible
      ) {
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


      /*
       * La opacidad de la capa se
       * multiplica por la del Root.
       */
      ctx.globalAlpha =
        root.opacity *
        opacity;


      ctx.translate(
        x,
        y
      );


      ctx.rotate(
        rotation *
        Math.PI /
        180
      );


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


    /*
     * Cerrar transformación Root.
     */
    ctx.restore();
  }


  /* -------------------------------------------------------
     GUARDAR PROYECTO
     ------------------------------------------------------- */

  serialize() {
    return {
      version:
        '0.2.6',

      /*
       * Guardamos el Root como
       * parte permanente del proyecto.
       */
      root: {
        id:
          'mikatsune-root',

        name:
          this.root.name ||
          'Mikatsune Root',

        x:
          this.root.x,

        y:
          this.root.y,

        scale:
          this.root.scale,

        rotation:
          this.root.rotation,

        opacity:
          this.root.opacity,

        pivotX:
          this.root.pivotX,

        pivotY:
          this.root.pivotY,

        visible:
          this.root.visible
      },

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

            organic:
              clonePlain(
                layer.organic
              ),

            breathing:
              clonePlain(
                layer.breathing
              )
          })
        ),

      animation:
        clonePlain(
          this.animation
        )
    };
  }


  /* -------------------------------------------------------
     ABRIR PROYECTO
     ------------------------------------------------------- */

  async load(data) {
    this.layers =
      [];


    /*
     * Proyectos antiguos no tienen
     * root.
     *
     * En ese caso usamos identidad,
     * así que siguen cargando igual.
     */
    this.root =
      normalizeRoot(
        data?.root,
        this.canvas.width,
        this.canvas.height
      );


    for (
      const raw
      of data?.layers ||
      []
    ) {
      if (
        !raw?.src
      ) {
        continue;
      }


      const image =
        await loadImage(
          raw.src
        );


      const layer =
        this.addLayer({
          ...raw,

          flipX:
            raw.flipX ??
            false,

          flipY:
            raw.flipY ??
            false,

          breathing:
            clonePlain(
              raw.breathing
            ),

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


    this.animation
      .layerKeyframes =
      this.animation
        .layerKeyframes ||
      {};


    this.animation
      .stateKeyframes =
      Array.isArray(
        this.animation
          .stateKeyframes
      )
        ? this.animation
            .stateKeyframes
        : [];


    this.animation
      .rootKeyframes =
      Array.isArray(
        this.animation
          .rootKeyframes
      )
        ? this.animation
            .rootKeyframes
        : [];


    this.selectedId =
      this.layers
        .at(-1)?.id ||
      null;
  }
}
