-- Initial schema for Gas Oracle DB
-- Run with: ./duckdb db/gas_oracle.db < scripts/db_init.sql

DROP TABLE IF EXISTS red_gasoductos;
DROP TABLE IF EXISTS plantas_compresoras;
DROP TABLE IF EXISTS produccion_historica;
DROP TABLE IF EXISTS consumo_cammesa;

CREATE TABLE red_gasoductos AS SELECT * FROM read_csv_auto('data/raw/enargas/red_gasoductos.csv', delim=',');
CREATE TABLE plantas_compresoras AS SELECT * FROM read_csv_auto('data/raw/enargas/plantas_compresoras.csv', delim=',');
CREATE TABLE produccion_historica AS SELECT * FROM read_csv_auto('data/raw/enargas/produccion_historica.csv', delim=',');
CREATE TABLE consumo_cammesa AS SELECT * FROM read_csv_auto('data/raw/cammesa/consumo_cammesa.csv', delim=';');

-- Verificamos la carga
.print 'Table sizes:'
SELECT 'red_gasoductos' as table_name, count(*) as row_count FROM red_gasoductos
UNION ALL
SELECT 'plantas_compresoras' as table_name, count(*) as row_count FROM plantas_compresoras
UNION ALL
SELECT 'produccion' as table_name, count(*) as row_count FROM produccion_historica
UNION ALL
SELECT 'cammesa' as table_name, count(*) as row_count FROM consumo_cammesa;
