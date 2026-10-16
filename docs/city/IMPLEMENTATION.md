# Atlas · Implementación de ciudad CRM

## Separación de responsabilidades

`src/city/model.js` contiene el contrato normalizado, proveedor ficticio, métricas y eventos; no importa Three.js ni el DOM. `scene.js` mantiene cámara, selección y transiciones; `architecture.js` construye un kit modular reutilizable con instancias por material. `traffic.js` separa la simulación de carriles de la representación de coches y moto. `app.js` suscribe la interfaz al proveedor y ofrece una tabla accesible, ficha y controles. Las ruedas se actualizan por transformaciones, sin reconstruir HTML por frame.

El stack existente sigue siendo Vite 7.3.7 + Three.js 0.180.0 y JavaScript ES modules. No se introduce React, un segundo motor ni WebGPU. La investigación anterior de WebGPU se conserva en los documentos de Luma; esta ciudad usa WebGLRenderer con ACES y salida sRGB, sin conectar EffectComposer a un renderer incompatible.

## Fuente y eventos

Un futuro adaptador deberá suministrar un snapshot con `stages`, `deals`, `accounts`, `owners`, `activities`, `events`, `source`, `historyCoverage` y `now`. Las etapas incluyen `kind: open|won|lost` y no dependen de cinco etiquetas fijas en el modelo. Los IDs CRM permanecen estables. Las actividades se relacionan mediante `dealId` o `accountId`.

```js
provider.dispatch({
  id: "crm-event-123",
  entityId: "deal-013",
  timestamp: "2026-10-16T10:16:00+02:00",
  type: "deal.won",
  source: "atlas-demo",
  payload: { stageId: "won", accountId: "account-001" },
});
```

El procesador rechaza IDs repetidos, entidades o etapas desconocidas, eventos mal formados y transiciones anteriores al estado actual. Reutiliza las cuentas existentes; crea otra solamente si el evento indica una asociación nueva explícita. No genera factura, cobro o beneficio al ganar. Una probabilidad ausente permanece ausente. Los importes desconocidos no se reemplazan por cero para las métricas.

La demo no es una conexión autenticada. Un backend futuro debe resolver autenticación, autorización, procedencia y permisos antes de entregar datos al navegador. Las claves de API no pertenecen al bundle.

## Totales reproducibles

| Estado inicial    | Registros |   Importe |
| ----------------- | --------: | --------: |
| Lead              |         7 |  31.500 € |
| Qualified         |         5 |  25.000 € |
| Proposal          |         6 |  33.000 € |
| Negotiation       |         6 |  30.500 € |
| Abiertas          |        24 | 120.000 € |
| Won, octubre      |         4 |  30.000 € |
| Perdidas, octubre |         3 |  18.500 € |

18 cuentas activas, 7 contactos pendientes, 9 conversaciones pendientes, 12 llamadas del día y 5 tareas vencidas. Las cuentas y actividades no se suman como oportunidades. El importe de ventas adicionales es potencial y no se suma al pipeline.

La tasa 4/(4+3)=57,1 % se calcula desde cierres del mes y exige una cobertura histórica explícita. Sin esa cobertura, muestra «No disponible». La fecha y zona de la demo son 16 octubre 2026 y Europe/Madrid; no se presenta como una sincronización en directo.

Replay reconstruye las etapas a partir de sus eventos y conserva el snapshot de cuentas/productos/actividades. No reconstruye atributos históricos que no existen. Al abandonar Replay se restaura el snapshot guardado; TV no modifica datos.

## Correspondencia visual

- Barrio: etapa del pipeline; zona separada de clientes activos.
- Edificio: oportunidad con ID estable y parcela reservada. Las perdidas permanecen en el archivo de tabla.
- Acento: etapa, acompañada por nombre y número.
- Altura: `clamp(1.8 + sqrt(importe / 10000) * 4.2, 2.2, 8.8)`, metáfora sin unidades físicas. Huella estable. La ficha muestra el importe exacto; los valores grandes se acotan. Si falta el importe, el edificio usa una altura neutra de 4 unidades y la ficha y los totales muestran «No disponible».
- Rojo y símbolo `!`: tarea vencida.
- Anillo: selección.
- Conexión continua temporal: traslado de etapa; conexión discontinua: relación con cliente. Límite simultáneo y retirada tras el evento.
- Árboles, bancos, fuente, alumbrado y vehículos: decoración, sin IDs comerciales adicionales.

La arquitectura incluye marcos profundos y cristales separados, basamentos, forjados, cubiertas, retranqueos, balcones y barandillas, pérgolas y jardineras. No se usa una imagen de fondo para fingir la ciudad. Las piezas y materiales se comparten por instancing. El HDR local se reutiliza de los assets originales CC0 de Luma; no hay modelos ni texturas externos pendientes de descarga.

## Tráfico e interacción

El tráfico usa un grafo dirigido de ocho segmentos: cuatro rectas y cuatro arcos tangentes. Nueve vehículos recorren un bucle sin cruces de trayectorias; los semáforos controlan pasos a nivel. Frenada, seguimiento, radio de giro y ruedas se resuelven con un paso fijo de 1/60 s. No es un simulador de tráfico multimodal ni representa transporte de clientes.

La escena emplea OrbitControls, raycasting sobre instancias arquitectónicas y distingue tap de arrastre. La tabla usa los mismos datos y filtros. Las fichas son HTML y mantienen su nitidez independientemente del DPR. En móvil hay bottom sheet con tres alturas, safe areas y controles principales de al menos 44 px. Si no hay contexto WebGL2, se ofrece tabla funcional y aviso.

Los presets modifican DPR, sombras y piezas de detalle. La calidad Ligera oculta y pausa el tráfico ambiental antes de reducir la nitidez de la arquitectura. El modo Auto cambia entre equilibrada y ligera con histéresis. La pestaña oculta pausa trabajo visual y temporal. Movimiento reducido suspende el tráfico, las celebraciones y la animación de cámara y relaciones. Los resultados medidos y los límites de hardware figuran en VALIDATION.md.

## Licencias y assets

Las parcelas se reservan por ID y las llegadas a una etapa buscan un destino libre. Para una concentración excepcional, como las 31 oportunidades en Lead al principio de Replay, el terreno crece hacia el norte y la vista general ajusta su encuadre; no se duplica una parcela ni se saca un edificio al vacío. No es un motor de urbanismo ni un GIS; el diseño de la demo prima sobre datos de ubicación real.

El kit nuevo se define íntegramente en `architecture.js`, `scene.js` y `traffic.js`; es geometría original presente en el repositorio. El HDR `public/assets/luma/studio.hdr` y su generador tienen licencia CC0 en `public/assets/luma/LICENSE.txt`. Three.js usa MIT, Lucide ISC y las fuentes OFL; las licencias completas permanecen en `docs/luma/licenses`.
