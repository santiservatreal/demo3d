# Presentación simulada de Bird View

Abre `/demo` y pulsa **Comenzar presentación**. No requiere Tavus, una API key, minutos de conversación ni permisos de cámara o micrófono. El mapa ocupa la ventana; el botón de pantalla completa solicita también el modo nativo del navegador.

La apertura construye el mapa con piezas y edificios escalonados. Después recorre los barrios y se detiene para elegir **comercial**, **industria** o **comunicaciones**. Cada recorrido termina en otra decisión. Los controles inferiores permiten pausar, continuar, retroceder, avanzar, desplazar el tiempo o repetir desde el principio. **Recorridos** permite cambiar de capítulo en cualquier momento. Espacio pausa y continúa; las flechas cambian de plano.

El recorrido comercial entra en el pipeline y muestra una oportunidad ficticia: un comercial acompaña la obra, las grúas desmontan el edificio, un camión hace el traslado y el edificio vuelve a construirse en ventas ganadas. El confeti y una tarjeta celebran la venta. El recorrido industrial sigue productos, preparación, reparto y entrega; el de comunicaciones visita mensajes, llamadas y reuniones.

La narración aparece como subtítulos. El botón de altavoz de la guía activa opcionalmente **la voz del navegador**, con una voz española si está disponible. No es el avatar ni la voz de Tavus. La disponibilidad y pronunciación dependen del navegador y sus voces; los subtítulos funcionan siempre. No se reproduce audio antes de pulsar ese botón.

## Datos y gráficos

Los indicadores proceden de la instantánea ficticia de la aplicación. La coreografía no modifica el CRM, inventario, entregas o eventos: es una capa gráfica reversible. La venta y el reparto del guion son ejemplos, no nuevos registros. El cierre de una oportunidad no se interpreta como facturación o cobro.

Se reutilizan el renderer, la cámara de perspectiva y los modelos Three.js de la ciudad. Las piezas, vehículos y confeti adicionales están acotados y se reutilizan. La pausa y la búsqueda muestrean el mismo tiempo de la coreografía, sin dejar obras de intentos anteriores. Con movimiento reducido se muestran los estados finales y se evitan los efectos de confeti.

La aplicación normal sigue en `/` con su dashboard y cámara fija. La integración del agente se conserva como opción en **`/demo?mode=live`**, accesible desde Recorridos → Abrir guía IA. Sólo esa ruta importa el SDK y consulta su configuración. Sus créditos y límites siguen siendo los de Tavus. [Configuración del agente](LIVE_SETUP.md).

## Ejecutar y comprobar

```sh
npm ci --cache /tmp/atlas-npm-cache
npm test
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
npm run test:demo
```

El test de presentación ejecuta Chromium con WebGL por software y bloquea los dominios de Tavus/Daily antes de navegar. Comprueba el mapa real, la coreografía, las decisiones, la pausa, los datos intactos, el móvil y la ruta normal. La integración anterior puede comprobarse con `npm run test:demo:live`, que utiliza dobles locales sin abrir una llamada real.

[Resultados de validación](VALIDATION.md).
