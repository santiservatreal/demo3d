# Guía de Bird View con Tavus

La ruta `/demo` conserva la ciudad, sus datos ficticios y su motor Three.js. Incorpora el SDK oficial Tavus 0.19.3 y una fachada de presentación que sólo navega y resalta objetos. La vista normal `/` mantiene su funcionamiento y no descarga el SDK de Tavus.

## Configurar el agente existente

En [PAL Maker](https://maker.tavus.io/dev), abre la sección de deployments y localiza la publicación del PAL que ya existe, con canal **Widget**. Si todavía no tiene una publicación, crea un deployment eligiendo ese mismo PAL y el canal Widget; no hace falta crear otro agente. Copia el código de instalación y toma su atributo `deployment-id`:

```html
<tavus-widget deployment-id="VALOR_DEL_SNIPPET"></tavus-widget>
```

El usuario facilitó el **PAL ID `p5695fb057e5`** y, después, el snippet oficial con **Deployment ID `d7770b89-ab37-4445-b065-2a5150e2e4cb`**. Este último está configurado en `.env.production` como `VITE_TAVUS_DEPLOYMENT_ID`, por lo que la compilación de producción ya lo utiliza sin copiarlo manualmente en Vercel. Una variable de compilación definida en Vercel tiene prioridad sobre ese valor.

La lectura pública de `/v2/deployments/d7770b89-ab37-4445-b065-2a5150e2e4cb/init` respondió HTTP 200, con nombre «Guía de Bird View Widget», canal `widget` e `is_available: true`. Esto confirma la publicación; no prueba una conversación ni los dominios permitidos de la web final. La respuesta no incluye esquemas de herramientas. No se ha creado otro PAL ni una conversación de prueba.

Para sobrescribir el ID público o completar las herramientas, usa Vercel → Settings → Environment Variables:

| Variable                    | Uso                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TAVUS_DEPLOYMENT_ID`       | ID público del snippet del deployment existente. La API `/api/tavus-config` lo entrega al navegador.             |
| `TAVUS_PAL_ID`              | Referencia opcional al PAL existente. No sustituye al deployment.                                                |
| `TAVUS_TOOL_CONTRACTS_JSON` | Exportación real de las tres funciones y sus mapeos de presentación; ver [TOOL_CONTRACTS.md](TOOL_CONTRACTS.md). |
| `VITE_TAVUS_DEPLOYMENT_ID`  | Alternativa para compilación estática o Vite local; es el mismo ID público.                                      |

No se necesita `TAVUS_API_KEY` para este flujo y no se envía ninguna clave al navegador. Configura los dominios permitidos del deployment en Tavus para incluir tu dominio de Vercel. Usa HTTPS; localhost es un contexto seguro para desarrollo. Después de cambiar variables de compilación, vuelve a desplegar.

`/demo` y `/demo/` tienen reescrituras explícitas a la aplicación. Las rutas `/api/*` conservan sus funciones de servidor.

## Herramientas del PAL

Las funciones solicitadas son `trigger_3d_camera_movement`, `highlight_building` y `trigger_animation`. Sus nombres no permiten deducir qué parámetros manda el agente. El widget no ofrece un contrato público para recuperar sus esquemas; se necesitan las definiciones exportadas del PAL existente. La integración no inventa esos parámetros ni crea herramientas nuevas en Tavus.

El puente compila los JSON Schema con AJV y aplica los mapeos explícitos sólo después de validar argumentos, objetivos y duración. Si falta la exportación, devuelve `TOOL_SCHEMA_UNAVAILABLE` al agente, no un éxito ficticio. Los botones **Comercial**, **Industrial**, **Vista general** y **Destacar edificio** permiten comprobar la ciudad manualmente mientras se termina esa configuración; no representan órdenes de voz ejecutadas.

Los controles visuales admiten enfoques, resaltados y pulsos. Los vehículos y la maquinaria existentes siguen funcionando. Fabricar, cambiar etapas, entregar productos o cerrar ventas no son acciones de este agente. Las animaciones de obras y los traslados que requieren cambios de datos se rechazan desde este puente.

## Widget y móvil

El widget oficial abre una ventana flotante en escritorio. Su versión 0.19.3 fuerza pantalla completa con ventanas de 480 px o menos, sin una opción pública para modificar ese comportamiento. En móvil se usa el **embed oficial de Tavus**, del mismo SDK y con el mismo deployment, dentro de un contenedor acotado para mantener visible la ciudad. Se monta sólo una superficie por sesión; redimensionar no sustituye el elemento en plena conversación. La compatibilidad de ambos elementos con el mismo ID está respaldada por el código oficial cliente y aún debe comprobarse con el deployment real.

El SDK se registra al entrar en `/demo`, pero no se monta ningún widget ni se solicita micrófono o cámara hasta pulsar **Iniciar demo con IA**. La cámara del visitante se configura apagada inicialmente. El indicador de micrófono no inventa un estado de mute que el SDK no publica: sus controles reales están en la interfaz de Tavus.

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

Vite preview sirve el cliente, no las funciones `/api/*`. La compilación usa el ID público de `.env.production`; el frontend también lo conserva como alternativa cuando la API no devuelve un ID. La API de Vercel sólo informa de las variables disponibles en su proceso, por lo que puede devolver `configured: false` si no se han añadido variables de servidor aunque el cliente tenga el ID compilado. Los tests Node prueban esa API y el puente sin credenciales.

Para desarrollo, copia `.env.example` a `.env.local` si todavía no existe. El archivo local está ignorado por Git y ya se ha preparado en esta máquina. No incluyas claves privadas en variables con prefijo `VITE_`.

Se verifican serialización de movimientos, cancelación al navegar manualmente, restauración de la vista y limpieza de listeners. La copia de protocolo `conversation.tool_call` no vuelve a ejecutar el evento `tavus:tool-call`. Sólo se devuelve `conversation.tool_result` cuando existe un ID de correlación real.

Las fuentes de contrato consultadas fueron el [README oficial](https://unpkg.com/@tavus/widget@0.19.3/README.md), sus [tipos](https://unpkg.com/@tavus/widget@0.19.3/dist/integration.d.ts), el [ejemplo oficial](https://github.com/Tavus-Engineering/tavus-examples/blob/main/examples/widget-prompt.md) y el [embed oficial](https://unpkg.com/@tavus/embed@0.19.3/README.md). Tras los rechazos iniciales con 403, se pudieron leer las páginas oficiales de [deployments](https://docs.tavus.io/sections/deployments/overview) y [widget](https://docs.tavus.io/sections/deployments/widget.md), que confirman PAL Maker y el atributo del código de instalación. Los métodos y eventos se contrastaron con los tipos y la implementación oficial de la versión instalada.

Resultados y límites de las pruebas: [VALIDATION.md](VALIDATION.md).

## Entorno de Codex

El borrador de configuración guarda las instrucciones de instalación/arranque, los requisitos de variables públicas y los dominios de Tavus/Daily necesarios: `tavusapi.com`, `*.tavusapi.com`, `docs.tavus.io`, `maker.tavus.io`, `*.tavus.io`, `*.daily.co` y `challenges.cloudflare.com`. Se conserva el preset de gestores de paquetes. No se ha añadido ninguna API key.

El Deployment ID facilitado está guardado también como valor sugerido de `TAVUS_DEPLOYMENT_ID` y `VITE_TAVUS_DEPLOYMENT_ID`. Los esquemas originales siguen pendientes en `TAVUS_TOOL_CONTRACTS_JSON`.

Guardar el borrador no aplica cambios a esta máquina ni publica el entorno. Para usarlos en tareas futuras, revisa y guarda la configuración en los ajustes del entorno y después publica el entorno. La publicación de la web en Vercel es un proceso distinto.
