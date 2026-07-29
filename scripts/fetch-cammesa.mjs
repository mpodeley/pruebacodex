import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT_DIR = "data/cammesa";

async function fetchCammesaGas() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  // CAMMESA provides daily summaries of fuel consumption.
  // This is a known endpoint for the Daily Report (Programación Diaria).
  // Note: In a real "YOLO" scenario, we'd find the latest date. 
  // For now, we'll try to fetch the most recent data.
  
  const today = new Date().toISOString().split('T')[0];
  console.log(`Fetching CAMMESA data for ${today}...`);

  // Target: Informe de Consumos de Combustibles (Gas/Fueloil/Gasoil)
  // This is often a CSV or XLS. CAMMESA also has a JSON API for their dashboard.
  
  try {
    // API for the "Combustibles" dashboard (Public)
    const url = "https://api.cammesa.com/pub-svc/publico/Combustibles?fechaDesde=" + today;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CAMMESA: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    await writeFile(
      join(OUTPUT_DIR, `consumo_${today}.json`),
      JSON.stringify(data, null, 2)
    );
    
    console.log(`Successfully saved CAMMESA data to ${OUTPUT_DIR}/consumo_${today}.json`);
    
    // Summary of restrictions
    const restrictions = data.filter(d => d.consumoGasoil > 0 || d.consumoFueloil > 0);
    console.log(`Found ${restrictions.length} plants burning liquid fuels (likely gas restriction).`);
    
  } catch (error) {
    console.error("Error fetching CAMMESA data:", error.message);
  }
}

fetchCammesaGas();
