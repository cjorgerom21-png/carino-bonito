# Cariño Bonito — Servidor Local

## INSTALACIÓN RÁPIDA (5 minutos)

### 1. Instalar Node.js
Descarga desde: https://nodejs.org (versión LTS)

### 2. Instalar dependencias
Abre una terminal en esta carpeta y ejecuta:
```
npm install
```

### 3. Iniciar el servidor
```
npm start
```

### 4. Abrir en el navegador
```
http://localhost:3000
```

### Acceso desde celular / otra computadora en la misma red WiFi:
Busca tu IP local (en Windows: `ipconfig`, en Mac/Linux: `ifconfig`)
Luego entra desde cualquier dispositivo a: `http://TU_IP:3000`
Ejemplo: `http://192.168.1.5:3000`

---
## Estructura de archivos
```
carino_bonito_server/
├── server.js          ← Servidor Node.js + API REST
├── database.js        ← Configuración SQLite
├── package.json       ← Dependencias
├── public/
│   └── index.html     ← La app (la misma interfaz)
└── carino_bonito.db   ← Base de datos SQLite (se crea sola)
```
