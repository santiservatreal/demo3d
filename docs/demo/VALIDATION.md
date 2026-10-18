# Bird View · Presentación simulada

`/demo` es ahora una presentación guiada que funciona sin Tavus ni minutos de conversación. La aplicación normal continúa en `/`; el agente original se conserva únicamente en `/demo?mode=live`.

## Qué muestra

- Apertura de 24 segundos: la ciudad se monta con 63 piezas reutilizables y los edificios se levantan por etapas; después la cámara descubre los barrios y espera una decisión.
- Capítulo comercial de 48 segundos: contacto, oportunidad, propuesta, negociación, desmontaje con grúa, camión, reconstrucción, comercial presente y celebración con confeti 3D.
- Capítulo industrial de 36 segundos: fabricación, empacado, almacén, transporte y entrega con paquetes y camión ilustrativos.
- Capítulo de comunicaciones de 22 segundos: oficina de mensajes, llamadas y reuniones representadas por sus locales.
- Pausa, continuación, avance, retroceso, repetición y búsqueda por tiempo. Cada capítulo termina esperando otra elección; la escena final permanece visible.

Los subtítulos siempre están disponibles. La voz opcional usa `speechSynthesis` y las voces del navegador; no representa una conversación con IA ni la voz del PAL. Los recorridos no escriben datos ni crean ventas, inventario o entregas en el CRM/ERP.

## Evidencia

La compilación de producción termina correctamente. La suite Node pasa con **265 casos**, incluidos 13 de guion/reproductor y ocho de efectos gráficos. Se comprueban el reloj determinista, cancelación de callbacks antiguos, pausa, decisiones, búsqueda hacia atrás, restauración, recursos acotados y movimiento reducido.

La suite de navegador utiliza Chromium con WebGL2 y ANGLE/SwiftShader por software. Renderiza la ciudad real; no sustituye los edificios ni fabrica eventos del CRM. Comprueba las piezas, grúas, camión, reconstrucción, comercial, paquetes, confeti, cambios de cámara, datos intactos, móvil vertical y horizontal, movimiento reducido y dashboard normal. La ruta opcional de Tavus se abre sin pulsar Iniciar.

La ejecución final del **18 de octubre de 2026** pasa **13 de 13 grupos**, con cero errores de página, cero solicitudes a Tavus/Daily y ninguna conversación o permiso de micrófono abierto. Los SHA-256 de las fuentes coinciden al principio, al final y con el código guardado. [Informe completo](simulation-browser-validation.json).

Capturas de esa ejecución:

- [Ciudad montándose por piezas](captures/simulation-01-city-assembling.png).
- [Desmontaje con grúa](captures/simulation-04-sale-dismantling.png), [traslado en camión](captures/simulation-05-sale-truck-in-transit.png) y [reconstrucción](captures/simulation-06-sale-rebuilding.png).
- [Venta ganada, comercial y confeti](captures/simulation-07-sale-celebration.png).
- [Entrega industrial](captures/simulation-10-delivery-arrives.png).
- Decisiones en móvil [vertical](captures/simulation-13-mobile-portrait-choice.png) y [horizontal](captures/simulation-16-mobile-landscape-choice.png).

El test bloquea los dominios de Tavus y Daily antes de navegar y comprueba que la presentación simulada no registra el embed ni solicita dispositivos o audio automáticamente. La prueba opcional de narración emplea un **doble explícito de síntesis de voz**, sin reproducción real, para verificar idioma, texto y recuperación tras pausa, repetición y cambio de capítulo. No acredita una voz del sistema operativo ni un dispositivo físico.

La prueba del ciclo de vida dispara eventos `PageTransitionEvent` explícitos: una salida persistida conserva el reproductor pausado y permite continuar; una salida definitiva lo elimina junto con el canvas. No comprueba la admisión real del documento en la caché Atrás/Adelante del navegador.

No se han medido FPS nuevos en hardware real ni probado un teléfono físico. Las rutas de camiones y la venta del relato son coreografías ficticias, sin GPS ni integración con un CRM externo.

## Reproducir

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:demo
```

`BASE_URL`, `CHROMIUM_PATH` y `CAPTURE_DIR` cambian el servidor, navegador y destino de las capturas. La integración anterior conserva su [informe histórico](VALIDATION-live.md), [configuración](LIVE_SETUP.md) y su suite `npm run test:demo:live`.
