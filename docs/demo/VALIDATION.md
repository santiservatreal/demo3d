# Bird View · Presentación simulada

`/demo` es ahora una presentación guiada que funciona sin Tavus ni minutos de conversación. La aplicación normal continúa en `/`; el agente original se conserva únicamente en `/demo?mode=live`.

## Qué muestra

- Presentación completa de **242 segundos (4:02)**: apertura de 32 segundos, ventas de 114 segundos e industria de 96 segundos. La reproducción principal cruza los capítulos automáticamente y espera una decisión al final.
- La ciudad se monta con 63 piezas reutilizables bajo el terreno. Los barrios ascienden sin aplastarse, conservando la separación entre pavimento y pintura; las sombras acompañan el movimiento y las piezas se desvanecen suavemente.
- Ventas: las cinco etapas comerciales, con planos separados y narrados para desmontaje con grúa, traslado en camión, reconstrucción, comercial presente y confeti 3D. La cámara baja a la altura de los edificios, acompaña el traslado y cambia de ángulo al reconstruir.
- Industria: fabricación, empacado, almacén, transporte y entrega con sus propios planos cercanos, paquetes, camión y celebración.
- Etiquetas flotantes de barrios y etapas, proyectadas cada muestra de cámara. Los planos cercanos muestran solo la etapa activa; los generales pueden mostrar varias zonas. Se retiran rótulos fuera del plano o que colisionen con la narración y controles.
- Comunicaciones, disponible como capítulo individual de 30 segundos: mensajes, llamadas y reuniones representadas por sus locales.
- Pausa, continuación, avance, retroceso, repetición y búsqueda global durante el tour. Elegir un capítulo manualmente cambia a su tiempo local y espera una decisión al terminar; la escena final permanece visible.

Los subtítulos siempre están disponibles. La voz opcional usa `speechSynthesis` y las voces del navegador; no representa una conversación con IA ni la voz del PAL. Los recorridos no escriben datos ni crean ventas, inventario o entregas en el CRM/ERP.

## Evidencia

La compilación de producción termina correctamente. La suite Node pasa con **291 casos**, incluidos 21 de guion/reproductor, 11 de efectos gráficos, siete de los nuevos planos de cámara y ocho de etiquetas. Se comprueban el reloj determinista, tour continuo, cancelación de callbacks antiguos, pausa, decisiones, búsqueda global y hacia atrás, restauración, recursos acotados y movimiento reducido. Las pruebas inspeccionan las matrices de las 63 piezas en 100 muestras: permanecen bajo la base real sin comprimir la distancia entre pintura y pavimento.

La suite de navegador utiliza Chromium con WebGL2 y ANGLE/SwiftShader por software. Renderiza la ciudad real; no sustituye los edificios ni fabrica eventos del CRM. Muestrea las 21 escenas del tour de 242 segundos, cruza los dos cambios de capítulo con el reloj real y comprueba las piezas, grúas, camión, reconstrucción, comercial, paquetes, confeti, planos cercanos y etiquetas de cada etapa. También verifica datos intactos, pausa/repetición, móvil vertical y horizontal, movimiento reducido y dashboard normal. La ruta opcional de Tavus se abre sin pulsar Iniciar.

La ejecución final del **18 de octubre de 2026** pasa **15 de 15 grupos**, con cero errores de página, cero solicitudes a Tavus/Daily y ninguna conversación o permiso de micrófono abierto. Los SHA-256 de las fuentes coinciden al principio, al final y con el código guardado. Las cinco etapas comerciales muestran exactamente una etiqueta activa con el ID correcto; se comprueba que no tape controles o narrativa. Se proyectan 99 partículas del confeti comercial y 33 de la entrega dentro del encuadre. [Informe completo](simulation-browser-validation.json).

Capturas de esa ejecución:

- [Ciudad montándose por piezas](captures/simulation-01-city-assembling.png).
- [Barrios identificados con rótulos flotantes](captures/simulation-02-city-assembled.png).
- [Desmontaje con grúa](captures/simulation-04-sale-dismantling.png), [traslado en camión](captures/simulation-05-sale-truck-in-transit.png) y [reconstrucción](captures/simulation-06-sale-rebuilding.png).
- [Venta ganada, comercial y confeti](captures/simulation-07-sale-celebration.png).
- [Entrega industrial](captures/simulation-10-delivery-arrives.png).
- Planos cercanos de [fabricación](captures/simulation-08-manufacturing.png) y [empacado](captures/simulation-09-packing.png).
- Decisiones en móvil [vertical](captures/simulation-13-mobile-portrait-choice.png) y [horizontal](captures/simulation-16-mobile-landscape-choice.png).

El test bloquea los dominios de Tavus y Daily antes de navegar y comprueba que la presentación simulada no registra el embed ni solicita dispositivos o audio automáticamente. La prueba opcional de narración emplea un **doble explícito de síntesis de voz**, sin reproducción real, para verificar idioma, texto y recuperación tras pausa, repetición y cambio de capítulo. No acredita una voz del sistema operativo ni un dispositivo físico.

La prueba del ciclo de vida dispara eventos `PageTransitionEvent` explícitos: una salida persistida conserva el reproductor pausado y permite continuar; una salida definitiva lo elimina junto con el canvas. No comprueba la admisión real del documento en la caché Atrás/Adelante del navegador.

No se han medido FPS nuevos en hardware real ni probado un teléfono físico. Las rutas de camiones y la venta del relato son coreografías ficticias, sin GPS ni integración con un CRM externo.

La revisión visual corrigió también el encuadre al buscar en la barra de tiempo: las coreografías se centran en la parcela ilustrada o el camión, en lugar de interpolar desde otro edificio del CRM. Los planos cercanos muestran únicamente la etapa activa para evitar que la etiqueta de origen aparezca encima de la obra de destino.

## Reproducir

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:demo
```

`BASE_URL`, `CHROMIUM_PATH` y `CAPTURE_DIR` cambian el servidor, navegador y destino de las capturas. La integración anterior conserva su [informe histórico](VALIDATION-live.md), [configuración](LIVE_SETUP.md) y su suite `npm run test:demo:live`.
