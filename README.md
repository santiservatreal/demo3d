# Atlas · CRM City

Prototipo interactivo de un CRM representado como una ciudad 3D. Three.js, Vite y JavaScript, con fuentes servidas localmente.

## Ejecutar

Requiere Node.js 22.12+ (validado con 24.19) y npm.

```sh
npm ci
npm run dev -- --port 5173
```

```sh
npm run build
npm run preview -- --port 4173
```

## Experiencia

- Ciudad 3D con órbita, zoom, reinicio, ampliación y pausa de animaciones.
- Distritos por etapa; altura por importe; capa de salud para detectar bloqueos.
- Selección de edificios con fichas y seguimiento temporal en la sesión.
- Vista pipeline, estadísticas, equipo y actividad de ejemplo.
- Escenarios de servicios, restaurante y productos; filtro temporal de los registros e indicadores.
- Diseño adaptable a móvil; pipeline disponible si falla WebGL.

**Todos los datos son de demostración.** Los indicadores principales se calculan a partir de los registros del escenario; las comparativas históricas y la actividad son ilustrativas. El movimiento de vehículos y personas es decorativo. Cambiar de sector adapta nombres, etapas y cantidad de registros: no implementa gestión de inventario ni operaciones de restaurante. El seguimiento es temporal; no existe persistencia ni backend. Los conectores muestran el alcance pendiente: no conectan a APIs ni solicitan credenciales.

Para conectar un CRM real se necesita un backend con OAuth, almacenamiento seguro de credenciales, correspondencia de etapas, sincronización y permisos por empresa.

## Validación de navegador

Con el servidor de desarrollo activo y Chromium instalado:

```sh
node tests/smoke.mjs
```

Se pueden configurar `CHROMIUM_PATH` y `BASE_URL`. La prueba valida renderizado y selección 3D, seguimiento, capas, pipeline, cambios de escenario y periodo, estados de integración, equipo, estadísticas y ausencia de desbordamiento móvil. Las capturas se escriben en `/tmp/atlas-checks`.
