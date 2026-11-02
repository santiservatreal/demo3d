# BirdView · FaradAI

Inteligencia de empresa con chat, evidencias, ciudad isométrica, tareas e informes. La nueva aplicación está en **`/app/`**, con el lenguaje visual del HTML aportado: interfaz clara, navegación lateral, conversación central y ciudad opcional.

La demo usa PostgreSQL y Redis reales y datos ficticios persistentes. Sus respuestas se calculan localmente, sin API keys ni minutos de Tavus. Ciudad, presentación y landing anteriores siguen en `/`, `/demo` y `/page`.

## Arranque con Docker

Requiere Docker Engine y Compose. El bootstrap puede ejecutar Node dentro de Docker.

```bash
test -f .env || cp .env.example .env
./scripts/bootstrap-demo.sh
docker compose up -d --wait
./scripts/check-demo.sh
```

Abre el puerto **8080**, ruta **`/app/`**, y pulsa **Explorar la demo**. El propietario puede alternar entre Brisa Servicios Demo y Norte Industrial Demo. El bootstrap genera credenciales aleatorias privadas para cinco roles; no hay contraseñas fijas en el repositorio. Los datos sobreviven al reinicio y el seed es explícito e idempotente. Está deshabilitado en producción.

Si tu entorno usa un proxy TLS corporativo, consulta [OPERATIONS.md](docs/platform/OPERATIONS.md); no desactives la validación TLS.

## Desarrollo

Node **24.19.0**, pnpm **11.25.0**, Docker y Chromium. El lockfile activo es `pnpm-lock.yaml`; el de npm se conserva solo como referencia histórica.

```bash
pnpm install --frozen-lockfile
node scripts/init-local-env.mjs
docker compose -f compose.infra.yml up -d --wait
pnpm platform:migrate
pnpm platform:seed
pnpm platform:dev
```

La web de desarrollo usa el puerto **5174**, ruta `/app/`; la API escucha en 3001 y se sirve bajo el mismo origen mediante Vite. El comando inicia también el worker. Para la ciudad anterior: `pnpm dev -- --port 5173`.

## Validación

```bash
pnpm platform:lint
pnpm platform:types
pnpm test
pnpm build
pnpm platform:test:prepare
pnpm platform:test
pnpm platform:e2e
```

Las pruebas de plataforma usan **`birdview_test`**, separada de la demo. No sustituyen PostgreSQL por SQLite. [Resultados y capturas](docs/platform/VALIDATION.md).

## Alcance

Chat guiado, datos y permisos, importación CSV/JSON, consultas con fuentes, propuestas aprobables, tareas, rutinas, HTML/PDF/CSV, presentaciones editables y gráficos locales están implementados. La IA externa requiere endpoint aprobado, revisión y presupuesto. HubSpot tiene un adaptador de lectura con pruebas de contrato. Holded y Factorial tienen transporte real desactivado hasta verificar sus contratos y cuentas. Studio generativo, voz, Slides/PPTX y MCP indican su dependencia pendiente.

**Vercel estático no ejecuta esta plataforma completa.** `pnpm build` incluye su frontend en `dist/app`, pero API, PostgreSQL, Redis y worker requieren servidor. No se ha publicado un backend de producción ni creado infraestructura de pago.

- [Estado y límites](IMPLEMENTATION_STATUS.md)
- [Arquitectura](docs/platform/ARCHITECTURE.md)
- [Seguridad y privacidad](docs/platform/SECURITY.md)
- [Conectores e IA](docs/platform/INTEGRATIONS.md)
- [Operación](docs/platform/OPERATIONS.md)
- [Correspondencia con el HTML](docs/platform/HTML_MATRIX.md)
- [Ciudad, demo y landing anteriores](docs/platform/LEGACY_CITY.md)
