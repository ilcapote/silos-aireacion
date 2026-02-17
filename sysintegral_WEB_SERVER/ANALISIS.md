# Informe de Referencia – sysintegral_WEB_SERVER

Este documento resume las características del proyecto original en Flask para usarlo como base durante la refactorización hacia el stack TypeScript del sistema SILOS.

## 1. Tecnologías y Configuración
- **Backend:** Flask + SQLAlchemy + Flask-Login.
- **Base de datos:** MySQL (configurable para entorno local o PythonAnywhere mediante `.env`).
- **Servicios externos:**
  - Pronóstico MET Norway + datos actuales de OpenWeatherMap (combinados mediante `WeatherCache`).
  - API sunrise-sunset.org para calcular ventanas solares.
- **Zona horaria fija:** America/Argentina/Buenos_Aires para todos los registros.

## 2. Modelado de Dominio
- `User` con roles (`super_admin`, `admin`, `user`), relación muchos-a-muchos con `Establishment`, tracking de quién creó a quién.
- `Establishment`, `Silo`, `SiloChangeLog` (bitácora), `Board` (ESP32), `DeviceHeartbeat`, `DeviceActionLog`, `AeratorRuntime`, `ProtectionAlert`, `GlobalAeratorControl`.
- Módulos adicionales: sensores de temperatura (`SensorTemperatura`, `BarraSensores`, `LecturaTemperatura`) y datos de producción/ mortalidad avícola (`EggData`, `MortalityData`).
- Control de corriente máxima por establecimiento, con memoria en RAM (`device_current_values`).

## 3. Autenticación y Roles
- Login tradicional con hash PBKDF2 y sesión de Flask-Login.
- Decoradores `@login_required` + `super_admin_required`.
- Permisos:
  - `super_admin`: administra usuarios, establecimientos, ESP32, sensores, límites globales.
  - `admin`: gestiona solo sus establecimientos/silos/usuarios.
  - `user`: ajusta parámetros de los silos asignados.
- Restablecimiento de contraseñas con rehash y verificación de propiedad.

## 4. Funcionalidades Clave
### 4.1 Gestión Administrativa
- CRUD de usuarios con asignación de establecimientos y contraseña inicial.
- Gestión completa de establecimientos y silos con validación de posiciones únicas y logging de cambios.

### 4.2 Control de Silos
- Modos `auto`, `manual on/off`, `intelligent (IA)`.
- Cálculo horario de operación (`get_silos_operation_status` / `get_silo_operation_hours`) que evalúa:
  - Rangos de temperatura/humedad configurados.
  - Ventanas de lluvia/niebla, horas pico, horarios manuales o solares.
  - En modo IA: lecturas internas + tablas de equilibrio de humedad para trigo/soja/maíz; se desactiva automáticamente si faltan datos.

### 4.3 Integración ESP32 / IoT
- Endpoints `/api/esp32/...` para obtener configuraciones, estados 24h, detectar cambios, registrar runtime y acciones.
- `device_heartbeat`, `device_reboot`, `device_action_log` con historial (slots de 20 min, purga de 7 días).
- Protección por sobrecorriente y control global de aireadores (apagado forzado).

### 4.4 Monitoreo y Reportes
- Panel `user_silo_settings` con estado actual de cada silo y del dispositivo asociado.
- Vistas para gestionar ESP32, sensores de corriente/temperatura y logs históricos.
- `raw_stats` calcula horas de funcionamiento (últimos 7/30 días), promedios diarios y estado del dispositivo.

## 5. Observaciones para la Refactorización
1. **Monolito grande (`app.py` > 5k líneas):** conviene dividir en módulos (modelos, servicios, controladores) al migrar a TypeScript/Express.
2. **Lógica meteorológica e IA:** trasladar a servicios especializados con tests (combinación MET+OWM, horarios solares, tablas de equilibrio).
3. **Estados IoT:** ya contempla heartbeats, sobrecorriente, logs y resets automáticos; asegurarse de replicar la lógica de protección en la nueva arquitectura.
4. **Seguridad de APIs ESP32:** actualmente solo valida MAC registrada; evaluar agregar autenticación adicional/tokens.
5. **Dependencias externas:** se requieren claves/credenciales para OWM y MySQL; planificar configuración equivalente en el nuevo stack.

Este archivo servirá como referencia para ir migrando cada módulo al nuevo backend/ frontend en TypeScript, manteniendo el alcance funcional del sistema original.
