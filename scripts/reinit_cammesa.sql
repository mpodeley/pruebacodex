-- Re-init schema for CAMMESA tables
-- Run with: ./duckdb db/gas_oracle.db < scripts/reinit_cammesa.sql

DROP TABLE IF EXISTS consumo_cammesa;

CREATE TABLE consumo_cammesa AS SELECT * FROM read_csv_auto('data/raw/cammesa/consumo_cammesa.csv', delim=',', header=TRUE);

-- Inspeccionamos para confirmar
PRAGMA table_info('consumo_cammesa');
SELECT combustible, sum(consumo) as total FROM consumo_cammesa GROUP BY combustible;
