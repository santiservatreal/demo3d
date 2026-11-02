# Bird View — Prompt maestro de implementación

Preparado el 2 de noviembre de 2026 a partir de «Pipeline City (1).html».

## Cómo utilizar este archivo

Adjunta este archivo y el HTML de referencia a Codex, Claude Code u otro agente con acceso a un repositorio y capacidad de ejecutar comandos. Indícale: **«Ejecuta íntegramente el bloque PROMPT DE IMPLEMENTACIÓN. Crea y verifica el producto en este repositorio. El HTML adjunto es la referencia de interfaz y experiencia»**. Si puedes, coloca el HTML en `references/pipeline-city.html`.

El resultado esperado es un repositorio ejecutable con servidor, base de datos, trabajadores de tareas, interfaz y demo funcional; no una nueva maqueta HTML. GitHub almacena código y ejecuta CI; el servicio necesita además un entorno de alojamiento. El agente solo podrá crear el repositorio remoto o desplegar en una cuenta si su entorno dispone del acceso necesario. La implementación no debe depender de tener todavía claves de IA o CRM.

Una instrucción extensa reduce ambigüedad, pero no garantiza por sí sola un SaaS listo para producción. Por eso este prompt exige pruebas, evidencias de funcionamiento y una lista explícita de bloqueos. No confundir «implementado», «probado con fixtures» y «validado con una cuenta real».

## Decisión sobre el tratamiento local de identidades

La propuesta es técnicamente viable mediante **seudonimización reversible local**, no anonimización irreversible: un servicio dentro del entorno controlado de Bird View sustituye identidades por referencias opacas; conserva la correspondencia cifrada y reconstruye la respuesta únicamente para el usuario autorizado. No necesita una llamada a IA para esa sustitución.

Ejemplo ilustrativo: `Mercadona → [[BV_ORG_k7p9]]` y `Lucía → [[BV_PERSON_m4r2]]`. La IA podría recibir «[[BV_PERSON_m4r2]] gestiona la cuenta [[BV_ORG_k7p9]]»; el backend recupera los nombres al presentar el resultado. Los identificadores reales serán aleatorios y distintos por cliente y ámbito de conversación, no esos valores de ejemplo.

Hay tres límites importantes:

- Cambiar nombres no elimina la posibilidad de identificación por contexto: cargo único, ubicación, importes o hechos conocidos. Los datos empresariales también pueden ser confidenciales aunque no identifiquen personas.
- Un sistema determinista puede transformar campos conocidos con precisión, pero no reconocer todas las personas, empresas y referencias en cualquier texto libre. El modo estricto debe limitarse a datos estructurados y lenguaje controlado, o bloquear el envío cuando no pueda construir un contenido permitido.
- «No se usa para entrenamiento» no equivale a «no se almacena», «no sale de Europa» o «nadie puede acceder». Cada proveedor y endpoint debe evaluarse por separado. Una API de terceros sigue recibiendo el contenido seudonimizado autorizado. Un modelo autohospedado reduce esa salida, pero requiere proteger el propio alojamiento.

La Comisión Europea distingue expresamente datos anónimos de datos seudonimizados que pueden reidentificarse. La documentación de OpenAI API diferencia entrenamiento, registros de abuso y estado de aplicación. Véanse fuentes al final. Estas condiciones deben verificarse antes de comercializar garantías a clientes.

---

# PROMPT DE IMPLEMENTACIÓN — INICIO

## 1. Tu misión y forma de trabajar

Actúa como responsable técnico de producto y desarrollador full stack. Implementa **Bird View**, una plataforma SaaS B2B multicliente que conecta herramientas de una empresa, permite preguntar sobre sus datos, explica respuestas con evidencia, genera informes y ofrece una ciudad isométrica como representación complementaria del negocio.

Trabaja en el repositorio actual, revisa sus instrucciones y conserva el código útil existente. Si está vacío, inicialízalo. No te limites a entregar arquitectura, pseudocódigo, pantallas estáticas o un plan. Escribe los archivos, instala dependencias cuando el entorno lo permita, crea migraciones, ejecuta servicios y pruebas, corrige errores y deja instrucciones reproducibles.

No esperes claves externas para construir el sistema. Implementa una demo persistente sin servicios de IA externos y adaptadores intercambiables para las integraciones reales. No inventes conexiones, respuestas de proveedores, resultados de pruebas ni URLs de despliegue. Si falta acceso a internet, credenciales o permisos de infraestructura, termina todo lo que no dependa de ello y documenta exactamente qué verificación no pudiste realizar.

Utiliza decisiones de este documento por defecto. Solo solicita aclaración si una decisión imprescindible no puede resolverse sin riesgo material. No preguntes por colores, nombre, stack o empresa de ejemplo: están definidos. Trabaja por etapas internas, pero entrega el producto integrado. Mantén un archivo `IMPLEMENTATION_STATUS.md` con requisito, implementación, pruebas, limitaciones y siguiente paso.

## 2. Qué conservar del HTML y qué transformar

Lee el HTML adjunto como referencia de producto. Puede contener un empaquetador con manifiesto JSON, recursos gzip/base64, plantilla HTML y componentes compilados. Extrae los recursos de forma local y segura para entenderlos; no conviertas el bundle entero en el nuevo código ni dependas de su runtime propietario, `DCLogic`, scripts remotos o globals. Si reutilizas código propio aportado, refactorízalo a componentes mantenibles y conserva los avisos de licencia de terceros.

El prototipo tiene: sidebar, chat central, ciudad lateral, briefing, conversaciones recientes, Brain, aprobaciones, conexiones, tareas, rutinas, actividad, personas y roles, estudio de imágenes/vídeo, presentaciones, AI hub, modelos/presupuestos, APIs propias y conexión a asistentes externos. Su empresa ficticia, Albar Limpieza, y sus cifras solo son ejemplos. No hardcodees nombres, respuestas, departamentos ni proveedores en la lógica de negocio.

Mantén las ideas más útiles:

1. Chat como superficie principal, con respuestas compuestas por texto, métricas, tablas, gráficos, fuentes y acciones.
2. Sidebar como navegación estable y conversaciones persistentes.
3. Ciudad en panel opcional que sigue el contexto del chat; también explorable a pantalla completa.
4. Separación entre preguntar, proponer una acción, aprobar y ejecutar.
5. Conocimiento con procedencia, corrección y caducidad.
6. Conectores y política de datos visibles para administradores.

Corrige las promesas del HTML que no son ciertas en esta arquitectura: no mostrar «nada se almacena en Bird View», «siempre respeta automáticamente los permisos del origen», «312 modelos disponibles», «cambio de modelo en menos de un segundo», precios o conexiones ficticias. Bird View guardará la información necesaria según su política de retención. El origen seguirá siendo sistema de registro, pero habrá datos normalizados, conversaciones y archivos en Bird View. Usa etiquetas honestas de demo, caché, sincronización, integración pendiente y limitaciones.

## 3. Alcance obligatorio y funciones extensibles

Entrega funcionalmente ahora:

- Autenticación, organizaciones, miembros, permisos y aislamiento entre clientes.
- Onboarding y selección de demo o espacio vacío.
- Chat persistente con proveedor demo determinista y contrato para IA real.
- Consultas y cálculos sobre datos persistidos, evidencias, gráficos y ciudad vinculados.
- Conocimiento, acciones propuestas, aprobaciones, tareas, rutinas y actividad.
- Informes HTML, PDF y CSV realmente generados y descargables.
- Importación CSV/JSON, motor de sincronización, catálogo y adaptadores de lectura iniciales para HubSpot, Holded y Factorial, con pruebas de contrato sin credenciales.
- Seudonimización por código, política de salida y pruebas de aislamiento y filtrado.
- Administración básica de proveedores de IA, capacidades, presupuesto y consumo.
- API propia limitada a operaciones predefinidas, claves revocables y límites.
- Docker Compose, migraciones, seeds, CI y guía de despliegue.

Conserva estas funciones del prototipo como módulos explícitamente extensibles, sin falsear resultados:

- Pipedrive, Zendesk, Gmail, Drive, Slides, Salesforce, SAP, marketing y gateway industrial: catálogo, interfaces, fixtures de ejemplo y estado «pendiente de integración» mientras no exista implementación verificable.
- Studio: biblioteca, formatos, formulario, assets y trabajos persistentes. Imágenes/vídeo generativos requieren proveedor configurado; no simular una generación real. Puede generar gráficos de datos sin IA.
- Presentaciones: modelo de diapositivas, plantillas con marca, editor simple y vista previa HTML funcional. La integración Google Slides y exportación PPTX pueden quedar como extensiones documentadas; PDF se implementa con el renderizador compartido.
- Voz: interfaz preparada para STT/TTS, apagada por defecto; no activar dictado del navegador sin evaluar si envía audio a un tercero.
- MCP: contrato de herramientas y diseño de autenticación; endpoint desactivado hasta implementar autorización por usuario y pruebas. No mostrar una URL operativa inventada.

El núcleo no debe convertirse en una colección de botones sin comportamiento. Si una función depende de un proveedor no configurado, explica el requisito en la interfaz y bloquea su ejecución; el resto de la app debe funcionar.

## 4. Arquitectura y stack

Construye un monorepo TypeScript con Node.js LTS compatible, pnpm y versiones estables compatibles fijadas en lockfile. Verifica documentación oficial vigente durante la implementación y documenta las versiones elegidas. No dependas de `latest` para construir imágenes reproducibles.

- `apps/web`: React, Vite, TypeScript strict, React Router, TanStack Query, Tailwind, componentes accesibles basados en Radix/shadcn, Lucide y Recharts.
- `apps/api`: Fastify, esquemas Zod, OpenAPI y servicios de dominio. REST `/api/v1`; SSE para progreso de chat y trabajos.
- `apps/worker`: BullMQ/Redis para sincronización, reportes y rutinas. No ejecutar tareas largas dentro de una petición HTTP.
- PostgreSQL con migraciones SQL y Drizzle. Usar SQL explícito para RLS y restricciones. Sin vector DB en la primera versión; búsqueda estructurada y full-text local suficiente para el MVP.
- Almacenamiento de objetos mediante interfaz `ArtifactStore`: directorio privado en demo y adaptador S3 compatible en despliegue. Nunca servir directamente la carpeta de informes como pública.
- Caddy u otro reverse proxy sencillo para HTTPS y frontend/API bajo el mismo origen. Base de datos y Redis en red privada.
- Autenticación mediante biblioteca mantenida compatible con Fastify/Node; preferir Better Auth si la compatibilidad actual se confirma. Sesiones opacas en cookies HttpOnly, Secure en producción y SameSite. No diseñar criptografía o contraseñas propias.
- PDF con Playwright/Chromium en worker sobre HTML generado localmente. Bloquear cargas de red arbitrarias durante el renderizado.
- Vitest, pruebas de integración contra PostgreSQL real y Playwright E2E.

Estructura orientativa:

```text
apps/web/src/{app,features,components,styles}
apps/api/src/{routes,services,auth,middleware}
apps/worker/src/{jobs,schedulers}
packages/{contracts,db,authz,connectors,analytics,privacy,ai,reporting,city,fixtures,config}
references/
docs/{architecture,security,connectors,operations,product}
tests/{integration,e2e,security}
infra/{docker,deploy}
.github/workflows/ci.yml
compose.yml
.env.example
README.md
IMPLEMENTATION_STATUS.md
```

Prefiere un backend modular y un worker a una arquitectura de microservicios. La bóveda de identidades se separa lógicamente y con permisos desde el inicio; documenta cómo extraerla a un servicio aislado. No añadas Kubernetes, Kafka, un motor de agentes autónomos o GPU como requisito de la demo.

## 5. Modelo multicliente y de autorización

Una `organization` representa al cliente de Bird View; una `account` representa un cliente comercial de esa empresa. No mezclar los dos conceptos. Un usuario puede pertenecer a varias organizaciones mediante `membership`. Cambiar de organización requiere comprobación de membresía en servidor y limpieza de cachés, paneles, selección y streams del frontend.

Roles iniciales configurables: propietario, administrador técnico, responsable de departamento, analista y lector. Administrar conectores o usuarios no concede automáticamente acceso a nóminas, datos personales restringidos o todas las conversaciones. Define permisos por recurso, acción, departamento y clasificación de campo. El control debe aplicarse en servidor, nunca solo ocultando botones.

Todas las tablas de negocio tendrán `organization_id NOT NULL`; referencias compuestas `(organization_id, id)` impedirán relaciones entre clientes. Índices y claves únicas incluirán organización y origen cuando corresponda. PostgreSQL RLS se activa con `USING` y `WITH CHECK`, política denegatoria sin contexto y `FORCE ROW LEVEL SECURITY` donde proceda. El rol de ejecución no será superusuario, propietario ni `BYPASSRLS`; el rol de migraciones será diferente.

El servidor obtiene la organización de la sesión y de membresías verificadas. Nunca acepta `tenant_id` del cuerpo, una cabecera o del modelo como autorización. El contexto de RLS se establece dentro de cada transacción con `SET LOCAL`/`set_config(..., true)`, evitando fugas del pool. Trabajadores, exportadores, scheduler y API keys usan el mismo mecanismo con principal comprobado. RLS complementa, no reemplaza, la autorización por departamento/campo.

Aplica aislamiento también a objetos, nombres de caché, deduplicación, SSE, búsquedas, fuentes, presupuestos, colas y reportes. En un cliente no revelar siquiera la existencia de objetos de otro: devolver 404 cuando corresponda.

Permisos del origen: si el conector dispone de ACL por usuario, intersectarlas con los permisos de Bird View. Si usa una credencial amplia de empresa sin ACL utilizables, declararlo y exigir una política local restrictiva aprobada por administrador. No afirmar equivalencia con permisos del origen si no se puede demostrar. Sin mapeo suficiente, denegar datos sensibles. Revocar acceso invalida sesiones/cachés y afecta consultas, tareas pendientes y descargas.

El personal de soporte de Bird View no tiene acceso a datos por defecto. Un futuro acceso de soporte requerirá autorización temporal del cliente, alcance, caducidad y auditoría.

## 6. Esquema de datos y trazabilidad

Implementa entidades y migraciones para:

- Identidad: organizations, users, memberships, departments, roles, permissions y bindings.
- Integraciones: connections, encrypted_credentials, sync_runs, cursors, source_records, source_entity_links y schema_mappings.
- Negocio: accounts, contacts, employees, teams, opportunities, pipelines, stages, invoices, payments, tickets, products, inventory_movements, orders y projects. Producción/campañas como esquemas extensibles cuando no estén habilitados.
- Analítica: metric_definitions, metric_snapshots, entity_events, evidence_records y data_quality_issues.
- Conversación: conversations, messages, answer_blocks, query_executions y evidence_links.
- Conocimiento: knowledge_items, knowledge_versions, knowledge_sources y knowledge_conflicts.
- Trabajo: action_proposals, approvals, execution_attempts, tasks, task_steps, routines y routine_runs.
- Salidas: report_templates, report_runs, artifacts, presentation_documents y media_jobs.
- Administración: ai_provider_configs, model_capabilities, privacy_policies, budget_limits, usage_ledger, api_keys, published_queries, webhook_subscriptions y audit_events.
- Privacidad: identity_registry, pseudonym_scopes, pseudonym_mappings y privacy_decisions con acceso especial.

Cada registro importado incluye proveedor, conexión, ID externo, timestamp del origen, fecha de observación/ingesta, versión/esquema, calidad y estado de borrado. Almacena solo los campos autorizados; el payload bruto completo no debe persistirse por comodidad. Si existe staging, tendrá cifrado, acceso restringido y TTL corto explícito.

Representa dinero con decimal o unidades menores, nunca floats; lleva código ISO de divisa. No sumes monedas distintas sin tipos de cambio y fecha identificados. Guarda fechas absolutas en UTC, fechas contables sin conversión accidental y zona IANA por organización. Usa Europe/Madrid y EUR en demo, configurables.

Resolver entidades entre herramientas por ID fiscal normalizado, enlaces confirmados o identificadores fuertes. Email exacto puede ayudar a contactos. Dominio o similitud de nombre solo sugieren correspondencia: no fusionar automáticamente empresas/personas por ellos. Implementa cola de revisión, procedencia de la decisión y reversión. Detecta duplicados, conflictos y datos huérfanos.

Histórico: distinguir `occurred_at`, `source_updated_at` y `observed_at`. Guardar eventos o snapshots desde la primera sincronización; importar historial anterior únicamente si la API lo expone. «Estado hace una semana» no se puede reconstruir a partir del estado actual sin evidencia. Mostrar «histórico no disponible» si corresponde. El período consultado y la cobertura real deben estar visibles.

## 7. Diseño visual y experiencia

Marca **Bird View**; no usar Pipeline City como marca de producción. Idioma inicial español con estructura i18n para inglés. Nombres/cifras dependen de organización; nunca del ejemplo del HTML.

Layout de escritorio a 1440 px: sidebar de aproximadamente 248 px; zona central flexible con contenido conversacional de 720–880 px; panel ciudad opcional de 360–440 px, redimensionable y colapsable. Si no hay ancho suficiente, ciudad como drawer. Bajo 768 px, navegación compacta y ciudad en pantalla separada; el chat conserva prioridad. Verificar 390, 768, 1280 y 1440 px.

Estética: superficies claras sólidas, sombras discretas, borde fino, esquinas de 12–16 px, tipografía Geist o Inter servida localmente, números tabulares y mono para datos técnicos. Fondo de aplicación `#F7F8FA`; ciudad `#E8EDF4`; paneles blancos; texto `#17212F`; secundario `#667085`; azul principal `#4F6FD0`; bordes `#E4E7EC`; verde para correcto, ámbar para atención y rojo para errores. Mantener contraste AA; el color nunca será el único indicador. Sin glassmorphism excesivo, animaciones invasivas ni iconos decorativos gigantes.

Sidebar:

- Inicio, Nuevo chat y buscador de conversaciones.
- Empresa: Conocimiento, Ciudad, Tareas, Aprobaciones, Rutinas, Informes.
- Crear: Presentaciones, Studio.
- Administración según permisos: Conectores, Personas y roles, IA y presupuesto, Privacidad, Actividad, API y automatizaciones.
- Conversaciones recientes, selector de organización y perfil.

Cada pantalla debe tener loading, vacío, error con recuperación, falta de permisos y conexión pendiente. Mantener foco, navegación por teclado, labels accesibles, estados de botones y reduced-motion. No mostrar controles falsos que no hagan nada.

Inicio: saludo, tres asuntos relevantes calculados sobre datos visibles, fuentes/fecha de actualización y preguntas sugeridas adaptadas a los módulos activos. El briefing no debe afirmar causalidades ni riesgos que no haya calculado. Badge persistente «Datos de demostración» cuando aplique.

## 8. Chat y motor de respuestas

Conversaciones persistidas por organización y propietario; compartirlas requiere alcance explícito y no amplía el acceso a fuentes. Al abrir una conversación compartida, volver a comprobar acceso a su contenido: no reutilizar texto visible para un usuario con más permisos. MVP: compartir solo con un grupo cuyo alcance de datos coincida; denegar o redactar si cambió.

Composer multilinea, Enter para enviar, Shift+Enter para salto, cancelar, reintentar, historial y filtros de fecha/departamento. Adjuntos desactivados hasta disponer de parser local, límites, validación y tratamiento de privacidad. Sin enlaces de descarga o imágenes remotas que el modelo pueda usar para exfiltrar datos.

Pipeline:

1. Autenticar y autorizar al usuario; resolver organización y filtros permitidos.
2. Identificar intención y referencias locales; resolver ambigüedad con selección al usuario.
3. Construir un plan de consulta tipado sobre herramientas permitidas.
4. Validar esquema, límites, presupuesto y permisos de cada herramienta.
5. Ejecutar consultas parametrizadas y cálculos en backend.
6. Seleccionar evidencia mínima, transformar datos y pregunta mediante privacidad local.
7. Invocar proveedor permitido únicamente con el envelope ya aprobado.
8. Validar respuesta estructurada, fuentes, referencias y valores; reconstruir nombres con permisos actuales.
9. Persistir conforme a retención y renderizar bloques tipados.

Nunca permitir SQL arbitrario generado por el modelo, ejecución de código, shell, navegación web libre ni llamadas HTTP decididas por el LLM. La IA puede seleccionar herramientas declaradas con argumentos validados; no puede concederse acceso ni ejecutar escrituras.

Contrato común de respuesta con Zod:

```ts
type Answer = {
  id: string;
  mode: 'demo' | 'external_llm' | 'self_hosted_llm';
  blocks: AnswerBlock[];
  evidenceIds: string[];
  dataAsOf: string;
  coverage: { from?: string; to?: string; warnings: string[] };
  proposedActionIds: string[];
  privacyDecisionId: string;
};
// AnswerBlock es una unión discriminada cerrada:
// text, metric, table, chart, sourceList, warning,
// actionProposal, reportLink, cityFocus y clarification.
```

Define el esquema completo de cada bloque. Texto en Markdown sanitizado, sin HTML ejecutable. Tablas y gráficos usan columnas/series tipadas y valores obtenidos del motor analítico. Referencias a métricas como `metricRef` y a entidades como `entityRef`; no aceptar cifras inventadas dentro de un gráfico. Si el texto del LLM contradice cifras verificadas, reemplazar esa parte por una formulación determinista o marcar respuesta no verificable. No calcular ratios a ojo.

Cada respuesta distingue hechos calculados, interpretación e hipótesis. No confundir correlación con causa, por ejemplo un ticket abierto con retraso de pago. No mostrar porcentajes de confianza inventados; usar «verificado», «parcial», «inferido» o «sin evidencia», con motivo.

Fuentes: proveedor, entidad, campos/indicador utilizados, rango temporal y fecha de sincronización. Los links al origen se construyen localmente, nunca se envían al modelo si contienen identidades. Abrir el detalle requiere permiso. Citar solo evidencia realmente utilizada; no fabricar IDs.

SSE transmite progreso real: validando, consultando, preparando, generando y listo. No mostrar razonamiento interno del modelo. Para privacidad, almacenar la respuesta del proveedor en buffer hasta validar tokens/bloques; no reenviar fragmentos sensibles o incompletos al navegador. Cancelación detiene el trabajo cuando sea posible y deja estado consistente.

## 9. Proveedor demo y herramientas analíticas

`DemoAIProvider` no es una IA general: usa reconocimiento determinista de intenciones conocidas, selección de consultas y plantillas sobre resultados actuales. Identificarlo como «Asistente demo — consultas guiadas». Ante preguntas no soportadas, explicar el límite y ofrecer ejemplos; jamás devolver una contestación fija irrelevante.

Implementa al menos estas familias en español y variantes básicas:

- Facturas pendientes/vencidas, aging y clientes con mayor saldo.
- Cobros recientes y comparación de períodos.
- Pipeline por fase, propietario, fecha prevista y estado.
- Tasa de cierre con definición explícita y comparación válida.
- Tickets abiertos/prioridad/antigüedad y cruce con cuentas autorizadas.
- Plantilla por equipo y disponibilidad agregada, sin datos de salud o nómina.
- Stock bajo mínimo y pedidos retrasados si el módulo está activo.
- Resumen ejecutivo de un período y generación de informe.
- Ficha de cliente con oportunidades, facturas y tickets permitidos.
- Consultas históricas cuando exista cobertura.

Herramientas como `getReceivables`, `getPipeline`, `getAccountSummary`, `getTeamCapacity`, `getInventoryAlerts`, `getMetricSeries`, `searchKnowledge`, `draftAction` y `createReport`. Cada una declara esquema de argumentos, permisos, clasificación de datos, timeout, coste estimado y límites de filas. La implementación recibe un `RequestContext` autenticado; el modelo no lo suministra.

Definiciones versionadas de KPI: vencido = saldo pendiente positivo y vencimiento anterior a fecha de corte; tasa de cierre = ganadas/(ganadas+perdidas) dentro de la cohorte indicada, no ganadas/todas sin explicar; pipeline ponderado solo con probabilidades configuradas. Evitar llamar DSO al promedio de días de cobro. Sin denominador, mostrar N/A. Facturas anuladas, abonos, pagos parciales y divisas requieren tratamiento explícito. La misma definición produce la cifra del chat, ciudad, informe y API.

## 10. Gateway de IA real

Interfaz `AIProvider` con capacidades, generación estructurada, timeout, cancelación, uso y errores normalizados. Implementar un adaptador HTTP para una API de proveedor documentada y otro compatible con endpoint autohospedado que soporte el contrato elegido. Encapsular diferencias; no asumir que todos los proveedores compatibles implementan tools, JSON Schema o streaming igual.

Configuración por organización: proveedor, modelo, endpoint aprobado por operador, región declarada/verificada, política de entrenamiento, retención, elegibilidad de controles especiales, capacidades, límites de contexto, estado y fecha de revisión. No hardcodear promesas comerciales. No aceptar un endpoint HTTP arbitrario desde el chat ni desde un administrador de cliente sin control del operador: proteger SSRF y salida de datos.

Solo el gateway puede invocar proveedores de IA, incluidos futuros embeddings, imágenes, OCR, STT/TTS, routers y herramientas externas. No instalar SDKs que envíen prompts por caminos paralelos. Sin claves, modo demo funcional. En producción sin proveedor, responder «IA no configurada»; no sustituir silenciosamente datos reales por fixtures.

Fallback solo a un proveedor previamente autorizado con políticas equivalentes o más restrictivas; si no existe, fallar de forma clara. Un agregador añade otro receptor de datos y debe declararse. Un modelo local en AWS significa autohospedado en vuestra infraestructura, no en el ordenador del cliente ni ausencia de costes.

Presupuesto mensual por organización y opcional por equipo/clave: reservar coste máximo estimado de forma atómica antes de invocar, reconciliar consumo comunicado, liberar reserva al fallar y controlar peticiones concurrentes. No superar presupuesto por carreras. Contar tokens reales cuando estén disponibles; estimaciones etiquetadas. Precios versionados por proveedor/modelo/unidad y moneda, no «por millón de palabras». No inventar facturación unificada con planes externos.

## 11. Privacidad local sin IA — obligatorio

Implementa `packages/privacy` con reglas deterministas, validación de esquema, diccionarios locales y tokenización. **No usar LLM, NER basado en modelos, servicios de moderación remotos ni API de terceros para detectar o sustituir identidades en esta ruta.** Una futura detección con modelo local sería una opción distinta y no satisface el requisito de este MVP.

Frontera de confianza: backend y bóveda controlados por Bird View; el proveedor externo está fuera. Datos en claro pueden existir dentro del backend para operar y para el usuario autorizado. La IA externa recibe solo los campos mínimos permitidos ya transformados. No prometer que desaparece todo riesgo de inferencia.

### 11.1 Clasificación y reglas por campo

Catálogo central con acciones `ALLOW`, `TOKENIZE`, `REDACT`, `AGGREGATE`, `GENERALIZE`, `DROP`, `BLOCK`. Por defecto denegar campos nuevos o desconocidos hasta clasificarlos.

- Nombres y apellidos, razón social, nombre comercial, alias, dominios, emails, teléfonos, documentos fiscales/personales, direcciones, cuentas bancarias, URLs y IDs externos: tokenizar o eliminar según utilidad.
- Nombre de vuestra empresa cliente y de sus clientes/proveedores también se protege, aunque un nombre de sociedad no sea siempre dato personal.
- Notas, asuntos, nombres de archivos, descripciones, links, metadatos y mensajes del chat también son superficies de salida.
- Nómina individual, salud, bajas médicas, documentos personales y secretos: no importar por defecto; impedir envío externo. Preferir agregados y supresión de grupos pequeños con umbral configurable. Ese umbral no garantiza anonimato formal.
- Importes, cargos únicos, fechas exactas y ubicaciones pueden ser cuasiidentificadores o información confidencial. Permitir agregación, redondeo o generalización por política y caso de uso.

### 11.2 Registro y correspondencias

Registro interno por `(organization_id, entity_type, canonical_entity_id)`; una misma persona puede tener roles de comercial y manager sin duplicar identidad. El rol es atributo autorizado, no la clave. Cliente y proveedor pueden apuntar a la misma organización canónica si la relación está confirmada.

La bóveda almacena correspondencia cifrada con AEAD de biblioteca estándar, nonce único y AAD con organización/ámbito/versión; claves separadas de PostgreSQL, identificador de versión y rotación documentada. En producción utilizar KMS/secret manager. No hashes simples de nombres/emails para seudónimos: permiten ataques de diccionario. Si se necesita lookup, HMAC con clave por cliente y propósito distinto; nunca reutilizar ese identificador interno como token del LLM.

Tokens aleatorios opacos, por ejemplo `[[BV_ORG_<random>]]` o `[[BV_PERSON_<random>]]`, sin codificar ID de cliente, email, rol único ni contador global. Un scope de conversación/trabajo mantiene estabilidad para sus turnos; scopes distintos usan tokens distintos. El registro interno sigue estable. No compartir mappings entre organizaciones ni enviar el diccionario al proveedor.

La aplicación principal no puede volcar la tabla completa; interfaces de resolución acotadas a entidades autorizadas. Expiración ligada al ciclo de vida del trabajo/conversación, borrado y rotación. Una revocación impide nuevas reconstrucciones. El cifrado de la bóveda no reemplaza cifrado de discos/backups y permisos del resto de los datos.

### 11.3 Entrada estructurada y texto libre

Campos estructurados: transformar por esquema y referencias canónicas, sin buscar nombres a ciegas en JSON serializado. JSON anidado y arrays se recorren con límites. No permitir propiedades desconocidas por defecto.

Texto libre: normalizar Unicode para detección manteniendo offsets correctos, detectar patrones de email/teléfono/documentos/URLs, buscar alias conocidos con límites de palabra y coincidencias largas primero. Cubrir acentos, mayúsculas, múltiples apellidos y nombres contenidos en otros nombres. Homónimos se resuelven con contexto autorizado; si siguen ambiguos, solicitar selección, no adivinar.

**Modo estricto por defecto para salida externa:** no enviar texto libre arbitrario solo porque no coincida con regex. Construir una pregunta segura desde una intención local soportada, entidades seleccionadas y parámetros validados. Si el texto contiene fragmentos que no pueden reconstruirse con esa gramática/lista permitida, no enviarlo; pedir reformulación guiada o usar una ruta autohospedada autorizada. Los resultados de herramientas también deben provenir de campos permitidos. Este es un límite deliberado, visible y probado.

**Modo texto libre controlado opcional:** exige activación administrativa informada, aplica diccionarios, patrones y revisión, pero indica riesgo residual; no llamarlo garantía de anonimato. Dejarlo desactivado en la entrega inicial si no se ha construido y probado todo su flujo.

No hay detector universal sin falsos negativos: la comprobación final sirve como defensa adicional; la garantía técnica del modo estricto es la construcción positiva de un envelope permitido, no «no encontramos nombres».

### 11.4 Entrada al modelo y salida al usuario

Envelope único incluye pregunta reconstruida, instrucciones, historia mínima, resultados de herramientas y metadatos ya transformados. Prohibido enviar nombres reales por títulos de conversación, etiquetas de trazas, tool arguments, errores, adjuntos, nombres de ficheros o URLs. Cada nueva llamada y cada retry/fallback pasan otra vez por la política.

La IA devuelve referencias tokenizadas o bloques con `entityRef`. Validar que todos los tokens están en la allowlist de esa petición, pertenecen al scope y organización, y el usuario mantiene acceso. Token inventado, expirado o ajeno: no resolver, registrar incidente de metadatos y usar mensaje seguro. No hacer un `replaceAll` global sobre cualquier string, HTML, ruta o enlace. Reconstruir sobre nodos de texto/JSON tipados, escapando salidas.

Evitar que el usuario introduzca un token literal que provoque lookup: reservar la sintaxis, escapar tokens de entrada y distinguir referencias emitidas por servidor. Las identidades se resuelven solo desde un contexto autorizado, nunca por el mero conocimiento de una cadena.

Ejemplo de aceptación: un usuario autorizado pregunta por una cuenta seleccionada y su comercial; el proveedor simulado recibe únicamente referencias opacas y las cifras permitidas; la respuesta final muestra los nombres reales. Un usuario de otro departamento o cliente no consigue la misma respuesta ni la correspondencia.

### 11.5 Salidas externas adicionales

El navegador autorizado puede ver nombres reconstruidos. Una API/MCP/webhook externo no debe recibir automáticamente esa misma salida: necesita política de destinatario y permiso de exportación independiente. En particular, devolver nombres reales por MCP a un asistente externo rompería el objetivo de no enviárselos. Por defecto esos canales reciben versión seudonimizada o agregada. Informes para descarga interna pueden incluir nombres con permiso; envíos externos están apagados hasta configurar destinatarios/política.

Auditoría de privacidad registra IDs internos, regla, clase de datos, allow/block y conteos; no prompts completos, diccionario o valores sensibles. Una vista restringida permite revisar qué campos se permitirían antes de activar proveedor, sin guardar el payload en logs generales.

## 12. Conectores y sincronización

Contrato tipado por conector:

```ts
interface Connector {
  manifest: ConnectorManifest;
  testConnection(ctx: ConnectorContext): Promise<ConnectionCheck>;
  discoverSchema(ctx: ConnectorContext): Promise<SourceSchema>;
  syncPage(ctx: ConnectorContext, request: SyncRequest): Promise<SyncPage>;
  // Opcionales y declarados en capabilities, nunca simulados:
  readRecord?: ReadRecord;
  verifyWebhook?: VerifyWebhook;
  executeApprovedAction?: ExecuteApprovedAction;
}
```

`manifest` declara versión, auth, scopes, entidades, capacidades, paginación, historial, webhooks, ACL, campos sensibles y acciones. `ctx` se crea en servidor con organización verificada y handle de secreto; los secretos no se serializan al frontend, logs o jobs. `SyncPage` incluye registros normalizados, cursor, borrados, límites observados y errores de calidad.

Credenciales cifradas por conexión, no una API key global para todos los clientes. OAuth con state de un solo uso ligado a sesión/organización, expiración, redirect URI exacta y PKCE cuando corresponda. Refresh seguro con bloqueo de concurrencia. Desconectar cancela syncs y revoca tokens cuando el proveedor lo permita; política explícita para conservar o borrar datos históricos.

Sincronización inicial seleccionable por entidades/período, incremental posterior, paginación completa, backoff con jitter para 429/5xx, Retry-After, timeout, cursor solo confirmado tras commit y upserts idempotentes. Identidad de deduplicación: organización+conexión+tipo+ID externo. Manejar eventos duplicados/desordenados, eliminaciones y reconciliación periódica. Reanudación tras reinicio y dead-letter visible. No asumir dos años de historial disponibles.

HubSpot inicial: cuentas/empresas, contactos, oportunidades, propietarios, pipelines, fases y asociaciones que permitan las credenciales. Holded inicial: contactos, facturas y cobros disponibles. Factorial inicial: empleados y equipos mínimos autorizados; disponibilidad solo si endpoint, scopes y política lo permiten; excluir salarios y salud. Verificar versiones, autenticación, endpoints y límites actuales en documentación oficial. No extrapolar el auth de un proveedor a otro.

Implementa adaptadores reales hasta donde permita documentación verificable y tests HTTP con fixtures. Sin cuenta, etiqueta «implementado, pendiente de validación con cuenta real». Si no puedes verificar un endpoint, no lo inventes: deja capability no disponible y explica la dependencia en `docs/connectors`. El usuario debe distinguir conexión pendiente, autorización pendiente, sync inicial, activo, degradado, error y revocado.

CSV/JSON debe funcionar ya: subida con límites, validación de extensión y contenido, vista previa, mapeo de columnas, clasificación, errores por fila, deduplicación, commit y resultado. No ejecutar fórmulas, macros ni expresiones. Mapear campos con un DSL limitado declarativo, nunca `eval`. Este importador permite pilotos antes de tener todas las APIs.

## 13. Adaptación a distintas empresas

Onboarding solicita razón social/nombre visible, actividad, zona horaria, moneda, idioma, departamentos y módulos. Elegir plantilla «servicios», «comercial/distribución» o «industrial», pero la lógica es configuración, no ramas por nombre de empresa.

Configurar nombres de fases, pipeline, departamentos, KPIs, objetivos, fuentes y correspondencias. Si no hay inventario o fábrica, no crear edificios vacíos ni respuestas sobre ellos. Si no hay RRHH, no impedir usar ventas/finanzas. Varias conexiones del mismo tipo deben soportarse con reglas explícitas para evitar doble conteo.

Proceso: conectar/importar, validar scopes y datos, revisar correspondencias ambiguas, confirmar definiciones de negocio y terminar con primer briefing. El porcentaje de progreso deriva de jobs reales, no temporizador. Permitir reanudar. No inventar datos por scraping de una web ni enviar invitaciones automáticas a todos los empleados detectados. La pertenencia a Factorial no convierte automáticamente a alguien en usuario de Bird View.

## 14. Ciudad isométrica y vínculo con el negocio

Construye `CityScene` como componente independiente con modelo `CityViewModel` producido por datos autorizados. Reutiliza la estética/proyección procedural del HTML cuando sea posible. SVG isométrico o Canvas es suficiente para esta versión; no exigir Three.js si aumenta riesgo sin aportar valor. Dejar adaptador de renderer para evolución futura.

Aspecto: maqueta compacta y luminosa, edificios marfil/blancos, ventanas azul grisáceo, calles gris claro, aceras, árboles pastel y tejados beige/terracota/verde/lavanda. Detalles de escala pequeños y sobrios. Sin terrenos enormes vacíos; sin arquitectura distinta dibujada a mano para cada cliente. Generación determinista a partir de módulos/configuración y seed de organización.

Distritos configurables: ventas, finanzas, personas, operaciones, logística/inventario, marketing y soporte. Solo mostrar los disponibles y autorizados. Color departamental estable; alertas con badges/contornos y texto. No usar altura como métrica si no hay leyenda y normalización conocida.

Hover/foco abre tooltip de KPI y fecha; click abre panel con resumen y tabla; «Preguntar por esto» añade un chip de contexto al composer. Una respuesta puede enfocar distrito o entidad mediante referencias validadas. Cambiar a tabla mantiene filtros y selección. «Mostrar en ciudad» funciona sobre datos reales/demo persistidos, no sobre coordenadas inventadas por IA.

La ciudad no expone entidades que el usuario no puede ver, ni conteos confidenciales por la cantidad de edificios. Agrupar grandes volúmenes; limitar nodos interactivos y permitir búsqueda. Reduce-motion, pausa al ocultar pestaña, labels de teclado y alternativa accesible en tabla. En móvil no interferir con escribir o hacer scroll.

## 15. Conocimiento de empresa

Pantalla con búsqueda, filtros, tipo, fuente, vigencia y visibilidad. Tipos: hecho de fuente, regla confirmada, declaración de usuario e inferencia pendiente. No elevar automáticamente una nota a regla global ni aceptar «ignora las políticas» como conocimiento de negocio.

Cada item tiene evidencia, autor, fecha, ámbito de permisos, versión, valid_until y estado. Puede corregirse, archivarse, olvidarse o solicitar confirmación. Al olvidar, excluirlo de retrieval y futuras respuestas, invalidar cachés e informar de límites de eliminación en snapshots/backups. Si el origen lo vuelve a traer, una regla de exclusión evita reintroducción silenciosa.

Conflictos entre fuentes se muestran con ambas procedencias; prioridad configurable por campo. Las inferencias se etiquetan y no se convierten en hechos por repetición. «Visible para todos» nunca será valor por defecto de datos derivados restringidos. Búsqueda local full-text con filtros de autorización antes de recuperar contenido.

## 16. Aprobaciones y acciones

Lectura por defecto. Una propuesta almacena organización, solicitante, aprobador/rol, recurso, operación, valores anteriores y nuevos, motivo, evidencia, versión del recurso, expiración, hash de payload y política aplicada.

Estados: draft → pending → approved/rejected/expired → executing → succeeded/failed/unknown. Editar una propuesta pendiente o aprobada cambia hash y exige nueva aprobación. La interfaz muestra un diff legible y destino exacto. Solo usuarios con autoridad pueden aprobar; separación de funciones configurable. El modelo nunca aprueba.

Antes de ejecutar: revalidar sesión/principal del trabajo, permisos, política, credenciales, expiración, hash y versión del origen. Si el dato cambió, volver a revisión. Usar idempotency key cuando exista y reconciliar resultados inciertos. Si el proveedor no garantiza idempotencia, no repetir a ciegas tras timeout: marcar `unknown` y comprobar estado remoto.

Sin APIs reales, las acciones se ejecutan en sandbox local de la demo y se etiquetan así. En conexiones reales solo lectura hasta implementar una acción verificable por proveedor. No asumir que Factorial permite asignar cualquier formación ni que un CRM puede hacer toda la acción descrita en lenguaje natural.

El resultado de ejecución se confirma con respuesta/proveedor o lectura posterior. Nunca mostrar «enviado» al crear un borrador. No enviar emails, publicar contenido, mover dinero o modificar herramientas por una frase de texto sin el flujo autorizado.

## 17. Tareas y rutinas

Tarea = objetivo finito con pasos, responsable, fuentes, fecha límite, estado y resultado. Rutina = ejecución recurrente por horario o evento. Una petición «revísalo en un mes» debe producir una tarea/rutina persistente con fechas y alcance, no una promesa en el chat.

Estados claros, pausa/cancelación, reintentos limitados, progreso real y enlace a conversación inicial. Planes del LLM son propuestas validadas sobre tipos de paso permitidos; no bucles autónomos sin límite.

Scheduler persistente con zona IANA y pruebas de cambio horario Europe/Madrid. Clave única por rutina/instante programado, bloqueo de concurrencia y política de misfires: ejecutar una vez lo pendiente reciente, no disparar cientos de trabajos tras una caída. Revalidar permisos del propietario antes de cada ejecución. Usuario revocado o datos fuera de alcance: bloquear trabajo.

Implementar briefing laboral 07:30, informe semanal y alerta de vencidos configurable. Resultados en bandeja interna; correo/webhook requiere configuración explícita y permiso de destinatario. Un trigger repetido no genera duplicados. Cada escritura vuelve al flujo de aprobación; aprobar una rutina de lectura no equivale a aprobar todas sus futuras escrituras.

## 18. Informes y presentaciones

Informes son primera clase y deben funcionar sin IA externa. Creación desde chat, pantalla Informes o rutina. Plantillas iniciales: ejecutivo, ventas/pipeline, cobros/vencidos, operaciones y personas agregadas. Parámetros: período, comparación, departamentos, filtros, audiencia, nivel de detalle, idioma, marca y formato.

Flujo: validar permisos → crear `report_run` → snapshot autorizado de datos/métricas → renderizar narrativa determinista o IA protegida → generar HTML/PDF/CSV → registrar artifact y disponibilidad. Enlace persistente, historial, regenerar como nueva versión, cancelar y estado de error. No confundir descargar CSV con generar un informe completo.

Estructura: título y período, resumen ejecutivo, KPIs, evolución, hallazgos con evidencia, riesgos/limitaciones de datos, acciones sugeridas sin ejecución, metodología y fuentes. Separar hechos e interpretaciones. Cada cifra visible tiene referencia a una definición y snapshot. Anotar cobertura y frescura por fuente; no poner una única fecha que oculte fuentes atrasadas.

PDF A4 limpio: portada compacta o cabecera, tipografía legible, tablas multipágina con encabezados, gráficos estáticos, número de página y sin elementos cortados. Generar realmente bytes PDF; no un botón que imprime una pantalla vacía. Pruebas verifican encabezado PDF, texto clave, totales y autorización; revisión visual de ejemplos. HTML sanitizado y CSP. CSV neutraliza fórmulas que empiezan con `=`, `+`, `-` o `@` cuando son texto controlado por usuarios, preservando tipos numéricos correctos.

Reportes guardados tienen ACL propia igual o más restrictiva que sus fuentes. MVP descargas mediante backend autenticado que revalida permisos y versiones de autorización; no enlaces públicos. Revocación de permisos bloquea el snapshot anterior, no solo la siguiente regeneración. Expiración y borrado configurables. Evitar PII en rutas/nombres externos.

Presentaciones reutilizan los mismos bloques y snapshots: portada, KPI, gráfico, tabla, conclusiones. Marca por organización; editor simple de títulos/orden/texto, vista previa y exportación PDF. Si PPTX/Google Slides no está implementado, mostrar «requiere integración» y documentar. Studio no debe poder enviar a modelos de imagen nombres/logos confidenciales por saltarse el gateway.

## 19. API propia, claves y conexiones externas

Implementar API versionada con OpenAPI y endpoints internos para sesiones, organizaciones, conectores, syncs, chat, métricas, ciudad, conocimiento, tareas, aprobaciones, rutinas, reportes y administración. Todas las rutas tienen esquemas, autorización y errores estructurados con request ID sin datos sensibles.

API pública inicial: consultas predefinidas y creación/consulta de informes. Service account ligado a organización, permisos estrechos y política de salida independiente. API key aleatoria de alta entropía, mostrada una vez, almacenada solo como hash, con prefijo, revocación, caducidad, rate limit y presupuesto. No permitir que una API key admin heredada acceda a toda la empresa.

«Crear API desde una respuesta» publica una plantilla de consulta validada y parámetros declarados, no código arbitrario o endpoint creado por el LLM. Mostrar esquema, ejemplo real de sandbox, alcance, coste y fecha de expiración. Sin escritura directa; como máximo crear propuesta con aprobación humana.

Webhooks salientes opcionales: destinos aprobados, HTTPS, protección SSRF/DNS rebinding/redirects, HMAC, timestamp, event ID, reintentos y deduplicación. Payload seudonimizado/agregado por defecto. No enviar un «webhook de prueba» a una URL hasta que el administrador configure y autorice el destino.

MCP queda desactivado hasta implementar autenticación por usuario, scopes, consentimiento, autorización de herramientas y política de salida para el cliente externo. No basar seguridad en slug de empresa o en saber una URL. Documentar que la interfaz externa tiene sus propias condiciones de datos y que rehidratar nombres allí constituye otra divulgación.

## 20. Seguridad operativa y privacidad por diseño

Sesiones seguras, protección CSRF para mutaciones autenticadas por cookie, CORS restrictivo, CSP, validación de entradas, límites de tamaño, rate limiting de login/chat/exportación, protección de credenciales y sanitización de Markdown/HTML. Invitaciones con token de un uso y caducidad; contraseñas/reset mediante biblioteca mantenida. Demo accesible solo en perfil de desarrollo; nunca usuario/password fijo expuesto en producción.

Claves y datos sensibles solo en backend. `.env` excluido de git; `.env.example` sin valores reales. Redacción de headers/cookies/tokens en logs. Sin analítica de terceros, session replay ni errores que capturen contenido de chats por defecto. Trazas solo metadatos seguros. Secret scanning y revisión de dependencias en CI.

Tratar textos de CRM, emails, documentos, conocimiento y respuestas del LLM como no confiables. Instrucciones embebidas no cambian políticas ni herramientas. No confiar en el system prompt como barrera de seguridad. La autoridad está en código, ACL, contratos y límites de salida. No mostrar ni ejecutar HTML/JS propuesto por el modelo.

Retención configurable y efectiva, con valores iniciales explícitos a revisar para cada cliente: conversaciones 90 días, informes 90 días, payloads de staging hasta 24 horas, logs operativos 30 días y auditoría de metadatos 12 meses. No son obligaciones legales universales. Datos normalizados siguen el contrato de sincronización y el ciclo de vida de la conexión. Implementar jobs de expiración, borrado de objetos/cache/búsqueda y comprobación de eliminación. Bóveda ligada al scope, sin mappings huérfanos indefinidos.

Exportación de datos del cliente y eliminación de organización requieren rol adecuado y confirmación explícita en producto. Borrado seguro con período de recuperación documentado si existe; explicar tratamiento y caducidad de backups. Restaurar backup debe reaplicar tombstones/borrados para no resucitar datos eliminados. No afirmar eliminación inmediata de copias de seguridad si no se implementa.

Auditoría append-only para el rol de aplicación, con actor, organización, acción, recurso, resultado, motivo y fecha. No llamarla inmutable frente al operador/DBA si solo es una tabla. Registro de lecturas sensibles, exportaciones, accesos denegados, decisiones de privacidad y cambios de configuración. CSV de actividad solo según permisos y sin payload sensible.

Documentar flujos, amenazas, inventario de datos, subencargados, retención, recuperación, claves y responsabilidades. No afirmar certificaciones, cumplimiento RGPD integral, anonimato absoluto o «cero exposición» por implementar estas medidas. Evaluar DPA/contrato, transferencias y necesidad de análisis de impacto según uso antes de producción. No automatizar decisiones laborales sobre personas; recomendaciones de personal son apoyo revisable, no decisión de empleo.

## 21. Datos de demostración

Seeds reproducibles con fecha de referencia configurable y dos organizaciones muy diferentes:

1. **Brisa Servicios Demo**: servicios B2B con ventas, facturación, equipos y soporte.
2. **Norte Industrial Demo**: distribución/fabricación con pedidos, inventario y operaciones además de ventas/finanzas.

Todos los datos son ficticios; emails en `example.com`, sin datos personales reales. Incluir al menos 40 cuentas, 60 oportunidades, 80 facturas con pagos parciales/abonos, 30 tickets, 20 empleados y 90 días de eventos por empresa según módulos. Cantidades consistentes, divisas explícitas y casos con datos ausentes. El período de demo debe permitir comparaciones al abrirla; no dejar fechas antiguas desconectadas del briefing.

Usuarios de prueba por roles, un usuario con acceso a dos organizaciones y otro solo a una. Casos de homónimos, alias de empresa, identidad con múltiples roles, dos clientes con igual nombre en organizaciones distintas, email en nota, URL con nombre, instrucción maliciosa en ticket y texto libre desconocido.

Un seed no crea identidades inseguras en producción. Script de credenciales aleatorias de demo local e instrucciones claras. Reiniciar el servidor conserva datos; reset demo es explícito y está deshabilitado fuera del perfil demo.

## 22. Infraestructura y entrega en GitHub

El repositorio debe arrancar en una máquina con Docker sin claves de terceros. Entregar comandos probados equivalentes a:

```bash
cp .env.example .env
./scripts/bootstrap-demo.sh
docker compose up --build -d
./scripts/check-demo.sh
```

El bootstrap genera secretos locales, crea volúmenes, ejecuta migraciones en orden e inicializa datos solo de forma explícita e idempotente. Healthchecks para API, base de datos y worker; endpoint liveness y readiness sin revelar secretos. Contenedores no root, cierre ordenado y límites razonables. La app debe indicar URL y cómo obtener usuarios demo. No depender de CDN ni runtime del HTML adjunto en ejecución.

CI: instalación congelada, lint, types, unit tests, integración con PostgreSQL/Redis, migraciones desde cero y E2E mínimo. Build de imágenes y reporte de dependencias/secretos; no volcar `.env` en logs. Tests de seguridad críticos bloquean merge. Si un runner no soporta Docker, ejecutar lo posible y declarar verificación pendiente, sin reemplazar PostgreSQL por SQLite para probar RLS.

GitHub remoto: si existe remote y autorización, trabajar en rama y dejar commit/PR revisable según entorno. Si no hay acceso, entregar repositorio local preparado y comandos de push, no inventar repositorio o URL. No sobrescribir ramas del usuario ni subir secretos o datasets sensibles.

Despliegue inicial documentado en un servidor Linux con Docker, dominio y TLS, volúmenes persistentes, backups cifrados externos y firewall. Solo puertos web públicos; Postgres/Redis privados. Esta topología es piloto de una instancia, no alta disponibilidad.

Documentar evolución a AWS en región elegida de la UE: frontend/API/worker en compute, PostgreSQL gestionado, Redis, S3 privado y KMS/Secrets Manager. Verificar disponibilidad regional de servicios y proveedor de IA antes de prometer residencia. Proponer WAF según exposición/necesidad, sin tratarlo como sustituto de autorización. No crear infraestructura con coste ni afirmar despliegue real sin acceso autorizado. Incluir pasos de rollback, restauración ensayable y actualización de migraciones; no prometer RPO/RTO sin medirlos.

## 23. Rendimiento y observabilidad

Paginación de tablas, límites de filas/contexto y agregación server-side. La UI no descarga todos los datos para filtrar. Caché incluye organización, principal/alcance de permisos, versión de política, filtro y snapshot; invalidar en revocación. Nada de caché global de respuestas por el texto de pregunta.

Objetivos de desarrollo medibles, no SLA comerciales: carga de app demo razonable, consultas comunes bajo 2 segundos con fixtures e informes cortos bajo 30 segundos en entorno documentado. Medir y reportar hardware/dataset en vez de afirmar que se cumple sin ejecutar. Instrumentar latencia, errores, lag de sync, cola, costes, bloqueos de privacidad y fallos de autorización mediante metadatos, sin contenido del cliente.

Evitar re-render completo de ciudad en cada token. Virtualizar listas grandes, lazy-load Studio/ciudad, cancelar requests obsoletas y manejar offline/reconexión sin mezclar respuestas o duplicar acciones.

## 24. Pruebas de aceptación obligatorias

Escribe pruebas de comportamiento, no solo snapshots de componentes. Como mínimo:

| ID | Comprobación | Resultado esperado |
|---|---|---|
| A01 | Arranque limpio sin API keys | Login/demo/chat/ciudad/informes funcionan; llamadas externas de IA = 0 |
| A02 | Cambiar facturas del seed/importar CSV y volver a preguntar | Cambian chat, KPI, ciudad, informe y API coherentemente |
| A03 | Organización B intenta ID de objeto de A en lectura/escritura/export/SSE | Denegado; no revela existencia ni metadatos |
| A04 | Consulta SQL con rol runtime sin contexto RLS | No devuelve filas de negocio; inserts no autorizados fallan |
| A05 | Reutilización de conexiones del pool entre clientes y jobs | Sin contaminación de contexto |
| A06 | Usuario de ventas pide salarios o acceso fuera de su ámbito | Denegado antes de retrieval/proveedor |
| A07 | Nombre de cliente y persona en pregunta, historia, nota y metadatos | El transport spy externo no observa los valores originales en solicitudes permitidas |
| A08 | Nombre desconocido en texto libre bajo modo estricto | Bloqueo o aclaración; ninguna llamada externa |
| A09 | Token ajeno/inventado/literal introducido por usuario | No se reconstruye identidad ni se consulta mapping ajeno |
| A10 | Alias, homónimos y misma persona en varios roles | Resolución correcta o aclaración, sin colisiones |
| A11 | Prompt injection en ticket y respuesta con HTML/URL maliciosa | No ejecuta herramientas ni scripts, ni realiza egress no autorizado |
| A12 | Proveedor devuelve cifra o fuente inventada | Se rechaza/corrige con datos verificados y se informa del límite |
| A13 | Aprobación duplicada, payload editado, timeout y versión remota distinta | Sin doble escritura; reaprobar o reconciliar según caso |
| A14 | Sync con 429, varias páginas, duplicados y borrados | Reintenta acotado, no pierde páginas ni duplica datos |
| A15 | Reiniciar API/worker a mitad de reporte/rutina | Recupera estado sin duplicar resultado/acción |
| A16 | Rutina Europe/Madrid en transición de horario | Ejecución según política documentada, sin duplicados |
| A17 | PDF/CSV de período conocido | Archivo válido, totales correctos, fuentes/fecha presentes, CSV seguro |
| A18 | Revocar permiso después de generar informe | Descarga y acceso a conversación derivada denegados o redactados |
| A19 | Presupuesto agotado con varias llamadas concurrentes | Reservas atómicas impiden nuevas llamadas fuera del límite |
| A20 | Modelo falla; fallback incumple región/retención/política | No hay fallback; error explícito |
| A21 | Logs, errores, colas y trazas | No contienen credenciales, mappings ni valores sensibles de fixtures |
| A22 | Histórico anterior a la cobertura | Respuesta reconoce ausencia; no inventa evolución |
| A23 | Retención y borrado | Datos/objetos/cachés/mappings caducados quedan inaccesibles; prueba de proceso |
| A24 | API externa recibe respuesta | Se aplica política de salida, sin rehidratar por defecto nombres confidenciales |
| A25 | Capturas en móvil y escritorio, teclado y reduced-motion | Interfaz usable; ciudad no bloquea chat; sin contenido cortado |

El spy de privacidad inspecciona el payload realmente serializado justo antes de transporte, no solamente el resultado de una función auxiliar. Probar también retries/fallback, generación de informes y proveedor de errores. Añade controles negativos que fallen si se elimina RLS, se omite el filtro de organización o se puentea la privacidad.

Para integraciones sin credenciales, declarar tests de contrato/fixtures; una prueba mock no demuestra que el proveedor real acepte la petición. Añadir suite opt-in con secretos del entorno y dataset sandbox para validación posterior. No efectuar escrituras reales durante pruebas por defecto.

## 25. Orden de implementación y criterio de finalización

Avanza en este orden: inspección del HTML → arquitectura/migraciones/autenticación → aislamiento y permisos → datos demo/importador/analítica → privacidad y gateway → chat → ciudad → conocimiento/aprobaciones/tareas/rutinas → informes → conectores y administración → extensiones/UI → Docker/CI/E2E/documentación. No dedicar el esfuerzo inicial a perfeccionar edificios antes de cerrar las rutas de datos.

No sacrifiques controles de seguridad para que una demo parezca funcionar. Si una dependencia externa impide completar una capacidad, cerrar el resto y marcarla como no disponible. No dejar TODOs en autorización, aislamiento, cálculo de KPIs, privacidad o persistencia que se anuncien como implementados.

Documentación obligatoria:

- README con arranque exacto, comandos probados, demo y usuarios.
- Arquitectura, esquema, flujo de datos y decisiones técnicas.
- Threat model y explicación de seudonimización y sus límites.
- Guía de conectores con versiones/URLs consultadas, scopes, campos, auth, pruebas y gaps.
- Guía para añadir proveedor de IA y adaptar uno autohospedado.
- Guía de permisos por organización/departamento y permisos de origen.
- Operación: despliegue, backup/restore, rotación, borrado, costes y monitorización.
- Matriz de requisitos del HTML: conservado, implementado, adaptado o pendiente, con motivo.
- `IMPLEMENTATION_STATUS.md` y pasos necesarios para piloto con datos reales.

Respuesta final del agente: qué está implementado, cómo arrancarlo, URL solo si existe, pruebas ejecutadas con resultados, capturas de UI cuando el entorno lo permita, limitaciones reales y credenciales/cuentas que faltan. No describir una maqueta como plataforma productiva ni una integración mock como conectada.

# PROMPT DE IMPLEMENTACIÓN — FIN

---

## Próximos pasos para los socios

| Orden | Acción | Qué preparar | Qué permite comprobar |
|---|---|---|---|
| 1 | Ejecutar este prompt en un repo vacío o rama dedicada | Este archivo, HTML y agente con shell/repositorio | Demo completa sin claves, persistencia y pruebas |
| 2 | Elegir un primer piloto y 5–10 preguntas reales | Sector, responsables, datos mínimos y definición de cada KPI | Que el producto resuelva trabajo concreto, no solo consultas vistosas |
| 3 | Probar con CSV ficticios y después autorizados | Muestras pequeñas con columnas, casos límite y mapeos | Analítica y adaptación a la empresa antes de integrar todo |
| 4 | Conectar un CRM y un ERP | Cuenta sandbox, aplicación OAuth o credencial adecuada, scopes y callback | HubSpot + Holded u otra pareja prioritaria; paginación, frescura y permisos |
| 5 | Añadir Factorial cuando aporte un caso claro | OAuth/scopes y política de RRHH acordada | Equipos/disponibilidad sin importar datos sensibles innecesarios |
| 6 | Seleccionar proveedor de IA | Cuenta API, presupuesto, modelo, región y condiciones contractuales | No entrenamiento, retención y routing verificados por separado |
| 7 | Validar privacidad con casos reales controlados | Diccionario/alias, campos sensibles, usuarios y matriz de permisos | Qué preguntas pasan por modo estricto y cuáles deben bloquearse |
| 8 | Preparar servidor de staging | Dominio, TLS, secretos, PostgreSQL, objetos, backups y acceso operativo | Despliegue persistente y recuperación; GitHub por sí solo no lo aloja |
| 9 | Revisar garantías y seguridad antes de vender | Contratos/DPA, subencargados, retención, incidentes y revisión técnica independiente | Qué garantías podéis sostener con evidencias |
| 10 | Ampliar gradualmente | Nuevos conectores, escritura, voz, Studio, Slides o MCP | Añadir valor sin ampliar silenciosamente la salida de datos |

**No necesitáis aún un modelo gráfico propio por cliente:** la primera versión genera la ciudad mediante departamentos/módulos y configuración. Sí necesitaréis revisar con cada piloto la equivalencia entre sus datos y los indicadores/edificios.

**No basta con pegar claves:** algunas integraciones requieren registrar aplicaciones, configurar redirects, obtener scopes, validar acceso del plan y probar un sandbox. El prompt obliga a documentar esas dependencias. Tampoco los permisos de un token de empresa equivalen automáticamente a los permisos de cada empleado.

**Mensaje de seguridad comercial recomendado, una vez verificado:** «Aplicamos minimización, controles de acceso y sustitución local de identificadores antes de las llamadas a IA externa. Configuramos proveedores y condiciones de uso de datos según la política acordada con cada cliente. La información necesaria para recuperar las identidades permanece separada en nuestro entorno controlado». Evitar «datos completamente anónimos», «no almacenamos nada» y «cero riesgo».

## Fuentes técnicas y de privacidad

Consultadas el 2 de noviembre de 2026. Las decisiones de diseño del prompt son propuestas para Bird View, no requisitos literales de estas fuentes. El agente deberá verificar versiones y condiciones vigentes al implementar.

- Comisión Europea, distinción entre datos personales, seudonimizados y anónimos: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en
- EDPB, explicación de anonimización y seudonimización: https://www.edpb.europa.eu/topics/ai-and-technology/anonymisation-pseudonymisation_en
- OpenAI API, controles de datos, entrenamiento, logs, estado de aplicación y elegibilidad de retención: https://developers.openai.com/api/docs/guides/your-data
- PostgreSQL, row-level security y bypass por propietarios/superusuarios: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- OWASP, controles frente a prompt injection: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- HubSpot, documentación y cambios de plataforma: https://developers.hubspot.com/developer-platform-basics
- HubSpot, cambio de endpoints OAuth: https://developers.hubspot.com/changelog/v1-oauth-api-deprecation
- Factorial, métodos de autenticación: https://apidoc.factorialhr.com/docs/authentication
- Factorial, scopes y diferencias de credenciales: https://apidoc.factorialhr.com/docs/faqs
- Holded, documentación de desarrolladores: https://www.holded.com/developers

La referencia visual y funcional principal es el HTML adjunto. Se revisaron su plantilla, lógica de interfaz y código de ciudad procedural; no se ha validado aquí una conexión real de ese prototipo a ninguno de los proveedores.
