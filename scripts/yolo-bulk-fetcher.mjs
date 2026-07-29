import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

const OUTPUT_ROOT = "data/raw";
const SOURCES = [
  {
    name: "red_gasoductos",
    url: "http://datos.energia.gob.ar/dataset/8758101a-1e0d-413f-8cc5-83e21ece6391/resource/e3459bc5-4aaa-4065-9b06-c169fbd0ec74/download/gasoductos-de-transporte-enargas-.csv",
    subDir: "enargas"
  },
  {
    name: "plantas_compresoras",
    url: "http://datos.energia.gob.ar/dataset/8758101a-1e0d-413f-8cc5-83e21ece6391/resource/7b0c0bc3-4bc5-4aac-8004-348619a39c26/download/plantas-compresoras-de-transporte-de-gas-enargas-.csv",
    subDir: "enargas"
  },
  {
    name: "produccion_historica",
    url: "http://datos.energia.gob.ar/dataset/5210866d-2caf-43fd-95d8-085dc18f39cc/resource/0622e111-dbfd-45e9-bf94-bdce83b978c0/download/producciongasnaturaldesde-1950.csv",
    subDir: "enargas"
  },
  {
    name: "consumo_cammesa",
    url: "http://datos.energia.gob.ar/dataset/2b4dfee6-6fca-4e4d-9611-a12d65cd4aa8/resource/0bcec125-0673-41c0-8f76-9e9ddc5c8248/download/combustibles.csv",
    subDir: "cammesa"
  }
];

async function runBulkFetch() {
  console.log("[YOLO] Starting Bulk Fetch from VERIFIED sources...");
  
  for (const src of SOURCES) {
    try {
      const dir = join(OUTPUT_ROOT, src.subDir);
      await mkdir(dir, { recursive: true });
      const targetPath = join(dir, `${src.name}.csv`);
      
      console.log(`  Downloading ${src.name}...`);
      // Use curl with follow redirects and silent
      execSync(`curl -L -o "${targetPath}" "${src.url}" --silent`);
      
      // Verification: Check if it's really a CSV (not HTML)
      const firstChars = execSync(`head -c 10 "${targetPath}"`).toString();
      if (firstChars.includes("<!DOCTYPE") || firstChars.includes("<html")) {
        console.error(`  ERROR: ${src.name} is HTML, not CSV. URL might be dynamic.`);
      } else {
        console.log(`  Successfully saved ${src.name} to ${targetPath}`);
      }
    } catch (err) {
      console.error(`  Failed to fetch ${src.name}: ${err.message}`);
    }
  }
}

runBulkFetch();
