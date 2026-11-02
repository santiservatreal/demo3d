# Seguridad y privacidad

Better Auth mantiene sesiones opacas HttpOnly/SameSite, con Secure en producción. Las mutaciones de cookie exigen origen autorizado y CSRF de la sesión. Fastify y Zod rechazan propiedades no declaradas. Hay límites de cuerpo, llamadas, filas y contexto; errores con código/request ID, sin SQL ni contenido sensible. No hay analítica externa ni session replay en `/app`.

| Rol | Alcance inicial |
|---|---|
| Propietario | Configuración, membresías y negocio; no conversaciones privadas ajenas |
| Administrador técnico | Configuración y conectores; sin lectura automática de negocio ni ampliación de roles/alcance |
| Responsable | Lectura departamental, conocimiento, propuestas y ejecución aprobada del sandbox |
| Analista | Lectura autorizada, propuestas e informes; sin ejecutar cambios |
| Lector | Lecturas/informes autorizados y recursos personales |

Los permisos se comprueban antes de retrieval y RLS añade organización, departamento, clasificación y propiedad. Revocar acceso elimina sesiones e incrementa la versión de autorización. Trabajos, descargas y SSE revalidan. Los permisos amplios del token del CRM no equivalen a los de cada empleado: sin ACL verificable se exige una política local aprobada.

## Frontera de IA

No se envían pregunta original, historial, notas, emails, nombres, IDs de origen ni metadatos de cliente. Un reconocedor determinista acepta vocabulario cerrado y entidades autorizadas; texto desconocido, enlaces, datos de contacto y tokens literales se bloquean. La pregunta se reconstruye como plantilla fija. Solo salen parámetros permitidos, métricas agregadas y referencias opacas.

AES-256-GCM cifra la bóveda con nonce aleatorio y AAD de organización, scope y versión. HMAC separa las claves de búsqueda por organización. Los tokens son aleatorios y distintos entre scopes/clientes. Solo se rehidratan referencias emitidas por el servidor después de comprobar el acceso actual. Homónimos requieren selección.

El modelo devuelve segmentos tipados. Cifras y fuentes deben referirse a hechos verificados. HTML, URLs, números literales y referencias ajenas se rechazan. La interpretación se marca como inferencia y se conservan los bloques calculados. Las pruebas inspeccionan el cuerpo realmente serializado que recibe el transporte, también en fallos/fallback.

El destino depende del operador: lista exacta, HTTPS, DNS/IP comprobado y fijado a la conexión, sin redirects. Un fallback requiere región y retención equivalentes. PostgreSQL reserva presupuesto antes del transporte. Si un fallo deja incierto el consumo, se registra conservadoramente el máximo reservado como estimación para impedir gasto ilimitado mediante timeouts.

**Seudonimización reversible, no anonimato absoluto.** Importes, fechas y hechos singulares permiten inferencias. No entrenamiento, región y retención son revisiones separadas; marcar un formulario no demuestra el contrato. No se afirma certificación ni cumplimiento RGPD integral.

## Amenazas y límites

| Amenaza | Control |
|---|---|
| ID ajeno, pool reutilizado, job manipulado | Membresía actual, contexto local, RLS y referencias compuestas |
| Administrador técnico curioso | Permisos de recurso; propiedad aprueba aumento de acceso |
| Instrucción maliciosa en ticket | Contenido sin autoridad; sin herramientas ni egress arbitrarios |
| Identidad desconocida | Bloqueo determinista del texto no clasificado |
| Archivo robado / permisos revocados | Almacén privado, propietario, caducidad y versión |
| SSRF / rebinding | Endpoint exacto, DNS fijado, sin redirecciones |
| Fórmula CSV / HTML | Escape, neutralización y PDF sin scripts/red |
| Operador/DBA comprometido | Fuera de la garantía de RLS; requiere controles operativos y separación de claves |

La auditoría es append-only para la aplicación, no inmutable frente al DBA. Logs y colas guardan metadatos permitidos, no conversaciones ni mappings.

## Retención

Valores iniciales: conversaciones/informes 90 días, staging 24 horas, decisiones operativas 30 días y auditoría 12 meses. Conversaciones e informes son configurables entre 1 y 365 días. El worker retira registros y objetos; confirma un objeto solo después de borrarlo. Mappings caducan con su scope.

Eliminar organización exige propietario y escribir su nombre. Bloquea acceso inmediatamente, permite recuperación por el propietario durante 7 días y después purga datos y conserva un tombstone mínimo. Los backups siguen otra caducidad y no se promete su eliminación inmediata. Restauraciones deben reaplicar tombstones.

Antes de datos reales: acordar definiciones, accesos, contratos/DPA, subencargados, transferencias, región y retención; ensayar restore, rotación e incidentes y hacer revisión independiente. Las recomendaciones de personas son apoyo revisable, sin decisiones laborales automáticas.
