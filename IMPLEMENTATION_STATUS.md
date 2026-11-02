# BirdView — estado de implementación

Fecha: 2 de noviembre de 2026. Es una versión funcional de desarrollo, no una certificación de producción. El HTML y prompt originales se conservan en `references/`. La plataforma está en `/app/`; ciudad, presentación y landing anteriores siguen accesibles.

| Capacidad | Implementación y evidencia | Límite real |
|---|---|---|
| Visual del HTML | React, Inter local, navegación, chat y ciudad opcional; capturas 390/768/1280/1440 | Ciudad SVG; la presentación cinematográfica Three.js sigue en `/demo` |
| Autenticación y organizaciones | Better Auth, sesiones opacas, CSRF, onboarding, membresías, invitación de un uso y selector | Sin servicio de envío de correos configurado |
| Aislamiento | PostgreSQL real, RLS FORCE, rol no privilegiado, FK compuestas, scope por transacción | Misma instancia; no aislamiento frente a DBA/operador |
| Demo | Dos empresas, cinco roles, 40 cuentas, 60 oportunidades, 80 facturas, 30 tickets, 20 empleados y 90 días de eventos por empresa; industria adicional | Datos ficticios; login demo desactivado en producción |
| Analítica y ciudad | Funciones compartidas para dinero, saldos, cobros, cierres y cobertura; selección contextual | Sin reconstrucción histórica cuando falta evidencia; altura decorativa |
| Chat | Persistencia, BullMQ, SSE y reconexión/poll; fuentes consultables y contrato tipado | Demo guiada, no IA general |
| Privacidad y gateway | Envelope positivo, bóveda AES-GCM por scope, salida validada, DNS fijado, presupuesto atómico y spy del transporte | Seudonimización reversible; no prueba contractual de proveedor real |
| Proveedores IA | Configuración cifrada, revisión/activación de propiedad, endpoint de operador y tarifas versionadas | No se hizo llamada facturable; requiere cuenta, revisión y presupuesto |
| Conocimiento | Fuente/tipo/vigencia, versiones, conflicto pendiente, confirmación y olvido efectivo | Detección de conflicto por título normalizado; no verificación semántica universal |
| Acciones | Propuesta/diff, aprobación, hash, versión e idempotencia | Solo escrituras del sandbox demo; conexiones reales de lectura |
| Tareas y rutinas | Persistencia y scheduler por zona horaria, DST, ejecuciones y resultados internos | Sin correo, WhatsApp ni webhooks salientes |
| Informes | HTML, CSV seguro y PDF real; snapshots, hashes, archivos privados y descarga autorizada | Lecturas/filas acotadas y advertidas; sin backup externo contratado |
| Presentaciones / Studio | Editor de diapositivas, HTML/PDF y gráficos SVG de datos | Slides/PPTX y media generativa pendientes de integración |
| Importación | CSV/JSON, preview, mapeo declarativo, errores, procedencia y deduplicación | Referencias de archivo usan IDs locales autorizados |
| HubSpot | Adaptador GET, scopes, páginas, retry, cursor y tombstone; contratos y store real probados | Falta cuenta sandbox; reconciliación de borrado de pipelines limitada |
| Holded / Factorial | Catálogo, contratos internos y mapeos de fixtures | Documentación bloqueada por CONNECT 403; transporte real deshabilitado |
| Otros conectores | Catálogo e interfaz extensible con estado pendiente | No se anuncian conectados |
| API propia | REST/OpenAPI, claves hash/revocación/caducidad y catálogo permitido; salida agregada | MCP, voz y webhooks apagados |
| Ciclo de vida | Exportación privada JSON, expiración, eliminación inmediata de acceso, recuperación 7 días y purga/tombstone | Backups externos y restauración física dependen del operador |
| Docker y CI | Imágenes fijadas, build validado, servicios sin root, healthchecks, workflow de tipos/tests/build/auditoría/E2E | Piloto de una instancia; CI remoto requiere ejecutar el workflow |

Verificación local: **45 pruebas de plataforma**, **298 pruebas anteriores**, tipos estrictos, revisión de fuente, build de ambos frontends, auditoría de producción sin vulnerabilidades publicadas y E2E nativo y estático sin solicitudes externas de la demo. Se conserva el ensayo Docker de la versión base. [Detalle A01–A25](docs/platform/VALIDATION.md), [capturas nativas](docs/platform/captures/results.json), [pruebas gratuitas sin API](docs/platform/browser-demo-captures/results.json) y [Docker anterior](docs/platform/docker-captures/results.json).

**Pruebas gratuitas en Vercel:** `/app` dispone ahora de un modo explícito de navegador, con fixtures ficticios, IndexedDB, chat guiado, importaciones, tareas, aprobaciones e informes y presentaciones descargables. Se selecciona automáticamente en Vercel cuando no hay backend configurado. No simula autenticación real, conectores ni ejecución de rutinas. [Alcance y uso](docs/platform/BROWSER_DEMO.md). La tabla anterior describe la instalación completa con servidor.

No se ha publicado un backend de producción ni creado infraestructura de pago. La plataforma compartida para datos reales sigue necesitando API, PostgreSQL, Redis y worker; se conserva separada de las pruebas de navegador.

Antes de piloto real: definir métricas y política de acceso con el cliente; validar cuentas sandbox y contratos de proveedor; desplegar servidor/TLS y copias cifradas; ensayar recuperación/rotación/incidentes y obtener revisión técnica independiente. Los tests de contrato no sustituyen esas comprobaciones.
