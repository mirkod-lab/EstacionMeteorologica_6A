const crypto = require('node:crypto');

const START_MARKER = '-- NUEVA LECTURA ---';
const FIELDS = [
  'temperatura_bmp',
  'presion_atmosferica',
  'temperatura_dht',
  'humedad_aire',
  'humedad_suelo_raw'
];

function isValidDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    return false;
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    hour <= 23 && minute <= 59 && second <= 59;
}

function parseNumber(line, expression) {
  const match = line.match(expression);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function validateMeasurement(values) {
  return Number.isFinite(values.temperatura_bmp) &&
    Number.isFinite(values.presion_atmosferica) &&
    values.presion_atmosferica > 0 &&
    Number.isFinite(values.temperatura_dht) &&
    Number.isFinite(values.humedad_aire) &&
    values.humedad_aire >= 0 && values.humedad_aire <= 100 &&
    Number.isInteger(values.humedad_suelo_raw) &&
    values.humedad_suelo_raw >= 0 && values.humedad_suelo_raw <= 1023;
}

function convertSoilHumidity(raw) {
  const value = ((1023 - raw) / (1023 - 300)) * 100;
  return Math.min(100, Math.max(0, value));
}

function createMeasurement(values) {
  if (!isValidDateTime(values.fecha, values.hora) || !validateMeasurement(values)) {
    return null;
  }

  const canonical = [
    values.fecha,
    values.hora,
    values.temperatura_bmp,
    values.presion_atmosferica,
    values.temperatura_dht,
    values.humedad_aire,
    values.humedad_suelo_raw
  ].join('|');

  return {
    fecha_hora: `${values.fecha} ${values.hora}`,
    temperatura_bmp: values.temperatura_bmp,
    presion_atmosferica: values.presion_atmosferica,
    temperatura_dht: values.temperatura_dht,
    humedad_aire: values.humedad_aire,
    humedad_suelo_raw: values.humedad_suelo_raw,
    humedad_suelo_porcentaje: Number(convertSoilHumidity(values.humedad_suelo_raw).toFixed(2)),
    lectura_hash: crypto.createHash('sha256').update(canonical).digest('hex')
  };
}

class MeasurementParser {
  constructor({ onMeasurement, onInvalid = () => {} }) {
    this.onMeasurement = onMeasurement;
    this.onInvalid = onInvalid;
    this.current = null;
  }

  push(line) {
    const text = line.trim();
    if (text === START_MARKER) {
      if (this.current) this.onInvalid('Lectura incompleta descartada al comenzar otra.');
      this.current = {};
      return;
    }
    if (!this.current || !text) return;

    let match = text.match(/^Fecha:\s*(\d{4}-\d{2}-\d{2})\s+Hora:\s*(\d{2}:\d{2}:\d{2})$/);
    if (match) {
      this.current.fecha = match[1];
      this.current.hora = match[2];
      this.tryComplete();
      return;
    }

    const fieldParsers = [
      ['temperatura_bmp', /^Temperatura BMP:\s*(-?\d+(?:\.\d+)?)\s*C$/],
      ['presion_atmosferica', /^Presion:\s*(-?\d+(?:\.\d+)?)\s*hPa$/],
      ['temperatura_dht', /^Temperatura DHT:\s*(-?\d+(?:\.\d+)?)\s*C$/],
      ['humedad_aire', /^Humedad del aire:\s*(-?\d+(?:\.\d+)?)\s*%$/],
      ['humedad_suelo_raw', /^Humedad suelo RAW:\s*(-?\d+)$/]
    ];

    for (const [field, expression] of fieldParsers) {
      match = text.match(expression);
      if (match) {
        this.current[field] = Number(match[1]);
        this.tryComplete();
        return;
      }
    }
  }

  tryComplete() {
    if (!this.current || !this.current.fecha || !this.current.hora) return;
    if (!FIELDS.every((field) => Object.hasOwn(this.current, field))) return;
    const measurement = createMeasurement(this.current);
    if (measurement) {
      this.onMeasurement(measurement);
    } else {
      this.onInvalid('Lectura inválida descartada.');
    }
    this.current = null;
  }
}

module.exports = { MeasurementParser, convertSoilHumidity, createMeasurement };
