const PAGE_SIZE = 20;
const chartDefinitions = [
  { id: 'bmp', canvas: 'chart-bmp', field: 'temperatura_bmp', label: 'Temperatura BMP', unit: '°C', color: '#198365' },
  { id: 'dht', canvas: 'chart-dht', field: 'temperatura_dht', label: 'Temperatura DHT', unit: '°C', color: '#5487c7' },
  { id: 'pressure', canvas: 'chart-pressure', field: 'presion_atmosferica', label: 'Presión atmosférica', unit: 'hPa', color: '#cb8d35' },
  { id: 'air', canvas: 'chart-air', field: 'humedad_aire', label: 'Humedad del aire', unit: '%', color: '#8a6ac0' },
  { id: 'soil', canvas: 'chart-soil', field: 'humedad_suelo_porcentaje', label: 'Humedad del suelo', unit: '%', color: '#3d9b8c' }
];
const charts = new Map();
let currentPage = 1;
let totalPages = 0;
let refreshTimer = null;
let isRefreshing = false;

function showError(message) {
  const banner = document.getElementById('page-error');
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function clearError() {
  document.getElementById('page-error').classList.add('hidden');
}

async function requestJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Error HTTP ${response.status}`);
  return body;
}

function dateLabel(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

function setMetric(id, value, digits = 2) {
  document.getElementById(id).textContent =
    value === null || value === undefined ? '—' : Number(value).toFixed(digits);
}

async function loadLatest() {
  const { data } = await requestJson('/api/mediciones/ultima');
  if (!data) {
    for (const id of ['temperature-bmp', 'temperature-dht', 'pressure', 'air-humidity', 'soil-humidity', 'soil-raw']) {
      document.getElementById(id).textContent = '—';
    }
    document.getElementById('last-updated').textContent = 'Sin mediciones registradas';
    return;
  }
  setMetric('temperature-bmp', data.temperatura_bmp);
  setMetric('temperature-dht', data.temperatura_dht);
  setMetric('pressure', data.presion_atmosferica);
  setMetric('air-humidity', data.humedad_aire);
  setMetric('soil-humidity', data.humedad_suelo_porcentaje);
  setMetric('soil-raw', data.humedad_suelo_raw, 0);
  document.getElementById('last-updated').textContent = `Última medición: ${dateLabel(data.fecha_hora)}`;
}

async function loadStatus() {
  const status = await requestJson('/api/status');
  const label = document.getElementById('connection-label');
  const detail = document.getElementById('connection-detail');
  const dot = document.getElementById('connection-dot');
  dot.className = 'status-dot';
  if (status.mode === 'simulation') {
    document.getElementById('simulation-banner').classList.remove('hidden');
  } else {
    document.getElementById('simulation-banner').classList.add('hidden');
  }
  if (!status.connected) {
    label.textContent = 'Puerto desconectado';
    detail.textContent = status.lastError || (status.port ? `Esperando ${status.port}` : 'Sin conexión serial');
    dot.classList.add('offline');
  } else if (status.receivingData) {
    label.textContent = status.mode === 'simulation' ? 'Simulación recibiendo datos' : 'Recibiendo datos';
    detail.textContent = status.mode === 'simulation'
      ? `Simulador activo · ${status.lastMeasurementAt ? dateLabel(status.lastMeasurementAt) : 'iniciando'}`
      : `${status.port} · última lectura ${dateLabel(status.lastMeasurementAt)}`;
    dot.classList.add('online');
  } else {
    label.textContent = 'Conectado, sin datos recientes';
    detail.textContent = status.lastMeasurementAt
      ? `Último dato recibido ${dateLabel(status.lastMeasurementAt)}`
      : 'Esperando la primera lectura';
    dot.classList.add('offline');
  }
}

function rangeQuery(prefix) {
  const from = document.getElementById(`${prefix}-from`).value;
  const to = document.getElementById(`${prefix}-to`).value;
  const params = new URLSearchParams();
  if (from) params.set('desde', from);
  if (to) params.set('hasta', to);
  return params;
}

function renderHistory(rows) {
  const body = document.getElementById('history-body');
  body.replaceChildren();
  if (!rows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'No hay mediciones para los filtros seleccionados.';
    return;
  }
  for (const measurement of rows) {
    const row = body.insertRow();
    const values = [
      dateLabel(measurement.fecha_hora),
      Number(measurement.temperatura_bmp).toFixed(2),
      Number(measurement.presion_atmosferica).toFixed(2),
      Number(measurement.temperatura_dht).toFixed(2),
      Number(measurement.humedad_aire).toFixed(2),
      String(measurement.humedad_suelo_raw),
      Number(measurement.humedad_suelo_porcentaje).toFixed(2)
    ];
    for (const value of values) row.insertCell().textContent = value;
  }
}

async function loadHistory() {
  const params = rangeQuery('history');
  params.set('page', String(currentPage));
  params.set('pageSize', String(PAGE_SIZE));
  const result = await requestJson(`/api/mediciones?${params}`);
  renderHistory(result.rows);
  totalPages = result.totalPages;
  document.getElementById('page-summary').textContent =
    `Página ${result.totalPages ? result.page : 0} de ${result.totalPages} · ${result.total} registros`;
  document.getElementById('previous-page').disabled = currentPage <= 1;
  document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function renderCharts(rows) {
  const labels = rows.map((row) => dateLabel(row.fecha_hora));
  for (const definition of chartDefinitions) {
    const values = rows.map((row) => Number(row[definition.field]));
    const existing = charts.get(definition.id);
    if (existing) {
      existing.data.labels = labels;
      existing.data.datasets[0].data = values;
      existing.update('none');
      continue;
    }
    const chart = new Chart(document.getElementById(definition.canvas), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${definition.label} (${definition.unit})`,
          data: values,
          borderColor: definition.color,
          backgroundColor: `${definition.color}20`,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${definition.label}: ${Number(context.parsed.y).toFixed(2)} ${definition.unit}`
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 7, maxRotation: 0, color: '#7b8984' },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: definition.unit, color: '#7b8984' },
            ticks: { color: '#7b8984' },
            grid: { color: '#edf1ef' }
          }
        }
      }
    });
    charts.set(definition.id, chart);
  }
}

async function loadCharts() {
  const params = rangeQuery('chart');
  params.set('limit', '5000');
  const { data } = await requestJson(`/api/graficos?${params}`);
  renderCharts(data);
}

async function refresh() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await Promise.all([loadLatest(), loadStatus(), loadHistory(), loadCharts()]);
    clearError();
  } catch (error) {
    showError(`No se pudieron actualizar los datos: ${error.message}`);
  } finally {
    isRefreshing = false;
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const milliseconds = Number(document.getElementById('refresh-rate').value) * 1000;
  refreshTimer = setInterval(refresh, milliseconds);
}

document.getElementById('apply-history-filter').addEventListener('click', () => {
  currentPage = 1;
  refresh();
});
document.getElementById('apply-chart-filter').addEventListener('click', refresh);
document.getElementById('clear-filters').addEventListener('click', () => {
  for (const id of ['history-from', 'history-to', 'chart-from', 'chart-to']) {
    document.getElementById(id).value = '';
  }
  currentPage = 1;
  refresh();
});
document.getElementById('previous-page').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadHistory().catch((error) => showError(`No se pudo cargar el historial: ${error.message}`));
  }
});
document.getElementById('next-page').addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage += 1;
    loadHistory().catch((error) => showError(`No se pudo cargar el historial: ${error.message}`));
  }
});
document.getElementById('refresh-rate').addEventListener('change', scheduleRefresh);

refresh();
scheduleRefresh();
