# Atlas · Ciudad CRM

Una ciudad 3D interactiva que transforma ventas, comunicaciones y operaciones en barrios conectados. La aplicación usa Three.js y datos ficticios reproducibles; cada panel consulta los mismos registros que su representación en el mapa.

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

**Presentación simulada de Bird View:** entra en `/demo` y pulsa **Comenzar presentación**. El recorrido completo de **4:02** construye la ciudad, baja a sus calles, acompaña una venta con grúas, camión, reconstrucción y confeti, y sigue la producción hasta la entrega. Las etiquetas flotantes explican cada etapa según el plano. Puedes elegir también capítulos individuales de ventas, industria o comunicaciones. Incluye subtítulos, voz opcional del navegador y controles de pausa, avance, retroceso y repetición. No carga Tavus ni consume minutos. El agente original se conserva en `/demo?mode=live`. [Uso y escenarios](docs/demo/SETUP.md) · [Pruebas y capturas](docs/demo/VALIDATION.md).

## Qué explorar

Los botones **Ventas**, **Comunicaciones**, **Industria** y **Empresa** cambian el encuadre de la misma ciudad. **Empresa** muestra los tres distritos conectados; pulsa sus placas para acercarte.

1. **Ciudad:** cada barrio es una etapa configurable y cada edificio, una oportunidad. La altura acotada representa su importe; la ficha muestra el valor exacto.
2. Pulsa un edificio o busca por oportunidad, empresa o responsable. Filtra por etapa, responsable, atención y archivo de perdidas.
3. En la ficha, cambia la etapa: una grúa desmonta el edificio por piezas, un camión lleva los materiales y otra grúa lo construye en la nueva zona. La oportunidad conserva su identidad y ocupa una parcela libre.
4. **Simular una venta** genera un evento ficticio `deal.won`: actualiza importes y feed, y reutiliza la cuenta cliente. No crea facturas ni cobros.
5. **Replay** reproduce las etapas históricas con pausa, velocidad y avance. Clientes y actividades conservan su instantánea. Al salir, restaura el estado guardado.
6. **TV** ocupa toda la pantalla con la ciudad, cifras arriba y el equipo comercial abajo. Oculta menús, filtros, fichas y el chat. Usa la **X** o **Escape** para salir; el navegador puede conceder pantalla completa nativa y, si no, se mantiene la vista inmersiva. **Explore** permite desplazar y acercar el mapa con perspectiva fija, sin girarlo.
7. **Tabla** consulta y selecciona los mismos registros. Sigue funcionando si el navegador no puede iniciar WebGL2.
8. **Capas** controla etiquetas, conexiones, actividad y tráfico ambiental. El tráfico no representa actividad real del CRM.
9. **Hoy en tu ciudad** abre la actividad, el feed y los 18 clientes con renovaciones y venta adicional potencial. **Comerciales** muestra las oportunidades abiertas y las ventas ganadas de cada responsable; puedes enfocarlo en la ciudad y consultar su cartera.
10. Cuatro comerciales caminan por aceras, con iniciales visibles y nombre al acompañar una obra. Asisten a los cambios de cualquier etapa y esperan junto al destino mientras se reconstruye. Sus posiciones son simuladas; los recuentos proceden de los registros.
11. En móvil, la ficha tiene alturas contraída, media y expandida, además de controles táctiles y tabla.
12. Los nombres de zonas y los totales están en una franja fuera de la ciudad. Las iniciales de los comerciales quedan pequeñas, detrás y a un lado de la persona, sin la línea que tapaba el personaje. Las flechas, el arrastre y el zoom mantienen el mismo ángulo de cámara.
13. **Asistente:** pregunta «Dónde está Lucía», consulta ventas, tareas o stock y enfoca los registros desde el chat inferior. Los consejos proactivos se basan en tareas vencidas, permanencia en una etapa y actividades registradas; se pueden descartar o silenciar. El modo local está identificado. La [conexión opcional de IA](docs/city/v5/AI_SETUP.md) usa una clave del servidor y nunca modifica el CRM.

La demo comienza con **24 abiertas por 120.000 €**, **4 ganadas por 30.000 €**, **3 perdidas** y **18 clientes activos**. Incluye 7 contactos pendientes, 9 conversaciones por responder, 12 llamadas registradas hoy y 5 tareas vencidas. La tasa de éxito 4/7 usa historial explícito de cierres del mes.

**Comunicaciones:** visita Correos, la Central de llamadas, la Casa de mensajes y la Cafetería reuniones. Sus placas muestran actividades realizadas hoy y pendientes por separado. Hay seis correos y doce llamadas completados, seis WhatsApps completados y dos pendientes, nueve conversaciones pendientes y una reunión realizada con otras dos previstas. Los registros conservan sus IDs, responsable y relación con cliente/oportunidad; los canales ausentes aparecen sin datos.

**Industria:** Fabricación → Empacado → Almacén → En transporte → Entregado. La demo contiene un producto, diez lotes y **1.320 unidades**: 240 en fabricación, 120 empacando, 480 en stock, 160 en reparto y 320 entregadas. Selecciona una estación, un palé o un camión; **Avanzar un lote** o **Simular → siguiente etapa** registra un evento explícito. Las rutas son ilustrativas y estimadas: una entrega requiere confirmación, y el regreso vacío y la llegada al almacén son eventos distintos. Un cierre comercial no fabrica productos ni genera cobros.

**Movimiento y presentación:** los comerciales mantienen su etiqueta en cada fotograma; el contenido y las medidas se reutilizan. La maquinaria industrial se anima y las transferencias llevan palés en carretilla entre estaciones, incluida la carga y descarga. **Simular proceso** reproduce eventos ficticios de los lotes existentes cada 14 segundos y permite pausarlos; no crea unidades. Al seleccionar un distrito, el resto pierde algo de contraste y color. Desde **Empresa → TV** se recorren las tres zonas con transiciones de siete segundos y pausas de nueve; navegar manualmente pausa el recorrido. Las ventas ganadas y las entregas registradas muestran una tarjeta breve con confeti. Movimiento reducido mantiene la información sin partículas ni recorrido automático.

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
npm run test:city-v3
npm run test:city-v4
npm run test:city-v5
npm run test:demo
# Regresión de experiencias anteriores, con Vite dev en el puerto 5173:
npm run test:luma
npm run test:operations
npm run test:classic
```

Los tests de navegador usan Chromium (`/usr/bin/chromium` por defecto). `CHROMIUM_PATH` y `BASE_URL` permiten configurar las pruebas de ciudad y Luma. Los gestos se emulan; no se ha probado hardware táctil físico.

- [Cambios actuales: mapa fijo, etiquetas y asistente](docs/city/v5/IMPLEMENTATION.md)
- [Validación visual del mapa y del asistente](docs/city/v5/VALIDATION.md)
- [Modo local y activación de IA en el servidor](docs/city/v5/AI_SETUP.md)
- [Fluidez, animaciones y presentaciones](docs/city/v4/IMPLEMENTATION.md)
- [Validación y comparación de esta versión](docs/city/v4/VALIDATION.md)
- [Comerciales, comunicaciones y pipeline industrial](docs/city/v3/IMPLEMENTATION.md)
- [Capturas y validación de la ciudad ampliada](docs/city/v3/VALIDATION.md)
- [TV, obras y equipo comercial](docs/city/v2/IMPLEMENTATION.md)
- [Capturas y validación de estos cambios](docs/city/v2/VALIDATION.md)
- [Arquitectura, datos y correspondencia visual](docs/city/IMPLEMENTATION.md)
- [Validación, capturas y rendimiento medido](docs/city/VALIDATION.md)
- [Documentación industrial Luma](docs/luma/IMPLEMENTATION.md)
- [Modelos originales GLB/HDR y licencia CC0](public/assets/luma/LICENSE.txt)
