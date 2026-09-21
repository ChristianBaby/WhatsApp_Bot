# Bot de WhatsApp para captación de clientes — Requerimientos

> Documento de especificación funcional y técnica. Sirve como punto de partida para desarrollar el proyecto (con esta misma sesión, con Claude Code, o con cualquier otro desarrollador/IA).
>
> Estado: **definido junto con Christian el 2026-09-16**, pendiente de implementación.

## 1. Objetivo

Automatizar el envío de campañas de WhatsApp (una "publicación": texto + imagen o video corto) a una lista de leads (empresas/negocios clientes), programando el envío, evitando que el número sea bloqueado por WhatsApp, y avisando cuando un lead responde. Es una herramienta de captación de clientes basada en una lista propia (no leads fríos comprados).

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Canal | WhatsApp, usando **Baileys** (librería no oficial, protocolo WhatsApp Web multi-dispositivo, sin necesidad de navegador headless) |
| ¿Por qué no la API oficial de Meta? | Es difícil de conseguir/aprobar y cobra por mensaje de marketing sin capa gratuita. Se deja como posible migración futura si el volumen crece o se prioriza cero riesgo. |
| Riesgo de baneo | Se acepta el riesgo (mitigado con buenas prácticas), a cambio de costo mínimo. El número que se usará **ya tiene historial de uso real** (no es nuevo), lo cual reduce el riesgo. |
| Volumen esperado | Entre 50 y 200 contactos por campaña |
| Personalización | Placeholders simples desde las columnas del CSV/Excel (ej. `{empresa}`, `{contacto}`). **No** se usará IA generativa para redactar o variar el texto en esta v1. |
| Multimedia | Imagen o video corto por publicación |
| Frecuencia | No es un envío recurrente automático por sí solo: el usuario arma "publicaciones" (campañas) y las deja en una **cola programada**, cada una con su propia fecha/hora de disparo |
| Alertas de respuesta | Cuando un lead responde: (a) notificación dentro del panel web, y (b) mensaje de WhatsApp al propio número del usuario |
| Catálogo de WhatsApp | No se automatiza (requeriría API oficial). El usuario lo sigue armando manualmente desde la app de WhatsApp Business. El bot **sí puede incluir el link al catálogo** dentro del mensaje, como un dato más de la plantilla. |
| Interfaz | Debe tener panel web propio (no solo scripts de terminal) |
| Base de datos | **PostgreSQL**, corriendo en un contenedor propio junto a la app (docker-compose), autocontenido y sin depender de otras bases de datos del usuario |
| Dónde corre en producción | VPS en **Contabo**, administrado con **Coolify** (despliegue como stack docker-compose: app + Postgres), 24/7 |
| Dónde se desarrolla | En la carpeta local del usuario: `Documents/Universoft_System/Whatsapp_bot` (conectada a esta sesión) |
| Mini-CRM automático | El sistema hace seguimiento del lead por etapas (ver sección 3.9), no solo envía y olvida. Detalle completo en 3.9. |
| Auto-respuestas con IA | El bot puede responder solo a quien escriba preguntando por un servicio, con control manual total del usuario en cualquier momento. Detalle completo en 3.10. No requiere n8n ni la API oficial de Meta. |
| Modelo de IA para clasificar respuestas | **Gemini 2.5 Flash-Lite**, usando la capa gratuita de Google (sin tarjeta, ~1500 solicitudes/día — muy por encima del volumen de respuestas esperado). Se usa **solo** para interpretar las respuestas entrantes de los leads y sugerir su clasificación; no se usa para redactar ni variar los mensajes salientes (eso sigue siendo con placeholders simples, ver fila "Personalización"). |
| Números de WhatsApp | El sistema soporta **varios números conectados a la vez**, no solo uno. Cada número se vincula con su propio QR, se etiqueta (ej. "Ventas 1"), y las campañas/conversaciones se pueden repartir entre ellos — ayuda a reducir el riesgo de baneo por número y a subir el volumen total. Detalle en 3.1 y 3.3. |
| Integraciones externas | El sistema expone: (a) un webhook para recibir leads nuevos automáticamente sin subir CSV, (b) notificaciones también por Telegram y/o correo además de WhatsApp/panel, y (c) una API de solo lectura para exportar reportes/datos hacia otras herramientas. Detalle en 3.11. |

## 3. Alcance funcional (features)

### 3.1 Conexión de WhatsApp
- Vincular **uno o más números** de WhatsApp, cada uno escaneando su propio código QR **dentro del panel web** (no solo en terminal).
- Lista de números conectados, cada uno con: etiqueta/nombre configurable (ej. "Ventas 1"), estado (conectado / desconectado / esperando QR) y fecha de conexión.
- Poder agregar un número nuevo, cerrar sesión de uno existente o volver a vincularlo, todo desde el panel, sin afectar a los demás números conectados.
- Si la sesión de un número se cae mientras está enviando una campaña, **detener el envío de ese número automáticamente** y marcarlo como pausado/fallido, en vez de perder mensajes silenciosamente — si hay otros números conectados, siguen funcionando con normalidad.

### 3.2 Gestión de leads (listas de contactos)
- Subir archivo **CSV o Excel (.xlsx)** con los datos de las empresas/negocios.
- Columna obligatoria: **teléfono** (con código de país). Columna obligatoria adicional: **empresa/negocio**. El resto de columnas (contacto, rubro, ciudad, etc.) son libres y quedan disponibles como variables para personalizar el mensaje.
- Al subir el archivo, **limpiar y validar automáticamente**:
  - Normalizar el teléfono (quitar espacios, guiones, símbolos).
  - Detectar filas con teléfono vacío/ inválido o sin nombre de empresa → excluirlas del envío.
  - Mostrar al usuario un resumen antes de confirmar la carga: cuántas filas válidas, cuántas inválidas y por qué (para que pueda corregir el archivo origen si quiere).
  - Detectar y avisar de posibles duplicados (mismo teléfono repetido).
- Guardar las listas subidas para poder reutilizarlas en distintas campañas sin volver a subir el archivo.

### 3.3 Publicaciones / Campañas
- Crear una "publicación" (campaña) con:
  - Nombre interno (para identificarla en el panel).
  - Lista de leads a usar (una de las ya subidas).
  - Texto del mensaje, con soporte de **variables** `{empresa}`, `{contacto}`, etc. según las columnas del CSV.
  - Posibilidad de definir **varias variantes** del mismo texto (se elige una al azar por contacto, para no mandar el mismo string exacto a todos).
  - Adjunto opcional: **imagen o video corto**.
  - Link opcional al catálogo de WhatsApp Business.
  - Fecha/hora de envío: inmediato o programado a futuro.
  - Configuración de ritmo de envío (ver sección 3.5), con valores por defecto configurables globalmente y overrides por campaña si se desea.
  - Si hay varios números conectados: elegir cuál envía la campaña, o repartir automáticamente la lista de leads entre varios números (para reducir el riesgo por número y acelerar el envío total).
- **Cola de campañas**: se pueden dejar varias publicaciones programadas con distintas fechas/horas; el sistema las procesa en orden, una a la vez (no en paralelo, porque solo hay una sesión de WhatsApp), respetando cada horario.
- Poder editar o cancelar una campaña que todavía no se ha disparado.
- Ver el progreso en vivo de la campaña que se está enviando (cuántos van, cuántos faltan).

### 3.4 Envío y manejo de casos especiales
- Antes de enviar a cada contacto, verificar si el número **está registrado en WhatsApp**:
  - Si no lo está: **no se envía nada a ese número** (obviamente no se le puede escribir), se salta al siguiente, y se registra en el reporte de la campaña como "no tiene WhatsApp" para que el usuario sepa por qué no llegó.
  - Si falla el envío por otro motivo (error de red, número bloqueado, etc.): se registra el motivo puntual y se continúa con el siguiente contacto, sin detener toda la campaña por un solo error.

### 3.5 Medidas anti-bloqueo (obligatorias, no opcionales)
- Pausas aleatorias entre mensajes (rango configurable, ej. 45–150 segundos).
- Envío por lotes con descansos más largos entre lotes (ej. cada 25 mensajes, pausa de 20 minutos).
- Respetar un horario "laboral" configurable (ej. solo enviar entre 9am y 7pm) — si la cola llega fuera de horario, espera a que abra la ventana.
- Límite máximo de mensajes por campaña/ejecución, configurable.
- Variar el texto (variantes de plantilla) para reducir contenido idéntico masivo.
- Simular "escribiendo…" antes de enviar cada mensaje.
- Modo de prueba: poder simular una campaña completa sin enviar nada real (**dry-run**), y poder enviar una prueba real a un solo número antes de lanzar la campaña completa.

### 3.6 Respuestas de leads
- Detectar cuando un contacto responde un mensaje entrante, en cualquiera de los números conectados.
- Guardar el historial completo de esa conversación (de quién, qué escribió, cuándo, y por qué número).
- Mostrar un indicador/lista de "no leídos" en el panel.
- Enviar un aviso al usuario cuando llega una respuesta nueva: por WhatsApp y, si se configuran, también por Telegram y/o correo (ver 3.11).
- **Chat integrado dentro del panel**: la conversación con el lead se responde directamente desde el detalle de la respuesta — burbujas de mensaje (lead / tú) y un campo de texto para escribir y enviar, sin salir del sistema. Usa la misma sesión de WhatsApp (Baileys) del número correspondiente a esa conversación.
- Botón secundario **"Abrir en WhatsApp"**: para cuando se prefiera responder desde la app o WhatsApp Web normal (por ejemplo, para mandar un audio, una ubicación, u otro contenido que el chat integrado todavía no soporte). Sigue siendo un enlace `https://wa.me/<telefono>` (o `whatsapp://send?phone=<telefono>`) que abre en una pestaña/app aparte.
- Al responder manualmente (ya sea desde el chat integrado o con el botón "Responder yo mismo"), la conversación pasa a modo manual (🙋), igual que en 3.10, para que el bot no se cruce con lo que estás escribiendo.

### 3.7 Reportes
- **Por campaña:** enviados, fallidos, sin WhatsApp y total; tasa de respuesta (% de contactos que contestó); desglose de motivos de fallo; comparación de rendimiento entre campañas; duración real del envío.
- **Del pipeline (mini-CRM, ver 3.9):** cantidad de leads por etapa (embudo Nuevo → Contactado → Respondió → Interesado / Duda de precio / No interesado → Venta concretada / Descartado); tasa de conversión general (de leads a ventas); desglose por rubro; tiempo promedio que un lead pasa en cada etapa.
- **Del auto-responder (ver 3.10):** conversaciones atendidas por el bot vs. escaladas a un asesor; qué palabras clave de escalamiento se usaron más.
- **Generales:** leads nuevos por semana/mes; evolución de ventas concretadas en el tiempo; leads descartados al subir un CSV/Excel, y por qué motivo.
- Log detallado descargable por campaña (contacto, estado, hora, motivo si falló).
- Todo filtrable por fecha, rubro, campaña o etapa, y exportable a Excel/CSV.
- Resumen final de cada campaña enviado al usuario al terminar (por WhatsApp, y opcionalmente por Telegram/correo si se configuran).
- Los mismos datos también se pueden consultar por API de solo lectura (ver 3.11), para integrarlos con otras herramientas (Excel, Power BI, etc.).

### 3.8 Configuración general
- Número propio del usuario (para recibir reportes y alertas).
- Valores por defecto de ritmo de envío y horario laboral.
- Link por defecto al catálogo de WhatsApp (opcional).
- API key de Gemini (para la clasificación automática de respuestas de 3.9 y el auto-responder de 3.10).
- Mensaje de bienvenida, base de conocimiento y palabras clave de escalamiento del auto-responder, más su interruptor general de activado/desactivado (ver 3.10).
- Etiqueta/nombre de cada número de WhatsApp conectado (ver 3.1).
- Datos de Telegram (token del bot y chat id) y/o correo (SMTP) para notificaciones alternas, si se activan (ver 3.11).
- Token del webhook de leads y API key de la API de reportes, con opción de regenerarlos (ver 3.11).

### 3.9 Mini-CRM automático de leads

Cada lead pasa por etapas de seguimiento, combinando automatismo total donde es seguro y confirmación manual donde importa no equivocarse (ej. registrar una venta).

**Etapas automáticas (sin intervención):**
- `Nuevo` — al cargarse en una lista de leads.
- `Contactado` — automático en el momento en que se le envía un mensaje de campaña.
- `Respondió` — automático en cuanto llega su respuesta.
- `En conversación` — automático si hay varios intercambios de mensajes con ese lead.

**Etapas sugeridas por IA, confirmadas por el usuario con un clic:**
- `Interesado` / `No interesado` / `Duda de precio` (u otras etiquetas similares) — al llegar una respuesta, se envía su texto a la IA (Gemini 2.5 Flash-Lite) para que sugiera la clasificación. El usuario la confirma o corrige desde el panel; no se aplica sola sin que el usuario la vea.

**Etapa exclusivamente manual:**
- `Venta concretada` (o `Descartado`) — el usuario es quien marca esto con un clic desde el panel. Nunca se marca solo, ni siquiera si la IA detecta señales de cierre (puede sugerirlo, pero no confirmarlo).

**Clasificación por rubro:**
- Se toma directo de la columna de rubro del CSV/Excel del lead (no se intenta adivinar con IA). Sirve para ver/filtrar a los leads agrupados por tipo de negocio.

**Notificaciones ligadas al pipeline** (además de la alerta general de "nueva respuesta" de la sección 3.6):
- Alerta diferenciada/prioritaria cuando la IA sugiere `Interesado` o detecta señales de cierre — para actuar mientras el lead está "caliente".
- Aviso de leads "enfriándose": contactados hace más de X días (configurable) sin respuesta, como recordatorio de seguimiento.
- Resumen periódico (diario o semanal) del pipeline: nuevos, interesados, cerca de cerrar, ventas concretadas en el periodo.
- Estas alertas pueden llegar también por Telegram o correo, no solo por WhatsApp/panel, si se configuran (ver 3.11).

### 3.10 Respuestas automáticas (auto-responder con IA)

No requiere n8n ni la API oficial de WhatsApp Business: se construye directo sobre la misma sesión de Baileys que ya está escuchando los mensajes entrantes para la sección 3.6.

- Responde automáticamente a **cualquiera** que escriba (leads ya cargados o números nuevos/desconocidos que preguntan por un servicio por primera vez).
- Primer mensaje de una conversación → el bot envía un **mensaje de bienvenida** configurable.
- Las preguntas se responden usando una **base de conocimiento en texto libre** que el usuario escribe en el panel (info de servicios, horarios, etc.), para que el bot no invente datos.
- **Escalamiento a asesor humano** cuando: (a) el lead usa una palabra clave configurable (ej. "asesor", "hablar con alguien", "persona real", "humano"), o (b) la IA detecta que no puede responder esa consulta con confianza.
- **Control manual total, en cualquier momento, no solo al escalar:** en cada conversación el usuario puede tomar el control con un botón "Responder yo mismo" cuando quiera — sin que el bot haya escalado ni haya ningún motivo especial, simplemente porque decide atenderla personalmente — y devolverla al bot con "Reactivar bot" cuando quiera. El escalamiento automático (palabra clave / criterio de IA) es solo una de las formas de pasar a modo manual; la otra es que el usuario lo decida directamente.
- Cada conversación muestra siempre en qué modo está: 🤖 Bot activo / 🙋 Atendida por el usuario — nunca debe haber duda de quién está respondiendo en ese momento, para evitar que el bot y el usuario se pisen.
- **Interruptor general:** activar/desactivar todo el auto-responder desde Configuración, sin tocar conversación por conversación.
- Reutiliza la misma API key de Gemini ya definida en 3.9 (no se agrega un modelo ni costo nuevo).
- Al ser tráfico reactivo (responde a quien escribió primero), es el escenario de **menor riesgo de bloqueo** de todo el sistema — aun así conviene una pequeña pausa antes de responder para no sentirse 100% instantáneo/robótico.
- Si hay varios números conectados (ver 3.1), el auto-responder funciona de forma independiente en cada uno, usando por defecto la misma base de conocimiento y configuración — no hace falta repetir la configuración por número, salvo que se quiera desactivar en uno en particular.

### 3.11 Integraciones externas

**Webhook para recibir leads automáticamente**
- El sistema expone una URL propia (con un token secreto) que recibe un lead nuevo por `POST` (JSON) desde un formulario web, Zapier, Make u otra herramienta — sin necesidad de exportar/subir un CSV a mano.
- Los leads que llegan por webhook entran al mismo mini-CRM, en la etapa `Nuevo`, igual que si se hubieran subido por archivo.
- El token se puede regenerar desde el panel para invalidar el anterior si se comparte por error.

**Notificaciones por Telegram y/o correo**
- Además del aviso por WhatsApp y dentro del panel, se puede activar el envío de las mismas alertas (nueva respuesta, lead "caliente", resumen del pipeline, campaña terminada) por Telegram (bot propio) y/o correo electrónico.
- Sirve especialmente como respaldo: si la sesión de WhatsApp se cae, el aviso por WhatsApp no llegaría, pero por Telegram/correo sí.
- Se configuran una sola vez en 3.8 y luego se elige qué canales usar para cada tipo de alerta.

**API para exportar reportes y datos**
- Endpoint(s) autenticados con API key, de **solo lectura**, para consultar en JSON los datos de campañas, leads, respuestas y reportes (ver 3.7) — pensado para conectar el sistema con Excel, Power BI u otra herramienta propia.
- No permite crear ni editar leads o campañas desde esta API (eso solo se hace por el webhook de leads o desde el panel).

## 4. Fuera de alcance (v1)

- Administrar/crear el catálogo de WhatsApp Business por código (solo se referencia su link).
- Generación de texto por IA (queda como posible v2).
- Multi-usuario / roles / permisos (se asume un solo usuario administrador).
- Migración a la API oficial de Meta (documentar como posible evolución futura, no construir ahora).

## 5. Propuesta técnica (borrador, ajustable en la implementación)

- **Backend:** Node.js + Express.
- **WhatsApp:** `@whiskeysockets/baileys`, con un **gestor de sesiones múltiples** (una instancia por número conectado, cada una con su propia carpeta/volumen de `auth_session`, reconexión y estado independientes).
- **IA de clasificación:** API de Gemini (`gemini-2.5-flash-lite`), llamada solo cuando llega una respuesta de un lead — nunca en los envíos masivos.
- **Base de datos:** PostgreSQL, en contenedor propio (docker-compose), con tablas aproximadas: `whatsapp_numbers` (número, etiqueta, estado), `leads_lists`, `leads` (incluye `rubro`, `etapa_pipeline`), `campaigns` (referencia el/los `numero_id` que la envían), `campaign_recipients`, `replies`/conversaciones (referencia `numero_id`, incluye clasificación sugerida por IA y la confirmada por el usuario, y el modo bot/manual), `settings`.
- **Frontend:** panel propio servido por el mismo backend (HTML/JS simple o un framework liviano), con actualizaciones en vivo (ej. Server-Sent Events) para: estado de conexión/QR de cada número, progreso de envío, nuevas respuestas, sugerencias de clasificación y mensajes del chat integrado (3.6).
- **Subida de archivos:** CSV vía `csv-parse`, Excel vía librería tipo `xlsx`/`exceljs`; imágenes/video guardados en disco (volumen persistente) y referenciados desde la campaña.
- **Cola de campañas:** un worker interno que revisa periódicamente si hay una campaña programada lista para correr y procesa una a la vez (repartiendo entre números si la campaña así lo indica).
- **Integraciones (3.11):** endpoint público `POST /webhooks/leads/:token` para el webhook entrante de leads; endpoint(s) `GET /api/reportes/...` protegidos con API key para la API de salida de solo lectura; cliente de Telegram (Bot API) y envío de correo (ej. `nodemailer`) para las notificaciones alternas.
- **Despliegue:** `docker-compose` con dos servicios (app + postgres) + volúmenes persistentes para: sesiones de WhatsApp (una por número, `auth_session/<numero_id>`), base de datos, y archivos multimedia subidos. Se despliega como stack de tipo Docker Compose en **Coolify**, sobre el VPS de **Contabo** del usuario.

## 6. Riesgos y advertencias a tener presentes

- Usar Baileys (no oficial) **incumple los Términos de Servicio de WhatsApp**. El riesgo de bloqueo del número existe siempre, aunque se reduzca con las medidas de la sección 3.5. Si el número se banea, **no hay proceso de apelación** y se pierde.
- Recomendado: probar primero con volúmenes bajos y con el modo de prueba/dry-run antes de lanzar campañas completas.
- Si el negocio crece o se depende críticamente de esto, evaluar migrar a la API oficial de WhatsApp Business (Meta Cloud API), que sí tiene soporte y estabilidad garantizada, a cambio de costo por mensaje.
- Con varios números conectados (3.1), cada uno mantiene su propio riesgo de baneo de forma independiente: da resiliencia (si uno se cae, los demás siguen funcionando), pero un número nuevo igual debe "calentarse" gradualmente, no usarse a full volumen desde el día uno.
- Al exponer un webhook y una API hacia afuera (3.11), es importante proteger bien los tokens/API keys (no compartirlos, poder regenerarlos si se filtran). Esto hace todavía más recomendable el login con usuario/contraseña para el panel que ya se sugiere como mejora en 8.5, ahora que hay endpoints públicos además del panel mismo.

## 7. Siguiente paso

Implementar el proyecto siguiendo esta especificación: estructura de carpetas, esquema de base de datos, backend (gestor de sesiones múltiples de WhatsApp, subida/limpieza de leads, motor de envío con anti-baneo, cola de campañas, detección de respuestas y chat integrado, endpoints de webhook/API de reportes, notificaciones por Telegram/correo), frontend del panel, y `docker-compose` para desplegar en el VPS (como recurso de tipo Docker Compose en Coolify).

## 8. Mejoras propuestas para un sistema completo (roadmap — no bloqueantes para v1)

Ideas para evolucionar esto de "enviador de campañas" a una herramienta real de captación y seguimiento de clientes. No forman parte del alcance mínimo (sección 3); son candidatas a priorizar después.

### 8.1 Mini-CRM de leads (extras más allá de la sección 3.9)
- Vista tipo pipeline/kanban del mini-CRM (la sección 3.9 define las etapas; el kanban visual es un "nice to have" de interfaz, no imprescindible para que funcione).
- Historial de todas las campañas enviadas a cada lead, para no volver a mandarle la misma publicación sin querer.
- Deduplicación automática entre distintas listas subidas (mismo teléfono repetido en dos archivos distintos).
- Filtrar/segmentar leads por rubro (u otra columna) al momento de armar una campaña nueva, en vez de apuntar siempre a la lista completa.

### 8.2 Campañas
- Guardar plantillas de mensaje reutilizables (texto + imagen) para no rehacerlas cada vez.
- Vista previa tipo "burbuja de chat de WhatsApp" del mensaje antes de programar.
- Duplicar una campaña anterior como punto de partida de una nueva.
- Reintento automático configurable solo para fallos de red/temporales (nunca para "sin WhatsApp", que es definitivo).

### 8.3 Anti-baneo y salud de la cuenta
- Panel de "salud del número" (por cada número conectado): mensajes enviados hoy/esta semana vs. tus propios límites configurados.
- Pausa automática y alerta si hay una racha inusual de errores seguidos (posible señal de restricción del número).

### 8.4 Reportes y aprendizaje
- Comparar variantes de texto entre sí (cuál generó más respuestas) — una especie de A/B testing simple.

### 8.5 Seguridad y operación (importante antes de exponerlo en Contabo con dominio público)
- Login con usuario/contraseña para entrar al panel — sin esto, cualquiera con el link podría ver tus leads y disparar campañas.
- Backups automáticos de la base Postgres (Coolify permite programarlos).
- Registro simple de auditoría: qué campaña se programó, cuándo y con qué configuración.

### 8.6 A más largo plazo
- Evaluar migración a la API oficial de WhatsApp Business (Meta Cloud API) si el volumen crece o se prioriza cero riesgo de baneo.
