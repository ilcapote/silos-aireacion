# Frontend - Sistema de Aireación de Silos

Interfaz web desarrollada con React, Vite y TailwindCSS.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## Build para Producción

```bash
npm run build
```

Los archivos compilados estarán en la carpeta `dist/`

## Preview de Producción

```bash
npm run preview
```

## Características

- ✅ Login con autenticación JWT
- ✅ Gestión de usuarios (Super Admin)
- ✅ Cambio de contraseña
- ✅ Interfaz responsiva
- ✅ Diseño moderno con TailwindCSS
- ✅ Iconos con Lucide React

## Componentes

- **Login**: Pantalla de inicio de sesión
- **Dashboard**: Panel principal
- **UserManagement**: Gestión de usuarios (solo super_admin)
- **ChangePasswordModal**: Modal para cambiar contraseña

## Configuración

El frontend se conecta al backend a través de un proxy configurado en `vite.config.ts`:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  }
}
```

Para producción, configura la variable de entorno:

```bash
VITE_API_URL=https://tu-backend.com/api
```
