# Guía de Despliegue en Railway

## 🚀 Instrucciones paso a paso

### 1. Preparar tu cuenta en Railway

1. Ve a https://railway.app y regístrate (puedes usar tu cuenta de GitHub)
2. Verifica tu email

### 2. Subir proyecto a GitHub (si no lo has hecho)

```bash
# En la raíz del proyecto
git init
git add .
git commit -m "Preparación para deploy en Railway"
git branch -M main

# Crear repo en GitHub y luego:
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 3. Crear proyecto en Railway

1. En Railway, haz click en **"New Project"**
2. Selecciona **"Deploy from GitHub repo"**
3. Autoriza Railway a acceder a tus repos de GitHub
4. Selecciona tu repositorio del proyecto

### 4. Configurar variables de entorno

En el dashboard de Railway, ve a tu servicio y configura estas variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `JWT_SECRET` | Genera uno largo y aleatorio | Clave para tokens JWT |
| `NODE_ENV` | `production` | Modo producción |

**Importante:** Genera un `JWT_SECRET` seguro. Puedes usar:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Configurar volumen persistente (para SQLite)

1. En el dashboard de Railway, ve a **"Volumes"**
2. Crea un nuevo volumen llamado `silos-data`
3. Montalo en la ruta `/app/data`

### 6. Deploy automático

Railway detectará automáticamente el `Dockerfile` y hará el deploy.

Cada vez que hagas `git push` a la rama `main`, Railway hará deploy automático.

### 7. Verificar el deploy

1. Railway te dará una URL tipo `https://tu-proyecto.up.railway.app`
2. Ve a `https://tu-proyecto.up.railway.app/health` para verificar que funciona
3. Accede a la app web en la URL principal

---

## 📋 Resumen de archivos creados

| Archivo | Propósito |
|---------|-----------|
| `Dockerfile` | Define cómo construir el contenedor |
| `railway.toml` | Configuración específica de Railway |
| `.dockerignore` | Archivos que no van en la imagen Docker |

---

## 🔧 Solución de problemas

### Error de SQLite
Si ves errores relacionados con `better-sqlite3`, asegúrate de que el volumen esté montado correctamente en `/app/data`.

### Frontend no carga
Verifica que el build del frontend exista en el directorio `public` dentro del contenedor.

### Logs
En Railway dashboard, ve a la pestaña **"Deployments"** → **"View Logs"** para ver qué está pasando.

---

## 💰 Costo estimado

Railway cobra por uso:
- **Starter Plan**: ~$5/mes (suficiente para este proyecto)
- Solo pagas por los recursos que uses
- Puedes configurar límites de gasto

---

## 📞 Credenciales por defecto

Una vez desplegado, puedes acceder con:
- **Usuario:** `super_admin`
- **Contraseña:** `nopormuchomadrugarsevenlasvacasencamison`

**⚠️ Importante:** Cambia esta contraseña en producción.

---

## 🔄 Actualizaciones futuras

Para actualizar el proyecto:
```bash
git add .
git commit -m "Nuevos cambios"
git push origin main
```

Railway hará deploy automáticamente.
