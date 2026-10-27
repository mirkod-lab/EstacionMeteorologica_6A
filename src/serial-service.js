const { EventEmitter } = require('node:events');
const config = require('./config');
const { MeasurementParser } = require('./measurement');

class SerialService extends EventEmitter {
  constructor() {
    super();
    this.mode = config.serial.mode;
    this.state = {
      mode: this.mode,
      port: this.mode === 'hardware' ? config.serial.port : null,
      baudRate: this.mode === 'hardware' ? config.serial.baudRate : null,
      connected: false,
      receivingData: false,
      lastMeasurementAt: null,
      lastError: null
    };
    this.stopped = false;
    this.retryTimer = null;
    this.simulationTimer = null;
    this.serialPort = null;
    this.parser = new MeasurementParser({
      onMeasurement: (measurement) => {
        this.state.lastMeasurementAt = new Date().toISOString();
        this.state.receivingData = true;
        this.emit('measurement', measurement);
      },
      onInvalid: (message) => console.warn(`[serial] ${message}`)
    });
  }

  start() {
    this.stopped = false;
    if (this.mode === 'simulation') {
      this.state.connected = true;
      this.simulationTimer = setInterval(
        () => this.feedSimulation(),
        config.serial.simulationIntervalMs
      );
      this.feedSimulation();
      console.info(`[serial] Simulacion activa; intervalo ${config.serial.simulationIntervalMs} ms.`);
      return;
    }
    this.connect();
  }

  feedLine(line) {
    this.parser.push(line);
  }

  feedSimulation() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const raw = 650 + Math.round(80 * Math.sin(Date.now() / 12000));
    const lines = [
      '-- NUEVA LECTURA ---',
      `Fecha: ${date} Hora: ${time}`,
      `Temperatura BMP: ${(22 + 2 * Math.sin(Date.now() / 25000)).toFixed(2)} C`,
      `Presion: ${(1013 + 3 * Math.sin(Date.now() / 40000)).toFixed(2)} hPa`,
      `Temperatura DHT: ${(21 + 2.5 * Math.sin(Date.now() / 22000)).toFixed(2)} C`,
      `Humedad del aire: ${(58 + 10 * Math.sin(Date.now() / 18000)).toFixed(2)} %`,
      `Humedad suelo RAW: ${raw}`
    ];
    for (const line of lines) this.feedLine(line);
  }

  connect() {
    if (this.stopped) return;
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');
    const port = new SerialPort({
      path: config.serial.port,
      baudRate: config.serial.baudRate,
      autoOpen: false
    });
    this.serialPort = port;
    const lines = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
      this.state.connected = true;
      this.state.lastError = null;
      console.info(`[serial] Conectado a ${config.serial.port} (${config.serial.baudRate} baudios).`);
    });
    lines.on('data', (line) => this.feedLine(line));
    port.on('error', (error) => {
      this.state.lastError = error.message;
      this.state.connected = false;
      this.state.receivingData = false;
      console.error(`[serial] ${error.message}`);
    });
    port.on('close', () => {
      this.state.connected = false;
      this.state.receivingData = false;
      if (!this.stopped) this.scheduleReconnect();
    });

    port.open((error) => {
      if (error) {
        this.state.lastError = error.message;
        this.state.connected = false;
        console.error(`[serial] No se pudo abrir ${config.serial.port}: ${error.message}`);
        this.scheduleReconnect();
      }
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, 3000);
  }

  getStatus() {
    const staleAfterMs = Math.max(config.serial.simulationIntervalMs * 3, 10000);
    const lastData = this.state.lastMeasurementAt
      ? new Date(this.state.lastMeasurementAt).getTime()
      : 0;
    return {
      ...this.state,
      receivingData: this.state.connected && Date.now() - lastData <= staleAfterMs
    };
  }

  stop() {
    this.stopped = true;
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.serialPort?.isOpen) this.serialPort.close();
  }
}

module.exports = SerialService;
