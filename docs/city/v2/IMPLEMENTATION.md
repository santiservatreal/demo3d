# Atlas · Televisión, barrios y actividad comercial

Esta iteración aplica la petición de TV sin menús, colores más vivos, zonas claras, reconstrucción de oportunidades y comerciales asociados a sus ventas. Mantiene el proveedor ficticio y los IDs existentes.

## Pantalla de televisión

TV usa toda la ventana para el canvas. Oculta barra lateral, cabecera de trabajo, pestañas, buscador, filtros, fichas, tarjetas inferiores y controles del mapa. Conserva indicadores arriba y cuatro resúmenes de comerciales abajo. La X y Escape permiten salir; se restauran vista, selección y filtros anteriores.

Un clic en TV solicita Fullscreen API con gesto del usuario cuando existe. Si el navegador la rechaza, el modo inmersivo CSS sigue funcionando. Salir del fullscreen nativo también abandona TV. TV no genera eventos ni cambia importes. Las cifras son pipeline potencial y cierres comerciales; no se añade un presupuesto o un saldo que no exista en la fuente.

## Barrios reconocibles

Los acentos son azul, turquesa, ámbar, violeta y verde. Los nombres por defecto pasan a Nuevos leads, Cualificados, Propuestas, Negociación y Ventas ganadas; los IDs del CRM no cambian. Las parcelas, bordes y placas comparten el mismo color y numeración.

Las placas HTML tienen contraste y posición al frente de cada zona; clientes dispone de un paseo y placa independientes. El cálculo de colisiones usa dimensiones reales y busca otra posición cercana para que una incidencia no tape un título. Las etapas siguen siendo configurables.

## Deconstruir, transportar y construir

`src/city/construction.js` gestiona una secuencia de 12 segundos por cambio de etapa:

| Tiempo relativo | Representación                                                                   |
| --------------- | -------------------------------------------------------------------------------- |
| 0–28 %          | Una grúa desmonta piezas por altura en la parcela de origen.                     |
| 28–68 %         | El edificio está ausente; un camión lleva materiales por las vías entre accesos. |
| 68–100 %        | Una grúa monta piezas en la parcela reservada de destino.                        |

`architecture.js` actualiza matrices de piezas instanciadas y conserva meshes, geometrías e ID de la oportunidad. El bloque completo no vuela entre barrios. Dos equipos de obra pueden trabajar a la vez; los demás esperan en cola. Cancelar o reiniciar restaura un estado consistente. Archivar o perder una oportunidad cancela la obra anterior.

La operación CRM se aplica de inmediato una sola vez; la secuencia ilustra el cambio. No crea inventario, gastos de construcción, facturas, cobros ni nuevos eventos. Replay reconstruye etapas sin encadenar docenas de obras; cargar snapshots tampoco desencadena obras. Movimiento reducido muestra el destino directamente sin grúas ni camión.

## Comerciales y recuento

`src/city/people.js` dibuja cuatro personajes con ropa de color, acreditación, tablet/maletín y extremidades animadas. Utiliza un grafo peatonal que evita las huellas de edificios y cruza las vías por pasos señalizados. Asocia responsable y cuenta desde las oportunidades; visita cuentas en negociación/propuesta y, tras una venta, visita la cuenta y acompaña la oportunidad a su nueva sede cuando termina la obra.

Los paseos son una metáfora de actividad comercial, no GPS, asistencia ni evidencia de productividad de trabajadores. No alteran el estado CRM. La capa Actividad permite ocultar los personajes. Las posiciones se mantienen estables cuando se prefiere movimiento reducido.

`ownerPerformance(state)` calcula abiertas e importes y cierres del mes por responsable. Usa IDs únicos e historial explícito de cierre; repetir un evento o animar más frames no incrementa el recuento. Datos ausentes se conservan como no disponibles. En la demo cada responsable comienza con seis abiertas y una ganada, sumando 24 abiertas y cuatro ganadas por 30.000 €.

## Ejecutar y comprobar

```sh
npm ci --cache /tmp/atlas-npm-cache
npm run dev
npm test
npm run build
# Con preview en el puerto 4173:
npm run test:city-v2
```

Los tests de modelo, obras y personas no requieren GPU. Los de navegador utilizan Chromium con SwiftShader en este entorno; las capturas, clip y resultados se describen en [VALIDATION.md](VALIDATION.md). No se ha probado un teléfono ni una GPU física, ni hay una conexión real a un CRM.
