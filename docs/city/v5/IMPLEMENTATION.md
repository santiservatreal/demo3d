# Atlas · Mapa fijo y asistente

La ciudad mantiene una perspectiva isométrica estable para leer el negocio de un vistazo. El ratón y los gestos desplazan o acercan el mapa; no lo giran. Los enfoques de registros, los comerciales y el recorrido TV conservan la misma orientación. Las flechas permiten desplazar la cámara sin arrastrar.

## Información fuera de la ciudad

Los nombres de barrios, los totales y los contadores de comunicaciones están en una franja fija después del canvas, dentro del flujo de la página. En Empresa, esa franja ofrece tres accesos a Ventas, Comunicaciones e Industria. Pasar el cursor por un edificio actualiza el contexto de esa franja; no crea un pop-up sobre los edificios. Los títulos decorativos grandes y las antiguas placas flotantes se retiran del mapa.

La cabecera se compacta y los textos promocionales dejan espacio a la ciudad. El mapa conserva una altura mínima independiente del chat; si la pantalla es pequeña, se desplaza el contenido de la página en vez de cubrir el mapa con la conversación. El campo de consulta se mantiene visible al expandir el chat y al recibir una respuesta.

Las iniciales de los cuatro comerciales siguen proyectándose en cada frame, con contenido DOM conservado. Ahora son pequeñas, sin línea vertical, ancladas al pavimento detrás y a un lado de la persona. Se mantiene una separación mínima en pantalla para dejar visible el cuerpo. El detalle completo sigue disponible al seleccionar al comercial.

## Mini chat

El asistente ocupa una franja debajo del mapa. La conversación se expande en el flujo de la página, con historial acotado, sin cubrir la ciudad. En pantallas pequeñas la zona principal puede desplazarse verticalmente y las etapas se desplazan horizontalmente dentro de su propia franja.

Ejemplos:

- **Dónde está Lucía:** busca al responsable registrado, enfoca su personaje y describe su actividad ilustrativa.
- **Dónde está Felipe:** consulta el vehículo asignado y abre su información industrial; el trayecto sigue siendo una estimación sin GPS.
- **Cuántas ventas llevamos:** responde desde las oportunidades actuales y sus cierres registrados.
- **Qué necesita atención:** muestra tareas vencidas y activa el filtro de atención.
- **Cuánto stock hay:** consulta el mismo proveedor industrial que los almacenes y camiones.
- **Facturación total:** explica que no existen registros de facturas en esta demo. Una oportunidad ganada no acredita facturación, cobro ni beneficio.

El modo local interpreta consultas admitidas y está identificado como **Demo local · consultas guiadas**. La conexión opcional a un modelo utiliza un endpoint del servidor y muestra **IA** cuando recibe una respuesta válida. La clave no está configurada en este entorno; las consultas siguen funcionando en modo local. Configuración y límites en [AI_SETUP.md](AI_SETUP.md).

Las acciones del chat sólo cambian la visualización. No envían comunicaciones, alteran inventario, cierran ventas ni escriben en el CRM. Las respuestas usan texto seguro, los identificadores se comprueban contra los registros actuales y las respuestas asíncronas antiguas se descartan al reiniciar o destruir el asistente.

## Recomendaciones proactivas

Una tarjeta junto al chat aparece tras doce segundos y puede rotar cada treinta segundos. Se basa en evidencia: tareas vencidas, tiempo en una etapa, última actividad registrada y conversaciones pendientes. Usa la fecha de referencia del CRM, no el reloj actual para aparentar datos nuevos. No concluye que una persona haya bajado su rendimiento sin períodos comparables.

Sólo se muestra una tarjeta a la vez. Puede abrirse el registro, descartarse el consejo o silenciarse la función. Un consejo que deja de ser válido desaparece al actualizar sus datos. Las recomendaciones se pausan con la página oculta y el asistente se oculta durante TV y Replay. No realizan llamadas a servicios de IA ni envían mensajes por sí solas.

## Validación

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal, con Chromium instalado:
npm run test:city-v5
```

La selección de edificios, las obras, la maquinaria, los traslados y los proveedores de las versiones anteriores se conservan. Las pruebas de navegador usan renderizado por software; no se presenta su velocidad como una tasa de FPS en hardware físico. Resultados y capturas en [VALIDATION.md](VALIDATION.md).
