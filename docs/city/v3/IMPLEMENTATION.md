# Atlas · Una ciudad para toda la empresa

Esta ampliación añade identidad de los comerciales, un barrio de comunicaciones y un circuito industrial a la ciudad existente. No abre una experiencia separada ni conecta servicios externos. Todos los registros de esta demo son ficticios.

## Explorar la ampliación

Los botones **Ventas**, **Comunicaciones**, **Industria** y **Empresa** encuadran distritos de una misma escena. La isla se extiende hacia el norte y mantiene caminos entre las zonas. La vista Empresa usa tres resúmenes; cada distrito muestra sus placas detalladas. Esto evita llenar el mapa con todos los títulos a la vez.

Los locales, estaciones, lotes y camiones se seleccionan en 3D. Los paneles laterales muestran sus registros y permiten seguir una relación hasta su cuenta u oportunidad comercial. La vista de tabla comercial y las experiencias anteriores se conservan. TV mantiene los indicadores del distrito elegido, sin menús; en industria muestra también los conductores y la carga de la flota.

## Personas presentes en las obras

Cada responsable tiene una insignia compacta con sus iniciales y color, ligada a la posición del avatar. Durante una obra se amplía con el nombre y el contexto. Las insignias permiten abrir el equipo y cartera; no representan GPS ni control de asistencia.

Todos los cambios de etapa, incluidas las etapas abiertas, asignan una visita al responsable. El comercial se acerca al origen, recorre las aceras hasta el destino y permanece durante la construcción y cuatro segundos después. El montaje espera a que esté junto a la fachada; la espera tiene un límite de 40 segundos ante datos o rutas que no permitan llegar. Una persona atiende una sola obra a la vez y las demás quedan en cola. Se comprime el recorrido durante la obra para acompañar la coreografía rápida.

La operación CRM se registra antes de la animación. Ni caminar, esperar ni acabar una obra crea otro evento o aumenta ventas. El director acepta un resolvedor opcional de presencia; sin él conserva el comportamiento anterior. Ocultar Actividad libera la espera. Movimiento reducido presenta una pose estable y completa el cambio de parcela sin desplazamientos animados.

## Los registros de comunicación tienen un lugar

| Local | Fuente de actividad | Placa y panel |
| --- | --- | --- |
| Correos | `email` | Correos realizados hoy y pendientes |
| Central de llamadas | `call` | Llamadas realizadas hoy y pendientes |
| Casa de mensajes | `whatsapp`, `message`, `conversation` | Resumen conjunto y desglose por canal |
| Cafetería reuniones | `meeting` | Reuniones realizadas y otras pendientes o previstas |

`communications-model.js` cuenta IDs únicos. Una actividad realizada debe estar completada y su fecha de realización debe pertenecer al día de la empresa, sin estar en el futuro. Prefiere `completedAt`; usa `occurredAt` cuando no existe una fecha de realización separada. Las previstas no entran en el número de reuniones realizadas. Los pendientes se muestran como otra cifra. La zona horaria por defecto es Europe/Madrid.

Los WhatsApps son ocho registros de demo explícitos (seis completados y dos pendientes). Las nueve conversaciones originales siguen siendo conversaciones genéricas: no se convierten en WhatsApps. Un canal ausente queda como no disponible; una cobertura explícita permite distinguir un cero real. Los paneles permiten leer el asunto, estado, hora, origen y relación CRM. No hay envío, recepción ni acceso a una bandeja real.

`communications.js` construye cuatro locales originales, con símbolos, mobiliario y terraza. Cada local usa una malla fusionada, comparte materiales y libera sus recursos al cerrar la escena.

## Un circuito industrial con trazabilidad

`industry-model.js` separa el dominio industrial de las oportunidades comerciales. Su proveedor simulado representa los registros que podría aportar un CRM con operaciones o un ERP. No deduce stock ni fabricación a partir de una venta. Un adaptador futuro necesita aportar expresamente productos, lotes, camiones, cobertura y eventos.

| Etapa | Unidades iniciales | Representación |
| --- | ---: | --- |
| Fabricación | 240 | Fábrica con maquinaria y cinta |
| Empacado | 120 | Línea de embalaje y cajas |
| Almacén | 480 | Racks, palés y muelle |
| En transporte | 160 | Camiones con conductor, lote y destino |
| Entregado | 320 | Clientes finales y entrega registrada |

Hay diez lotes, un SKU **Kit Atlas**, tres camiones y **1.320 unidades trazadas**. Cada lote ocupa una sola etapa; stock es exclusivamente lo que está en almacén. Los palés y cajas son una representación limitada, y los números del panel muestran las unidades exactas. No se dibuja una caja por cada unidad.

Los controles de demo publican eventos explícitos para avanzar un lote una etapa. Cargarlo necesita un camión disponible en el almacén y con suficiente capacidad. Entregarlo registra una prueba de entrega y vacía el vehículo, que queda en el cliente. Volver vacío y confirmar llegada son dos eventos posteriores. No se crean facturas, ventas ni cobros.

Los IDs, productos y cantidades se conservan. Los eventos duplicados, antiguos, incoherentes o que no respetan la siguiente etapa se rechazan de forma atómica. El resumen del modelo mantiene los totales como no disponibles cuando falta cobertura. Los tests recorren el flujo completo y comprueban la conservación de unidades.

`industry.js` muestra maquinaria, empacado, almacén, despacho, clientes y camiones. Las cintas son ambientales. El trayecto del camión es una ilustración acelerada de la estimación disponible; no es geolocalización. Llegar al extremo visual de la ruta no cambia el lote ni confirma una entrega. La escena nunca publica eventos desde su bucle de renderizado.

## Ejecutar y validar

```sh
npm ci --cache /tmp/atlas-npm-cache
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:city-v3
```

No se añaden dependencias. El modelo industrial y los resúmenes de comunicaciones se prueban sin GPU. Las comprobaciones de navegador y sus capturas están en [VALIDATION.md](VALIDATION.md); usan Chromium y SwiftShader en este entorno, con móvil emulado, sin acreditar rendimiento de hardware físico.
