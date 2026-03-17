# pruebacodex

Proyecto base para probar integracion entre Codex, GitHub y una futura visualizacion
de la red de transporte y procesamiento de gas natural en Argentina.

## Estado actual

- App web React + Vite publicada desde `index.html`
- Script para descargar capas publicas de ENARGAS en `scripts/fetch-enargas.mjs`
- Script para extraer flujos y capacidad desde Power BI en `scripts/fetch-enargas-flows.mjs`
- Datos generados en `data/raw` y `data/processed`

## Uso

Instalar dependencias:

```bash
npm install
```

Levantar la app local:

```bash
npm run dev
```

Generar build para GitHub Pages:

```bash
npm run build
```

Para actualizar los datos de ENARGAS:

```bash
npm run fetch:enargas
```

Para actualizar el snapshot de flujos y capacidad:

```bash
npm run fetch:flows
```
