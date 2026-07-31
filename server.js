const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { run, all, get, insert } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function hoy(req)  {
  if (req?.body?.fecha_local) return req.body.fecha_local;
  if (req?.query?.fecha) return req.query.fecha;
  return new Date().toLocaleDateString('en-CA', {timeZone: process.env.TZ || 'America/Lima'});
}
function hora(req) {
  if (req?.body?.hora_local) return req.body.hora_local;
  if (req?.query?.hora) return req.query.hora;
  return new Date().toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit', timeZone: process.env.TZ || 'America/Lima'});
}

// ── HISTORIAL DEL DÍA ────────────────────────────────────
app.post('/api/historial', (req, res) => {
  const { hora, mesa, tipo, txt, monto, chica, icon } = req.body;
  const h = hoy(req);
  run('CREATE TABLE IF NOT EXISTS historial_dia (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, mesa TEXT, tipo TEXT, txt TEXT, monto REAL DEFAULT 0, chica TEXT, icon TEXT)');
  run('INSERT INTO historial_dia (fecha,hora,mesa,tipo,txt,monto,chica,icon) VALUES (?,?,?,?,?,?,?,?)',
    [h, hora||'', String(mesa||''), tipo||'cobro', txt||'', parseFloat(monto)||0, chica||'', icon||'💰']);
  res.json({ ok: true });
});

// ── DEBUG — ver qué hay en bar_movimientos ───────────────
app.get('/api/debug/bar', (req, res) => {
  const ultimos = all('SELECT id,fecha,hora,marca,cantidad,tipo,categoria FROM bar_movimientos ORDER BY id DESC LIMIT 20');
  const fechas  = all('SELECT DISTINCT fecha, COUNT(*) as n FROM bar_movimientos GROUP BY fecha ORDER BY fecha DESC');
  const hReq    = req.query.fecha || hoy(req);
  const deHoy   = all('SELECT * FROM bar_movimientos WHERE fecha=? ORDER BY id DESC',[hReq]);
  res.json({ hoy: hReq, fechas, ultimos, deHoy });
});

// ── STATUS / DIAGNÓSTICO ─────────────────────────────────
app.get('/api/status', (req,res) => {
  const { DB_PATH } = require('./database');
  const fs = require('fs');
  res.json({
    db_path: DB_PATH,
    db_exists: fs.existsSync(DB_PATH),
    volume_env: process.env.RAILWAY_VOLUME_MOUNT_PATH || null,
    data_dir_exists: fs.existsSync('/data'),
    uptime: process.uptime()
  });
});

// ── EMPLEADAS ────────────────────────────────────────────
app.get('/api/empleadas', (req,res) => {
  res.json(all('SELECT * FROM empleadas WHERE activa=1 ORDER BY id'));
});
app.post('/api/empleadas', (req,res) => {
  const {nombre,color,turno,entrada,salida,rol} = req.body;
  const id = insert('INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES (?,?,?,?,?,?)',
    [nombre,color,turno,entrada,salida,rol]);
  res.json({id,nombre,color,turno,entrada,salida,rol});
});
app.put('/api/empleadas/:id', (req,res) => {
  const {nombre,color,turno,entrada,salida,rol} = req.body;
  run('UPDATE empleadas SET nombre=?,color=?,turno=?,entrada=?,salida=?,rol=? WHERE id=?',
    [nombre,color,turno,entrada,salida,rol,req.params.id]);
  res.json({ok:true});
});
app.delete('/api/empleadas/:id', (req,res) => {
  run('UPDATE empleadas SET activa=0 WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

// ── CERVEZAS ─────────────────────────────────────────────
app.get('/api/cervezas', (req,res) => {
  const rows = all('SELECT * FROM cervezas WHERE activa=1 ORDER BY id');
  const h = hoy(req);
  rows.forEach(c => {
    c.precio     = parseFloat(c.precio)||0;
    c.stock      = parseInt(c.stock)||0;
    c.icon       = c.icon || '🍺';
    c.categoria  = c.categoria || 'Cervezas';
    const out = get('SELECT COALESCE(SUM(cantidad),0) as v FROM bar_movimientos WHERE cerveza_id=? AND tipo!=? AND fecha=?',[c.id,'devol',h]);
    const dev = get('SELECT COALESCE(SUM(cantidad),0) as v FROM bar_movimientos WHERE cerveza_id=? AND tipo=? AND fecha=?',[c.id,'devol',h]);
    const ped = get('SELECT COALESCE(SUM(cantidad),0) as v FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE pi.marca=? AND pi.tipo=? AND p.fecha=?',[c.nombre,'cerveza',h]);
    c.vendidas_hoy = Math.max(0,(out?.v||0)+(ped?.v||0)-(dev?.v||0));
  });
  res.json(rows);
});
app.post('/api/cervezas', (req,res) => {
  const {nombre,icon,categoria} = req.body;
  const precio = parseFloat(req.body.precio)||0;
  const stock  = parseInt(req.body.stock)||24;
  const cat    = categoria||'Cervezas';
  const id = insert('INSERT INTO cervezas (nombre,precio,icon,stock,categoria) VALUES (?,?,?,?,?)',[nombre,precio,icon||'🍺',stock,cat]);
  res.json({id,nombre,precio,icon,stock,categoria:cat});
});
app.put('/api/cervezas/:id', (req,res) => {
  const {nombre,categoria} = req.body;
  const precio = parseFloat(req.body.precio)||0;
  const stock = parseInt(req.body.stock)||0;
  const cat = categoria||'Cervezas';
  const icon = req.body.icon||'🍺';
  run('UPDATE cervezas SET nombre=?,precio=?,stock=?,categoria=?,icon=? WHERE id=?',[nombre,precio,stock,cat,icon,req.params.id]);
  res.json({ok:true});
});
app.delete('/api/cervezas/:id', (req,res) => {
  run('UPDATE cervezas SET activa=0 WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

// ── PLATOS ───────────────────────────────────────────────
app.get('/api/platos', (req,res) => {
  res.json(all('SELECT * FROM platos WHERE activo=1 ORDER BY categoria,nombre'));
});
app.post('/api/platos', (req,res) => {
  const {nombre,categoria} = req.body;
  const precio = parseFloat(req.body.precio)||0;
  const id = insert('INSERT INTO platos (nombre,precio,categoria) VALUES (?,?,?)',[nombre,precio,categoria]);
  res.json({id,nombre,precio,categoria});
});
app.put('/api/platos/:id', (req,res) => {
  const {nombre,categoria} = req.body;
  const precio = parseFloat(req.body.precio)||0;
  run('UPDATE platos SET nombre=?,precio=?,categoria=? WHERE id=?',[nombre,precio,categoria,req.params.id]);
  res.json({ok:true});
});
app.delete('/api/platos', (req,res) => {
  // Elimina TODOS los platos (para limpieza de datos de prueba)
  run('UPDATE platos SET activo=0 WHERE 1=1');
  res.json({ok:true});
});

app.delete('/api/platos/:id', (req,res) => {
  run('UPDATE platos SET activo=0 WHERE id=?',[req.params.id]);
  res.json({ok:true});
});

// ── MESAS ────────────────────────────────────────────────
app.get('/api/mesas', (req,res) => {
  const mesas = all('SELECT m.*, e.nombre as empleada_nombre, e.color as empleada_color FROM mesas m LEFT JOIN empleadas e ON e.id=m.empleada_id ORDER BY m.id');
  const h = hoy(req);
  mesas.forEach(m => {
    const peds = all('SELECT total FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0',[m.id,h]);
    m.total = peds.reduce((s,p)=>s+(p.total||0),0);
    const cerv = get('SELECT COALESCE(SUM(pi.cantidad),0) as c FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE p.mesa_id=? AND pi.tipo=? AND p.fecha=? AND p.cobrado=0',[m.id,'cerveza',h]);
    m.total_cerv = cerv?.c||0;
  });
  res.json(mesas);
});
app.put('/api/mesas/:id', (req,res) => {
  const {estado,empleada_id} = req.body;
  run('UPDATE mesas SET estado=?,empleada_id=? WHERE id=?',[estado,empleada_id||null,req.params.id]);
  res.json({ok:true});
});
app.post('/api/mesas/cantidad', (req,res) => {
  const {cantidad} = req.body;
  const actual = get('SELECT COUNT(*) as n FROM mesas').n;
  if (cantidad > actual) {
    const ins = require('./database').db.prepare('INSERT OR IGNORE INTO mesas (id,estado) VALUES (?,?)');
    for (let i=actual+1;i<=cantidad;i++) ins.run([i,'libre']);
  }
  res.json({ok:true,cantidad});
});

// ── PEDIDOS ──────────────────────────────────────────────
app.post('/api/pedidos', (req,res) => {
  const {mesa_id,empleada_id,items} = req.body;
  items.forEach(i=>{ i.precio_unit=parseFloat(i.precio_unit)||0; i.subtotal=i.precio_unit*(parseInt(i.cantidad)||1); });
  const total = items.reduce((s,i)=>s+(i.subtotal||0),0);
  const h=hoy(req), hr=hora(req);
  const pedido_id = insert('INSERT INTO pedidos (mesa_id,empleada_id,fecha,hora,total) VALUES (?,?,?,?,?)',[mesa_id,empleada_id||null,h,hr,total]);
  items.forEach(item => {
    run('INSERT INTO pedido_items (pedido_id,tipo,nombre,marca,cantidad,precio_unit,subtotal) VALUES (?,?,?,?,?,?,?)',
      [pedido_id,item.tipo,item.nombre,item.marca||null,item.cantidad,item.precio_unit,item.subtotal]);
    if (item.tipo==='cerveza') {
      run('UPDATE cervezas SET stock=MAX(0,stock-?) WHERE nombre=?',[item.cantidad,item.marca]);
      const cerv = get('SELECT id,precio FROM cervezas WHERE nombre=?',[item.marca]);
      if(cerv) run('INSERT INTO bar_movimientos (empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,fecha,hora) VALUES (?,?,?,?,?,?,?,?,?)',
        [empleada_id||null,mesa_id,cerv.id,item.marca,item.cantidad,'venta',cerv.precio,h,hr]);
    }
  });
  run('UPDATE mesas SET estado=?,empleada_id=? WHERE id=?',['ocupada',empleada_id||null,mesa_id]);
  res.json({id:pedido_id,total});
});

app.post('/api/pedidos/cobrar-mesa', (req,res) => {
  const {mesa_id} = req.body;
  // Sin filtro de fecha — cobrar todos los pedidos pendientes de la mesa
  const peds = all('SELECT * FROM pedidos WHERE mesa_id=? AND cobrado=0',[mesa_id]);
  const totalMesa = peds.reduce((s,p)=>s+(p.total||0),0);
  const items = [];
  peds.forEach(p => {
    const its = all('SELECT * FROM pedido_items WHERE pedido_id=?',[p.id]);
    its.forEach(it => {
      const ex = items.find(x=>x.nombre===it.nombre&&x.tipo===it.tipo);
      if (ex) ex.cantidad += it.cantidad;
      else items.push({nombre:it.nombre, tipo:it.tipo, cantidad:it.cantidad});
    });
  });
  run('UPDATE pedidos SET cobrado=1 WHERE mesa_id=? AND cobrado=0',[mesa_id]);
  run("UPDATE mesas SET estado='libre', empleada_id=NULL WHERE id=?",[mesa_id]);
  res.json({ok:true, total:totalMesa, items});
});

// ── BAR ──────────────────────────────────────────────────
app.get('/api/bar/movimientos', (req,res) => {
  const h=hoy(req);
  res.json(all("SELECT bm.*, e.nombre as emp_nombre, e.color as emp_color FROM bar_movimientos bm LEFT JOIN empleadas e ON e.id=bm.empleada_id WHERE bm.fecha=? AND bm.tipo!='cierre' ORDER BY bm.id DESC LIMIT 100",[h]));
});

app.post('/api/bar/movimientos', (req,res) => {
  const {empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,categoria} = req.body;
  const h=hoy(req), hr=hora(req);
  const cerv = cerveza_id ? get('SELECT categoria FROM cervezas WHERE id=?',[cerveza_id]) : null;
  const cat = categoria || cerv?.categoria || 'Cervezas';
  console.log(`[bar/mov] marca=${marca} fecha=${h} fecha_local=${req.body.fecha_local||'NO'}`);
  try {
    run('INSERT INTO bar_movimientos (empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,fecha,hora,categoria) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [empleada_id||null,mesa_id||null,cerveza_id||null,marca,cantidad,tipo,precio_unit||0,h,hr,cat]);
  } catch(e) {
    // Si falla por columna categoria, insertar sin ella
    console.warn('[bar/mov] retry sin categoria:', e.message);
    run('INSERT INTO bar_movimientos (empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,fecha,hora) VALUES (?,?,?,?,?,?,?,?,?)',
      [empleada_id||null,mesa_id||null,cerveza_id||null,marca,cantidad,tipo,precio_unit||0,h,hr]);
  }
  if (tipo==='venta' || tipo==='salio') {
    try { run('UPDATE cervezas SET stock=MAX(0,stock-?) WHERE id=?',[cantidad,cerveza_id]); } catch(e) {}
  } else if (tipo==='devol') {
    try { run('UPDATE cervezas SET stock=stock+? WHERE id=?',[cantidad,cerveza_id]); } catch(e) {}
  }
  res.json({ok:true,hora:hr});
});

// ── COBRO DE TURNO EMPLEADA ──────────────────────────────
app.post('/api/bar/cobrar-turno', (req, res) => {
  const { empleada_id, total, cervezas: totalCerv, parcial } = req.body;
  const h = hoy(req), hr = hora(req);
  // Asegurar tabla existe con columna parcial
  run(`CREATE TABLE IF NOT EXISTS cobros_turno (id INTEGER PRIMARY KEY AUTOINCREMENT, empleada_id INTEGER, total REAL DEFAULT 0, cervezas INTEGER DEFAULT 0, fecha TEXT, hora TEXT, parcial INTEGER DEFAULT 0)`);
  try { run(`ALTER TABLE cobros_turno ADD COLUMN parcial INTEGER DEFAULT 0`); } catch(e) { /* ya existe */ }
  run('INSERT INTO cobros_turno (empleada_id,total,cervezas,fecha,hora,parcial) VALUES (?,?,?,?,?,?)',
    [empleada_id||null, parseFloat(total)||0, totalCerv||0, h, hr, parcial?1:0]);
  res.json({ ok: true, hora: hr, total, empleada_id });
});

// ── CAJA ─────────────────────────────────────────────────
// ── LISTAR CIERRES DE CAJA ───────────────────────────────
app.get('/api/caja/cierres', (req, res) => {
  const cierres = all(`SELECT * FROM cierres_caja ORDER BY id DESC LIMIT 30`);
  res.json(cierres);
});

// ── ELIMINAR CIERRE DE CAJA (reabrir) ────────────────────
app.delete('/api/caja/cierres/:id', (req, res) => {
  const id = req.params.id;
  run('DELETE FROM cierre_empleadas WHERE cierre_id=?', [id]);
  run('DELETE FROM cierre_cervezas WHERE cierre_id=?', [id]);
  run('DELETE FROM cierre_platos WHERE cierre_id=?', [id]);
  run('DELETE FROM cierres_caja WHERE id=?', [id]);
  res.json({ ok: true });
});

// ── ELIMINAR MOVIMIENTO BAR ESPECÍFICO ───────────────────
app.delete('/api/bar/movimientos/:id', (req, res) => {
  const mov = get('SELECT * FROM bar_movimientos WHERE id=?', [req.params.id]);
  if (!mov) return res.status(404).json({ error: 'No encontrado' });
  // Revertir stock
  if (mov.tipo === 'salio' || mov.tipo === 'venta' || mov.tipo === 'manual') {
    if (mov.cerveza_id) run('UPDATE cervezas SET stock=stock+? WHERE id=?', [mov.cantidad, mov.cerveza_id]);
  } else if (mov.tipo === 'devol') {
    if (mov.cerveza_id) run('UPDATE cervezas SET stock=MAX(0,stock-?) WHERE id=?', [mov.cantidad, mov.cerveza_id]);
  }
  run('DELETE FROM bar_movimientos WHERE id=?', [req.params.id]);
  res.json({ ok: true, revertido: mov });
});

app.post('/api/caja/cerrar', (req,res) => {
  const {totalDia,mesasCob,totalCervG,totalMenu,porEmpleada,porCerveza,porPlato} = req.body;
  const fecha = new Date().toLocaleDateString('es',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const ahora = new Date().toISOString();
  const cid = insert('INSERT INTO cierres_caja (fecha,total_dia,total_mesas,total_cervezas,total_menu,creado_en) VALUES (?,?,?,?,?,?)',
    [fecha,totalDia,mesasCob,totalCervG,totalMenu,ahora]);
  (porEmpleada||[]).forEach(e => run('INSERT INTO cierre_empleadas (cierre_id,empleada_nombre,cervezas,ventas) VALUES (?,?,?,?)',[cid,e.nombre,e.cervezas,e.ventas]));
  (porCerveza||[]).forEach(c => run('INSERT INTO cierre_cervezas (cierre_id,cerveza_nombre,vendidas,ingresos) VALUES (?,?,?,?)',[cid,c.nombre,c.vendidas,c.ingresos]));
  (porPlato||[]).forEach(p => run('INSERT INTO cierre_platos (cierre_id,plato_nombre,cantidad,ingresos) VALUES (?,?,?,?)',[cid,p.nombre,p.cantidad,p.ingresos]));
  res.json({ok:true,cierre_id:cid});
});

// ── ANALYTICS ────────────────────────────────────────────
app.get('/api/analytics', (req,res) => {
  const periodo = req.query.periodo||'todo';
  const hoyD = new Date();
  let filtro = '';
  if (periodo==='semana') {
    const lunes = new Date(hoyD); lunes.setDate(hoyD.getDate()-hoyD.getDay()+1);
    filtro = `AND date(creado_en)>='${lunes.toISOString().split('T')[0]}'`;
  } else if (periodo==='mes') {
    const mes = hoyD.toISOString().slice(0,7);
    filtro = `AND substr(creado_en,1,7)='${mes}'`;
  }
  const cierres = all(`SELECT * FROM cierres_caja WHERE 1=1 ${filtro} ORDER BY id DESC`);
  const dias = cierres.map(c=>({
    ...c,
    porEmpleada: all('SELECT * FROM cierre_empleadas WHERE cierre_id=?',[c.id]),
    porCerveza:  all('SELECT * FROM cierre_cervezas  WHERE cierre_id=? ORDER BY vendidas DESC',[c.id]),
    porPlato:    all('SELECT * FROM cierre_platos     WHERE cierre_id=? ORDER BY ingresos DESC',[c.id]),
  }));
  const rankCerv = all(`SELECT cerveza_nombre as nombre, SUM(vendidas) as total_qty, SUM(ingresos) as total_ing FROM cierre_cervezas cc JOIN cierres_caja c ON c.id=cc.cierre_id WHERE 1=1 ${filtro} GROUP BY cerveza_nombre ORDER BY total_qty DESC LIMIT 10`);
  const rankPlat = all(`SELECT plato_nombre as nombre, SUM(cantidad) as total_qty, SUM(ingresos) as total_ing FROM cierre_platos cp JOIN cierres_caja c ON c.id=cp.cierre_id WHERE 1=1 ${filtro} GROUP BY plato_nombre ORDER BY total_ing DESC LIMIT 10`);
  const rankEmp  = all(`SELECT empleada_nombre as nombre, SUM(cervezas) as total_cerv, SUM(ventas) as total_ventas, COUNT(*) as dias FROM cierre_empleadas ce JOIN cierres_caja c ON c.id=ce.cierre_id WHERE 1=1 ${filtro} GROUP BY empleada_nombre ORDER BY total_ventas DESC`);
  res.json({dias,rankCerv,rankPlat,rankEmp});
});

// ── RESUMEN DEL DÍA ──────────────────────────────────────
app.get('/api/dia/resumen', (req, res) => {
  const h   = req.query.fecha || hoy(req);
  const hUTC= new Date().toISOString().split('T')[0];
  const F   = h !== hUTC ? [h, hUTC] : [h]; // cliente + UTC por desfase de TZ
  const ph  = F.map(()=>'?').join(',');

  run(`CREATE TABLE IF NOT EXISTS cobros_turno (id INTEGER PRIMARY KEY AUTOINCREMENT, empleada_id INTEGER, total REAL DEFAULT 0, cervezas INTEGER DEFAULT 0, fecha TEXT, hora TEXT, parcial INTEGER DEFAULT 0)`);
  try { run(`ALTER TABLE cobros_turno ADD COLUMN parcial INTEGER DEFAULT 0`); } catch(e) {}
  run(`CREATE TABLE IF NOT EXISTS historial_dia (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, mesa TEXT, tipo TEXT, txt TEXT, monto REAL DEFAULT 0, chica TEXT, icon TEXT)`);

  const cajaDia   = get(`SELECT COALESCE(SUM(total),0) as t, COUNT(DISTINCT mesa_id) as m FROM pedidos WHERE fecha IN (${ph}) AND cobrado=1`, F);
  const menuDia   = get(`SELECT COALESCE(SUM(pi.subtotal),0) as t FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE p.fecha IN (${ph}) AND pi.tipo!='cerveza' AND p.cobrado=1`, F);
  const cobrosBar = get(`SELECT COALESCE(SUM(total),0) as t FROM cobros_turno WHERE fecha IN (${ph})`, F);
  const cobrosEmp = all(`SELECT empleada_id, SUM(total) as total_cobrado, MAX(hora) as ultima_hora, MAX(CASE WHEN parcial=0 THEN 1 ELSE 0 END) as tiene_cierre FROM cobros_turno WHERE fecha IN (${ph}) GROUP BY empleada_id`, F);
  const cervsDia  = get(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha IN (${ph}) AND tipo IN ('venta','salio','manual') AND (categoria='Cervezas' OR categoria IS NULL OR categoria='')`, F);
  const cervsDevol= get(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha IN (${ph}) AND tipo='devol' AND (categoria='Cervezas' OR categoria IS NULL OR categoria='')`, F);
  const porCat    = all(`SELECT COALESCE(categoria,'Cervezas') as cat, SUM(CASE WHEN tipo IN ('venta','salio','manual') THEN cantidad ELSE -cantidad END) as qty FROM bar_movimientos WHERE fecha IN (${ph}) AND tipo IN ('venta','salio','manual','devol') GROUP BY COALESCE(categoria,'Cervezas')`, F);
  const porCerveza= all(`SELECT marca as nombre, COALESCE(categoria,'Cervezas') as categoria, SUM(cantidad) as vendidas, SUM(cantidad*precio_unit) as ingresos FROM bar_movimientos WHERE fecha IN (${ph}) AND tipo IN ('venta','salio','manual') GROUP BY marca`, F);

  // porEmp: repetir F tantas veces como subqueries con fecha
  const F5 = [...F,...F,...F,...F,...F];
  const ph5= [...F,...F,...F,...F,...F].map(()=>'?'); // same count
  const porEmp = all(`
    SELECT e.id, e.nombre,
      COALESCE((SELECT SUM(bm.cantidad) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha IN (${ph}) AND bm.tipo IN ('venta','salio','manual')),0) -
      COALESCE((SELECT SUM(bm.cantidad) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha IN (${ph}) AND bm.tipo='devol'),0) as cervezas,
      COALESCE((SELECT SUM(p.total) FROM pedidos p WHERE p.empleada_id=e.id AND p.fecha IN (${ph}) AND p.cobrado=0),0) as ventas_mesa,
      COALESCE((SELECT SUM(bm.cantidad*bm.precio_unit) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha IN (${ph}) AND bm.tipo IN ('venta','salio','manual')),0) -
      COALESCE((SELECT SUM(bm.cantidad*bm.precio_unit) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha IN (${ph}) AND bm.tipo='devol'),0) as ventas_bar
    FROM empleadas e WHERE e.activa=1
  `, [...F,...F,...F,...F,...F]);

  const movimientos   = all(`SELECT bm.*, e.nombre as emp_nombre FROM bar_movimientos bm LEFT JOIN empleadas e ON e.id=bm.empleada_id WHERE bm.fecha IN (${ph}) AND bm.tipo!='cierre' ORDER BY bm.id ASC`, F);
  const mesasOcupadas = all(`SELECT DISTINCT mesa_id FROM pedidos WHERE fecha IN (${ph}) AND cobrado=0`, F);
  const historialDia  = all(`SELECT * FROM historial_dia WHERE fecha IN (${ph}) ORDER BY id DESC`, F);

  res.json({
    totalDia:   (cajaDia?.t||0) + (cobrosBar?.t||0),
    mesasCob:   cajaDia?.m||0,
    totalCervG: Math.max(0,(cervsDia?.t||0)-(cervsDevol?.t||0)),
    totalMenu:  menuDia?.t||0,
    porCategoria: porCat, porCerveza, porEmp, cobrosEmp, movimientos,
    mesasOcupadas: mesasOcupadas.map(m=>m.mesa_id),
    historialDia
  });
});
// ── ELIMINAR TODOS LOS PEDIDOS DE UNA MESA ───────────────
app.delete('/api/mesas/:id/pedidos', (req, res) => {
  const h = hoy(req);
  const pedidos = all('SELECT * FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0', [req.params.id, h]);
  let totalRestado = 0;
  pedidos.forEach(p => {
    const items = all('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    items.forEach(it => {
      if (it.tipo === 'cerveza') run('UPDATE cervezas SET stock=stock+? WHERE nombre=?', [it.cantidad, it.marca]);
    });
    run('DELETE FROM pedido_items WHERE pedido_id=?', [p.id]);
    totalRestado += p.total || 0;
  });
  run('DELETE FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0', [req.params.id, h]);
  run("UPDATE mesas SET estado='libre', empleada_id=NULL WHERE id=?", [req.params.id]);
  res.json({ ok: true, total_restado: totalRestado, count: pedidos.length });
});

// ── ELIMINAR PEDIDO (para pruebas) ───────────────────────
app.delete('/api/pedidos/:id', (req, res) => {
  const pedido = get('SELECT * FROM pedidos WHERE id=?', [req.params.id]);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  // Revertir stock de cervezas
  const items = all('SELECT * FROM pedido_items WHERE pedido_id=?', [req.params.id]);
  items.forEach(it => {
    if (it.tipo === 'cerveza') run('UPDATE cervezas SET stock=stock+? WHERE nombre=?', [it.cantidad, it.marca]);
  });
  run('DELETE FROM pedido_items WHERE pedido_id=?', [req.params.id]);
  run('DELETE FROM pedidos WHERE id=?', [req.params.id]);
  // Si no quedan pedidos en la mesa, liberarla
  const resto = get('SELECT COUNT(*) as n FROM pedidos WHERE mesa_id=? AND cobrado=0 AND fecha=?', [pedido.mesa_id, hoy(req)]);
  if ((resto?.n || 0) === 0) run("UPDATE mesas SET estado='libre', empleada_id=NULL WHERE id=?", [pedido.mesa_id]);
  res.json({ ok: true, total_restado: pedido.total, mesa_id: pedido.mesa_id });
});

// ── PEDIDOS DE UNA MESA (lista completa) ─────────────────
app.get('/api/mesas/:id/pedidos', (req, res) => {
  const h = hoy(req);
  const pedidos = all(`
    SELECT p.*, e.nombre as emp_nombre
    FROM pedidos p LEFT JOIN empleadas e ON e.id=p.empleada_id
    WHERE p.mesa_id=? AND p.fecha=? ORDER BY p.id DESC
  `, [req.params.id, h]);
  pedidos.forEach(p => {
    p.items = all('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
  });
  res.json(pedidos);
});

// ── DETALLE DE MESA ──────────────────────────────────────
app.get('/api/mesas/:id/detalle', (req, res) => {
  const h = hoy(req);
  const mesa = get('SELECT m.*, e.nombre as emp_nombre FROM mesas m LEFT JOIN empleadas e ON e.id=m.empleada_id WHERE m.id=?', [req.params.id]);
  const pedidos = all('SELECT * FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0 ORDER BY id', [req.params.id, h]);
  const items = [];
  pedidos.forEach(p => {
    const its = all('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    its.forEach(it => items.push({...it, pedido_id:p.id, hora:p.hora}));
  });
  const agrupado = {};
  items.forEach(it => {
    const k = it.nombre;
    if (!agrupado[k]) agrupado[k] = {nombre:it.nombre, tipo:it.tipo, marca:it.marca, cantidad:0, precio_unit:it.precio_unit, subtotal:0, primera_hora:it.hora};
    agrupado[k].cantidad += it.cantidad;
    agrupado[k].subtotal += it.subtotal;
  });
  const total = pedidos.reduce((s,p)=>s+(p.total||0),0);
  res.json({ mesa, items: Object.values(agrupado), total, num_pedidos: pedidos.length });
});

// ── FECHAS DISPONIBLES ───────────────────────────────────
app.get('/api/fechas', (req, res) => {
  const fechas = all(`
    SELECT fecha, COUNT(*) as pedidos, SUM(total) as total
    FROM pedidos WHERE cobrado=1 GROUP BY fecha ORDER BY fecha DESC LIMIT 30
  `);
  const barFechas = all(`
    SELECT fecha, COUNT(*) as movimientos, SUM(cantidad*precio_unit) as total
    FROM bar_movimientos WHERE tipo IN ('venta','salio','manual') GROUP BY fecha ORDER BY fecha DESC LIMIT 30
  `);
  res.json({ fechas, barFechas });
});

// ── RESUMEN DE FECHA ESPECÍFICA ───────────────────────────
app.get('/api/dia/resumen/fecha/:fecha', (req, res) => {
  const h = req.params.fecha;
  const cajaDia  = get(`SELECT COALESCE(SUM(total),0) as t, COUNT(DISTINCT mesa_id) as m FROM pedidos WHERE fecha=? AND cobrado=1`,[h]);
  const menuDia  = get(`SELECT COALESCE(SUM(pi.subtotal),0) as t FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE p.fecha=? AND pi.tipo!='cerveza' AND p.cobrado=1`,[h]);
  const cobrosBar= get(`SELECT COALESCE(SUM(total),0) as t FROM cobros_turno WHERE fecha=?`,[h]);
  const cervsDia = get(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha=? AND tipo IN ('venta','salio','manual')`,[h]);
  const cervsDevol=get(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha=? AND tipo='devol'`,[h]);
  const porCerveza=all(`SELECT marca as nombre, SUM(cantidad) as vendidas, SUM(cantidad*precio_unit) as ingresos FROM bar_movimientos WHERE fecha=? AND tipo IN ('venta','salio','manual') GROUP BY marca ORDER BY vendidas DESC`,[h]);
  const porEmpBar =all(`SELECT e.nombre, SUM(bm.cantidad) as cervezas, SUM(bm.cantidad*bm.precio_unit) as ventas_bar FROM bar_movimientos bm JOIN empleadas e ON e.id=bm.empleada_id WHERE bm.fecha=? AND bm.tipo IN ('venta','salio','manual') GROUP BY e.id`,[h]);
  const pedidosEmp=all(`SELECT e.nombre, SUM(p.total) as ventas_mesa FROM pedidos p JOIN empleadas e ON e.id=p.empleada_id WHERE p.fecha=? AND p.cobrado=1 GROUP BY e.id`,[h]);
  res.json({
    fecha: h,
    totalDia: (cajaDia?.t||0)+(cobrosBar?.t||0),
    mesasCob: cajaDia?.m||0,
    totalCervG: Math.max(0,(cervsDia?.t||0)-(cervsDevol?.t||0)),
    totalMenu: menuDia?.t||0,
    porCerveza, porEmpBar, pedidosEmp
  });
});

// ── RESET DÍA ────────────────────────────────────────────
app.delete('/api/dia/reset', (req, res) => {
  const h = hoy(req);
  try {
    // Borrar TODOS los pedidos no cobrados (sin filtro de fecha)
    const pedidosPend = all('SELECT id FROM pedidos WHERE cobrado=0');
    pedidosPend.forEach(p => run('DELETE FROM pedido_items WHERE pedido_id=?', [p.id]));
    run('DELETE FROM pedidos WHERE cobrado=0');
    // Borrar movimientos de bar de hoy Y de cualquier fecha no cobrada
    run('DELETE FROM bar_movimientos WHERE fecha=?', [h]);
    // También borrar movimientos sin fecha o con fecha rara
    run("DELETE FROM bar_movimientos WHERE fecha IS NULL OR fecha=''");
    try { run('DELETE FROM cobros_turno WHERE fecha=?', [h]); } catch(e2) {}
    try { run('DELETE FROM historial_dia WHERE fecha=?', [h]); } catch(e3) {}
    const cierresHoy = all("SELECT id FROM cierres_caja WHERE date(creado_en)=?", [h]);
    cierresHoy.forEach(c => {
      run('DELETE FROM cierre_empleadas WHERE cierre_id=?', [c.id]);
      run('DELETE FROM cierre_cervezas WHERE cierre_id=?', [c.id]);
      run('DELETE FROM cierre_platos WHERE cierre_id=?', [c.id]);
      run('DELETE FROM cierres_caja WHERE id=?', [c.id]);
    });
    run('UPDATE mesas SET estado=?, empleada_id=NULL WHERE 1=1', ['libre']);
    res.json({ ok: true, fecha: h });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── INICIO ───────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🌸 ==========================================');
  console.log('   CARIÑO BONITO — Sistema de Gestión');
  console.log('🌸 ==========================================');
  console.log(`✅ Puerto: ${PORT}`);
  console.log(`📦 Volume: ${process.env.RAILWAY_VOLUME_MOUNT_PATH || 'local'}`);
  console.log('🌸 ==========================================\n');
});
