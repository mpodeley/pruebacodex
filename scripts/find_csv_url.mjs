import { writeFile } from "node:fs/promises";

async function findCsvUrl() {
  const query = "despacho-diario-enargas";
  const url = `https://datos.gob.ar/api/3/action/package_search?q=${query}`;
  console.log(`Searching for dataset: ${query}...`);
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    const pkg = data.result.results[0];
    
    if (!pkg) throw new Error("Dataset not found.");
    
    console.log(`Dataset found: ${pkg.title}`);
    const csvResource = pkg.resources.find(r => r.format.toLowerCase() === 'csv');
    
    if (csvResource) {
      console.log(`SUCCESS! Direct CSV URL: ${csvResource.url}`);
    } else {
      console.log("No CSV resource found.");
    }
  } catch (err) {
    console.error(err.message);
  }
}

findCsvUrl();
