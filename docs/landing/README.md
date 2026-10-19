# BirdView · Landing de FaradAI

La landing está en `/page` y `/page/`. El producto principal conserva `/` y la presentación `/demo`.

La página presenta BirdView como producto de FaradAI y se dirige a quienes toman decisiones: evolución del negocio, prioridades y contexto del equipo. Las imágenes WebP proceden del renderer real del proyecto, sin HUD y con datos ficticios. La web externa del producto proporcionada devolvió HTTP 403 desde este entorno; no se afirma haber verificado su contenido ni sus integraciones.

## Dirección visual

El rediseño toma como referencia la grabación de 45 segundos aportada por el usuario, que muestra las webs públicas de HappyRobot y Palantir. Se revisaron los dos recorridos: portada y casos de HappyRobot; película de apertura, declaración editorial, índice de productos y cierre de Palantir. Las consultas directas a sus webs siguen bloqueadas por el proxy (CONNECT 403); la referencia visual utilizada es el vídeo proporcionado. La marca, la ciudad, los textos y el producto son los propios de BirdView / FaradAI.

La apertura ocupa la pantalla con una escena en movimiento de la ciudad y un mensaje breve. La cabecera cambia de contraste al salir de esa escena. Después aparecen una declaración editorial, un índice tipográfico de Ventas / Equipo / Operaciones, el mapa interactivo y los detalles del producto. Tres bloques de imágenes presentan escenarios comerciales, de servicios e industriales; el cierre ofrece dos bandas para explorar la ciudad o abrir la presentación.

La paleta es blanco `#f7f7f4` y grafito `#16181b`, con fotografías del producto y azul reservado para indicadores. DM Sans y las fuentes del sistema se sirven localmente. Los datos se mantienen agrupados en el mapa y el tablero de dirección, fuera de la escena de apertura.

`birdview-hero-film.mp4` contiene 12 segundos de un travelling generado con el renderer del proyecto: 1600 × 900, 24 fps, H.264/yuv420p, sin pista de audio, faststart y 2,87 MB. Su trayectoria es cerrada y se comprobó la continuidad del loop. `birdview-hero-poster.webp` (446 KB) corresponde exactamente al primer fotograma. La captura se hizo de forma aislada, sin cambiar las escenas de la aplicación ni de `/demo`. El mapa vuelve a la imagen diurna original.

## Interacciones

- El botón de producto abre `https://pipeline-city.vercel.app/`. Los enlaces de presentación abren `/demo`.
- El vídeo de apertura es local, silencioso y tiene un control de pausa. Se detiene al salir de pantalla, al ocultar la pestaña y con movimiento reducido. En ese último caso se muestra el póster estático y no se inicia la reproducción. No utiliza un agente virtual ni consume minutos.
- El índice y los casos de uso llevan a la perspectiva correspondiente de la plataforma. Las dos bandas del cierre abren la ciudad o la presentación.
- Las pestañas muestran imágenes y explicaciones distintas para ventas, equipo y actividad. Admiten flechas, Inicio y Fin.
- El mapa en `#city-map` etiqueta nuevos leads, cualificados, propuestas, negociación y ventas ganadas. Seleccionar una etapa muestra su importe, oportunidades, responsables y contexto; admite clic, flechas, Inicio y Fin.
- El mapa incorpora facturación, pipeline, cuentas pendientes de atención, una venta ganada y el contexto de Lucía. Los botones de detalle llevan al apartado correspondiente del producto.
- El recorrido de dirección cambia entre negocio, prioridades y equipo al desplazarse en escritorio. En móvil se controla con pestañas accesibles. El panel permanece visible junto a la explicación en escritorio.
- Los importes y recuentos avanzan desde cero al entrar en pantalla, junto a barras de progreso e indicadores. Cada contador termina una vez; se pausa fuera de pantalla o al ocultar la pestaña. Su reloj de animación se detiene al finalizar.
- El menú móvil se cierra al elegir destino y con Escape. Las preguntas usan `details` y `summary` nativos.
- Las animaciones de entrada y el desplazamiento respetan movimiento reducido; los contadores muestran directamente su valor final con esa preferencia.

## Escenario de dirección

`src/landing/executive-data.js` contiene un único ejemplo inmutable compartido entre el mapa y los paneles. Hay 95.000 € en diez oportunidades abiertas y 60.000 € en cuatro ventas ganadas: Lucía 32.000 €, Marc 18.000 € y Ana 10.000 €. De las ventas ganadas, 42.000 € están facturados y 18.000 € pendientes de facturar; el objetivo de ventas es de 80.000 €, con un avance del 75 %. Facturación y cobros se distinguen expresamente.

Las tres prioridades son una negociación de Luma SL sin respuesta durante cinco días y dos leads pendientes de primer contacto. La venta reciente de Grupo Zafiro corresponde a Marc. Los datos no cambian al desplazarse o seleccionar una vista: se anima su representación, sin consultar ni modificar un CRM.

Los ejemplos no representan resultados de clientes. No se han añadido testimonios, cifras de adopción, precios, contactos inventados ni formularios con envío simulado. La sección de preguntas aclara el estado de las conexiones a datos reales.

## Construcción y publicación

`vite.config.js` compila dos entradas: la aplicación y `page/index.html`. La landing tiene título, descripción, metadatos sociales y favicon propios en su HTML inicial. `vercel.json` sirve `/page` desde esa entrada; no requiere comprar o configurar un dominio. Los enlaces y metadatos de dominio definitivo se pueden ajustar cuando exista.

```sh
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
node tests/landing-browser.mjs
```

La URL del servidor de pruebas puede configurarse con `BASE_URL`; `CAPTURE_DIR` cambia el directorio de evidencia y `CHROMIUM_PATH` el navegador. `LANDING_QA_MODE=preview` genera las vistas para revisión visual sin ejecutar la batería completa. La landing no descarga Three.js ni Tavus: usa imágenes y vídeo locales. Las rutas de producto conservan su carga independiente.

## Verificación

Compilación de producción correcta y **7 pruebas de los modelos de la landing aprobadas**, incluidas interpolación de contadores y coherencia financiera del ejemplo. **18 de 18 grupos de navegador pasan** en Chromium, con formatos de escritorio 1440 × 1000 y móvil 390 × 844 / 360 × 800. Se comprueban reproducción real del vídeo silencioso, pausa manual, visibilidad y movimiento reducido, las cinco zonas, importes y resultados del equipo, cambios de perspectiva al hacer scroll, valores intermedios de los contadores, ausencia de reinicios, pausa y reposo sin RAF de los contadores, marca, destinos, metadatos, anclas, índice y casos de uso, pestañas, preguntas, teclado, menú, recursos, ausencia de desbordamientos y las rutas originales `/` y `/demo`.

Sin errores JavaScript, recursos HTTP fallidos, peticiones externas ni captura de cámara, micrófono o síntesis de voz. El único medio que se reproduce es el vídeo decorativo local, siempre silenciado y sin pista de audio. Las huellas de las 78 fuentes y recursos comprobados coinciden al inicio, al final y con el código entregado. La pausa por visibilidad se verifica mediante `visibilityState` controlado por QA y un evento real; no es una prueba de foco del sistema operativo. Los enlaces externos se verifican por su destino; no se sortea el bloqueo de red ni se prueba la página de destino. Móvil se valida mediante viewport, sin afirmar pruebas en un teléfono físico.

Las evidencias visuales se guardan por secciones. La captura larga de Chromium headless presenta un artefacto de composición con este vídeo, incluso pausado, y se omite para evitar una imagen engañosa. Se comprobó que el DOM contiene una sola portada y que el cierre real muestra correctamente las dos bandas y el pie. La reproducción del vídeo se prueba de forma independiente a las capturas.

[Informe completo](browser-validation.json) · [Validación del clip](hero-film-validation.json) · [Portada de escritorio](captures/desktop-hero.png) · [Portada móvil](captures/mobile-hero.png) · [Índice de perspectivas](captures/desktop-perspectives.png) · [Casos de uso](captures/desktop-business-cases.png) · [Cierre](captures/desktop-cta.png) · [Negocio](captures/director-overview.png) · [Prioridades](captures/director-attention.png) · [Equipo](captures/director-team.png) · [Mapa móvil](captures/mobile-commercial-map.png).
