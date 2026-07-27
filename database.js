const path      = require('path');
const fs        = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH  = path.join(DATA_DIR, 'carino_bonito.db');

let db, _timer = null, _dirty = false;

// ── Escritura diferida: agrupa todas las escrituras en 1 cada 800ms ──────────
function scheduleSave() {
  _dirty = true;
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    if (_dirty && db) {
      try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); _dirty = false; }
      catch(e) { console.error('[DB]', e.message); }
    }
  }, 800);
}

function saveNow() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (db) { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); _dirty = false; }
}

function save() { scheduleSave(); }

function run(sql, params=[])    { db.run(sql, params); scheduleSave(); }
function all(sql, params=[]) {
  const s = db.prepare(sql); s.bind(params);
  const rows = [];
  while (s.step()) rows.push(s.getAsObject());
  s.free(); return rows;
}
function get(sql, params=[])    { return all(sql, params)[0] || null; }
function insert(sql, params=[]) {
  db.run(sql, params);
  const r = db.exec('SELECT last_insert_rowid() as id');
  scheduleSave();
  return r[0]?.values[0][0];
}

function crearTablas() {
  db.run(`
    CREATE TABLE IF NOT EXISTS empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, color TEXT DEFAULT '#60A5FA',
      turno TEXT, entrada TEXT, salida TEXT,
      rol TEXT DEFAULT 'Moza', activa INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, precio REAL DEFAULT 0,
      icon TEXT DEFAULT '🍺', stock INTEGER DEFAULT 24, activa INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL, precio REAL DEFAULT 0,
      categoria TEXT DEFAULT 'Principales', activo INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY, estado TEXT DEFAULT 'libre', empleada_id INTEGER);
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa_id INTEGER, empleada_id INTEGER,
      fecha TEXT, hora TEXT, total REAL DEFAULT 0, cobrado INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER, tipo TEXT, nombre TEXT, marca TEXT,
      cantidad INTEGER, precio_unit REAL, subtotal REAL);
    CREATE TABLE IF NOT EXISTS bar_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleada_id INTEGER, mesa_id INTEGER, cerveza_id INTEGER,
      marca TEXT, cantidad INTEGER, tipo TEXT,
      precio_unit REAL DEFAULT 0, fecha TEXT, hora TEXT);
    CREATE TABLE IF NOT EXISTS cierres_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT, total_dia REAL, total_mesas INTEGER,
      total_cervezas INTEGER, total_menu REAL, creado_en TEXT);
    CREATE TABLE IF NOT EXISTS cierre_empleadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, empleada_nombre TEXT, cervezas INTEGER, ventas REAL);
    CREATE TABLE IF NOT EXISTS cierre_cervezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, cerveza_nombre TEXT, vendidas INTEGER, ingresos REAL);
    CREATE TABLE IF NOT EXISTS cierre_platos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cierre_id INTEGER, plato_nombre TEXT, cantidad INTEGER, ingresos REAL);
  `);
}

function seed() {
  if (!get('SELECT COUNT(*) as n FROM empleadas').n) {
    [['Ana','#F59E0B','Tarde','15:00','22:00','Moza'],
     ['Sarely','#60A5FA','Tarde','15:00','22:00','Barista']]
    .forEach(e => db.run('INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES (?,?,?,?,?,?)',e));
  }
  if (!get('SELECT COUNT(*) as n FROM cervezas').n) {
    [['Pilsen',8,'🍺',48],['Cristal',8,'🍻',48],
     ['Cusqueña',10,'🍺',36],['Corona',12,'🍺',24],['Heineken',12,'🍻',24]]
    .forEach(c => db.run('INSERT INTO cervezas (nombre,precio,icon,stock) VALUES (?,?,?,?)',c));
  }
  if (!get('SELECT COUNT(*) as n FROM platos').n) {
    [['Lomo saltado',28,'Principales'],['Ceviche mixto',32,'Principales'],
     ['Arroz con pollo',22,'Principales'],['Papas a la huancaína',14,'Entradas'],
     ['Piqueo surtido',45,'Entradas'],['Flan de lúcuma',12,'Postres']]
    .forEach(p => db.run('INSERT INTO platos (nombre,precio,categoria) VALUES (?,?,?)',p));
  }
  if (!get('SELECT COUNT(*) as n FROM mesas').n) {
    for (let i=1;i<=10;i++) db.run('INSERT OR IGNORE INTO mesas (id,estado) VALUES (?,?)',[i,'libre']);
  }
  saveNow();
}

async function getDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
  crearTablas(); seed();
  process.on('exit',   ()=>{ if(_dirty) saveNow(); });
  process.on('SIGINT', ()=>{ if(_dirty) saveNow(); process.exit(0); });
  process.on('SIGTERM',()=>{ if(_dirty) saveNow(); process.exit(0); });
  return db;
}

module.exports = { getDB, run, all, get, insert, save, saveNow };
