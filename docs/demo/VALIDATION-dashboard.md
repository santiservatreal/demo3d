> Archivo histórico del diseño anterior con dashboard. La presentación actual se documenta en [VALIDATION.md](VALIDATION.md).

# Bird View · Validación Tavus

**205/205 casos Node y 8/8 grupos de navegador**, sin errores JavaScript no capturados. La compilación de producción terminó correctamente. Los esquemas reales facilitados por el usuario están integrados; el Deployment ID está configurado y el botón Iniciar habilitado. **No se inició ninguna conversación real.**

![Aplicación real antes de iniciar](captures/demo-desktop-ready.png)

## Comprobaciones

Chromium 154.0.8037.57, escritorio de 1440 × 1000 y móvil emulado de 390 × 844, con WebGL2/SwiftShader por software. No se midieron FPS nuevos ni se probó un móvil físico.

Los seis primeros grupos comprueban la página sin iniciar sesión: configuración y contratos listos; foco comercial de «Nueva sede» y su importe distinguido de un cobro; fabricación con sus 1.320 unidades trazadas y 240 en esa etapa; regreso a vista general; conservación del asistente V5 y navegación de `/`; composición móvil sin desplazamiento horizontal y botón de 44 px. La cámara mantiene su orientación y las instantáneas serializadas de CRM/ERP permanecen idénticas.

Los otros dos grupos, en escritorio y móvil, usan un **doble controlado del SDK**. La aplicación real crea sesión, validadores, puente y controlador; sólo el elemento Tavus se sustituye por un `div` local con eventos controlados. No se instancia el SDK real ni se abre una sala.

Ambos verifican:

- Contexto con las tres definiciones exactas y catálogo de entidades existentes: 82 movimientos, 55 edificios/áreas y 57 animaciones.
- `movement_id: "industry-stage:manufacturing"`: encuadre real; `building_id` equivalente y `animation_id: "pulse:industry-stage:manufacturing"`: halo visible.
- `animation_id: "machinery"`: respuesta `already_running` y matrices de la cinta que cambian entre fotogramas, sin avanzar producción.
- Argumento requerido ausente: `TOOL_ARGUMENTS_INVALID`. ID no anunciado: `TOOL_BINDING_UNRESOLVED`.
- Finalizar restaura la cámara, cierra y destruye el doble una vez y elimina su elemento. Los registros no cambian.

![Puente real sobre WebGL con SDK doble expresamente identificado](captures/qa-sdk-double-desktop-tool-highlight.png)

[Prueba móvil con doble](captures/qa-sdk-double-mobile-tool-highlight.png). El rótulo QA permanece visible. Ese `div` **no reproduce la reserva de espacio ni la interfaz del avatar real**: se valida el flujo de eventos y la escena, no la composición de un avatar junto al mapa. El estado conectado de estas imágenes procede del doble, no de Tavus.

[Industria sin doble](captures/demo-industrial-readonly-highlight.png) · [Comercial](captures/demo-commercial-readonly-highlight.png) · [Guía móvil](captures/demo-mobile-ready-industry.png) · [Mapa móvil](captures/demo-mobile-industrial-city.png) · [Ruta principal](captures/normal-city-v5-preserved.png).

## Red y trazabilidad

**Cero solicitudes** a `tavusapi.com`, `tavus.io`, `tavus.com`, `tavus.dev` y `daily.co`, incluidos sus subdominios; además están bloqueadas durante la suite. Cero llamadas a `getUserMedia`, reproducción multimedia o creación de `AudioContext`. No se montan componentes Tavus reales ni elementos de audio/vídeo. `/demo` registra los SDK oficiales sin iniciar sesión; `/` no los descarga ni registra.

[Informe completo](dashboard-browser-validation.json): dos inicios con doble y `realSdkStartButtonClicked: false`; respuestas de herramientas, restauración y hashes JS/CSS recibidos por HTTP. Incluye `app-CGN78Dty.js`, `app-D-wTd5vv.js` y `app-DMQpJPKC.css`, todos HTTP 200. Las fuentes coinciden al comenzar y terminar, incluida `.env.production`; `.env.local` no se incluye en el informe.

Los archivos de `npm test` se ejecutaron también con `node --test --test-isolation=none`: **205 casos, sin fallos ni omitidos**. Las pruebas cubren los exports reales y conservan fixtures sintéticos para casos genéricos. Los esquemas originales no reciben enums ni prohibiciones adicionales; los bindings limitan después las acciones a su catálogo.

La API se verifica localmente y con pruebas controladas. Su valor predeterminado `contractSource: "bundled"` vincula los exports a la instantánea del cliente; un override inválido se rechaza. `vite preview` no ejecuta serverless: el cliente utiliza el ID compilado y los contratos incluidos. No se comprobó el endpoint publicado de Vercel desde este navegador.

## Límite de la prueba

La lectura pública del Deployment ID `d7770b89-ab37-4445-b065-2a5150e2e4cb` respondió HTTP 200, «Guía de Bird View Widget» e `is_available: true`. Esto confirma disponibilidad, no una conversación ni los dominios permitidos de la web final.

**Siguen sin verificarse con Tavus real** la voz bidireccional, saludo, interrupciones, permisos físicos y llamadas espontáneas de herramientas. Los eventos dobles prueban el puente local; no acreditan esos comportamientos del servicio. No se creó una llamada facturable. [Configuración](SETUP.md) · [Contratos](TOOL_CONTRACTS.md).

## Reproducir

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal, con una sola sesión de navegador:
npm run test:demo
```

`BASE_URL`, `CHROMIUM_PATH` y `CAPTURE_DIR` permiten cambiar servidor, navegador y destino. El ID esperado se lee con `loadEnv("production", process.cwd(), "VITE_")`; `EXPECT_TAVUS_DEPLOYMENT_ID` permite sustituirlo. Un valor explícitamente vacío comprueba una compilación/servidor sin ID y omite los dos grupos con doble. La suite sólo pulsa Iniciar después de instalar el doble local y nunca crea una conversación real.
