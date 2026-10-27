CREATE DATABASE IF NOT EXISTS monitoreo_ambiental
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE monitoreo_ambiental;

CREATE TABLE IF NOT EXISTS mediciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha_hora DATETIME NOT NULL,
  temperatura_bmp DECIMAL(7, 2) NOT NULL,
  presion_atmosferica DECIMAL(8, 2) NOT NULL,
  temperatura_dht DECIMAL(7, 2) NOT NULL,
  humedad_aire DECIMAL(5, 2) NOT NULL,
  humedad_suelo_raw SMALLINT UNSIGNED NOT NULL,
  humedad_suelo_porcentaje DECIMAL(5, 2) NOT NULL,
  lectura_hash CHAR(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mediciones_lectura_hash (lectura_hash),
  KEY idx_mediciones_fecha_hora (fecha_hora),
  CONSTRAINT chk_mediciones_humedad_aire
    CHECK (humedad_aire BETWEEN 0 AND 100),
  CONSTRAINT chk_mediciones_humedad_suelo_raw
    CHECK (humedad_suelo_raw BETWEEN 0 AND 1023),
  CONSTRAINT chk_mediciones_humedad_suelo_porcentaje
    CHECK (humedad_suelo_porcentaje BETWEEN 0 AND 100)
) ENGINE=InnoDB;
