const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function getDB() {
  await crearTablas();
  await crearIndices();
  await insertarDatosIniciales();
  return pool;
}

// Wrappers sincrónicos-estilo para mantener compatibilidad con server.js
// En Postgres todo es async, pero usamos el pool directamente desde server.js
async function run(sql, params=[]) {
  await pool.query(sql, params);
}

async function all(sql, params=[]) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function get(sql, params=[]) {
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function insert(sql, params=[]) {
  // Convertir "INSERT ... VALUES (...)" → "INSERT ... VALUES (...) RETURNING id"
  const q = sql.trimEnd().replace(/;?$/, '') + ' RETURNING id';
  const res = await pool.query(q, params);
  return res.rows[0]?.id;
}

async function runBatch(ops) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { sql, params } of ops) {
      await client.query(sql, params || []);
    }
    await client.query('COMMIT');
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Alias — en Postgres no hay diferencia entre batch y batchImmediate
const runBatchImmediate = runBatch;

async function crearTablas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empleadas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      color TEXT DEFAULT '#60A5FA',
      turno TEXT DEFAULT 'Tarde',
      entrada TEXT DEFAULT '08:00',
      salida TEXT DEFAULT '16:00',
      rol TEXT DEFAULT 'Moza',
      activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS cervezas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 8,
      icon TEXT DEFAULT '🍺',
      stock INTEGER DEFAULT 24,
      activa INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS platos (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      mesa_id INTEGER,
      empleada_id INTEGER,
      fecha TEXT,
      hora TEXT,
      total REAL DEFAULT 0,
      cobrado INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pedido_items (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER,
      tipo TEXT,
      nombre TEXT,
      marca TEXT,
      cantidad INTEGER DEFAULT 1,
      precio_unit REAL,
      subtotal REAL
    );
    CREATE TABLE IF NOT EXISTS bar_movimientos (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
      fecha TEXT,
      total_dia REAL DEFAULT 0,
      total_mesas INTEGER DEFAULT 0,
      total_cervezas INTEGER DEFAULT 0,
      total_menu REAL DEFAULT 0,
      creado_en TEXT
    );
    CREATE TABLE IF NOT EXISTS cierre_empleadas (
      id SERIAL PRIMARY KEY,
      cierre_id INTEGER,
      empleada_nombre TEXT,
      cervezas INTEGER DEFAULT 0,
      ventas REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cierre_cervezas (
      id SERIAL PRIMARY KEY,
      cierre_id INTEGER,
      cerveza_nombre TEXT,
      vendidas INTEGER DEFAULT 0,
      ingresos REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cierre_platos (
      id SERIAL PRIMARY KEY,
      cierre_id INTEGER,
      plato_nombre TEXT,
      cantidad INTEGER DEFAULT 0,
      ingresos REAL DEFAULT 0
    );
  `);
}

async function crearIndices() {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bar_mov_fecha      ON bar_movimientos(fecha);
    CREATE INDEX IF NOT EXISTS idx_bar_mov_cerv_fecha ON bar_movimientos(cerveza_id, fecha);
    CREATE INDEX IF NOT EXISTS idx_bar_mov_emp_fecha  ON bar_movimientos(empleada_id, fecha);
    CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_fecha ON pedidos(mesa_id, fecha, cobrado);
    CREATE INDEX IF NOT EXISTS idx_pedidos_emp_fecha  ON pedidos(empleada_id, fecha, cobrado);
    CREATE INDEX IF NOT EXISTS idx_pedido_items_pid   ON pedido_items(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_pedido_items_marca ON pedido_items(marca, tipo);
    CREATE INDEX IF NOT EXISTS idx_cierres_fecha      ON cierres_caja(creado_en);
  `);
}

async function insertarDatosIniciales() {
  const emp = await pool.query('SELECT COUNT(*) as n FROM empleadas');
  if (parseInt(emp.rows[0].n) === 0) {
    await runBatch([
      { sql:"INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES ($1,$2,$3,$4,$5,$6)", params:['Ana',   '#60A5FA','Tarde',  '15:00','22:00','Moza'] },
      { sql:"INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES ($1,$2,$3,$4,$5,$6)", params:['Carla', '#34D399','Tarde',  '15:00','22:00','Moza'] },
      { sql:"INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES ($1,$2,$3,$4,$5,$6)", params:['Diana', '#FBBF24','Mañana', '08:00','15:00','Barista'] },
      { sql:"INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES ($1,$2,$3,$4,$5,$6)", params:['Sofía', '#F472B6','Noche',  '18:00','02:00','Encargada'] },
    ]);
  }
  const cerv = await pool.query('SELECT COUNT(*) as n FROM cervezas');
  if (parseInt(cerv.rows[0].n) === 0) {
    await runBatch([
      { sql:"INSERT INTO cervezas (nombre,precio,icon,stock) VALUES ($1,$2,$3,$4)", params:['Pilsen',   8,  '🍺', 48] },
      { sql:"INSERT INTO cervezas (nombre,precio,icon,stock) VALUES ($1,$2,$3,$4)", params:['Cristal',  8,  '🍻', 48] },
      { sql:"INSERT INTO cervezas (nombre,precio,icon,stock) VALUES ($1,$2,$3,$4)", params:['Cusqueña', 10, '🍺', 36] },
      { sql:"INSERT INTO cervezas (nombre,precio,icon,stock) VALUES ($1,$2,$3,$4)", params:['Corona',   12, '🍺', 24] },
      { sql:"INSERT INTO cervezas (nombre,precio,icon,stock) VALUES ($1,$2,$3,$4)", params:['Heineken', 12, '🍻', 24] },
    ]);
  }
  const plat = await pool.query('SELECT COUNT(*) as n FROM platos');
  if (parseInt(plat.rows[0].n) === 0) {
    await runBatch([
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Lomo saltado',28,'Principales'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Ceviche mixto',32,'Principales'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Arroz con pollo',22,'Principales'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Papas a la huancaína',14,'Entradas'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Piqueo surtido',45,'Entradas'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Causa rellena',18,'Entradas'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Tiradito',26,'Principales'] },
      { sql:"INSERT INTO platos (nombre,precio,categoria) VALUES ($1,$2,$3)", params:['Flan de lúcuma',12,'Postres'] },
    ]);
  }
  const mesa = await pool.query('SELECT COUNT(*) as n FROM mesas');
  if (parseInt(mesa.rows[0].n) === 0) {
    const ops = [];
    for (let i=1;i<=10;i++) ops.push({ sql:'INSERT INTO mesas (id,estado) VALUES ($1,$2)', params:[i,'libre'] });
    await runBatch(ops);
  }
}

module.exports = { getDB, run, all, get, insert, runBatch, runBatchImmediate, pool };
