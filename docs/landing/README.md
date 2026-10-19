# BirdView · Landing de FaradAI

La landing está en `/page` y `/page/`. El producto principal conserva `/` y la presentación `/demo`.

La página presenta BirdView como producto de FaradAI: ciudad visual, pipeline comercial, equipo, comunicaciones y un ejemplo de operaciones. Las cinco imágenes WebP proceden del renderer real del proyecto, sin HUD y con datos ficticios. El titular y el diseño siguen el concepto de la captura del usuario. La web externa proporcionada devolvió HTTP 403 desde este entorno; no se afirma haber verificado su contenido ni sus integraciones.

## Interacciones

- El botón de producto abre `https://pipeline-city.vercel.app/`. Los enlaces de presentación abren `/demo`.
- Las pestañas muestran imágenes y explicaciones distintas para ventas, equipo y actividad. Admiten flechas, Inicio y Fin.
- Los marcadores de la ciudad seleccionan el apartado correspondiente y llevan a su sección.
- El menú móvil se cierra al elegir destino y con Escape. Las preguntas usan `details` y `summary` nativos.
- Las animaciones de entrada y el desplazamiento respetan movimiento reducido.

Los ejemplos no representan resultados de clientes. No se han añadido testimonios, cifras de adopción, precios, contactos inventados ni formularios con envío simulado. La sección de preguntas aclara el estado de las conexiones a datos reales.

## Construcción y publicación

`vite.config.js` compila dos entradas: la aplicación y `page/index.html`. La landing tiene título, descripción, metadatos sociales y favicon propios en su HTML inicial. `vercel.json` sirve `/page` desde esa entrada; no requiere comprar o configurar un dominio. Los enlaces y metadatos de dominio definitivo se pueden ajustar cuando exista.

```sh
npm run build
npm run preview -- --port 4173 --strictPort
# En otra terminal:
node tests/landing-browser.mjs
```

La URL del servidor de pruebas puede configurarse con `BASE_URL`; `CAPTURE_DIR` cambia el directorio de evidencia y `CHROMIUM_PATH` el navegador. La landing no descarga Three.js ni Tavus: usa imágenes locales. Las rutas de producto conservan su carga independiente.

## Verificación

Compilación de producción correcta. **9 de 9 grupos de navegador pasan** en Chromium, con formatos de escritorio 1440 × 1000 y móvil 390 × 844. Se comprueban marca, destinos, anclas, pestañas, preguntas, teclado, menú, recursos gráficos, ausencia de scroll horizontal, movimiento reducido y las rutas originales `/` y `/demo`.

Sin errores JavaScript, recursos HTTP fallidos, solicitudes a Tavus ni apertura de cámara, micrófono o audio. Las huellas de las 67 fuentes y recursos comprobados coinciden al inicio, al final y con el código entregado. Los enlaces externos se verifican por su destino; no se sortea el bloqueo de red ni se prueba la página de destino. Móvil se valida mediante viewport, sin afirmar pruebas en un teléfono físico.

[Informe completo](browser-validation.json) · [Portada de escritorio](captures/desktop-hero.png) · [Página completa](captures/desktop-full-page.png) · [Portada móvil](captures/mobile-hero.png) · [Página móvil completa](captures/mobile-full-page.png).
