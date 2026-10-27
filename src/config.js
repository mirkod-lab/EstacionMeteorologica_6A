require('dotenv').config();

function positiveInteger(value, name, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return parsed;
}

const serialMode = (process.env.SERIAL_MODE || 'simulation').toLowerCase();
if (!['simulation', 'hardware'].includes(serialMode)) {
  throw new Error('SERIAL_MODE debe ser "simulation" o "hardware".');
}

module.exports = {
  port: positiveInteger(process.env.PORT, 'PORT', 3000),
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: positiveInteger(process.env.DB_PORT, 'DB_PORT', 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'monitoreo_ambiental'
  },
  serial: {
    mode: serialMode,
    port: process.env.SERIAL_PORT || 'COM3',
    baudRate: positiveInteger(process.env.SERIAL_BAUD_RATE, 'SERIAL_BAUD_RATE', 9600),
    simulationIntervalMs: positiveInteger(
      process.env.SIMULATION_INTERVAL_MS,
      'SIMULATION_INTERVAL_MS',
      3000
    )
  }
};
