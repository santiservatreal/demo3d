# Atlas · Ciudad CRM

Una ciudad 3D interactiva que transforma un pipeline comercial en barrios, oportunidades y relaciones con clientes. La aplicación usa Three.js y datos ficticios reproducibles; la ciudad, la tabla, las fichas y el feed comparten el mismo proveedor.

## Ejecutar

Node.js 22.12+ y npm; entorno validado con Node 24.19.

```sh
npm ci
npm run dev -- --port 5173
```

En este entorno cloud, `npm ci --cache /tmp/atlas-npm-cache` evita el caché personal no escribible.

```sh
npm run build
npm run preview -- --port 4173
```

**Vercel:** preset **Vite**, directorio raíz `./`, build `npm run build`, salida `dist`. Todos los assets necesarios están incluidos. El push a `main` puede activar un despliegue si el proyecto Vercel está enlazado. El estado de Vercel no se verifica desde esta aplicación.

## Qué explorar

1. **Ciudad:** cada barrio es una etapa configurable y cada edificio, una oportunidad. La altura acotada representa su importe; la ficha muestra el valor exacto.
2. Pulsa un edificio o busca por oportunidad, empresa o responsable. Filtra por etapa, responsable, atención y archivo de perdidas.
3. En la ficha, cambia la etapa: una grúa desmonta el edificio por piezas, un camión lleva los materiales y otra grúa lo construye en la nueva zona. La oportunidad conserva su identidad y ocupa una parcela libre.
4. **Simular una venta** genera un evento ficticio `deal.won`: actualiza importes y feed, y reutiliza la cuenta cliente. No crea facturas ni cobros.
5. **Replay** reproduce las etapas históricas con pausa, velocidad y avance. Clientes y actividades conservan su instantánea. Al salir, restaura el estado guardado.
6. **TV** ocupa toda la pantalla con la ciudad, cifras arriba y el equipo comercial abajo. Oculta menús, filtros y fichas. Usa la **X** o **Escape** para salir; el navegador puede conceder pantalla completa nativa y, si no, se mantiene la vista inmersiva. **Explore** permite navegar libremente.
7. **Tabla** consulta y selecciona los mismos registros. Sigue funcionando si el navegador no puede iniciar WebGL2.
8. **Capas** controla etiquetas, conexiones, actividad y tráfico ambiental. El tráfico no representa actividad real del CRM.
9. **Hoy en tu ciudad** abre la actividad, el feed y los 18 clientes con renovaciones y venta adicional potencial. **Comerciales** muestra las oportunidades abiertas y las ventas ganadas de cada responsable; puedes enfocarlo en la ciudad y consultar su cartera.
10. Cuatro comerciales caminan por aceras, visitan las cuentas que están negociando y acompañan sus ventas hasta el edificio reconstruido. Sus posiciones son simuladas; los recuentos proceden de los registros.
11. En móvil, la ficha tiene alturas contraída, media y expandida, además de controles táctiles y tabla.

La demo comienza con **24 abiertas por 120.000 €**, **4 ganadas por 30.000 €**, **3 perdidas** y **18 clientes activos**. Incluye 7 contactos pendientes, 9 conversaciones por responder, 12 llamadas registradas hoy y 5 tareas vencidas. La tasa de éxito 4/7 usa historial explícito de cierres del mes.

## Experiencias anteriores conservadas

- `/?experience=luma`: Luma Works, fábrica de lámparas con producción, inventario, carga y camiones.
- `/?experience=operations`: Atlas operativo, perfiles industria/servicios y escenarios logísticos.
- `/?experience=classic`: concepto de ciudad original.

## Datos y límites

**Datos simulados.** No hay un CRM conectado, backend, OAuth, GPS ni permisos de servidor. El proveedor independiente define los registros y eventos que deberá suministrar un futuro adaptador autenticado. No se exponen credenciales ni se inventan enlaces de registros reales. Las ventas adicionales potenciales no se suman a oportunidades existentes.

El kit arquitectónico es original y procedural: geometría 3D seleccionable, materiales PBR, HDR local, sombras, piezas instanciadas, niveles de detalle y controles de calidad. WebGL2 es la base de producción; no se añaden nuevas dependencias ni se cambia el motor. Se prioriza medir el render real; las pruebas con SwiftShader no acreditan 60 FPS en un ordenador ni 30 FPS en un móvil físico.

No se recibió una imagen nueva con el último prompt. La web de referencia devolvió HTTP 403 desde este entorno; se implementan las definiciones escritas sin afirmar que sus controles se verificaron.

## Validación

```sh
npm test
npm run build
# Con preview activo en el puerto 4173:
npm run test:e2e
npm run test:city-v2
# Regresión de experiencias anteriores, con Vite dev en el puerto 5173:
npm run test:luma
npm run test:operations
npm run test:classic
```

Los tests de navegador usan Chromium (`/usr/bin/chromium` por defecto). `CHROMIUM_PATH` y `BASE_URL` permiten configurar las pruebas de ciudad y Luma. Los gestos se emulan; no se ha probado hardware táctil físico.

- [Cambios actuales: TV, obras y equipo comercial](docs/city/v2/IMPLEMENTATION.md)
- [Capturas y validación de estos cambios](docs/city/v2/VALIDATION.md)
- [Arquitectura, datos y correspondencia visual](docs/city/IMPLEMENTATION.md)
- [Validación, capturas y rendimiento medido](docs/city/VALIDATION.md)
- [Documentación industrial Luma](docs/luma/IMPLEMENTATION.md)
- [Modelos originales GLB/HDR y licencia CC0](public/assets/luma/LICENSE.txt)
