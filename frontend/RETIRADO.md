# Panel Vite retirado

Este panel (React + Vite, publicado antes en botscrapt.universoftsystems.com) **ya no se compila
ni se despliega**. Se conserva solo como referencia histórica.

- El mismo panel, con sus mismas pantallas y rutas, vive ahora en `frontend_universoft`
  (`src/panel/`, pasado a Next) y se publica en `https://app.universoftsystems.com`.
- El `Dockerfile` de este repo ya no tiene la etapa del panel. El backend redirige (301) cualquier
  ruta fuera de `/api` y `/webhooks` a la misma ruta en `PANEL_URL`
  (`https://app.universoftsystems.com`), así que los enlaces viejos de botscrapt siguen funcionando.

No hagas cambios aquí: cualquier ajuste de la interfaz va en `frontend_universoft/src/panel/`.
