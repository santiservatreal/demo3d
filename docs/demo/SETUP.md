# Guía de Bird View con Tavus

La ruta `/demo` muestra la ciudad a pantalla completa como una presentación interactiva. Un HUD pequeño acompaña cada plano con su título, cifras y pipeline; el guía aparece en un dock inferior derecho. Reutiliza los mismos objetos, datos ficticios, renderer Three.js y bucle de animación de la ciudad. La vista normal `/` conserva su cámara ortográfica, sus menús y su funcionamiento, y no descarga el SDK de Tavus.

## Recorrer la presentación

**Explorar la ciudad** abre los accesos a vista general, comercial, industrial, comunicaciones y resaltado de la selección. La presentación oculta los paneles de trabajo, filtros y fichas de la aplicación; conserva las etiquetas 3D de los objetos. El enlace **Salir** vuelve a la aplicación y el botón de pantalla completa solicita el modo nativo del navegador.

[`getPresentationFrame`](../../src/demo/presentation-state.js) obtiene los títulos, indicadores y etapas de la misma instantánea que dibuja la escena. Los primeros planos de una oportunidad, cliente, comercial, estación, lote o vehículo muestran sus propios datos. Los valores ausentes aparecen como «No disponible». No se convierte una venta ganada en facturación, dinero cobrado o beneficio.

| Zona inicial | Indicadores | Pipeline contextual |
| --- | --- | --- |
| Empresa | 120.000 € de pipeline abierto; 30.000 € ganados este mes; 160 unidades en reparto. | No se muestra. |
| Comercial | 120.000 € abiertos; 30.000 € ganados; 24 oportunidades abiertas. | Nuevos leads **7** → Cualificados **5** → Propuestas **6** → Negociación **6** → Ventas ganadas **4**. |
| Industria | 240 unidades en fabricación; 480 en stock; 160 en reparto. | Fabricación **240** → Empacado **120** → Almacén **480** → En transporte **160** → Entregado **320** unidades. |
| Comunicaciones | 6 correos, 12 llamadas y 1 reunión completados hoy. | No se muestra. |

Los recuentos comerciales proceden de `metrics` y `ownerPerformance`; las comunicaciones de `communicationsSummary`, y las unidades y cargas de `industryMetrics`. Al enfocar a Lucía se muestra su cartera —6 oportunidades abiertas, 31.000 € asignados y 8.500 € ganados—; al enfocar el Camión 01 aparecen Felipe Martín, sus 80 unidades de carga y un trayecto estimado de 180 minutos. Son datos de ejemplo, sin GPS. El pipeline comercial se filtra por cliente o comercial cuando corresponde; el industrial conserva el contexto de toda la operación y señala la etapa del objetivo.

La cámara de presentación utiliza perspectiva de 35° y tomas ajustadas a los objetos existentes. Los desplazamientos entre zonas se elevan según la distancia y conservan margen sobre los tejados; no reconstruyen la ciudad ni crean otro motor. Antes de iniciar al guía, y después de finalizar una conversación, se alternan planos de empresa, ventas, fabricación y reuniones tras pausas de 18 segundos. Una oscilación muy pequeña anima los encuadres quietos. El inicio de la IA o la navegación manual detiene ese recorrido; con movimiento reducido se desactivan las tomas automáticas y la oscilación. No se reproduce audio durante este recorrido ambiental.

## Configurar el agente existente

En [PAL Maker](https://maker.tavus.io/dev), abre la sección de deployments y localiza la publicación del PAL que ya existe, con canal **Widget**. Si todavía no tiene una publicación, crea un deployment eligiendo ese mismo PAL y el canal Widget; no hace falta crear otro agente. Copia el código de instalación y toma su atributo `deployment-id`:

```html
<tavus-widget deployment-id="VALOR_DEL_SNIPPET"></tavus-widget>
```

El usuario facilitó el **PAL ID `p5695fb057e5`** y, después, el snippet oficial con **Deployment ID `d7770b89-ab37-4445-b065-2a5150e2e4cb`**. Este último está configurado en `.env.production` como `VITE_TAVUS_DEPLOYMENT_ID`, por lo que la compilación de producción ya lo utiliza sin copiarlo manualmente en Vercel. Una variable de compilación definida en Vercel tiene prioridad sobre ese valor.

La lectura pública de `/v2/deployments/d7770b89-ab37-4445-b065-2a5150e2e4cb/init` respondió HTTP 200, con nombre «Guía de Bird View Widget», canal `widget` e `is_available: true`. Esto confirma la publicación; no prueba una conversación ni los dominios permitidos de la web final. La respuesta no incluye esquemas de herramientas. No se ha creado otro PAL ni una conversación de prueba.

Los tres esquemas reales facilitados por el usuario ya están versionados en [`src/demo/existing-agent-tools.js`](../../src/demo/existing-agent-tools.js). La demo los vincula a los objetos existentes cuando la ciudad termina de cargar; no hace falta añadir una variable de contratos para utilizarlos.

Para sobrescribir la configuración pública, usa Vercel → Settings → Environment Variables:

| Variable                    | Uso                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TAVUS_DEPLOYMENT_ID`       | ID público del snippet del deployment existente. La API `/api/tavus-config` lo entrega al navegador.             |
| `TAVUS_PAL_ID`              | Referencia opcional al PAL existente. No sustituye al deployment.                                                |
| `TAVUS_TOOL_CONTRACTS_JSON` | Override opcional de los esquemas y bindings. Vacía o ausente utiliza los contratos incluidos; un override inválido desactiva el puente. Ver [TOOL_CONTRACTS.md](TOOL_CONTRACTS.md). |
| `VITE_TAVUS_DEPLOYMENT_ID`  | Alternativa para compilación estática o Vite local; es el mismo ID público.                                      |

No se necesita `TAVUS_API_KEY` para este flujo y no se envía ninguna clave al navegador. Configura los dominios permitidos del deployment en Tavus para incluir tu dominio de Vercel. Usa HTTPS; localhost es un contexto seguro para desarrollo. Después de cambiar variables de compilación, vuelve a desplegar.

`/demo` y `/demo/` tienen reescrituras explícitas a la aplicación. Las rutas `/api/*` conservan sus funciones de servidor.

## Herramientas del PAL

Las funciones existentes son `trigger_3d_camera_movement`, `highlight_building` y `trigger_animation`. Sus exports reales establecen, respectivamente, los campos obligatorios de tipo string `movement_id`, `building_id` y `animation_id`. Se conservan sus esquemas y descripciones, sin añadir enums, restricciones de campos adicionales ni metadatos de propietario. No se crean herramientas ni agentes en Tavus.

Antes de cada conversación, el contexto comunica las definiciones y un catálogo de IDs con sus nombres: la instantánea inicial contiene **82 movimientos, 55 edificios y 57 animaciones**. Los valores son propios de Bird View y se resuelven mediante tablas explícitas; no son parámetros nuevos ni enums añadidos en Tavus. El puente valida los argumentos con AJV y comprueba que el destino siga existiendo antes de ejecutar la acción. Un ID desconocido devuelve error. Los accesos de **Explorar la ciudad** siguen disponibles para navegar manualmente.

Los controles visuales admiten enfoques, resaltados y pulsos. Los vehículos y la maquinaria existentes siguen funcionando. Fabricar, cambiar etapas, entregar productos o cerrar ventas no son acciones de este agente. Las animaciones de obras y los traslados que requieren cambios de datos se rechazan desde este puente.

## Guía en vídeo, en todos los dispositivos

La presentación utiliza siempre **`@tavus/embed` 0.19.3** en un contenedor inferior derecho. El mismo elemento y deployment se mantienen en escritorio, móvil vertical y móvil horizontal; cambiar el tamaño de la ventana no vuelve a montar la sesión. El modo `inline` permite que la página controle su tamaño y mantenga visible la ciudad. No se activa `expand-options`, no se modifica el Shadow DOM y no se dibuja un vídeo o avatar ficticio.

La importación del embed es estática al entrar en `/demo`. La dependencia `@tavus/widget` permanece en `package.json`, pero esta ruta ya no la importa ni monta su launcher. El ID procede del deployment original con canal Widget; el uso de ese ID en el embed está respaldado por el código cliente oficial, mientras que una conversación real con este deployment sigue pendiente de comprobarse.

Antes de pulsar **Iniciar demo con IA**, el dock muestra un CTA pequeño y no monta el embed, crea una conversación ni solicita micrófono o cámara. Al iniciar, Tavus renderiza su propia vista previa, permisos, vídeo y controles de medios. La cámara del visitante se configura apagada inicialmente. El indicador local no inventa un estado de mute que el SDK no publica; los controles reales están dentro de Tavus. **Interrumpir** envía la interacción oficial y **Finalizar** termina la sesión.

En la vista de preparación, permite el micrófono y pulsa **Join**. Si falla el acceso, la aplicación conserva el embed para mostrar el aviso y los controles de reintento de Tavus. No crea otro intento automáticamente. Tavus puede emitir `conversation-ended` durante la limpieza de un Join fallido, antes de emitir su error: ese evento no debe desmontar la ventana. El cierre normal de la llamada también conserva la pantalla final del agente; **Finalizar**, iniciar una sesión nueva o salir de la página sí libera y retira el embed. Un reintento desde sus controles vuelve a conectar las herramientas visuales y descarta las respuestas pendientes del intento anterior.

Mientras existe el embed se oculta el inicio exterior: se reintenta con **Try again** dentro de Tavus. **Finalizar** muestra un estado de cierre e impide iniciar otra instancia hasta que termine el intento de cierre del SDK. Una llamada conectada espera tanto su salida de modo `call` como el fin de la conversación y la promesa pública del cierre pendiente; un timeout libera los recursos locales y muestra un aviso, sin iniciar otra llamada automáticamente. El SDK puede absorber un error HTTP de cierre: esta espera no garantiza que el servidor haya liberado el PAL ni cierra conversaciones de otras pestañas o de Tavus.

El mensaje **PAL is in another conversation** es genérico en el SDK 0.19.3 y también se usa para fallos distintos de concurrencia. La aplicación distingue HTTP 409/423, 429, 402, dominio rechazado y errores de servicio cuando Tavus aporta ese detalle. Si hay una prueba activa de **Guía de Bird View**, compruébala en **Tavus → Conversations**, finalízala y después pulsa Try again en `/demo`. [Diagnóstico y pruebas](TAVUS_AVAILABILITY.md).

El saludo se envía como `custom-greeting` en español. El contexto pide esperar respuesta, ofrecer recorrido comercial o industrial, aceptar interrupciones y confirmar las acciones con el resultado de sus herramientas. La conversación y la voz reales dependen del PAL y de la conexión al servicio; las pruebas con dobles de SDK no las acreditan.

## Ejecución y comprobaciones

```sh
npm ci --cache /tmp/atlas-npm-cache
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:demo
```

Vite preview sirve el cliente, no las funciones `/api/*`. La compilación usa el ID público de `.env.production`; el frontend también lo conserva como alternativa cuando la API no devuelve un ID. Sin override de contratos, `/api/tavus-config` devuelve `contractSource: "bundled"` y `contracts: null`: el cliente compila los contratos incluidos con su instantánea de la ciudad. Ese `null` no significa que falten esquemas. La API sólo informa de las variables disponibles en su proceso, por lo que puede devolver `configured: false` aunque el cliente tenga el ID compilado. Los tests Node prueban esa API y el puente sin credenciales.

Para desarrollo, copia `.env.example` a `.env.local` si todavía no existe. El archivo local está ignorado por Git y ya se ha preparado en esta máquina. No incluyas claves privadas en variables con prefijo `VITE_`.

Las pruebas cubren esquemas reales, catálogos, datos contextuales, geometría de las tomas, serialización de movimientos, cancelación, restauración y limpieza de listeners. Las pruebas de navegador comprueban el viewport completo, indicadores, pipeline y dock en escritorio y móvil vertical/horizontal. La copia de protocolo `conversation.tool_call` no vuelve a ejecutar el evento `tavus:tool-call`; sólo se devuelve `conversation.tool_result` cuando existe un ID de correlación real. Los eventos inyectados mediante un elemento inerte que hace de doble del SDK verifican el puente hacia WebGL, pero no crean avatar, audio ni conexión a Tavus. Siguen pendientes una conversación real desde la web desplegada y los permisos del dominio final. Las capturas con Chromium y GPU por software tampoco acreditan FPS en hardware real ni una prueba en teléfono físico.

Las fuentes principales son el [README oficial del embed](https://unpkg.com/@tavus/embed@0.19.3/README.md), sus [atributos](https://unpkg.com/@tavus/embed@0.19.3/dist/index.d.ts) y sus [métodos y eventos](https://unpkg.com/@tavus/embed@0.19.3/dist/integration.d.ts). Se consultaron también el [widget original](https://unpkg.com/@tavus/widget@0.19.3/README.md) y el [ejemplo oficial de integración](https://github.com/Tavus-Engineering/tavus-examples/blob/main/examples/widget-prompt.md). Tras los rechazos iniciales con 403, se pudieron leer las páginas oficiales de [deployments](https://docs.tavus.io/sections/deployments/overview) y [widget](https://docs.tavus.io/sections/deployments/widget.md), que confirman PAL Maker y el atributo del código de instalación. Los contratos se contrastaron con los tipos y la implementación oficial de la versión instalada.

Resultados y límites de las pruebas: [VALIDATION.md](VALIDATION.md).

## Entorno de Codex

El borrador de configuración guarda las instrucciones de instalación/arranque, los requisitos de variables públicas y los dominios de Tavus/Daily necesarios: `tavusapi.com`, `*.tavusapi.com`, `docs.tavus.io`, `maker.tavus.io`, `*.tavus.io`, `*.daily.co` y `challenges.cloudflare.com`. Se conserva el preset de gestores de paquetes. No se ha añadido ninguna API key.

El Deployment ID facilitado está guardado también como valor sugerido de `TAVUS_DEPLOYMENT_ID` y `VITE_TAVUS_DEPLOYMENT_ID`. Las instrucciones reutilizables guardadas ya indican que los esquemas originales están incluidos y que `TAVUS_TOOL_CONTRACTS_JSON` es únicamente un override opcional.

Guardar el borrador no aplica cambios a esta máquina ni publica el entorno. Para usarlos en tareas futuras, revisa y guarda la configuración en los ajustes del entorno y después publica el entorno. La publicación de la web en Vercel es un proceso distinto.
