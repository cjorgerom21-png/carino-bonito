const path = require('path');
const fs   = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH  = path.join(DATA_DIR, 'carino_bonito.db');

let db;
let _timer = null;
let _dirty = false;

// ─── ESCRITURA DIFERIDA ───────────────────────────────────────
// En vez de escribir al disco en cada SQL (100-300ms cada vez),
// agrupa todos los cambios y escribe UNA sola vez cada 800ms.
// Resultado: respuesta inmediata en pantalla, disco actualizado en segundo plano.

function scheduleSave() {
  _dirty = true;
  if (_timer) return;          // ya hay un timer corriendo, no crear otro
  _timer = setTimeout(() => {
    _timer = null;
    if (_dirty && db) {
      try {
        fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
        _dirty = false;
      } catch(e) { console.error('[DB] Error guardando:', e.message); }
    }
  }, 800);
}

// Guardado inmediato — usar solo para operaciones críticas (cierre de caja)
function saveNow() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  _dirty = false;
}

// Alias para compatibilidad con código existente
function save() { scheduleSave(); }

// ─── OPERACIONES SQL ──────────────────────────────────────────

function run(sql, params=[]) {
  db.run(sql, params);
  scheduleSave();   // sin bloqueo
}

function all(sql, params=[]) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params=[]) {
  return all(sql, params)[0] || null;
}

function insert(sql, params=[]) {
  db.run(sql, params);
  const r = db.exec('SELECT last_insert_rowid() as id');
  scheduleSave();   // sin bloqueo
  return r[0]?.values[0][0];
}

// ─── TABLAS ───────────────────────────────────────────────────

function crearTablas() {
  db.run(`
    CREATE TABLE IF NOT EXISTS empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, color TEXT DEFAULT '#60A5FA',
      turno TEXT, entrada TEXT, salida TEXT,
      rol TEXT DEFAULT 'Moza', activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, precio REAL DEFAULT 0,
      icon TEXT DEFAULT '🍺', stock INTEGER DEFAULT 24, activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, precio REAL DEFAULT 0,
      categoria TEXT DEFAULT 'Principales', activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY,
      estado TEXT DEFAULT 'libre', empleada_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa_id INTEGER, empleada_id INTEGER,
      fecha TEXT, hora TEXT, total REAL DEFAULT 0, cobrado INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER, tipo TEXT, nombre TEXT, marca TEXT,
      cantidad INTEGER, precio_unit REAL, subtotal REAL
    );
    CREATE TABLE IF NOT EXISTS bar_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleada_id INTEGER, mesa_id INTEGER, cerveza_id INTEGER,
      marca TEXT, cantidad INTEGER, tipo TEXT,
      precio_unit REAL DEFAULT 0, fecha TEXT, hora TEXT
    );
    CREATE TABLE IF NOT EXISTS cierres_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT, total_dia REAL, total_mesas INTEGER,
      total_cervezas INTEGER, total_menu REAL, creado_en TEXT
    );
    CREATE TABLE IF NOT EXISTS cierre_empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, empleada_nombre TEXT, cervezas INTEGER, ventas REAL
    );
    CREATE TABLE IF NOT EXISTS cierre_cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, cerveza_nombre TEXT, vendidas INTEGER, ingresos REAL
    );
    CREATE TABLE IF NOT EXISTS cierre_platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, plato_nombre TEXT, cantidad INTEGER, ingresos REAL
    );
  `);
}

function insertarDatosIniciales() {
  const ne = get('SELECT COUNT(*) as n FROM empleadas').n;
  if (ne === 0) {
    [
      ['Ana',    '#F59E0B','Tarde','15:00','22:00','Moza'],
      ['Sarely', '#60A5FA','Tarde','15:00','22:00','Barista'],
    ].forEach(e => db.run(
      'INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES (?,?,?,?,?,?)', e
    ));
  }
  const nc = get('SELECT COUNT(*) as n FROM cervezas').n;
  if (nc === 0) {
    [
      ['Pilsen',    8, '🍺', 48],
      ['Cristal',   8, '🍻', 48],
      ['Cusqueña', 10, '🍺', 36],
      ['Corona',   12, '🍺', 24],
      ['Heineken', 12, '🍻', 24],
    ].forEach(c => db.run(
      'INSERT INTO cervezas (nombre,precio,icon,stock) VALUES (?,?,?,?)', c
    ));
  }
  const np = get('SELECT COUNT(*) as n FROM platos').n;
  if (np === 0) {
    [
      ['Lomo saltado',          28, 'Principales'],
      ['Ceviche mixto',         32, 'Principales'],
      ['Arroz con pollo',       22, 'Principales'],
      ['Papas a la huancaína',  14, 'Entradas'],
      ['Piqueo surtido',        45, 'Entradas'],
      ['Flan de lúcuma',        12, 'Postres'],
    ].forEach(p => db.run(
      'INSERT INTO platos (nombre,precio,categoria) VALUES (?,?,?)', p
    ));
  }
  const nm = get('SELECT COUNT(*) as n FROM mesas').n;
  if (nm === 0) {
    for (let i = 1; i <= 10; i++)
      db.run('INSERT OR IGNORE INTO mesas (id,estado) VALUES (?,?)', [i, 'libre']);
  }
  saveNow(); // guardar datos iniciales de forma inmediata
}

// ─── INICIO ───────────────────────────────────────────────────

async function getDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  crearTablas();
  insertarDatosIniciales();
  // Guardar al cerrar el proceso
  process.on('exit',    () => { if (_dirty) saveNow(); });
  process.on('SIGINT',  () => { if (_dirty) saveNow(); process.exit(0); });
  process.on('SIGTERM', () => { if (_dirty) saveNow(); process.exit(0); });
  return db;
}

module.exports = { getDB, run, all, get, insert, save, saveNow };
