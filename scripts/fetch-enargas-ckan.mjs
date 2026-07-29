import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CKAN_API = "https://transparencia.enargas.gob.ar/api/3/action/";
const OUTPUT_DIR = "data/raw/enargas";

async function fetchCkan(action, params = {}) {
  const url = new URL(CKAN_API + action);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CKAN HTTP ${response.status}`);
  return response.json();
}

async function discoverAndDownload() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  // Datasets de interés: Linepack, Flujos, Capacidades
  const queries = ["linepack", "flujos", "transporte"];
  
  console.log(`[INGEST] Discovering datasets from ENARGAS CKAN...`);

  for (const q of queries) {
    try {
      const search = await fetchCkan("package_search", { q, rows: 1 });
      const pkg = search.result.results[0];
      
      if (!pkg) {
        console.warn(`  No dataset found for query: ${q}`);
        continue;
      }

      console.log(`  Found dataset: ${pkg.title}`);

      // Buscamos el recurso CSV o JSON (preferimos CSV para DuckDB)
      const resource = pkg.resources.find(r => r.format.toLowerCase() === 'csv') 
                    || pkg.resources[0];

      if (resource) {
        console.log(`  Downloading ${q} from ${resource.url}...`);
        const dataRes = await fetch(resource.url);
        if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);
        
        const content = await dataRes.text();
        const fileName = `${q}_latest.${resource.format.toLowerCase()}`;
        await writeFile(join(OUTPUT_DIR, fileName), content);
        console.log(`  Saved as ${fileName}`);
      }
    } catch (err) {
      console.error(`  Error processing ${q}: ${err.message}`);
    }
  }
}

discoverAndDownload();
