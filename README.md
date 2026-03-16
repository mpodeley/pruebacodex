# pruebacodex

Proyecto base para probar integracion entre Codex, GitHub y una futura visualizacion
de la red de transporte y procesamiento de gas natural en Argentina.

## Estado actual

- Demo estatica simple en `index.html`
- Script para descargar capas publicas de ENARGAS en `scripts/fetch-enargas.mjs`
- Datos generados en `data/raw` y `data/processed`

## Uso

Abri `index.html` en el navegador para ver la demo inicial.

Para actualizar los datos de ENARGAS:

```bash
npm run fetch:enargas
```
