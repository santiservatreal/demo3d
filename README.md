# Atlas · Business in motion

Una capa visual para comprender la empresa a partir de datos de CRM, ERP, logística y geolocalización. Primera versión vertical operativa con fuentes **simuladas**, Three.js y Vite. No necesita claves ni servicios externos para la demo. Las fuentes tipográficas son locales.

## Abrir y ejecutar

Node.js 22.12+ y npm; validado con Node 24.19.

```sh
npm ci
npm run dev -- --port 5173
```

```sh
npm run build
npm run preview -- --port 4173
```

Vercel: preset **Vite**, raíz `./`, build `npm run build`, directorio de salida `dist`. Cada push a `main` puede desplegarse si el proyecto Vercel está enlazado; Atlas no comprueba ni publica el despliegue remoto.

## Recorrido recomendado (dos minutos)

1. Abre Norte Manufacturing. La ficha inicial corresponde a Felipe y su camión AT-001, con 40 unidades del pedido #1042.
2. Pulsa **Siguiente evento**: se confirma la entrega, el pedido pasa a entregado y la carga queda a cero. El vehículo todavía no regresa.
3. Pulsa de nuevo: un evento independiente inicia el **retorno vacío**, con una duración estimada de tres horas. **Seguir vehículo** centra y acompaña al recurso. Puedes iniciar, pausar y acelerar el reloj simulado.
4. El escenario **Llegada sin confirmar** muestra qué ocurre al vencer la ETA: se mantiene el estado de retorno. Solo **Llegada confirmada** lo convierte en disponible.
5. Explora producción bloqueada, falta de stock y GPS desactualizado. Los cambios se reflejan en fichas, escena, lista y pipeline.
6. Busca un conductor, pedido o instalación. Combina departamento, responsable, estado e incidencias. La selección se mantiene al cambiar de vista. Si los filtros la excluyen, se indica en pantalla.
7. Cambia a **Studio Norte · Servicios**: aparecen proyectos y horas registradas; desaparecen vehículos, líneas y existencias industriales.

El Atlas original se conserva en `/?experience=classic`, con sus escenarios anteriores y navegación.

## Modelo y arquitectura

- `src/operations/model.js`: entidades normalizadas, referencias estables, plantillas, eventos idempotentes, permisos de demo, reglas de posición y proveedores. La escena no incrusta los datos comerciales.
- `src/operations/scene.js`: instalaciones funcionalmente distintas, muelles, palés, líneas de trabajo, señalización, aparcamientos, camiones con carga visible, rutas y selección. Los cambios de estado actualizan los mismos grupos por identificador; la escena solo se reconstruye al cambiar de plantilla.
- `src/operations/app.js`: vistas 3D/lista/pipeline, filtros comunes, fichas con procedencia, reloj y escenarios reproducibles.
- `src/operations/operations.css`: diseño adaptable a escritorio y móvil.
- `src/classic.js` y `src/style.css`: MVP anterior preservado.

`DemoProvider.read()` y `HubSpotProvider.read()` comparten la estructura del snapshot normalizado. El adaptador HubSpot acepta una función de lectura autorizada inyectada, valida los campos y conserva la etapa original sin inventar su correspondencia operativa. La interfaz permite revisar y guardar **localmente** la propuesta de campos con una muestra HubSpot; no inicia conexiones de red ni pretende importar producción o GPS desde oportunidades comerciales.

### Reglas que importan

- **GPS:** permanece en la última posición recibida y muestra antigüedad; no extrapola movimiento.
- **Estimado:** avance interpolado por ruta, salida y duración. No se presenta como GPS ni confirma una llegada.
- **Desconocido:** el recurso AT-005 aparece en lista y ficha, sin una posición ficticia en la maqueta.
- **Instalación confirmada:** posición esquemática de carga, aparcamiento o llegada, distinta de GPS.
- **Tiempo simulado:** 14 de octubre de 2026, mostrado en Europe/Madrid. Se inicia pausado. Los eventos del guion son confirmaciones ficticias explícitas, no consecuencias de alcanzar una ETA.
- **Carga:** las cajas desaparecen al recibir la entrega total; la plataforma del camión permanece. Una entrega no implica siempre carga cero: el evento debe declarar unidades entregadas y carga restante coherentes.
- **Inventario:** la carga en tránsito ya salió del almacén en el snapshot. La entrega al cliente no descuenta esas unidades otra vez. Las reservas son independientes de existencias; la falta de stock muestra el déficit sin inventar stock negativo.
- **Producción:** la cinta se anima por estado activo; el progreso es el último valor ERP, no se transforma la animación en producción confirmada. No hay avatares de los que se infieran horas o productividad.
- **Escala:** maqueta operativa, no mapa geográfico. Instalaciones dimensionadas por función, no por ingresos ni metros reales. La apariencia de las cajas es una indicación de carga, no un recuento uno a uno.
- **Permisos:** el toggle de finanzas elimina instalación, registros y relaciones del snapshot que reciben escena e interfaz. Es una demostración de proyección en cliente, **no una frontera de seguridad**. Los conectores reales deben filtrar datos y agregaciones en el servidor según la identidad autenticada.

## Qué falta para producción

No hay backend, OAuth, conexión real a HubSpot/ERP/TMS/GPS, persistencia de operaciones, control de acceso del servidor ni importación automática del organigrama. No se ofrecen enlaces ficticios a registros: solo se puede mostrar un enlace si lo aporta una fuente autorizada. El siguiente paso de integración requiere elegir CRM y ERP, configurar correspondencias comerciales/operativas, gestionar autorizaciones y credenciales en servidor y recibir eventos verificables.

Los escenarios vuelven al snapshot inicial. El mapping se guarda en el almacenamiento del navegador. No hay escritura a sistemas externos. El rol financiero es una simulación de interfaz y no cambia permisos reales.

## Validación

```sh
npm test
npm run build
```

Con el servidor activo y Chromium instalado:

```sh
npm run test:e2e
npm run test:classic
```

`CHROMIUM_PATH` y `BASE_URL` configuran las pruebas de operaciones. La prueba clásica utiliza `BASE_URL`. La prueba 3D requiere un navegador con WebGL; los flags SwiftShader usados por las pruebas están limitados al proceso de Chromium de pruebas.

Las 11 pruebas de modelo cubren coherencia de identificadores, entrega y repetición de eventos, inventario, retorno, ETA, GPS, stock, bloqueos, permisos, plantillas, filtros y contrato de proveedores. Las pruebas de navegador seleccionan un camión mediante raycasting real y verifican el recorrido completo, navegación, filtros, configuración de campos y vista móvil. Capturas locales: `/tmp/atlas-operations` y `/tmp/atlas-checks`.
