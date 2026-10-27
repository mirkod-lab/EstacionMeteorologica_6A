const express = require('express');
const {
  getLatestMeasurement,
  getMeasurementPage,
  getChartMeasurements
} = require('./database');

const router = express.Router();

function parseDateParameter(value, name) {
  if (value === undefined) return null;
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) {
    const error = new Error(`El parámetro "${name}" debe ser una fecha válida.`);
    error.status = 400;
    throw error;
  }
  const normalized = value.replace('T', ' ');
  const full = normalized.length === 10 ? `${normalized} ${name === 'hasta' ? '23:59:59' : '00:00:00'}` :
    normalized.length === 16 ? `${normalized}:00` : normalized;
  const [date, time] = full.split(' ');
  const dateParts = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const check = new Date(Date.UTC(
    dateParts[0], dateParts[1] - 1, dateParts[2],
    timeParts[0], timeParts[1], timeParts[2]
  ));
  if (
    check.getUTCFullYear() !== dateParts[0] ||
    check.getUTCMonth() !== dateParts[1] - 1 ||
    check.getUTCDate() !== dateParts[2] ||
    timeParts[0] > 23 || timeParts[1] > 59 || timeParts[2] > 59
  ) {
    const error = new Error(`El parámetro "${name}" no contiene una fecha existente.`);
    error.status = 400;
    throw error;
  }
  return full;
}

function parseRange(query) {
  const from = parseDateParameter(query.desde, 'desde');
  const to = parseDateParameter(query.hasta, 'hasta');
  if (from && to && from > to) {
    const error = new Error('"desde" no puede ser posterior a "hasta".');
    error.status = 400;
    throw error;
  }
  return { from, to };
}

function positiveQueryInteger(value, name, fallback, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    const error = new Error(`El parámetro "${name}" debe ser un entero entre 1 y ${max}.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

router.get('/status', (req, res) => {
  res.json(req.app.locals.serialService.getStatus());
});

router.get('/mediciones/ultima', async (req, res, next) => {
  try {
    res.json({ data: await getLatestMeasurement() });
  } catch (error) {
    next(error);
  }
});

router.get('/mediciones', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const page = positiveQueryInteger(req.query.page, 'page', 1, 1000000);
    const pageSize = positiveQueryInteger(req.query.pageSize, 'pageSize', 20, 100);
    const result = await getMeasurementPage({ from, to, page, pageSize });
    res.json({
      ...result,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/graficos', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const limit = positiveQueryInteger(req.query.limit, 'limit', 5000, 10000);
    const supportedVariables = new Set([
      'temperatura_bmp',
      'presion_atmosferica',
      'temperatura_dht',
      'humedad_aire',
      'humedad_suelo_raw',
      'humedad_suelo_porcentaje'
    ]);
    const variable = req.query.variable;
    if (variable !== undefined &&
        (typeof variable !== 'string' || !supportedVariables.has(variable))) {
      const error = new Error('El parámetro "variable" no corresponde a una variable disponible.');
      error.status = 400;
      throw error;
    }
    res.json({
      data: await getChartMeasurements({ from, to, limit, variable }),
      limit,
      variable: variable || null
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
