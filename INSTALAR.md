# 🌸 Cariño Bonito — Guía de instalación local con base de datos

## ¿Qué necesitas?
- Una computadora con Windows, Mac o Linux
- 15 minutos la primera vez
- Los datos se guardan en SQLite (un archivo .db en la carpeta)

---

## PASO 1 — Instalar Node.js

Ve a 👉 https://nodejs.org
Descarga la versión **LTS** (la recomendada) e instálala normal.

Para verificar que quedó bien, abre una terminal y escribe:
```
node --version
```
Debe aparecer algo como `v20.x.x`

---

## PASO 2 — Instalar las dependencias

Abre una terminal **dentro de esta carpeta** y ejecuta:
```
npm install
```
Esto descarga Express, SQLite y los demás paquetes (solo la primera vez).

### ¿Cómo abrir la terminal en esta carpeta?
- **Windows:** Shift + clic derecho en la carpeta → "Abrir ventana de PowerShell aquí"
- **Mac:** Clic derecho en la carpeta → "Nueva terminal en la carpeta"

---

## PASO 3 — Iniciar el servidor

```
npm start
```

Verás algo así:
```
🌸 ==========================================
   CARIÑO BONITO — Sistema de Gestión
🌸 ==========================================
✅ Servidor corriendo en:
   Local:   http://localhost:3000
   Red:     http://192.168.1.5:3000  ← usa esta en el celular
🌸 ==========================================
```

---

## PASO 4 — Abrir en el navegador

Ve a: **http://localhost:3000**

¡Listo! La app cargará con todos los datos desde la base de datos.

---

## Acceso desde celular / otra computadora

Tu celular y la computadora deben estar **en la misma red WiFi**.

Usa la dirección IP que aparece en la terminal:
```
http://192.168.1.5:3000
```
(la tuya puede ser diferente, usa la que muestra la terminal)

---

## ¿Dónde se guardan los datos?

En el archivo **`carino_bonito.db`** que se crea automáticamente en esta carpeta.

- ✅ Es un archivo SQLite estándar
- ✅ Puedes abrirlo con [DB Browser for SQLite](https://sqlitebrowser.org/) para ver todo
- ✅ Para hacer backup, simplemente copia ese archivo

---

## Iniciar automáticamente con Windows

Para que el servidor arranque solo cuando prendes la PC:

1. Crea un archivo `iniciar.bat` con este contenido:
```batch
@echo off
cd /d "C:\ruta\a\carino_bonito_server"
npm start
```

2. Presiona `Win + R`, escribe `shell:startup` y pega ahí el archivo `.bat`

---

## Tablas de la base de datos

| Tabla | Contenido |
|-------|-----------|
| `empleadas` | Datos de cada trabajadora |
| `cervezas` | Marcas, precios y stock |
| `platos` | Menú de comidas |
| `mesas` | Estado en tiempo real |
| `pedidos` | Cada orden confirmada |
| `pedido_items` | Ítems de cada pedido |
| `bar_movimientos` | Cervezas manuales del bar |
| `cierres_caja` | Resumen de cada día |
| `cierre_empleadas` | Ventas por empleada por día |
| `cierre_cervezas` | Cervezas por marca por día |
| `cierre_platos` | Platos más vendidos por día |

---

## Backup semanal (recomendado)

Copia el archivo `carino_bonito.db` a un USB o Google Drive cada semana.
Puedes restaurarlo reemplazando el archivo.

---

## Comandos útiles

| Comando | Para qué sirve |
|---------|----------------|
| `npm start` | Iniciar el servidor |
| `npm run dev` | Iniciar con recarga automática (para desarrollo) |
| Ctrl + C | Detener el servidor |
