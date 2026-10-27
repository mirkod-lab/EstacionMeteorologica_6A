const path = require('node:path');
const express = require('express');
const config = require('./src/config');
const database = require('./src/database');
const SerialService = require('./src/serial-service');
const apiRoutes = require('./src/routes');

async function start() {
  await database.pool.query('SELECT 1');
  const app = express();
  const serialService = new SerialService();
  app.locals.serialService = serialService;
  app.use(express.json());
  app.use('/vendor/chart.js', express.static(
    path.join(__dirname, 'node_modules', 'chart.js', 'dist')
  ));
  app.use('/api', apiRoutes);
  app.use(express.static(path.join(__dirname, 'public')));

  app.use((error, req, res, next) => {
    console.error(`[api] ${error.message}`);
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'Error interno del servidor.'
    });
  });

  serialService.on('measurement', async (measurement) => {
    try {
      const inserted = await database.insertMeasurement(measurement);
      if (inserted) {
        console.info(`[db] Medición guardada: ${measurement.fecha_hora}`);
      } else {
        console.info(`[db] Lectura duplicada omitida: ${measurement.fecha_hora}`);
      }
    } catch (error) {
      console.error(`[db] No se pudo guardar la medición: ${error.message}`);
    }
  });

  const server = app.listen(config.port, () => {
    console.info(`Monitoreo ambiental disponible en http://localhost:${config.port}`);
    serialService.start();
  });

  const shutdown = () => {
    serialService.stop();
    server.close(async () => {
      await database.pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(async (error) => {
  console.error(`[inicio] No se pudo iniciar el sistema: ${error.message}`);
  await database.pool.end();
  process.exitCode = 1;
});
