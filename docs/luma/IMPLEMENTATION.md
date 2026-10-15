# Luma Works · Entrega gráfica y simulación

Este escenario sustituye la primera vista de Atlas por un campus industrial compacto. El Atlas operativo anterior se conserva en `/?experience=operations`; el original, en `/?experience=classic`. Las correspondencias HubSpot y las plantillas sectoriales anteriores continúan accesibles allí. No se ha creado ni afirmado una integración CRM real.

## Renderer y compatibilidad

Three.js **0.180.0**, una única versión en el lockfile. Se mantiene JavaScript modular, acorde al repositorio; no se añade React/R3F, otro motor ni dependencias alpha. Todas las dependencias directas están fijadas a sus versiones verificadas.

La prueba `renderer-lab.html` usa los mismos GLB del producto: camión, almacén, HDR local, sombras, material físico de nodos, raycasting y pipeline TSL. En r180 la API se llama **PostProcessing**, no RenderPipeline. Se probó inicialización asíncrona y se esperó el trabajo de la GPU, evitando confundir una página que no dibuja con una prueba correcta.

- El backend **WebGL2 de WebGPURenderer** renderiza la prueba.
- El backend **WebGPU nativo** pierde el dispositivo en el Chromium/SwiftShader de este entorno: «A valid external Instance reference no longer exists». No se afirma que falle en todos los equipos.
- Se entrega **WebGLRenderer** para el producto. No hay dos campus ni dos propietarios del loop. La prueba de compatibilidad está aislada y no se carga en la aplicación.

Resultados sin editar: [renderer-probe.json](renderer-probe.json).

La cadena principal es RenderPass → GTAO opcional en alta → OutputPass → FXAA. RenderPass trabaja en el target lineal; OutputPass aplica tone mapping ACES y salida sRGB una vez. FXAA recibe la salida transformada. No hay EffectComposer conectado a WebGPURenderer. No se han activado SSR, SSGI, TAA, profundidad de campo ni bloom global. Las luminarias tienen emisión contenida.

## Modelado original y escala

Siete archivos GLB creados en Blender **4.3.2**, con fuente reproducible en `tools/build_luma_assets.py`. No se presentan como modelos comprados ni descargados. HDR RGBE propio generado con Python (`tools/build_luma_environment.py`): un entorno analítico de estudio de alto rango dinámico, no una fotografía. Procedencia, bytes y SHA-256: [asset-manifest.json](asset-manifest.json).

- Camión rígido ligero, aproximadamente 6,5 m: cabina biselada, cristales, limpiaparabrisas, espejos, parrilla, faros/intermitentes, pasos de rueda, neumáticos, llantas y tornillería. Caja, puertas traseras, plataforma elevadora y matrícula ficticia. Nodos independientes para ruedas, dirección, puertas y elevador.
- Fábrica con cubierta segmentada, lucernarios, marcos, paneles y oficina acristalada integrada. No hay edificio por departamento. Cubierta desmontable.
- Almacén con huecos reales, tres muelles, topes, niveladores, bolardos, persianas y ventilación de cubierta.
- Bancos de montaje, componentes, herramientas, comprobación de LED, embalaje, cintas y estanterías. La lámpara parcial y terminada proceden del mismo modelo.
- Carretilla con protección, asiento, ruedas, mástil, carro y horquillas. El palé y las cajas son hijos del carro móvil; el traslado no crea otra transacción.
- Europalé con tablas, tacos y huecos. Cajas con junta, cinta, etiqueta y código gráfico. Pavimento, marcas, pasos, drenajes, bordillos, barrera y luminarias.

1 unidad = 1 metro en el campus. La ruta regional es una **representación esquemática**, no una reproducción de 180 km de carretera. La capacidad de 8 palés es un parámetro nominal de demo; no se entrega un sistema de validación volumétrica de estiba. El envío visible lleva 5 palés. Un palé representa 10 lámparas y cada caja, 5; no se dibujan 2.000 productos separados.

Materiales diferenciados de cartón, madera, caucho, vidrio simplificado, metal, pintura con clearcoat moderado, hormigón y asfalto con microrelieve procedimental. Los mapas de relieve se tratan como datos; colores glTF y HDR usan sus espacios correspondientes. IBL filtrada por PMREM, direccional cálida, relleno suave y sombras ajustadas al campus.

No se ha necesitado KTX2, Meshopt ni texturas externas: el tamaño real de los assets locales está por debajo del presupuesto propuesto. No se han añadido decodificadores que no se utilicen. Instancing para stock, carga y vegetación; batching estático por material que conserva pivotes animados. LOD de vegetación por distancia/zoom, manteniendo siluetas; los modelos de vehículos mantienen su detalle cercano en los tres presets.

## Cámara y controles

Primera vista ortográfica oblicua, ficha cerrada y escena protagonista. Perspectiva opcional conservando el tamaño aparente al alternar. Cuatro encuadres: campus, producción sin cubierta, muelles y Felipe. Transiciones con damping y seguimiento cancelable al comenzar un control manual. El recorrido de presentación dura 50 segundos y se puede omitir; no se inicia con reducción de movimiento.

Etiquetas HTML claras y limitadas: los puestos interiores aparecen al retirar el techo. Las entidades se seleccionan por geometría real; los props instanciados mantienen su entidad de inventario o vehículo. La selección y los modelos no se recrean al pasar eventos o cambiar de vista.

## Simulación y economía

`src/luma/simulation.js` es independiente de Three.js e interfaz. Usa reloj común y calendario de 20 días operativos ficticios de octubre de 2026, mostrados en Europe/Madrid. El escenario se abre el día operativo 12. No pretende representar la fecha real del usuario.

Paso fijo de 20 Hz de tiempo real; ×1, ×60 y ×240. La posición visual interpola el remanente del paso. Una pausa no genera eventos. Al ocultar la pestaña no se acumula una ráfaga de tiempo para la vuelta. La semilla 42 se conserva como metadato; el guion empresarial es completamente determinista y no necesita aleatoriedad para ventas, costes ni cantidades.

El planificador consume todos los eventos intermedios por timestamp incluso al saltar una jornada o un mes. Cada evento tiene eventId, entityId, timestamp, source, payload y tipo. El conjunto de procesados impide efectos duplicados. El historial visible se limita; el ledger conserva las entradas económicas del mes.

BOM simplificada: kit comprado de base, brazo, pantalla, LED y cable (18 €), embalaje (2 €), energía/consumibles variables (4 €). No se simula fundición ni fabricación de componentes electrónicos. Ensamblaje → comprobación → embalaje. Lotes de 10, uno terminado cada 40 minutos, 100 unidades planificadas/día y capacidad nominal 120/día. Las cintas solo se animan dentro de ventanas de operación; un bloqueo retiene producto en curso.

El inventario conserva **kits + producto en curso + terminado + tránsito + entregado**. La carga transfiere stock una vez por palé; la entrega no vuelve a descontar el almacén. Las incidencias retienen la operación si faltan unidades, capacidad o reserva del vehículo. Dos muelles asignados evitan compartir el punto de carga.

### Felipe y LW-024

Felipe conduce LW-01, asignado explícitamente a LW-024 el día 12: 50 lámparas, 10 cajas, 5 palés, 2.500 € de venta. Sale a las 11:00, entrega a las 12:40 y recibe orden de retorno a las 12:45. La ida de 90 km se planifica en 100 minutos; el retorno estimado dura tres horas. ETA de vuelta 15:45; la confirmación normal llega a las 15:47. Horas de Madrid.

La entrega reconoce 2.500 € de ventas y 1.200 € de coste de producto. La factura queda emitida y el cobro pendiente. El retorno vacío exige un evento separado. La ETA agotada solo cambia la presentación a «Llegada pendiente de confirmar». El escenario de pérdida de datos suprime la confirmación; no inventa una llegada.

Coste variable de ruta: 180 km × 0,40 € + 28 € = 100 €. Los 28 € se reconocen una vez en la salida; los kilómetros se devengan mediante eventos, incluida la vuelta vacía. Se separa coste devengado y total previsto. Margen del producto: 1.300 €. Contribución prevista tras ruta: 1.200 €, antes de fijos. No se llama beneficio neto.

Mes objetivo: 2.000 × 50 € = 100.000 €, 48.000 € de producto, 4.000 € de distribución, contribución 48.000 €, fijos 30.000 €, resultado operativo simplificado **18.000 € (18%)**. Los fijos incluyen conductores y vehículos; no están duplicados en los 24 €/unidad. Se devengan 1.500 € por día operativo cerrado. No se muestra saldo de caja.

| Comprobación                     | Día 12 cerrado | Mes base cerrado |
| -------------------------------- | -------------: | ---------------: |
| Unidades entregadas              |          1.200 |            2.000 |
| Ventas reconocidas               |       60.000 € |        100.000 € |
| Coste variable producto          |       28.800 € |         48.000 € |
| Distribución                     |        2.400 € |          4.000 € |
| Fijos                            |       18.000 € |         30.000 € |
| Resultado operativo simplificado |       10.800 € |         18.000 € |
| Stock terminado                  |       200 uds. |         200 uds. |

Los pedidos aún no entregados son comprometido; el objetivo no se trata como realizado. La extrapolación lineal se etiqueta y no está disponible antes del primer cierre. No se promete predicción.

## Qué sigue siendo una demo

No hay OAuth, backend, CRM/ERP/TMS/GPS real, inventario físico validado ni permisos de servidor. Los filtros financieros son una proyección de interfaz, no seguridad. Los anteriores adaptadores y configuración no se han eliminado. No se implementan física de colisiones general ni estiba volumétrica: rutas cinemáticas y reservas del guion. Las curvas visuales resumen una ruta regional y no se pueden usar para navegación real.

No se afirma iluminación global trazada por rayos ni rendimiento universal. La validación de móvil es emulación de viewport en Chromium, no una prueba en dispositivos físicos. El entorno automatizado usa software gráfico; los objetivos de 60/30 FPS requieren mediciones posteriores en equipos físicos de referencia.

## Reproducir

```sh
npm ci --cache /tmp/atlas-npm-cache
npm run dev -- --port 5173
npm test
npm run test:e2e
npm run test:operations
npm run test:classic
npm run build
```

Assets ya incluidos; **Blender no es necesario para ejecutar**. Para regenerarlos:

```sh
blender -b -t 2 --python tools/build_luma_assets.py
python3 tools/build_luma_environment.py
```

`node tools/capture_luma.mjs` usa el servidor de desarrollo para comparación con cámara idéntica, instrumentación de frames y grabación real de navegador. `BASE_URL` cambia su destino. Las capturas y los resultados medidos se enlazan en [VALIDATION.md](VALIDATION.md).

Licencias: assets originales CC0 en `public/assets/luma/LICENSE.txt`. Atribuciones de Three.js MIT, Lucide ISC/Feather MIT y fuentes OFL en [licenses](licenses/). No se han importado assets de procedencia desconocida.
