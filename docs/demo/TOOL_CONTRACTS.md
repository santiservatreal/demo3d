# Contratos de las herramientas del agente existente

Los tres exports reales entregados por el usuario están incluidos en [`src/demo/existing-agent-tools.js`](../../src/demo/existing-agent-tools.js). Se conservan los nombres, descripciones y JSON Schema originales; no se copian metadatos de propietario ni fechas. La integración utiliza el PAL y el deployment existentes, sin registrar herramientas nuevas en Tavus.

## Parámetros reales

| Función existente | Campo obligatorio | Tipo |
| --- | --- | --- |
| `trigger_3d_camera_movement` | `movement_id` | `string` |
| `highlight_building` | `building_id` | `string` |
| `trigger_animation` | `animation_id` | `string` |

Los exports no contienen `enum` ni `additionalProperties: false`. La aplicación no añade esas restricciones al esquema. AJV exige los campos y tipos originales; los campos adicionales admitidos por el export se ignoran al resolver la acción, en lugar de interpretarse como comandos.

## IDs de presentación de Bird View

Al cargar la ciudad se construye un catálogo con objetos existentes. Antes de cada conversación se envían sus IDs y nombres, junto con las definiciones de las tres herramientas, en `conversational-context`. Los valores siguientes pertenecen a Bird View: no son herramientas nuevas ni enums añadidos al PAL.

| Parámetro | Valores anunciados al agente |
| --- | --- |
| `movement_id` | `overview`, o `kind:id` para enfocar un distrito, etapa comercial, comercial, lote, vehículo o edificio. |
| `building_id` | `kind:id` de un edificio existente: `deal`, `account`, `communication` o `industry-stage`. |
| `animation_id` | `traffic`, `machinery` o `pulse:kind:id` de un edificio del catálogo. |

Ejemplos válidos en la instantánea inicial:

```json
{"movement_id":"owner:owner-lucia"}
{"building_id":"industry-stage:manufacturing"}
{"animation_id":"traffic"}
```

La ciudad inicial anuncia **82 movimientos, 55 edificios y 57 animaciones**. No incluye edificios de oportunidades perdidas. Los catálogos tienen límites explícitos y señalan `truncated` cuando una instantánea mayor no cabe; sólo se aceptan los IDs incluidos en sus tablas. No se buscan nombres parecidos ni se inventan alias. Si un objeto desaparece después de construir el catálogo, el controlador también lo rechaza al comprobar la instantánea actual.

Las tablas traducen la cámara a `overview` o `focus` con una transición de 2,8 segundos, el resaltado a `highlight` durante 5 segundos y las animaciones a `traffic`, `machinery` o `pulse` durante 5 segundos. Son decisiones de presentación locales. El agente no puede establecer duraciones arbitrarias ni pasar comandos completos como argumentos.

## Configuración incluida y override opcional

No hace falta configurar `TAVUS_TOOL_CONTRACTS_JSON`. Vacía o ausente, la API devuelve `contractSource: "bundled"` y `contracts: null`; el cliente genera los bindings incluidos cuando la ciudad está lista. El deployment público configurado se obtiene de `TAVUS_DEPLOYMENT_ID`, `VITE_TAVUS_DEPLOYMENT_ID` o del valor de compilación. No se necesita una API key para el widget.

Para una integración que cambie deliberadamente las herramientas del PAL, `TAVUS_TOOL_CONTRACTS_JSON` permite sustituir el manifiesto completo. Debe contener:

| Campo | Contenido |
| --- | --- |
| `version` | `1`. |
| `source` | `exported-from-existing-tavus-agent`. Declara la procedencia; no constituye una verificación remota. |
| `tools` | Las tres definiciones reales con forma `{"type":"function","function":{"name":…, "parameters":…}}`. |
| `bindings` | Una entrada por cada nombre exacto, que traduce argumentos validados a acciones permitidas. |

Un override explícito inválido desactiva el puente: no se sustituye silenciosamente por los contratos incluidos. El manifiesto es configuración pública que necesita el navegador; no debe contener API keys. `GET /api/tavus-config` no devuelve otras variables de entorno.

Los bindings pueden usar una tabla de comandos completa, `{"command":{"pointer":"/campo_real","map":{"valor":{"action":"overview"}}}}`, como hace la configuración incluida. También se admite resolver por separado `action`, `target`, `duration` y `animation` mediante constantes `{"value":…}` o un JSON Pointer `{"pointer":"/campo_real","map":{…}}`. Los pointers deben corresponder a los esquemas reales y todas las equivalencias son explícitas.

Las acciones permitidas son `overview`, `focus`, `highlight` y `animation`. Los tipos de destino son `district`, `sales-stage`, `deal`, `account`, `owner`, `communication`, `industry-stage`, `batch` y `vehicle`; cada ID se comprueba contra la instantánea. Las duraciones configuradas deben estar entre `0.15` y `12` segundos, y las animaciones se limitan a `pulse`, `traffic` y `machinery`. Un valor sin correspondencia devuelve un error estructurado.

## Validación y alcance

AJV 8 valida el manifiesto al cargarlo y de nuevo al crear el puente. Los argumentos de cada llamada se contrastan con el esquema real antes de traducirlos. Se utiliza `coerceTypes: false`, `useDefaults: false` y `removeAdditional: false`: no se cambian tipos ni se insertan valores por defecto.

Se permiten referencias locales `#` y `#/…`; se rechazan referencias remotas, `$dynamicRef`, `$recursiveRef` y vocabularios o formatos que esta instalación no pueda validar. Límites: manifiesto de 128 KiB, argumentos de 16 KiB, profundidad de 32, 4.096 nodos y 256 elementos por array. Sólo se admiten los tres nombres exactos.

El evento de entrada del SDK 0.19.3 es `tavus:tool-call`, con `detail` que contiene `name`, `arguments` como JSON string y, opcionalmente, `tool_call_id`, `seq` y `turn_idx`. La sesión deduplica y responde con `conversation.tool_result` cuando hay un ID de correlación. La copia del evento en `tavus:protocol-message` no vuelve a ejecutar la acción.

El resultado indica `businessMutation: false`. El puente sólo accede a cámara y efectos: no cierra ventas, fabrica unidades, avanza lotes, confirma entregas ni registra cobros. El movimiento de tráfico o maquinaria es visual. El agente debe esperar el resultado antes de afirmar que una acción se ha completado.

## Comprobación

```sh
node --test tests/demo-existing-agent-tools-model.test.mjs tests/demo-tool-contracts-model.test.mjs tests/demo-tavus-config-model.test.mjs
```

Las pruebas contrastan los exports reales, recorren todos los IDs anunciados, comprueban tipos, destinos desconocidos, límites y ausencia de cambios en CRM/ERP. También prueban overrides inválidos y ausencia de credenciales en la configuración pública. Las pruebas de navegador con dobles del SDK inyectan eventos para comprobar el puente y la escena WebGL; no acreditan una conversación de voz real con Tavus. Resultados y límites: [VALIDATION.md](VALIDATION.md).
