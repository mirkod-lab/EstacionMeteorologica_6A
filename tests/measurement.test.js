const test = require('node:test');
const assert = require('node:assert/strict');
const { MeasurementParser, convertSoilHumidity, createMeasurement } = require('../src/measurement');
const SerialService = require('../src/serial-service');

const reading = [
  '-- NUEVA LECTURA ---',
  'Fecha: 2026-10-27 Hora: 13:59:17',
  'Temperatura BMP: 22.46 C',
  'Presion: 1020.04 hPa',
  'Temperatura DHT: 21.20 C',
  'Humedad del aire: 65.00 %',
  'Humedad suelo RAW: 1022'
];

test('parses a complete serial reading and calculates soil humidity', () => {
  const received = [];
  const parser = new MeasurementParser({ onMeasurement: (value) => received.push(value) });
  for (const line of reading) parser.push(line);

  assert.equal(received.length, 1);
  assert.equal(received[0].fecha_hora, '2026-10-27 13:59:17');
  assert.equal(received[0].temperatura_bmp, 22.46);
  assert.equal(received[0].humedad_aire, 65);
  assert.equal(received[0].humedad_suelo_raw, 1022);
  assert.equal(received[0].humedad_suelo_porcentaje, 0.14);
  assert.match(received[0].lectura_hash, /^[a-f0-9]{64}$/);
});

test('clamps soil conversion at the calibration limits', () => {
  assert.equal(convertSoilHumidity(1023), 0);
  assert.equal(convertSoilHumidity(300), 100);
  assert.equal(convertSoilHumidity(0), 100);
  assert.equal(convertSoilHumidity(1200), 0);
});

test('rejects invalid dates and sensor values', () => {
  assert.equal(createMeasurement({
    fecha: '2026-02-30', hora: '13:59:17',
    temperatura_bmp: 20, presion_atmosferica: 1000, temperatura_dht: 20,
    humedad_aire: 50, humedad_suelo_raw: 500
  }), null);
  assert.equal(createMeasurement({
    fecha: '2026-10-27', hora: '13:59:17',
    temperatura_bmp: 20, presion_atmosferica: 1000, temperatura_dht: 20,
    humedad_aire: 101, humedad_suelo_raw: 500
  }), null);
});

test('discards incomplete readings and continues with subsequent readings', () => {
  const received = [];
  const warnings = [];
  const parser = new MeasurementParser({
    onMeasurement: (value) => received.push(value),
    onInvalid: (message) => warnings.push(message)
  });
  parser.push(reading[0]);
  parser.push(reading[1]);
  parser.push(reading[2]);
  for (const line of reading) parser.push(line);
  assert.equal(received.length, 1);
  assert.equal(warnings.length, 1);
});

test('simulation mode feeds a complete reading through the serial parser', () => {
  const service = new SerialService();
  let received = null;
  service.on('measurement', (measurement) => {
    received = measurement;
  });

  service.feedSimulation();

  assert.ok(received);
  assert.match(received.fecha_hora, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(received.humedad_suelo_porcentaje >= 0);
  assert.ok(received.humedad_suelo_porcentaje <= 100);
});
