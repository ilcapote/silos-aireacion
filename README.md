# Sistema de Aireación de Silos

Sistema completo para el control y monitoreo de aireación de silos con interfaz web y API para ESP32.

## 🚀 Características

- **Backend Node.js + Express + TypeScript**
  - API REST completa
  - Autenticación JWT
  - Base de datos SQLite
  - Gestión de usuarios con roles
  - Endpoints para ESP32

- **Frontend React + Vite + TailwindCSS**
  - Interfaz moderna y responsiva
  - Login seguro
  - Panel de administración
  - Gestión de usuarios
  - Cambio de contraseña

- **Integración ESP32**
  - Endpoint para consultar condiciones de aireación
  - Logs de actividad
  - Configuración de parámetros por silo

## 📋 Requisitos

- Node.js 18+ 
- npm o yarn

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
cd "SILOS REFACTORY"
```

### 2. Instalar Backend

```bash
cd backend
npm install
npm run init-db
```

### 3. Instalar Frontend

```bash
cd ../frontend
npm install
```

## 🎯 Uso

### Iniciar Backend (Terminal 1)

```bash
cd backend
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

### Iniciar Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

La aplicación web estará disponible en `http://localhost:5173`

## 🔐 Credenciales por Defecto

- **Usuario**: `super_admin`
- **Contraseña**: `nopormuchomadrugarsevenlasvacasencamison`

## 📡 API para ESP32

### Verificar condiciones de aireación

```
GET /api/esp32/check-conditions?silo_name=SILO1&temperature=25.5&humidity=65.0
```

**Respuesta:**
```json
{
  "silo_name": "SILO1",
  "aerate": true,
  "reason": "Humedad alta: 65% > 70%",
  "current": {
    "temperature": 25.5,
    "humidity": 65.0
  },
  "thresholds": {
    "temperature_max": 25.0,
    "temperature_min": 10.0,
    "humidity_max": 70.0,
    "humidity_min": 40.0
  }
}
```

### Ping

```
GET /api/esp32/ping
```

## 📁 Estructura del Proyecto

```
SILOS REFACTORY/
├── backend/
│   ├── src/
│   │   ├── database/       # Configuración de BD
│   │   ├── middleware/     # Autenticación
│   │   ├── routes/         # Endpoints API
│   │   ├── types/          # TypeScript types
│   │   └── index.ts        # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── api/           # Cliente API
│   │   ├── components/    # Componentes React
│   │   ├── context/       # Context API
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

## 🔄 Flujo de Trabajo

1. **Super Admin** inicia sesión
2. Crea usuarios con contraseña temporal `12345678`
3. Usuarios cambian su contraseña al primer login
4. Configura parámetros de silos
5. ESP32 consulta condiciones y activa/desactiva aireadores

## 🌐 Deployment

### Backend

Puede desplegarse en:
- Railway.app
- Render.com
- Fly.io
- Heroku

### Frontend

Puede desplegarse en:
- Vercel
- Netlify
- GitHub Pages

### Base de Datos

Para producción, migrar a PostgreSQL usando servicios como:
- Supabase
- Neon
- Railway

## 📝 Endpoints API

### Autenticación
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Cambiar contraseña
- `GET /api/auth/verify` - Verificar token

### Usuarios (Super Admin)
- `GET /api/users` - Listar usuarios
- `POST /api/users` - Crear usuario
- `DELETE /api/users/:id` - Eliminar usuario
- `POST /api/users/:id/reset-password` - Resetear contraseña

### Silos
- `GET /api/silos` - Listar silos
- `GET /api/silos/:silo_id/logs` - Obtener logs de aireación
- `GET /api/silos/establishment/:establishment_id/states` - Obtener estados con datos de clima (Frontend)

### ESP32 (Compatible con firmware existente)
- `POST /api/esp32/get_silos` - El ESP32 consulta qué silos tiene asignados
- `POST /api/esp32/get_24h_states` - El ESP32 obtiene estados para las próximas 24 horas
- `GET /api/check_modified/:mac_address` - El ESP32 verifica si debe actualizar configuración
- `POST /api/log_aerator_state` - El ESP32 reporta tiempo de funcionamiento
- `POST /api/log_runtime` - Alias de log_aerator_state
- `GET /api/esp32/ping` - Verificar conectividad

### Gestión de Silos
- `GET /api/silos-management` - Listar todos los silos
- `GET /api/silos-management/:id` - Obtener silo por ID
- `POST /api/silos-management` - Crear silo
- `PUT /api/silos-management/:id` - Actualizar silo
- `DELETE /api/silos-management/:id` - Eliminar silo

## 🌡️ Sistema de Evaluación de Clima

El sistema evalúa automáticamente las condiciones para operar los aireadores:

### Condiciones Universales
- **Sin lluvia**: No opera si hay precipitación (incluye 1 hora antes y después)
- **Sin niebla**: No opera con niebla o cobertura de nubes >90%
- **Fuera de horas pico**: Opcional, evita operar entre 17:00-22:59
- **Restricción horaria**: Configurable por silo o basado en horas de sol

### Modos de Operación
- **auto**: Opera si T y H están dentro de rangos configurados
- **on**: Opera siempre (respetando condiciones universales)
- **off**: Nunca opera

### APIs Externas
- **MET Norway**: Pronóstico meteorológico (temperatura, humedad, precipitación, viento)
- **Sunrise-Sunset.org**: Horas de amanecer/atardecer para modo solar

### Cache
- Datos meteorológicos: 30 minutos
- Reduce llamadas a APIs externas

## 🛠️ Tecnologías Utilizadas

### Backend
- Node.js + Express + TypeScript
- SQLite (better-sqlite3)
- JWT (jsonwebtoken) + bcryptjs
- Axios (llamadas a APIs de clima)

### Frontend
- React 18 + TypeScript + Vite
- TailwindCSS (modo oscuro)
- Axios + Lucide React (iconos)

## 📄 Licencia

MIT

## 👨‍💻 Desarrollo

Para contribuir al proyecto:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 🐛 Reportar Bugs

Si encuentras algún bug, por favor abre un issue en el repositorio.

## 📝 Notas Importantes

### Compatibilidad con Firmware ESP32
Los endpoints `/api/esp32/*` y `/api/check_modified/*` son **100% compatibles** con el firmware existente en los microcontroladores instalados. No es necesario actualizar el firmware.

### Estructura de Datos ESP32

**Consulta de silos (`POST /api/esp32/get_silos`)**:
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF"
}
```
Respuesta:
```json
{
  "silos": [
    {"id": 1, "position": 1},
    {"id": 2, "position": 2}
  ],
  "count": 2
}
```

**Estados 24h (`POST /api/esp32/get_24h_states`)**:
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF"
}
```
Respuesta:
```json
{
  "current_time": "2025-12-24 09:00",
  "states": [
    {
      "hour": "2025-12-24 09:00",
      "states": [
        {"silo_id": 1, "position": 1, "is_on": true},
        {"silo_id": 2, "position": 2, "is_on": false}
      ]
    }
  ]
}
```

## ✨ Próximas Características

- [x] Sistema de evaluación de clima con APIs externas
- [x] Endpoints compatibles con ESP32 existente
- [x] Dashboard con datos meteorológicos en tiempo real
- [ ] Gráficos de histórico de temperatura/humedad
- [ ] Notificaciones push
- [ ] Exportar reportes
- [ ] Alertas por email/SMS
- [ ] Protección por sobrecorriente
- [ ] App móvil
