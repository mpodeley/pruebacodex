import { execSync } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";

const DB_PATH = "db/gas_oracle.db";
const GRAPH_PATH = "src/data/network-graph.json";

async function enrichGraph() {
  console.log("[STRESS] Querying CAMMESA for fuel-switching events...");
  
  // Query para obtener consumos de líquidos por central
  const query = `
    SELECT 
      central, 
      SUM(consumo_gasoil_m3) as gasoil, 
      SUM(consumo_fueloil_tn) as fueloil
    FROM consumo_cammesa
    WHERE consumo_gasoil_m3 > 0 OR consumo_fueloil_tn > 0
    GROUP BY central;
  `;
  
  const result = execSync(`./duckdb ${DB_PATH} -json -c "${query}"`).toString();
  const stressData = JSON.parse(result);
  
  console.log(`[STRESS] Found ${stressData.length} plants with fuel switching events.`);
  
  const graph = JSON.parse(await readFile(GRAPH_PATH, 'utf-8'));
  
  // Mapeamos los nodos por nombre (central)
  stressData.forEach(s => {
    // Buscamos un nodo que "contenga" el nombre de la central (fuzzy match simple)
    const node = graph.nodes.find(n => n.id.includes(s.central) || s.central.includes(n.id));
    if (node) {
      node.stress_gasoil = s.gasoil;
      node.stress_fueloil = s.fueloil;
      node.type = 'power_plant_stressed';
    }
  });

  await writeFile(GRAPH_PATH, JSON.stringify(graph, null, 2));
  console.log(`[STRESS] Graph enriched with real-time fuel switching data.`);
}

enrichGraph();
