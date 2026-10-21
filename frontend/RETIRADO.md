# Panel Vite retirado

Fecha: 21/10/2026.

Este panel (React + Vite, publicado en botscrapt.universoftsystems.com) **ya no se compila ni
se despliega**. Se conserva solo como referencia histórica.

- La interfaz vive ahora en `frontend_universoft`, como el módulo **WhatsApp CRM**:
  `https://app.universoftsystems.com/dashboard/admin/whatsapp`
  (código en `frontend_universoft/src/features/whatsapp-crm/`).
- La migración está documentada en `frontend_universoft/docs/WHATSAPP_CRM_MIGRACION.md`.
- El `Dockerfile` de este repo ya no tiene la etapa del panel. El backend redirige (301) cualquier
  ruta fuera de `/api` y `/webhooks` a `PANEL_URL`, con la sección equivalente
  (`/respuestas` → `/chats`, `/leads` → `/leads`, etc.). Por eso botscrapt sigue funcionando como
  redirección.

No hagas cambios aquí: cualquier ajuste de la interfaz va en `frontend_universoft`.
