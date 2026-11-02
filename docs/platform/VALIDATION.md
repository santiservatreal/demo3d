# Validación

Entorno: 2 de noviembre de 2026; Linux x64, Node 24.19.0, PostgreSQL 17.6 y Redis 7.4.6 en Docker, Chromium del sistema. Los resultados son de desarrollo con fixtures, no un SLA ni una certificación de producción.

## Evidencia

- TypeScript estricto y comprobación de patrones peligrosos/secretos.
- **45 pruebas de plataforma**: 30 existentes con PostgreSQL/Redis reales y contratos, 7 de publicación/proxy y 8 de demo de navegador.
- **298 pruebas anteriores** de modelos de ciudad.
- Auditoría `pnpm audit --prod`: **0 vulnerabilidades publicadas** después de actualizar Ajv/Vitest y retirar plugins no usados. Es una fotografía del registro, no garantía de ausencia de vulnerabilidades.
- E2E real: entrada demo, pregunta y fuentes, generación/descarga PDF, conocimiento, importación CSV, cambio de empresa, ciudad industrial, navegación móvil, teclado y movimiento reducido. Cero solicitudes externas de la demo y cero errores de JavaScript en el recorrido.
- Docker Compose: API, PostgreSQL, Redis, worker y Caddy saludables; E2E completo también a través del puerto publicado.
- Capturas en [captures](captures/desktop-1440.png); mediciones de cada ejecución en [results.json](captures/results.json).
- Prueba estática del build `VERCEL=1`, sin backend: chat con fuentes, descarga PDF válida (7.344 bytes en esta ejecución), CSV, IndexedDB tras recargar, cambio de empresa, cierre/reentrada y reinicio. Anchos 390/768/1280/1440; cero solicitudes a `/api`, cero solicitudes externas y cero errores de JavaScript durante la demo. También se verifica entrada explícita desde el error de modo servidor. [Resultados y capturas](browser-demo-captures/results.json).

El modo gratuito es una prueba local independiente, no una sustitución de PostgreSQL en los ensayos de aislamiento. Reutiliza analítica, fixtures y validación. Las funciones de puente se ensayaron mediante HTTP local con transportes controlados, no contra un servidor de producción en Vercel. No se pudo verificar la URL remota del usuario desde este entorno (fallo de resolución DNS); una URL de preview antigua no recibe los cambios de una compilación nueva.

## Aceptación

| ID | Evidencia / límite |
|---|---|
| A01 | Login, worker, chat, ciudad y documento sin configuración de IA; E2E sin solicitudes externas |
| A02 | Importación cambia el mismo importe en analítica, ciudad, informe y API |
| A03 | IDs de otra organización invisibles en datos, conversaciones, SSE y archivos |
| A04 | Rol real no dueño/super/BYPASS; sin contexto SELECT vacío e INSERT denegado |
| A05 | Transacciones alternadas A/B en pool, sin contaminación |
| A06 | Salarios bloqueados; responsable comercial sin acceso financiero; administrador técnico sin lectura comercial |
| A07 | Spy del transporte recibe cuerpo serializado sin pregunta original, nombres ni IDs de cliente |
| A08 | Texto desconocido, contactos y URLs bloqueados antes del transporte |
| A09 | Tokens scope/tenant distintos, entrada literal y rehidratación ajena rechazadas |
| A10 | Alias/homónimos requieren selección; referencias estables dentro del scope |
| A11 | Notas no tienen autoridad; HTML/URL del modelo rechazados |
| A12 | Cifras, métricas y fuentes inventadas rechazadas |
| A13 | Aprobación/ejecución duplicada idempotente; versión destino obsoleta bloqueada. No existe escritura remota para ensayar timeout remoto |
| A14 | Contratos 429/páginas/archivados y sync real contra store con idempotencia/tombstone; sin validación de cuenta externa |
| A15 | Reinicio controlado del worker desde snapshot de generación y un único artefacto. No es una prueba de caída eléctrica del host |
| A16 | Europe/Madrid: hora repetida comparte ID y hora inexistente se omite |
| A17 | PDF con cabecera válida y tamaño real; CSV de snapshot y neutralización de fórmulas; fuentes/fechas |
| A18 | Cambio de permisos invalida archivo, conversación derivada y contexto antiguo |
| A19 | Reservas concurrentes con límite 100: solo tres reservas de 30 se aceptan |
| A20 | Fallback con región/retención incompatible no alcanza transporte |
| A21 | Colas rechazan contenido/credenciales; logs estructurados y escaneo de fuente. No se afirma prueba exhaustiva de todos los logs de terceros |
| A22 | Histórico fuera de cobertura se declara sin evidencia |
| A23 | Expiración de conversación/objeto; borrado, recuperación y purga con tombstone. Backups externos dependen del operador |
| A24 | API devuelve agregados sin nombres y respeta catálogo/revocación de la clave |
| A25 | Capturas 390/768/1280/1440, sin overflow horizontal, teclado y reduced-motion. No se probó teléfono físico |

Las comprobaciones se pueden repetir con los comandos del README. Las respuestas externas de IA y conectores usan transportes de contrato; no acreditan un proveedor real. Los ensayos de backup cifrado externo, residencia/contrato, OAuth, S3 y fallos físicos de infraestructura quedan para staging.

También se verifica selección de factura/equipo desde la ciudad y rechazo de IDs ajenos; confirmación de conocimiento contradictorio y eliminación de un historial de más de mil versiones. Los resultados Docker están en [docker-captures/results.json](docker-captures/results.json).
