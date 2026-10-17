# Asistente de Atlas: modo local y conexión de IA opcional

El chat funciona sin claves: interpreta las consultas admitidas con los datos actuales del CRM y del ERP simulados y muestra **Demo local**. Puede localizar a Lucía, enfocar distritos, consultar las oportunidades, las comunicaciones y el inventario. No modifica el CRM ni envía mensajes.

La conexión con un modelo de IA está preparada en `api/assistant.js`. No se ha añadido ninguna credencial ni se ha realizado ninguna consulta a un servicio de IA durante esta implementación. Sin `OPENAI_API_KEY`, el servidor responde inmediatamente `503 AI_NOT_CONFIGURED` y el navegador utiliza la respuesta local. El modo se identifica en cada respuesta; no presenta el intérprete local como una IA conectada.

## Activación en Vercel

1. Abre el proyecto en Vercel → **Settings → Environment Variables**.
2. Añade `OPENAI_API_KEY` como variable secreta del servidor para los entornos que quieras utilizar. No uses un prefijo `VITE_` ni añadas la clave al repositorio.
3. Opcionalmente añade `OPENAI_MODEL`. El valor predeterminado es `gpt-4.1-mini`, con la API Responses y salida JSON estructurada.
4. Vuelve a desplegar el proyecto. El endpoint será `POST /api/assistant` en el mismo dominio que la ciudad.
5. Abre el chat y pregunta, por ejemplo, «¿Qué debería revisar primero en la empresa?». Una respuesta remota válida muestra **IA**; las consultas que dependen de datos ausentes conservan el modo local y explican la limitación.

Vite (`npm run dev` o `npm run preview`) solo sirve el cliente. Sin un entorno que ejecute las funciones de Vercel, `/api/assistant` devuelve un error o HTML y el chat continúa en modo local. Para comprobarlo sin servicios externos, ejecuta `node --test tests/city-assistant-api-model.test.mjs`.

## Datos enviados y acciones permitidas

El navegador envía la pregunta y un resumen limitado de la instantánea actual: fecha de referencia, métricas comerciales, nombres e identificadores, próximos pasos, tareas pendientes, contadores de comunicaciones, lotes y vehículos. Excluye los historiales completos y los campos de correos electrónicos de contactos, teléfonos, URLs del CRM, coordenadas y claves; no envía un estado bruto. Las listas tienen límites explícitos y se indica cuando pueden ser parciales. El servidor vuelve a aplicar la misma lista de campos permitidos antes de consultar al modelo. Las peticiones se limitan a 128 KiB, el servidor espera como máximo ocho segundos al servicio y el cliente diez segundos.

Con la clave activada, el endpoint admite hasta 20 peticiones por minuto e IP y devuelve `429 RATE_LIMITED` cuando se alcanza el límite; el chat continúa en modo local. Este contador vive en memoria de cada instancia del servidor, conserva un máximo de 256 entradas y elimina las caducadas al recibir peticiones. No es un límite distribuido entre varias instancias y no sustituye a la autenticación de una integración real.

El modelo solo puede proponer acciones de visualización: enfocar un comercial o una entidad existente, mostrar un distrito o activar la vista de atención. El cliente y el servidor validan los identificadores y rechazan acciones desconocidas. No existe ninguna ruta de escritura al CRM. Las respuestas no se guardan mediante la opción `store` de la API; no se registra su contenido en este endpoint.

Los importes ganados no representan facturas ni cobros. Esta conexión no incluye registros de facturas, costes ni períodos comparables de rendimiento, por lo que esas preguntas se resuelven con una explicación local y no se envían al modelo. Los personajes y los recorridos son ilustrativos; no se presenta su posición como GPS real. Las fechas y recomendaciones se calculan con el reloj de la instantánea.

Este endpoint es opcional y está preparado para esta demostración. Antes de conectarlo a datos reales de varias empresas, la autenticación y la autorización por empresa deben formar parte de la integración del CRM y del endpoint.

## Verificación realizada

El endpoint sin credenciales se ha comprobado con peticiones HTTP reales a un servidor Node local: `GET` devuelve `405` y `POST` devuelve `503 AI_NOT_CONFIGURED`. La conexión configurada, los errores del servicio, los límites de tiempo, la validación de acciones y el límite por IP se verifican con `fetch` simulado; no se han enviado datos a OpenAI ni consumido una clave real.
