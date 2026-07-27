const path = require('path');
const fs   = require('fs');

// Usar volumen de Railway si está disponible, si no usar directorio local
const DB_DIR  = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DB_DIR, 'carino_bonito.db');

// Asegurar que el directorio exista
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

// WAL mode: mejor rendimiento, sin locks, sin lag
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

function insert(sql, params = []) {
  const result = db.prepare(sql).run(params);
  return result.lastInsertRowid;
}

function crearTablas() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      color TEXT DEFAULT '#60A5FA',
      turno TEXT DEFAULT 'Tarde',
      entrada TEXT DEFAULT '08:00',
      salida TEXT DEFAULT '16:00',
      rol TEXT DEFAULT 'Moza',
      activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 8,
      icon TEXT DEFAULT '🍺',
      stock INTEGER DEFAULT 24,
      activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 0,
      categoria TEXT DEFAULT 'Principales',
      activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY,
      estado TEXT DEFAULT 'libre',
      empleada_id INTEGER,
      total REAL DEFAULT 0,
      total_cerv INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa_id INTEGER,
      empleada_id INTEGER,
      fecha TEXT,
      hora TEXT,
      total REAL DEFAULT 0,
      cobrado INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      tipo TEXT,
      nombre TEXT,
      marca TEXT,
      cantidad INTEGER DEFAULT 1,
      precio_unit REAL,
      subtotal REAL
    );
    CREATE TABLE IF NOT EXISTS bar_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleada_id INTEGER,
      mesa_id INTEGER,
      cerveza_id INTEGER,
      marca TEXT,
      cantidad INTEGER,
      tipo TEXT,
      precio_unit REAL DEFAULT 0,
      fecha TEXT,
      hora TEXT
    );
    CREATE TABLE IF NOT EXISTS cierres_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      total_dia REAL DEFAULT 0,
      total_mesas INTEGER DEFAULT 0,
      total_cervezas INTEGER DEFAULT 0,
      total_menu REAL DEFAULT 0,
      creado_en TEXT
    );
    CREATE TABLE IF NOT EXISTS cierre_empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER,
      empleada_nombre TEXT,
      cervezas INTEGER DEFAULT 0,
      ventas REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cierre_cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER,
      cerveza_nombre TEXT,
      vendidas INTEGER DEFAULT 0,
      ingresos REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cierre_platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER,
      plato_nombre TEXT,
      cantidad INTEGER DEFAULT 0,
      ingresos REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cobros_turno (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleada_id INTEGER,
      total REAL DEFAULT 0,
      cervezas INTEGER DEFAULT 0,
      fecha TEXT,
      hora TEXT
    );
  `);
}

function insertarDatosIniciales() {
  const empCount = get('SELECT COUNT(*) as n FROM empleadas').n;
  if (empCount === 0) {
    const ins = db.prepare('INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES (?,?,?,?,?,?)');
    [
      ['Ana',   '#60A5FA','Tarde',  '15:00','22:00','Moza'],
      ['Carla', '#34D399','Tarde',  '15:00','22:00','Moza'],
      ['Diana', '#FBBF24','Mañana', '08:00','15:00','Barista'],
      ['Sofía', '#F472B6','Noche',  '18:00','02:00','Encargada'],
    ].forEach(e => ins.run(e));
  }
  const cervCount = get('SELECT COUNT(*) as n FROM cervezas').n;
  if (cervCount === 0) {
    const ins = db.prepare('INSERT INTO cervezas (nombre,precio,icon,stock) VALUES (?,?,?,?)');
    [
      ['Pilsen',   8,  '🍺', 48],
      ['Cristal',  8,  '🍻', 48],
      ['Cusqueña', 10, '🍺', 36],
      ['Corona',   12, '🍺', 24],
      ['Heineken', 12, '🍻', 24],
    ].forEach(c => ins.run(c));
  }
  const platCount = get('SELECT COUNT(*) as n FROM platos').n;
  if (platCount === 0) {
    const ins = db.prepare('INSERT INTO platos (nombre,precio,categoria) VALUES (?,?,?)');
    [
      ['Lomo saltado',28,'Principales'],
      ['Ceviche mixto',32,'Principales'],
      ['Arroz con pollo',22,'Principales'],
      ['Papas a la huancaína',14,'Entradas'],
      ['Piqueo surtido',45,'Entradas'],
      ['Causa rellena',18,'Entradas'],
      ['Tiradito',26,'Principales'],
      ['Flan de lúcuma',12,'Postres'],
    ].forEach(p => ins.run(p));
  }
  const mesaCount = get('SELECT COUNT(*) as n FROM mesas').n;
  if (mesaCount === 0) {
    const ins = db.prepare('INSERT INTO mesas (id,estado) VALUES (?,?)');
    for (let i = 1; i <= 10; i++) ins.run([i, 'libre']);
  }
}

// Inicializar sincrónico (better-sqlite3 es sync)
crearTablas();
insertarDatosIniciales();

// Limpiar registros CIERRE_TURNO que quedaron en bar_movimientos (migración)
try { db.prepare("DELETE FROM bar_movimientos WHERE marca='CIERRE_TURNO' OR tipo='cierre'").run(); } catch(e) {}

console.log(`📦 DB en: ${DB_PATH}`);

module.exports = { db, run, all, get, insert };
