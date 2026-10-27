const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: ['DATE', 'DATETIME']
});

async function insertMeasurement(measurement) {
  const [result] = await pool.execute(
    `INSERT INTO mediciones
      (fecha_hora, temperatura_bmp, presion_atmosferica, temperatura_dht,
       humedad_aire, humedad_suelo_raw, humedad_suelo_porcentaje, lectura_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      measurement.fecha_hora,
      measurement.temperatura_bmp,
      measurement.presion_atmosferica,
      measurement.temperatura_dht,
      measurement.humedad_aire,
      measurement.humedad_suelo_raw,
      measurement.humedad_suelo_porcentaje,
      measurement.lectura_hash
    ]
  );
  return result.affectedRows === 1;
}

async function getLatestMeasurement() {
  const [rows] = await pool.execute(
    'SELECT * FROM mediciones ORDER BY fecha_hora DESC, id DESC LIMIT 1'
  );
  return rows[0] || null;
}

function buildDateFilter(from, to) {
  const conditions = [];
  const values = [];
  if (from) {
    conditions.push('fecha_hora >= ?');
    values.push(from);
  }
  if (to) {
    conditions.push('fecha_hora <= ?');
    values.push(to);
  }
  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

async function getMeasurementPage({ from, to, page, pageSize }) {
  const filter = buildDateFilter(from, to);
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM mediciones ${filter.sql}`,
    filter.values
  );
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.execute(
    `SELECT * FROM mediciones ${filter.sql}
     ORDER BY fecha_hora DESC, id DESC LIMIT ? OFFSET ?`,
    [...filter.values, pageSize, offset]
  );
  return { rows, total: Number(countRows[0].total) };
}

async function getChartMeasurements({ from, to, limit, variable }) {
  const filter = buildDateFilter(from, to);
  const columns = variable
    ? `fecha_hora, ${variable} AS valor`
    : `fecha_hora, temperatura_bmp, presion_atmosferica, temperatura_dht,
       humedad_aire, humedad_suelo_raw, humedad_suelo_porcentaje`;
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM mediciones ${filter.sql}
     ORDER BY fecha_hora DESC, id DESC LIMIT ?`,
    [...filter.values, limit]
  );
  return rows.reverse();
}

module.exports = {
  pool,
  insertMeasurement,
  getLatestMeasurement,
  getMeasurementPage,
  getChartMeasurements
};
