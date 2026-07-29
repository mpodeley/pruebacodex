import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT_DIR = "data/yolo";

async function fetchCammesaYolo() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  const today = new Date().toISOString().split('T')[0];
  console.log(`[YOLO] Fetching CAMMESA Live Data for ${today}...`);

  const endpoints = [
    { name: 'inyeccion_cuenca', id: 'INYECCION_GAS_ORIGEN' },
    { name: 'consumo_gas', id: 'CONSUMO_GAS_PD' },
    { name: 'combustibles_liquidos', id: 'CONSUMO_COMB_LIQUIDOS_PD' }
  ];

  const results = {};

  for (const ep of endpoints) {
    try {
      console.log(`  Fetching ${ep.name}...`);
      const url = `https://api.cammesa.com/pub-svc/public/v1/publication/${ep.id}?fechaDesde=${today}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      results[ep.name] = data;
      
      await writeFile(
        join(OUTPUT_DIR, `${ep.name}_${today}.json`),
        JSON.stringify(data, null, 2)
      );
    } catch (err) {
      console.error(`  Failed to fetch ${ep.name}: ${err.message}`);
    }
  }

  // Analysis of Restrictions (Flow vs Demand)
  console.log("\n[RESTRICTION ANALYSIS]");
  if (results.consumo_gas && results.combustibles_liquidos) {
    const plantsWithGas = results.consumo_gas.length;
    const plantsWithLiquid = results.combustibles_liquidos.length;
    
    console.log(`  Plants with Gas Confirmation: ${plantsWithGas}`);
    console.log(`  Plants burning Liquids (Restriction Proxy): ${plantsWithLiquid}`);
    
    if (plantsWithLiquid > 0) {
      console.warn("  ALERT: Fuel Switching detected. Network is STRESSED.");
    } else {
      console.log("  STATUS: Network is STABLE.");
    }
  }

  console.log(`\nData saved to ${OUTPUT_DIR}/`);
}

fetchCammesaYolo();
