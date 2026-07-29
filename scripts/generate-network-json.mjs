import { execSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DB_PATH = "db/gas_oracle.db";
const OUTPUT_PATH = "src/data/network-graph.json";

async function generateGraph() {
  await mkdir("src/data", { recursive: true });
  
  console.log("[GRAPH] Querying DuckDB for network structure...");
  
  // Obtenemos los tramos y las plantas
  const query = `
    SELECT nombre_de_tramo, empresa_licenciataria, tipo_de_tramo 
    FROM red_gasoductos 
    WHERE nombre_de_tramo IS NOT NULL;
  `;
  
  const result = execSync(`./duckdb ${DB_PATH} -json -c "${query}"`).toString();
  const rawData = JSON.parse(result);
  
  const nodes = new Map();
  const links = [];
  
  console.log(`[GRAPH] Parsing ${rawData.length} pipeline segments...`);
  
  rawData.forEach(row => {
    // Intentamos extraer Origen y Destino del nombre del tramo
    // Formatos comunes: "Nodo A - Nodo B", "Nodo A / Nodo B", "Nodo A a Nodo B"
    const parts = row.nombre_de_tramo.split(/ - | \/ | a /i);
    
    if (parts.length >= 2) {
      const source = parts[0].trim();
      const target = parts[1].trim();
      
      // Registrar nodos
      if (!nodes.has(source)) nodes.set(source, { id: source, type: 'city_gate', label: source });
      if (!nodes.has(target)) nodes.set(target, { id: target, type: 'city_gate', label: target });
      
      // Crear link
      links.push({
        source,
        target,
        label: row.nombre_de_tramo,
        operator: row.empresa_licenciataria,
        type: row.tipo_de_tramo
      });
    }
  });

  // Marcamos las Plantas Compresoras
  const pcQuery = "SELECT nombre FROM plantas_compresoras;";
  const pcResult = JSON.parse(execSync(`./duckdb ${DB_PATH} -json -c "${pcQuery}"`).toString());
  
  pcResult.forEach(pc => {
    if (nodes.has(pc.nombre)) {
      nodes.get(pc.nombre).type = 'compressor';
    } else {
      nodes.set(pc.nombre, { id: pc.nombre, type: 'compressor', label: pc.nombre });
    }
  });

  const graphData = {
    nodes: Array.from(nodes.values()),
    links: links
  };
  
  await writeFile(OUTPUT_PATH, JSON.stringify(graphData, null, 2));
  console.log(`[GRAPH] SUCCESS! Graph JSON saved with ${graphData.nodes.length} nodes and ${graphData.links.length} links.`);
}

generateGraph();
