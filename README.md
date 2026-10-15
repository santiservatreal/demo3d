# Atlas · Luma Works

Una maqueta industrial interactiva para entender cómo los datos de una empresa se convierten en actividad visual. La vista principal es **Luma Works**, una empresa ficticia que ensambla lámparas: taller, comprobación, embalaje, almacén, muelles y dos camiones.

## Ejecutar

Node.js 22.12+ y npm; validado con Node 24.19.

```sh
npm ci
npm run dev -- --port 5173
```

En este entorno cloud, usa `npm ci --cache /tmp/atlas-npm-cache` si el caché del directorio personal no es escribible.

```sh
npm run build
npm run preview -- --port 4173
```

**Vercel:** preset Vite, raíz `./`, build `npm run build`, salida `dist`. Los modelos ya están incluidos: no necesitas Blender para ejecutar ni desplegar. El push a `main` puede activar el despliegue si tu proyecto Vercel está enlazado; el estado de ese despliegue no se verifica desde esta aplicación.

## Qué probar primero

1. Explora los cuatro encuadres: **Campus**, **Producción**, **Muelles** y **Felipe**.
2. Retira la cubierta para ver componentes, bancos, la lámpara en montaje, comprobación LED y embalaje.
3. Selecciona un camión; sus puertas, ruedas, carga y movimiento tienen nodos independientes.
4. Usa el escenario **Carga en muelle** y el reloj **×240** para observar las transferencias de palés.
5. Abre **Entrega de LW-024**: Felipe lleva 50 lámparas, 10 cajas y 5 palés. La entrega reconoce ventas y coste, pero no un cobro.
6. Prueba **Felipe vuelve vacío** y **Llegada sin confirmar**. El retorno es estimado; una ETA no confirma la llegada.
7. Comprueba **Cierre del día 12** y **Cierre mensual** en la ficha económica. El mes base cierra en 100.000 € de ventas y 18.000 € de resultado operativo simplificado; quedan 200 lámparas terminadas.
8. Alterna lista/pipeline, usa búsqueda/filtros y compara presets gráficos.

El **Atlas operativo anterior** (industria/servicios, adaptador de campos HubSpot, permisos de demo y escenarios) se conserva en `/?experience=operations`. El **Atlas original** (servicios/restaurante/productos) está en `/?experience=classic`.

## Datos y alcance

**Todos los datos son ficticios.** Luma tiene un reloj determinista y eventos idempotentes; no genera ventas por frame ni atribuye productividad a avatares. Las rutas regionales son esquemáticas y no están a escala geográfica. El campus usa metros; los palés/cajas visibles son proxies identificados.

No hay conexión real a CRM, ERP, TMS o GPS, backend, OAuth, persistencia operativa ni seguridad de servidor. Las correspondencias y arquitectura anteriores permanecen disponibles; no se presentan como conectores autenticados. Las restricciones financieras son una demostración en cliente.

La ruta de producción es WebGLRenderer con Three.js 0.180.0, materiales PBR, HDR local, sombras y FXAA; AO opcional en alta. WebGPU nativo se evaluó, pero perdió el dispositivo en este entorno de software. Las mediciones no validan 60 FPS ni sustituyen pruebas en GPU física.

## Documentación y evidencia

- [Implementación, renderer, modelos y reglas de simulación](docs/luma/IMPLEMENTATION.md)
- [Verificación visual, rendimiento, capturas y vídeo real](docs/luma/VALIDATION.md)
- [Procedencia, tamaños y SHA-256 de los assets](docs/luma/asset-manifest.json)
- [Licencia CC0 de los modelos originales](public/assets/luma/LICENSE.txt)

## Comprobar

```sh
npm test
npm run test:e2e
npm run test:operations
npm run test:classic
npm run build
```

Los tests de navegador necesitan Chromium (`/usr/bin/chromium` por defecto; `CHROMIUM_PATH` y `BASE_URL` configuran los de Luma). El servidor debe estar activo. Los tests de operaciones y los scripts de comparación usan importaciones del servidor Vite de desarrollo. El resto de pruebas puede ejecutarse contra `npm run preview`.

Assets originales generados con `tools/build_luma_assets.py` (Blender 4.3.2) y `tools/build_luma_environment.py` (Python). Se conservan como GLB/HDR en `public/assets/luma`. No hay modelos externos pendientes de descarga. La grabación de navegador usa CDP y el FFmpeg del sistema, sin imágenes generadas.
