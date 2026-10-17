# Atlas · Fluidez y movimiento

Esta iteración atiende los saltos de etiquetas, el parpadeo industrial, la falta de movimiento entre procesos y las mejoras de presentación solicitadas. Mantiene los proveedores ficticios, sus identidades y las reglas de unidades, ventas y entregas.

## Corregir las causas de los saltos

Las etiquetas se recolocaban cada 0,12 segundos y volvían a crear nodos y medirlos aunque su contenido no hubiera cambiado. Ahora su proyección se actualiza en cada fotograma, después de mover la cámara y los avatares, mediante `translate3d` con coordenadas subpíxel. El contenido y los tamaños se conservan mientras no cambien. Las iniciales del comercial mantienen un anclaje estable; las colisiones de rótulos se resuelven al cambiar contenido o terminar una navegación, evitando recolocaciones continuas mientras se mueve el mapa.

Las actualizaciones de un edificio antes marcaban como pendientes los buffers completos de matrices y colores. Ahora se envía únicamente el rango de matrices del edificio afectado, y sus colores sólo si cambia el acento. Se conservan los objetos, buffers, geometrías e IDs usados por selección y obras. En la medición Node de `deal-001`, 126 piezas, los bytes pendientes bajan de **3.454.580 a 8.064**. Es una medición de datos transferidos, no de FPS.

## Suelo y maquinaria industrial

El asfalto industrial compartía altura con la ampliación del pavimento de la ciudad. Se han separado los niveles del suelo, carretera, pintura, parcelas y zonas de carga. Las pruebas comprueban que las superficies superpuestas tengan alturas distintas, incluidos cruces y aparcamientos. Las sombras móviles se evitan en los elementos instanciados para no dejar marcas antiguas.

Las máquinas muestran pistones, brazos, rodillos y cajas en movimiento usando geometrías compartidas. Un cambio explícito de etapa inicia una transferencia visual de ocho segundos con recogida, traslado en carretilla y descarga. La entrega muestra la descarga desde el camión hacia el cliente. Dos equipos reutilizables atienden los movimientos y los demás esperan; cambios rápidos de un mismo lote se agrupan hacia su último destino. Reinicios, carga inicial y Replay no reproducen trabajos históricos.

Los números se actualizan con el evento de origen. Las carretillas y muestras de cajas ilustran ese evento; no son otra existencia de inventario y no publican eventos. Se conservan diez lotes y 1.320 unidades en la demo.

## Simular un proceso completo

El botón **Simular proceso** inicia una reproducción ficticia que puede pausarse. Avanza los lotes existentes por fabricación, empacado, almacén, transporte y entrega, esperando a que termine la transferencia visual anterior. Los comandos se programan desde un controlador de demo separado del renderer, con intervalos de 14 segundos. Si falta un vehículo disponible, la demo registra por separado la entrega de una carga, el regreso vacío y la llegada antes de volver a cargar.

Esta reproducción está desactivada inicialmente. Se pausa al entrar en Replay o reiniciar y no publica eventos mientras la página está oculta. Termina cuando todos los lotes están entregados. Replay también bloquea los comandos manuales de avance, regreso y llegada aunque su panel estuviera abierto. No crea productos, unidades, ventas comerciales ni cobros. Una ruta animada por sí sola continúa sin confirmar entregas.

## Enfatizar y presentar

Correos, llamadas, mensajes y reuniones muestran un símbolo reconocible y su contador: sobre, teléfono, conversación y taza. Los pendientes conservan su cifra separada.

Al enfocar un distrito, los otros reciben una transición suave con menos saturación y una ligera mezcla atmosférica con el fondo. Se aplica dentro del material en un único pase, sin añadir un filtro de desenfoque de pantalla completa. La vista **Empresa** restaura el aspecto de todos los distritos; la selección 3D conserva sus geometrías.

Desde **Empresa → TV**, el recorrido alterna vista general y distritos comercial, de comunicaciones e industrial. Cada transición dura siete segundos y cada pausa, nueve. Se interpolan posición, orientación, zoom y encuadre de la cámara para evitar saltos entre sectores. Si cambia el tamaño de la pantalla durante una transición, el vuelo continúa con la relación de aspecto y el destino recalculados. Navegar manualmente lo pausa 14 segundos. Salir de TV recupera la vista guardada. Movimiento reducido desactiva el recorrido automático.

## Celebrar eventos registrados

Una oportunidad que pasa a ganada y un lote que pasa a entregado generan una tarjeta temporal con entidad, cliente, importe o unidades. El confeti usa 36 piezas CSS animadas por transformaciones y opacidad; no añade trabajo al renderer 3D. Sólo hay una tarjeta visible y dos en espera como máximo; se deduplica por evento y por cierre de entidad.

La carga inicial, los snapshots, el reinicio, Replay y los eventos repetidos no celebran cierres históricos. La tarjeta aparece con opacidad completa desde el principio, con una entrada de posición breve. Su tiempo de lectura de 5,6 segundos empieza tras dos callbacks de animación, para dar al navegador la oportunidad de pintarla; también se puede cerrar con su botón. Reiniciar o destruir cancela tanto los callbacks pendientes como el temporizador. El aviso anuncia el mensaje sin tomar el foco. Movimiento reducido conserva la tarjeta y elimina las partículas.

## Comprobación

```sh
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:city-v4
node tools/measure_city_v4.mjs
```

La comparación usa el mismo viewport y preset antes y después. Las muestras y los límites del entorno de GPU por software se describen en [VALIDATION.md](VALIDATION.md). No se añade ninguna dependencia ni se acredita una tasa de FPS en un equipo físico.
