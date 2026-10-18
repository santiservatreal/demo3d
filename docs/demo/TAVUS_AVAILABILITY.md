# Disponibilidad y cierre del agente en /demo

La captura del usuario muestra el aviso oficial **PAL is in another conversation**. El SDK 0.19.3 utiliza esa pantalla tanto para una conversación local que sigue conectada como para distintos errores de inicio. La captura sola no identifica una llamada activa ni demuestra un fallo concreto del servidor. No hay acceso autenticado a la cuenta Tavus desde este entorno para enumerar o finalizar sus conversaciones.

Se corrigieron dos problemas locales de la integración:

- El inicio exterior podía reemplazar un embed de error y lanzar otro intento mientras el anterior aún cerraba sus recursos. Ahora sólo existe una instancia; el reintento utiliza los controles del SDK. Iniciar de nuevo requiere Finalizar.
- El cierre anterior invocaba `endConversation()` y `destroy()` sin esperar. En 0.19.3, el primer método desde modo `call` sólo solicita salir de esa vista. La aplicación espera los eventos de fin y de salida de ese modo, y llama de nuevo al método público para esperar la operación de cierre compartida. Hasta entonces muestra **Cerrando la conversación…** y bloquea nuevos inicios. Hay un timeout de 8 segundos que libera recursos locales y no arranca otra llamada.

No se llaman endpoints privados ni se finalizan conversaciones ajenas. El SDK absorbe algunos errores de su petición HTTP de fin; ni su promesa ni el evento `ended` acreditan un HTTP 200 o la liberación remota del PAL.

Los mensajes españoles diferencian los errores de concurrencia 409/423, exceso de intentos 429, cuota 402, dominio rechazado y fallos de servicio 5xx cuando el SDK proporciona esa información. Un fallo de red genérico no se describe como otra conversación activa. Se mantiene visible el aviso oficial y su reintento; la aplicación no crea intentos automáticos.

## Verificación

- La suite Node pasa, incluidos los casos de cierre con promesas controladas: esperas en ambos órdenes, señales síncronas, ID ajeno, preview sin llamada, cierre del backend pendiente, errores, timeout y limpieza única. La sesión también bloquea un reinicio rápido y descarta eventos antiguos durante el cierre.
- El navegador de la presentación comprueba en escritorio y móvil que el inicio exterior queda oculto cuando ya existe el embed, que no crea otra instancia aunque se invoque su botón y que conserva el componente durante el cierre pendiente. La pantalla principal `/` conserva su funcionamiento.
- El **SDK real** reproduce una respuesta HTTP 423 local y muestra el aviso de la captura con **Try again**. La aplicación comunica `AGENT_BUSY`. [Informe del escenario ocupado](tavus-busy-sdk-validation.json).
- Otro escenario usa HTTP 403 de dominio rechazado y conserva el embed. [Informe de dominio](tavus-origin-sdk-validation.json).

Ambos escenarios del SDK interceptan los destinos externos antes de cargarlo. No se crea ninguna sala, avatar o llamada real. Se fuerza sólo el atributo DOM `disabled` de Join para alcanzar su handler sin descargar los recursos privados de Daily; no valida permisos de un micrófono físico ni voz real. Los rechazos HTTP son fixtures y no prueban el motivo del error de la cuenta del usuario.

```sh
node --test --test-isolation=none tests/demo-tavus-close-model.test.mjs tests/demo-tavus-session-model.test.mjs
JOIN_QA_SCENARIO=busy node tests/demo-tavus-join-browser.mjs
node tests/demo-tavus-join-browser.mjs
```

Para un bloqueo que continúe en producción, comprobar **Tavus → Conversations** y finalizar cualquier prueba activa de este agente; después volver a `/demo` y pulsar **Try again**. Si no hay llamadas activas, revisar los límites de concurrencia y uso del deployment y el error concreto que muestra la integración. El desarrollo local no puede liberar una conversación remota sin acceso a esa cuenta.
