# Pruebas gratuitas en Vercel

La ruta `/app/` puede probarse sin contratar servicios: la interfaz funciona con datos ficticios y **IndexedDB en el navegador**. Una banda permanente identifica este modo. No hay autenticación real ni servidor oculto y no se consume IA externa. Las rutas `/`, `/demo` y `/page` conservan su comportamiento.

## Abrirla

En Vercel usa la rama con estos cambios, comando `pnpm build`, directorio de salida `dist`. Sin `BIRDVIEW_API_ORIGIN`, Vercel selecciona automáticamente la demo. Abre **Deployments → último despliegue → Visit** y añade `/app/`. Una URL de preview antigua seguirá mostrando su versión anterior.

En una compilación normal también puedes abrir `/app/?demo=local`. La pestaña recuerda la elección, incluso al navegar y recargar. `?demo=server` vuelve al modo con API. `BIRDVIEW_BROWSER_DEMO=1` fuerza pruebas al compilar; `=0` fuerza servidor. No se añade un fallback automático si falla una API configurada.

## Qué se puede probar

- Brisa Servicios Demo y Norte Industrial Demo, con cuentas, oportunidades, facturas, personas y tickets; la segunda añade productos, stock y pedidos.
- Chat guiado con consultas y fuentes sobre los datos guardados. No es una IA general, no escucha el micrófono ni utiliza Tavus. Se muestran resultados cuando el cálculo ha terminado, sin simular colas o streaming.
- Ciudad y briefing calculados con el mismo paquete analítico de la instalación completa; importaciones y cambios aprobados afectan a los datos de la prueba.
- CSV/JSON con validación y mapeo compartidos, deduplicación y actualización de registros importados.
- Conocimiento con versiones, conflictos y olvido; tareas creadas explícitamente; revisión y ejecución de cambios sobre registros ficticios.
- Informes HTML/CSV y PDF reales generados en el navegador; presentaciones editables exportadas a PDF; gráficos SVG. Los archivos se identifican como datos ficticios.
- Persistencia al recargar y **Restablecer demo**, que borra los cambios y archivos locales y reconstruye los ejemplos.

## Límites de estas pruebas

Los datos y archivos pertenecen al **navegador y origen** actuales: otro dispositivo, perfil o URL de preview tiene su propia copia. Borrar el almacenamiento del sitio, usar navegación privada o la expulsión de datos por el navegador puede eliminarlos. No es almacenamiento compartido, backup ni aislamiento de producción. No importes información confidencial o real para estas pruebas. Las escrituras comprueban la revisión almacenada para evitar sobrescribir cambios concurrentes de otra pestaña.

Usuarios, invitaciones, claves de API, conexiones a CRM, IA externa, políticas de servidor y automatizaciones requieren la instalación completa. Sus acciones están desactivadas o devuelven explícitamente `SERVER_REQUIRED`; no se generan credenciales reales ni se finge una conexión. Las rutinas pueden guardarse como configuración en pausa, sin ejecución automática. Studio de imagen/vídeo queda bloqueado sin proveedor.

La demo reutiliza fixtures portables, validación de importaciones, analítica y renderizado de documentos. La persistencia usa un adaptador explícito de transporte local, cargado únicamente al elegir este modo; no intercepta HTTP ni modifica las comprobaciones de autorización del servidor. La versión completa mantiene PostgreSQL/RLS, Better Auth, Redis y worker. Pasar a ella no migra automáticamente los datos de estas pruebas.

## Repetir la comprobación estática

```bash
BIRDVIEW_BROWSER_DEMO=1 pnpm build
pnpm --filter @birdview/web exec vite preview --port 4177 --host 127.0.0.1
# En otra terminal:
pnpm platform:e2e:static
```

La prueba de Chromium comprueba chat y fuentes, CSV, PDF válido, IndexedDB tras recargar, selector industrial, reinicio, entrada desde modo servidor y anchos 390/768/1280/1440. Exige cero solicitudes a API y cero solicitudes externas durante el uso de la demo. [Resultados](browser-demo-captures/results.json).
