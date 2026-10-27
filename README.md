# Monitoreo ambiental

Aplicación local que recibe lecturas de un Arduino por puerto serial, conserva cada medición en MySQL y presenta los valores actuales, el historial paginado y gráficos independientes por variable. También incluye un simulador serial para verificar el flujo completo sin conectar el dispositivo.

## Estructura

```text
database/schema.sql          Base de datos y tabla
src/config.js                Configuración desde .env
src/database.js              Acceso MySQL parametrizado
src/measurement.js           Parser, validación y conversión de humedad
src/serial-service.js        Puerto serial, reconexión y simulador
src/routes.js                API REST con validación de parámetros
public/                      Interfaz HTML, CSS y gráficos Chart.js
tests/measurement.test.js    Pruebas del parser y conversión
server.js                    Arranque y coordinación de servicios
```

## Requisitos

- Node.js 18 o posterior y npm.
- MySQL 8 instalado localmente.
- Para hardware: Arduino conectado y el controlador de su puerto COM instalado.

## Preparación de MySQL

1. Si MySQL aún no está instalado, descargue **MySQL Installer Community** desde [la página oficial de descargas](https://dev.mysql.com/downloads/installer/), instale MySQL Server 8 y configure una contraseña para el usuario `root`.
2. Inicie el servicio local de MySQL desde Servicios de Windows o el instalador.
3. Desde una terminal abierta en la carpeta del proyecto, ejecute el script con un usuario que pueda crear bases de datos:

   ```powershell
   cmd /c "mysql -u root -p < database\schema.sql"
   ```

4. Si `mysql` no está en `PATH`, invoque `mysql.exe` desde la carpeta `bin` de su instalación de MySQL. El script crea `monitoreo_ambiental` y la tabla `mediciones`, con índice temporal y clave única de lectura para descartar re-procesamientos idénticos.

La aplicación no crea ni elimina datos de manera automática; los registros permanecen en MySQL después de cerrar o reiniciar Node.js.

## Instalación y configuración

En la carpeta del proyecto:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` con el usuario y contraseña de MySQL. No agregue `.env` al control de versiones.

### Probar sin Arduino

Deje `SERIAL_MODE=simulation` en `.env` (valor predeterminado) y ejecute:

```powershell
npm start
```

Abra <http://localhost:3000>. El simulador emite una lectura de prueba al iniciar y luego respeta `SIMULATION_INTERVAL_MS`. La interfaz muestra un aviso permanente mientras se usa la simulación. Estas lecturas son artificiales y no representan mediciones del ambiente.

### Usar el dispositivo real

1. En Windows, abra **Administrador de dispositivos → Puertos (COM y LPT)** para identificar el puerto asignado, por ejemplo `COM3`.
2. Configure `SERIAL_MODE=hardware`, `SERIAL_PORT=COM3` y `SERIAL_BAUD_RATE=9600` en `.env`. El baud rate debe coincidir con `Serial.begin(...)` en el firmware.
3. Cierre el monitor serial del IDE de Arduino, si está abierto; un puerto COM normalmente no puede ser usado por dos programas a la vez.
4. Inicie con `npm start`. Si el dispositivo se desconecta, el servicio informa el estado e intenta reconectar cada tres segundos.

El formato esperado es una lectura por bloque:

```text
-- NUEVA LECTURA ---
Fecha: 2026-10-27 Hora: 13:59:17
Temperatura BMP: 22.46 C
Presion: 1020.04 hPa
Temperatura DHT: 21.20 C
Humedad del aire: 65.00 %
Humedad suelo RAW: 1022
```

Cada bloque se valida antes de persistirse. Una lectura incompleta, con fecha imposible o valor no válido se descarta y se registra en la consola. La humedad del suelo se calcula como `clamp((1023 - RAW) / (1023 - 300) * 100, 0, 100)`; se almacena el RAW y el resultado. La humedad relativa del aire no se transforma.

## Interfaz y actualización

La página actualiza indicadores, estado serial, tabla y gráficos con la frecuencia seleccionada (2, 5, 10 o 30 segundos). El control de frecuencia no requiere reiniciar Node. Se pueden filtrar la tabla y los gráficos por fecha y hora; la tabla navega por páginas de 20 filas. Cada variable tiene su propio gráfico y escala para no mezclar unidades. Los puntos muestran fecha/hora y valor al pasar el cursor.

El panel diferencia puerto desconectado, puerto conectado sin lecturas recientes y recepción activa. La última medición disponible se conserva visible desde MySQL, aunque la conexión serial se interrumpa; el sistema no fabrica mediciones en modo hardware.

## API

- `GET /api/mediciones/ultima` — última medición o `data: null`.
- `GET /api/mediciones?page=1&pageSize=20&desde=2026-10-27T00:00&hasta=2026-10-27T23:59` — historial paginado y filtrado.
- `GET /api/graficos?desde=...&hasta=...&limit=5000` — datos cronológicos para los gráficos; puede recibir `variable=temperatura_bmp` (o cualquier campo medible) para consultar una sola serie.
- `GET /api/status` — modo, puerto, conexión, recepción, hora de última lectura y último error serial.

Las fechas usan hora local sin conversión de zona horaria. Los límites de fecha/hora, páginas y tamaños se validan. Los valores para SQL viajan mediante parámetros preparados; los únicos fragmentos SQL dinámicos son las condiciones fijas de fecha.

## Verificación

```powershell
npm test
```

Lista de comprobación manual:

1. En modo simulación, confirme que la lectura aparece en el panel y queda guardada en MySQL.
2. Consulte `/api/mediciones/ultima` y `/api/mediciones` y compruebe que nombres y valores coinciden con la tabla.
3. Confirme que RAW `1023` da `0 %`, RAW `300` da `100 %` y los valores fuera de calibración quedan limitados a `0–100 %`.
4. Espere otra lectura y compruebe la actualización automática de las tarjetas, tabla y cinco gráficos.
5. Cambie la frecuencia y use los filtros de fecha, hora y paginación.
6. En hardware, desconecte el dispositivo: el estado debe reflejar la desconexión y la última medición guardada debe seguir visible.
