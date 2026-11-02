# Integraciones y versiones

Verificado el 2 de noviembre de 2026. Lockfile exacto: Node 24.19.0, React 19.3.1, Vite 7.3.7, TypeScript 5.9.3, Fastify 5.12.8, Better Auth 1.7.15, Zod 4.6.7, pg 8.23.1, Drizzle 0.45.4, BullMQ 5.63.0, PostgreSQL 17.6, Redis 7.4.6, Playwright 1.64.1, Vitest 4.1.12 y Ajv 8.20.0. Versiones verificadas en metadatos del registro; las imágenes fijan digest. Ajv/Vitest se actualizaron después de la auditoría y se retiraron plugins no utilizados.

## Archivos

Conexiones → Importar permite CSV/JSON, vista previa y mapeo declarativo. `{}` usa automáticamente columnas conocidas; un mapeo explícito selecciona columnas. Ejemplo:

```csv
externalId,name,email
cliente-001,Cuenta de ejemplo,cliente@example.com
```

Facturas requieren `accountId` local, número, fechas e importes enteros en céntimos. Transformación opcional: `{"importe":{"target":"totalMinor","transform":"decimal_to_minor"}}`; admite decimales sin separadores de miles. No acepta código. Identificadores de origen evitan duplicados; no fusiona por nombre. Referencias del archivo deben apuntar a IDs locales existentes. Campos sensibles/desconocidos sin mapeo y archivos inválidos no se confirman.

## Conectores

| Fuente | Implementado | Falta para conexión real |
|---|---|---|
| HubSpot | GET empresas/contactos/owners/pipelines/fases/deals; páginas, backoff, archivados, cursores por página y tombstones | Cuenta sandbox, scopes del plan y validación real |
| Holded | Catálogo, interfaz y mapeos de fixtures | Verificar documentación, autenticación y endpoints; transporte desactivado |
| Factorial | Catálogo, interfaz y mapeos mínimos de fixtures | Verificar versión, OAuth/scopes y endpoints; transporte desactivado |
| Pipedrive, Zendesk, Gmail, Drive, Slides, Salesforce, SAP, marketing e industrial | Catálogo pendiente y contrato común | Implementación y pruebas específicas |

Los accesos a documentación oficial de Holded y Factorial devolvieron CONNECT 403 en este entorno. No se inventaron endpoints. HubSpot se contrastó con el SDK oficial `@hubspot/api-client@14.1.3`; los contratos HTTP usan fixtures, **no acreditan** aceptación real por una cuenta.

HubSpot utiliza token de aplicación, sin OAuth/refresh en esta versión. Scopes del manifiesto: `crm.objects.companies.read`, `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.owners.read`, `crm.schemas.deals.read`. La propiedad aprueba entidades/departamentos e inicia la sincronización. No hay ACL por empleado verificada. Los owners no aportan disponibilidad de personas: ese dato queda ausente.

Se hace escaneo paginado completo, sin prometer histórico anterior. Archivados se conservan como tombstones y se excluyen de analítica. Borrados de pipelines requieren reconciliación adicional. Desconectar detiene nuevas sincronizaciones; no borra automáticamente datos normalizados. Para validar un proveedor real se necesita dataset sandbox y comparar IDs/campos/páginas/borrados. No se han realizado escrituras remotas.

Fuentes consultadas o intentadas:

- https://developers.hubspot.com/docs/api-reference/crm-companies-v3/basic/get-crm-v3-objects-companies
- https://www.npmjs.com/package/@hubspot/api-client/v/14.1.3
- https://www.holded.com/developers
- https://developers.holded.com/reference/get-contacts
- https://apidoc.factorialhr.com/docs/authentication
- https://apidoc.factorialhr.com/docs/faqs

## IA

La demo siempre es local. En una organización no demo:

1. El operador configura URLs base HTTPS exactas en `AI_ALLOWED_ENDPOINTS`, vacía por defecto.
2. Se configura proveedor/modelo/clave en la UI; la clave se cifra y queda pendiente.
3. La propiedad revisa contrato, no entrenamiento, región, retención, JSON y tarifa; registra la revisión y activa. Debe fijar presupuesto positivo.
4. Se ensaya primero con datos ficticios y después con sandbox autorizado.

El adaptador usa Chat Completions compatible y segmentos JSON; no promete compatibilidad universal. `AIProvider` admite otros protocolos manteniendo privacidad y presupuesto. El autohospedado también exige aprobación. Excepciones privadas solo existen en el transporte para destinos autohospedados aprobados explícitamente; no hay una URL libre del usuario para abrir la red interna.

Contrastar https://developers.openai.com/api/docs/guides/your-data y contrato del proveedor elegido. No se hizo una llamada facturable real ni se verificó residencia contractual.

## API y extensiones

OpenAPI: `/api/openapi.json`. Bloques: `/api/v1/contracts/answer`. Claves aleatorias de un uso visual, hash almacenado, caducidad y revocación. Solo consultas predeclaradas e informes agregados, con permisos actuales del propietario. No hay preguntas libres/SQL/código. Se eliminan nombres y tablas de entidad de la salida externa.

Studio genera SVG local y conserva trabajos bloqueados de imagen/vídeo. Presentaciones tiene editor, HTML y PDF. Slides/PPTX requieren integración. Voz, webhooks y MCP están apagados: un futuro MCP debe autenticar usuario, scopes, consentimiento y política del destinatario. No se anuncia un URL operativo ficticio.
