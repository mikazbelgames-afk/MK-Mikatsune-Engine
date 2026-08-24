# MK Mikatsune Engine v0.2 — Runtime Bridge

Esta actualización corrige el puente entre el editor y `runtime.html`.

## Qué cambia

- El botón **Abrir runtime transparente** guarda primero el proyecto actual.
- El proyecto se comparte mediante **IndexedDB** (evita depender de URLs gigantes).
- `runtime.html` carga automáticamente el último proyecto del editor.
- Si editor y runtime están abiertos al mismo tiempo, los cambios se sincronizan mediante **BroadcastChannel**.
- Se mantiene compatibilidad con `runtime.html?project=URL_DEL_JSON`.

## Archivos que debes reemplazar/subir

- `index.html`
- `runtime.html`
- `src/editor.js`
- `src/runtime.js`

## Archivo nuevo

- `src/bridge.js`

No es necesario modificar `core.js`, `animator.js` ni `style.css`.

## Prueba rápida

1. Abre el editor.
2. Carga un PNG.
3. Pulsa **Abrir runtime transparente**.
4. La nueva pestaña debe mostrar la misma pieza sobre fondo transparente.
