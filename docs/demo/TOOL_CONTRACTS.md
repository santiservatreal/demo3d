# Contratos de las herramientas del agente existente

La integración conserva el agente de Tavus y sus herramientas. No crea otro agente, no registra herramientas nuevas ni deduce sus argumentos a partir del nombre.

Para activar la conversación hace falta el **Deployment ID** público del fragmento de instalación del widget. Se configura como `TAVUS_DEPLOYMENT_ID` en Vercel, o `VITE_TAVUS_DEPLOYMENT_ID` durante una compilación estática. El identificador facilitado como PAL ID, `p5695fb057e5`, puede guardarse en `TAVUS_PAL_ID` como referencia; este campo no se utiliza automáticamente como Deployment ID. No hace falta una API key de Tavus para el widget público.

La conversación y el control de la ciudad tienen requisitos distintos: el widget puede conversar con un deployment válido aunque todavía falte el contrato de sus herramientas. En ese caso los intentos de controlar la escena reciben `TOOL_SCHEMA_UNAVAILABLE`, con estado de error. La aplicación no simula haber ejecutado la acción.

## Qué debe exportarse de Tavus

Desde la configuración del agente **que ya existe**, hay que copiar las definiciones JSON de estas tres funciones, incluyendo sus `parameters` completos:

- `trigger_3d_camera_movement`
- `highlight_building`
- `trigger_animation`

El contrato debe proceder de esa configuración, no de una propuesta generada para esta aplicación. Cada definición mantiene la forma `{"type":"function","function":{"name":…, "parameters":…}}`; `description` y `strict` son opcionales. La API pública de inicio del widget no proporciona estos esquemas. El repositorio no contiene los argumentos reales del agente y no incluye un manifiesto de producción de ejemplo que pueda confundirse con ellos.

Después de revisar los esquemas reales, un desarrollador debe declarar la equivalencia entre sus campos y los comandos de presentación de Bird View. Se guarda todo en una variable de servidor, `TAVUS_TOOL_CONTRACTS_JSON`, con estos campos:

| Campo | Contenido |
| --- | --- |
| `version` | El número `1`. |
| `source` | La cadena `exported-from-existing-tavus-agent`. Declara la procedencia del export; no constituye una verificación remota. |
| `tools` | Las tres definiciones reales, sin sustituir sus esquemas. |
| `bindings` | Un objeto con una entrada por cada uno de los tres nombres exactos. |

No se debe guardar ninguna API key en el manifiesto: sus esquemas y sus bindings son configuración pública que el navegador necesita para validar las llamadas. `GET /api/tavus-config` devuelve únicamente la configuración pública admitida; no devuelve el resto de variables de entorno.

## Bindings de presentación

Estos campos pertenecen **a Bird View**. No afirman nada sobre los nombres de parámetros de las herramientas de Tavus.

Cada binding admite `action`, `target`, `duration` y `animation`:

- `action` resuelve a `overview`, `focus`, `highlight` o `animation`.
- `target`, cuando procede, contiene `kind` e `id`. Los tipos admitidos son `district`, `sales-stage`, `deal`, `account`, `owner`, `communication`, `industry-stage`, `batch` y `vehicle`. El controlador comprueba además que el ID exista en la instantánea actual.
- `duration` es opcional y se expresa en segundos, entre `0.15` y `12`.
- `animation` resuelve a `pulse`, `traffic` o `machinery`. `pulse` necesita un destino.

Cada valor se expresa mediante **una** de estas formas:

| Forma | Significado |
| --- | --- |
| `{"value":"focus"}` | Constante de presentación revisada por el desarrollador. |
| `{"pointer":"/ruta/al/campo"}` | Lee ese campo de los argumentos ya validados, usando JSON Pointer. La ruta debe corresponder al esquema real. |
| `{"pointer":"/ruta/al/campo","map":{"valorDeOrigen":"valorDeDestino"}}` | Traducción explícita de un valor mediante una tabla. No hay heurísticas ni equivalencias implícitas. Las claves se comparan con `String(valor)`. |

Una ruta sin valor, un enum sin correspondencia o una acción fuera de la lista admitida produce un error estructurado. No se insertan valores por defecto. No se evalúa código procedente de las herramientas ni de los bindings.

Los ejemplos de argumentos de `tests/demo-tool-contracts-model.test.mjs` son **fixtures sintéticos de prueba**. No describen el agente del usuario y no deben copiarse como configuración real.

## Validación y límites

`src/demo/tool-contracts.js` valida el manifiesto al cargarlo y vuelve a validarlo antes de crear el puente que consume los eventos. AJV 8 comprueba los argumentos con el esquema exportado antes de resolver el binding. La configuración utiliza `coerceTypes: false`, `useDefaults: false` y `removeAdditional: false`: un tipo incorrecto o un campo extra prohibido no se corrigen silenciosamente.

El soporte actual utiliza la versión de JSON Schema que admite AJV por defecto, con sus comprobaciones estrictas. Se permiten referencias locales `#` y `#/…`; se rechazan las referencias remotas, `$dynamicRef`, `$recursiveRef`, vocabularios o formatos que esta instalación no pueda validar. Un esquema no soportado requiere revisar la integración; no se transforma en un esquema más permisivo. Las tres definiciones y sus bindings deben ser válidos para activar el puente.

Límites: manifiesto de 128 KiB, argumentos de 16 KiB, profundidad máxima de 32, 4.096 nodos y 256 elementos por array. Sólo se admiten los tres nombres exactos. La respuesta del puente siempre indica `businessMutation: false`; sólo dispone del controlador de cámara y efectos, sin acceso a proveedores de escritura del CRM o ERP.

El evento de entrada es `tavus:tool-call` del SDK `@tavus/widget` 0.19.3, cuyo `detail` documentado contiene `name`, `arguments` y, opcionalmente, `tool_call_id`, `seq` y `turn_idx`. La sesión se encarga de deduplicar y de responder con `conversation.tool_result`; los eventos de protocolo observados no se vuelven a ejecutar como herramientas.

## Comprobación

```bash
node --test tests/demo-tool-contracts-model.test.mjs tests/demo-tavus-config-model.test.mjs
```

Las pruebas comprueban argumentos exactos, ausencia de esquemas, esquemas no soportados, referencias remotas, mapeos explícitos, límites, errores del controlador, cierre de sesión y ausencia de credenciales en la configuración pública. No comprueban los esquemas reales del agente: siguen pendientes de exportación.
