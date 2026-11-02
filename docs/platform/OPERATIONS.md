# Operación

## Entorno de desarrollo

README contiene el arranque exacto. `.env` y `.local` son privados y no se versionan. `init-local-env.mjs` genera secretos solo cuando faltan; no reemplaza claves existentes ni imprime sus valores. No vuelvas a copiar `.env.example` encima de un `.env` inicializado. No borres volúmenes para resolver una contraseña incorrecta: recupera la configuración que los creó.

La variante nativa usa `compose.infra.yml`, PostgreSQL en 54329 y Redis en 63799, ligados a loopback. El Compose completo usa otros volúmenes/red y no publica bases ni Redis. Sus datos son independientes. Solo se publica 8080 en loopback. Caddy, API, worker y base se ejecutan sin root. `migrate` recibe las credenciales de migración; API y worker no. El runtime rechaza un rol SQL dueño/superusuario/BYPASSRLS.

La demo crea propietario, administrador, responsable, analista y lector con contraseñas aleatorias en `.local/demo-users.json`, archivo 0600 del servidor/volumen privado. Explorar la demo evita tener que copiarlas. Los tests usan `.local/test-users.json` y otra base. No expongas estos archivos ni montes `.local` como web pública.

## Proxy de construcción

Si un proxy corporativo añade una CA, utiliza su certificado **público** de confianza como secreto de BuildKit:

```bash
export BIRDVIEW_BUILD_CA_FILE=/ruta/a/la/ca-publica.crt
./scripts/bootstrap-demo.sh
```

O `docker compose -f compose.yml -f infra/docker/compose.build-ca.yml build`. No se desactiva TLS ni se guarda una credencial del proxy en la imagen. En este entorno se usó el almacén público `/etc/ssl/certs/ca-certificates.crt`. Fuera de ese proxy, el Compose normal no necesita esta opción.

## Piloto Linux con dominio

1. Prepara un servidor Linux con Docker, volúmenes persistentes, firewall y acceso operativo restringido. No se ha contratado ni creado uno desde esta tarea.
2. Configura un dominio real y un proxy TLS de host que reenvíe a 127.0.0.1:8080. Mantén PostgreSQL/Redis cerrados al exterior. El Caddy interno sirve frontend y API bajo un origen.
3. Establece `APP_PROFILE=production`, `BIRDVIEW_NODE_ENV=production` y `PUBLIC_ORIGIN` con ese origen HTTPS. Ejecuta migraciones; **no** el seed demo. Demo login queda deshabilitado y las cookies pasan a Secure. El servidor no debe recibir `MIGRATION_DATABASE_URL`.
4. Ejecuta `docker compose up -d --wait` y `scripts/check-demo.sh`; crea usuarios/organizaciones propios y ensaya acceso por rol, exportación y recuperación antes de conectar fuentes reales.
5. Elige región y contratos, retención, backup, política de datos y presupuesto. Comprueba con un sandbox el conector y la IA elegidos. No activar integraciones solo porque acepten una clave.

Esta topología es de una instancia, sin alta disponibilidad. Vercel puede alojar la landing o el frontend estático; no sustituye API, PostgreSQL, Redis y workers. La evolución AWS prevista es compute para web/API/worker, PostgreSQL gestionado, Redis y S3 privado con KMS/Secrets Manager en una región elegida de la UE. Verifica disponibilidad regional y condiciones del modelo antes de prometer residencia. WAF es complementario, no reemplaza autorización.

## Backups y restore

El piloto debe programar `pg_dump` desde una tarea operativa con credenciales separadas, cifrar el resultado antes de enviarlo a almacenamiento privado externo y copiar los objetos con sus checksums. Este repositorio no afirma que exista ya un servicio externo de backup. Conserva por separado las versiones de claves necesarias para restaurar, con acceso restringido.

Procedimiento ensayable:

1. Para escrituras y workers durante la copia coherente. Guarda migración/checksum, dump cifrado, objetos y un manifiesto de tombstones de borrado.
2. Restaura en **otra base y directorio**, nunca encima de producción durante un ensayo. Descifra allí, aplica migraciones y configura roles de runtime restringidos.
3. Reaplica el manifiesto de eliminaciones posterior a la copia, purga lo vencido y comprueba objetos y permisos. No devolver acceso a una organización borrada restaurando un backup antiguo.
4. Ejecuta las suites de aislamiento, descargas y retención y mide tiempos. Solo después cambia tráfico. No hay RPO/RTO prometidos sin ensayo y medición.

La recuperación de una organización dentro de sus 7 días usa `POST /api/v1/organizations/restore` con sesión de su propietario, CSRF y `{organizationId}`. No reactiva API keys revocadas. Después de la purga el tombstone impide recuperación y el seed no resucita esa organización. Los backups tienen su propio plazo de eliminación; define y comunica ese plazo al cliente.

## Actualizaciones, rollback y rotación

Guarda backup probado antes de migrar, valida checksum y ejecuta migraciones con el inicializador. Publica una imagen versionada y comprueba readiness. Ante fallo, detén nuevos trabajos y vuelve a la imagen anterior solo si es compatible con el esquema; de otro modo usa restauración probada. No se incluyen migraciones destructivas de bajada automáticas.

Las credenciales de CRM/IA deben renovarse en origen y reemplazarse mediante configuración autorizada, ensayando lectura con sandbox. El cifrado de mappings admite versiones: `VAULT_KEYS_JSON` es un mapa privado versión→clave y `VAULT_KEY_VERSION` selecciona la nueva versión. Conserva claves antiguas hasta caducar scopes/backups. Rotar el master usado para credenciales cifradas exige recifrarlas en una operación de mantenimiento; no basta con cambiar `.env`. Cambiar secreto de sesión invalida sesiones y exige volver a entrar.

## Salud y mantenimiento

`/health/live`, `/health/ready` y heartbeat del worker son señales reales. El worker revisa colas/rutinas y retención cada 30 segundos. Los errores de job muestran únicamente código, tipo e ID. Supervisa cola fallida, latencia, frescura de fuentes, disco, backups, reservas de presupuesto y bloqueos de privacidad con metadatos.

`docker compose logs` no debe contener contenido de chats ni secretos; no actives logs de cuerpos o variables de entorno. Los objetos pendientes de borrado se reintentan hasta confirmarlos. Si el disco se llena, se pueden retirar **cachés de build** y capas sin uso, conservando volúmenes. No uses `docker compose down -v` para mantenimiento rutinario.
