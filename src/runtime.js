import { Engine } from './core.js';
import { Animator } from './animator.js';

import {
  loadCurrentProject,
  createProjectChannel
} from './bridge.js';


const stage =
  document.querySelector('#stage');


const engine =
  new Engine(stage);


const animator =
  new Animator(engine);


let channel = null;

let currentTime = 0;

let lastFrameTime = null;

let frameRequest = null;

let loadingProject = false;


/* =========================================================
   DURACIÓN
   ========================================================= */

function animationDuration() {

  return Math.max(
    0.1,

    Number(
      engine.animation?.duration
    ) || 10
  );
}


/* =========================================================
   REINICIAR CLOCK
   ========================================================= */

function resetRuntimeClock() {

  currentTime = 0;

  lastFrameTime = null;

  animator.currentTime = 0;

  animator.manualStates.clear();

  animator.resetOrganic();

  engine.resetRuntime();
}


/* =========================================================
   CARGAR PROYECTO
   ========================================================= */

async function loadProjectData(data) {

  if (
    loadingProject ||
    !data ||
    !Array.isArray(data.layers)
  ) {
    return false;
  }


  loadingProject = true;


  try {

    await engine.load(data);


    resetRuntimeClock();


    animator.evaluate(
      0,
      true,
      performance.now()
    );


    engine.draw();


    return true;

  } catch (error) {

    console.error(
      'No se pudo cargar el proyecto en runtime:',
      error
    );


    return false;

  } finally {

    loadingProject = false;
  }
}


/* =========================================================
   CARGAR PROYECTO DESDE URL
   ========================================================= */

async function loadFromProjectURL(
  projectURL
) {

  try {

    const response =
      await fetch(
        projectURL,
        {
          cache:
            'no-store'
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    return await loadProjectData(
      data
    );

  } catch (error) {

    console.error(
      'No se pudo cargar ?project=:',
      error
    );


    return false;
  }
}


/* =========================================================
   AVANZAR TIMELINE
   ========================================================= */

function advanceTimeline(delta) {

  const animation =
    engine.animation || {};


  const duration =
    animationDuration();


  const playTimeline =
    animation.playOnRuntime !==
    false;


  /*
   * Si Runtime está desactivado
   * para la Timeline,
   * conservamos igualmente
   * el movimiento orgánico.
   */

  if (!playTimeline) {

    currentTime = 0;

    animator.currentTime = 0;


    return -1;
  }


  currentTime +=
    delta;


  if (
    currentTime >
    duration
  ) {

    if (
      animation.loop !==
      false
    ) {

      currentTime =
        currentTime %
        duration;

    } else {

      currentTime =
        duration;
    }
  }


  animator.currentTime =
    currentTime;


  return currentTime;
}


/* =========================================================
   FRAME PRINCIPAL
   ========================================================= */

function frame(now) {

  if (
    lastFrameTime ===
    null
  ) {

    lastFrameTime =
      now;
  }


  const delta =
    Math.min(
      0.1,

      Math.max(
        0,

        (
          now -
          lastFrameTime
        ) / 1000
      )
    );


  lastFrameTime =
    now;


  if (!loadingProject) {

    const evaluationTime =
      advanceTimeline(
        delta
      );


    animator.evaluate(
      evaluationTime,
      true,
      now
    );


    engine.draw();
  }


  frameRequest =
    requestAnimationFrame(
      frame
    );
}


/* =========================================================
   ARRANQUE
   ========================================================= */

async function boot() {

  const url =
    new URL(
      location.href
    );


  const externalProject =
    url.searchParams.get(
      'project'
    );


  let loaded = false;


  /*
   * Proyecto externo
   */

  if (externalProject) {

    loaded =
      await loadFromProjectURL(
        externalProject
      );
  }


  /*
   * Proyecto actual del editor
   */

  if (!loaded) {

    try {

      loaded =
        await loadProjectData(
          await loadCurrentProject()
        );

    } catch (error) {

      console.error(
        'No se pudo leer el proyecto actual:',
        error
      );
    }
  }


  /* =======================================================
     SINCRONIZACIÓN EN VIVO
     ======================================================= */

  channel =
    createProjectChannel();


  if (channel) {

    channel.onmessage =
      async event => {

        if (
          event.data?.type !==
          'project'
        ) {
          return;
        }


        await loadProjectData(
          event.data.project
        );
      };
  }


  /*
   * Comenzar renderer
   */

  if (!frameRequest) {

    frameRequest =
      requestAnimationFrame(
        frame
      );
  }
}


/* =========================================================
   API MIKATSUNE
   Para eventos futuros:
   Streamlabs / Streamer.bot / OBS
   ========================================================= */

window.Mikatsune = {

  /*
   * Volver a leer el
   * proyecto del editor.
   */

  async reload() {

    return await loadProjectData(
      await loadCurrentProject()
    );
  },


  /*
   * Reiniciar la Timeline.
   */

  restart() {

    resetRuntimeClock();
  },


  /*
   * Cambiar estado manualmente.
   *
   * Ejemplo futuro:
   *
   * Mikatsune.activateState(
   *   'Ojos',
   *   'Cerrado'
   * );
   */

  activateState(
    group,
    state
  ) {

    animator.setGroupState(
      group,
      state
    );
  },


  /*
   * Liberar estado manual.
   */

  clearState(group) {

    animator.clearGroupState(
      group
    );
  },


  /*
   * Tiempo actual.
   */

  get time() {

    return currentTime;
  },


  /*
   * Proyecto actualmente
   * cargado.
   */

  get project() {

    return engine.serialize();
  }
};


/* =========================================================
   LIMPIEZA
   ========================================================= */

window.addEventListener(
  'beforeunload',
  () => {

    if (frameRequest) {

      cancelAnimationFrame(
        frameRequest
      );
    }


    channel?.close();
  }
);


/* =========================================================
   GO
   ========================================================= */

boot();
