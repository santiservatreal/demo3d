# BirdView · Landing de FaradAI

La landing está en `/page` y `/page/`. El producto principal conserva `/` y la presentación `/demo`.

La página presenta BirdView como producto de FaradAI y se dirige a quienes toman decisiones: evolución del negocio, prioridades y contexto del equipo. Las cinco imágenes WebP proceden del renderer real del proyecto, sin HUD y con datos ficticios. El titular y el diseño siguen el concepto de la captura del usuario. La web externa proporcionada devolvió HTTP 403 desde este entorno; no se afirma haber verificado su contenido ni sus integraciones.

## Interacciones

- El botón de producto abre `https://pipeline-city.vercel.app/`. Los enlaces de presentación abren `/demo`.
- Las pestañas muestran imágenes y explicaciones distintas para ventas, equipo y actividad. Admiten flechas, Inicio y Fin.
- El primer mapa etiqueta nuevos leads, cualificados, propuestas, negociación y ventas ganadas. Seleccionar una etapa muestra su importe, oportunidades, responsables y contexto; admite clic, flechas, Inicio y Fin.
- El mapa incorpora facturación, pipeline, cuentas pendientes de atención, una venta ganada y el contexto de Lucía. Los botones de detalle llevan al apartado correspondiente del producto.
- El recorrido de dirección cambia entre negocio, prioridades y equipo al desplazarse en escritorio. En móvil se controla con pestañas accesibles. El panel permanece visible junto a la explicación en escritorio.
- Los importes y recuentos avanzan desde cero al entrar en pantalla, junto a barras de progreso e indicadores. Cada contador termina una vez; se pausa fuera de pantalla o al ocultar la pestaña. No queda un bucle de animación activo en reposo.
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

La URL del servidor de pruebas puede configurarse con `BASE_URL`; `CAPTURE_DIR` cambia el directorio de evidencia y `CHROMIUM_PATH` el navegador. `LANDING_QA_MODE=preview` genera las vistas para revisión visual sin ejecutar la batería completa. La landing no descarga Three.js ni Tavus: usa imágenes locales. Las rutas de producto conservan su carga independiente.

## Verificación

Compilación de producción correcta y **298 pruebas unitarias aprobadas**, incluidas interpolación de contadores y coherencia financiera del ejemplo. **17 de 17 grupos de navegador pasan** en Chromium, con formatos de escritorio 1440 × 1000 y móvil 390 × 844 / 360 × 800. Se comprueban las cinco zonas, importes y resultados del equipo, cambios de perspectiva al hacer scroll, valores intermedios de los contadores, ausencia de reinicios, pausa y reposo sin RAF, marca, destinos, anclas, pestañas, preguntas, teclado, menú, recursos gráficos, ausencia de desbordamientos, movimiento reducido y las rutas originales `/` y `/demo`.

Sin errores JavaScript, recursos HTTP fallidos, peticiones externas ni apertura de cámara, micrófono o audio. Las huellas de las 74 fuentes y recursos comprobados coinciden al inicio, al final y con el código entregado. La pausa por visibilidad se verifica mediante `visibilityState` controlado por QA y un evento real; no es una prueba de foco del sistema operativo. Los enlaces externos se verifican por su destino; no se sortea el bloqueo de red ni se prueba la página de destino. Móvil se valida mediante viewport, sin afirmar pruebas en un teléfono físico.

[Informe completo](browser-validation.json) · [Portada de escritorio](captures/desktop-hero.png) · [Página completa](captures/desktop-full-page.png) · [Portada móvil](captures/mobile-hero.png) · [Página móvil completa](captures/mobile-full-page.png) · [Negocio](captures/director-overview.png) · [Prioridades](captures/director-attention.png) · [Equipo](captures/director-team.png) · [Mapa móvil](captures/mobile-commercial-map.png).
