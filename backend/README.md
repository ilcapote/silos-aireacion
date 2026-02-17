# Backend - Sistema de Aireación de Silos

Backend desarrollado con Node.js, Express y TypeScript para el control de aireación de silos.

## Características

- 🔐 Autenticación JWT
- 👥 Gestión de usuarios con roles
- 📊 Gestión de parámetros de silos
- 🌡️ API para ESP32
- 📝 Logs de aireación
- 💾 Base de datos SQLite

## Instalación

```bash
npm install
```

## Configuración

Copia el archivo `.env.example` a `.env` y ajusta las variables:

```bash
cp .env.example .env
```

## Inicializar Base de Datos

```bash
npm run init-db
```

## Desarrollo

```bash
npm run dev
```

## Producción

```bash
npm run build
npm start
```

## Credenciales por defecto

- **Usuario**: super_admin
- **Contraseña**: nopormuchomadrugarsevenlasvacasencamison

## Endpoints

### Autenticación
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Cambiar contraseña
- `GET /api/auth/verify` - Verificar token

### Usuarios (requiere super_admin)
- `GET /api/users` - Listar usuarios
- `POST /api/users` - Crear usuario
- `DELETE /api/users/:id` - Eliminar usuario
- `POST /api/users/:id/reset-password` - Resetear contraseña

### Silos (requiere autenticación)
- `GET /api/silos` - Listar silos
- `GET /api/silos/:silo_name` - Obtener silo
- `POST /api/silos` - Crear/actualizar silo
- `DELETE /api/silos/:silo_name` - Eliminar silo
- `GET /api/silos/:silo_name/logs` - Obtener logs

### ESP32 (público)
- `GET /api/esp32/check-conditions?silo_name=X&temperature=Y&humidity=Z` - Verificar condiciones
- `GET /api/esp32/ping` - Ping

## Estructura

```
backend/
├── src/
│   ├── database/
│   │   └── db.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── silos.ts
│   │   └── esp32.ts
│   ├── scripts/
│   │   └── initDb.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```
