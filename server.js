const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getDB, run, all, get, insert, runBatch, runBatchImmediate } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function hoy()  { return new Date().toISOString().split('T')[0]; }
function hora() { return new Date().toTimeString().slice(0,5); }

// Helper: convierte ? → $1,$2,... para Postgres
function pg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ── EMPLEADAS ────────────────────────────────────────────
app.get('/api/empleadas', async (_,res) => {
  try { res.json(await all('SELECT * FROM empleadas WHERE activa=1 ORDER BY id')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/empleadas', async (req,res) => {
  try {
    const {nombre,color,turno,entrada,salida,rol} = req.body;
    const id = await insert(pg('INSERT INTO empleadas (nombre,color,turno,entrada,salida,rol) VALUES (?,?,?,?,?,?)'),
      [nombre,color,turno,entrada,salida,rol]);
    res.json({id,nombre,color,turno,entrada,salida,rol});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.put('/api/empleadas/:id', async (req,res) => {
  try {
    const {nombre,color,turno,entrada,salida,rol} = req.body;
    await run(pg('UPDATE empleadas SET nombre=?,color=?,turno=?,entrada=?,salida=?,rol=? WHERE id=?'),
      [nombre,color,turno,entrada,salida,rol,req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete('/api/empleadas/:id', async (req,res) => {
  try {
    await run(pg('UPDATE empleadas SET activa=0 WHERE id=?'),[req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── CERVEZAS ─────────────────────────────────────────────
app.get('/api/cervezas', async (_,res) => {
  try {
    const rows = await all('SELECT * FROM cervezas WHERE activa=1 ORDER BY id');
    const h = hoy();
    const movTotales = await all(pg(`
      SELECT cerveza_id,
        SUM(CASE WHEN tipo != 'devol' THEN cantidad ELSE 0 END) as out_qty,
        SUM(CASE WHEN tipo  = 'devol' THEN cantidad ELSE 0 END) as dev_qty
      FROM bar_movimientos WHERE fecha=? GROUP BY cerveza_id
    `), [h]);
    const movMap = {};
    movTotales.forEach(r => { movMap[r.cerveza_id] = r; });

    const pedTotales = await all(pg(`
      SELECT pi.marca, SUM(pi.cantidad) as qty
      FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id
      WHERE pi.tipo='cerveza' AND p.fecha=? GROUP BY pi.marca
    `), [h]);
    const pedMap = {};
    pedTotales.forEach(r => { pedMap[r.marca] = parseInt(r.qty)||0; });

    rows.forEach(c => {
      c.precio = parseFloat(c.precio)||0;
      c.stock  = parseInt(c.stock)||0;
      const mov = movMap[c.id] || {};
      c.vendidas_hoy = Math.max(0, (parseInt(mov.out_qty)||0) + (pedMap[c.nombre]||0) - (parseInt(mov.dev_qty)||0));
    });
    res.json(rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/cervezas', async (req,res) => {
  try {
    const {nombre,icon} = req.body;
    const precio = parseFloat(req.body.precio)||0;
    const stock  = parseInt(req.body.stock)||24;
    const id = await insert(pg('INSERT INTO cervezas (nombre,precio,icon,stock) VALUES (?,?,?,?)'),[nombre,precio,icon||'🍺',stock]);
    res.json({id,nombre,precio,icon,stock});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.put('/api/cervezas/:id', async (req,res) => {
  try {
    const {nombre} = req.body;
    const precio = parseFloat(req.body.precio)||0;
    const stock  = parseInt(req.body.stock)||0;
    await run(pg('UPDATE cervezas SET nombre=?,precio=?,stock=? WHERE id=?'),[nombre,precio,stock,req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete('/api/cervezas/:id', async (req,res) => {
  try {
    await run(pg('UPDATE cervezas SET activa=0 WHERE id=?'),[req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── PLATOS ───────────────────────────────────────────────
app.get('/api/platos', async (_,res) => {
  try { res.json(await all('SELECT * FROM platos WHERE activo=1 ORDER BY categoria,nombre')); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/platos', async (req,res) => {
  try {
    const {nombre,categoria} = req.body;
    const precio = parseFloat(req.body.precio)||0;
    const id = await insert(pg('INSERT INTO platos (nombre,precio,categoria) VALUES (?,?,?)'),[nombre,precio,categoria]);
    res.json({id,nombre,precio,categoria});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.put('/api/platos/:id', async (req,res) => {
  try {
    const {nombre,categoria} = req.body;
    const precio = parseFloat(req.body.precio)||0;
    await run(pg('UPDATE platos SET nombre=?,precio=?,categoria=? WHERE id=?'),[nombre,precio,categoria,req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.delete('/api/platos/:id', async (req,res) => {
  try {
    await run(pg('UPDATE platos SET activo=0 WHERE id=?'),[req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── MESAS ────────────────────────────────────────────────
app.get('/api/mesas', async (_,res) => {
  try {
    const mesas = await all('SELECT m.*, e.nombre as empleada_nombre, e.color as empleada_color FROM mesas m LEFT JOIN empleadas e ON e.id=m.empleada_id ORDER BY m.id');
    const h = hoy();
    const totales = await all(pg('SELECT mesa_id, SUM(total) as total_mesa FROM pedidos WHERE fecha=? AND cobrado=0 GROUP BY mesa_id'),[h]);
    const totalMap = {};
    totales.forEach(r => { totalMap[r.mesa_id] = parseFloat(r.total_mesa)||0; });
    const cervMesas = await all(pg(`
      SELECT p.mesa_id, COALESCE(SUM(pi.cantidad),0) as c
      FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id
      WHERE pi.tipo='cerveza' AND p.fecha=? AND p.cobrado=0 GROUP BY p.mesa_id
    `),[h]);
    const cervMap = {};
    cervMesas.forEach(r => { cervMap[r.mesa_id] = parseInt(r.c)||0; });
    mesas.forEach(m => {
      m.total      = totalMap[m.id] || 0;
      m.total_cerv = cervMap[m.id]  || 0;
    });
    res.json(mesas);
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.put('/api/mesas/:id', async (req,res) => {
  try {
    const {estado,empleada_id} = req.body;
    await run(pg('UPDATE mesas SET estado=?,empleada_id=? WHERE id=?'),[estado,empleada_id||null,req.params.id]);
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/mesas/cantidad', async (req,res) => {
  try {
    const {cantidad} = req.body;
    const row = await get('SELECT COUNT(*) as n FROM mesas');
    const actual = parseInt(row.n)||0;
    if (cantidad > actual) {
      const ops = [];
      for (let i=actual+1;i<=cantidad;i++) ops.push({ sql:pg('INSERT INTO mesas (id,estado) VALUES (?,?) ON CONFLICT DO NOTHING'), params:[i,'libre'] });
      await runBatch(ops);
    }
    res.json({ok:true,cantidad});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── PEDIDOS ──────────────────────────────────────────────
app.post('/api/pedidos', async (req,res) => {
  try {
    const {mesa_id,empleada_id,items} = req.body;
    items.forEach(i=>{ i.precio_unit=parseFloat(i.precio_unit)||0; i.subtotal=i.precio_unit*(parseInt(i.cantidad)||1); });
    const total = items.reduce((s,i)=>s+(i.subtotal||0),0);
    const h=hoy(), hr=hora();

    const pedido_id = await insert(pg('INSERT INTO pedidos (mesa_id,empleada_id,fecha,hora,total) VALUES (?,?,?,?,?)'),[mesa_id,empleada_id||null,h,hr,total]);

    // Cachear cervezas
    const marcasCerv = [...new Set(items.filter(i=>i.tipo==='cerveza').map(i=>i.marca))];
    const cervCache = {};
    for (const marca of marcasCerv) {
      const c = await get(pg('SELECT id,precio FROM cervezas WHERE nombre=?'),[marca]);
      if (c) cervCache[marca] = c;
    }

    const ops = [];
    items.forEach(item => {
      ops.push({ sql:pg('INSERT INTO pedido_items (pedido_id,tipo,nombre,marca,cantidad,precio_unit,subtotal) VALUES (?,?,?,?,?,?,?)'),
        params:[pedido_id,item.tipo,item.nombre,item.marca||null,item.cantidad,item.precio_unit,item.subtotal] });
      if (item.tipo==='cerveza') {
        ops.push({ sql:pg('UPDATE cervezas SET stock=GREATEST(0,stock-?) WHERE nombre=?'), params:[item.cantidad,item.marca] });
        const cerv = cervCache[item.marca];
        if (cerv) ops.push({ sql:pg('INSERT INTO bar_movimientos (empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,fecha,hora) VALUES (?,?,?,?,?,?,?,?,?)'),
          params:[empleada_id||null,mesa_id,cerv.id,item.marca,item.cantidad,'venta',cerv.precio,h,hr] });
      }
    });
    ops.push({ sql:pg('UPDATE mesas SET estado=?,empleada_id=? WHERE id=?'), params:['ocupada',empleada_id||null,mesa_id] });
    await runBatch(ops);
    res.json({id:pedido_id,total});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/pedidos/cobrar-mesa', async (req,res) => {
  try {
    const {mesa_id} = req.body;
    const h=hoy();
    const peds = await all(pg('SELECT total FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0'),[mesa_id,h]);
    const totalMesa = peds.reduce((s,p)=>s+(parseFloat(p.total)||0),0);
    await runBatch([
      { sql:pg('UPDATE pedidos SET cobrado=1 WHERE mesa_id=? AND fecha=? AND cobrado=0'), params:[mesa_id,h] },
      { sql:pg("UPDATE mesas SET estado=?,empleada_id=NULL WHERE id=?"), params:['libre',mesa_id] },
    ]);
    res.json({ok:true,total:totalMesa});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── BAR ──────────────────────────────────────────────────
app.get('/api/bar/movimientos', async (_,res) => {
  try {
    const h=hoy();
    res.json(await all(pg('SELECT bm.*, e.nombre as emp_nombre, e.color as emp_color FROM bar_movimientos bm LEFT JOIN empleadas e ON e.id=bm.empleada_id WHERE bm.fecha=? ORDER BY bm.id DESC LIMIT 100'),[h]));
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/bar/movimientos', async (req,res) => {
  try {
    const {empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit} = req.body;
    const h=hoy(), hr=hora();
    const id = await insert(pg('INSERT INTO bar_movimientos (empleada_id,mesa_id,cerveza_id,marca,cantidad,tipo,precio_unit,fecha,hora) VALUES (?,?,?,?,?,?,?,?,?)'),
      [empleada_id,mesa_id||null,cerveza_id||null,marca,cantidad,tipo,precio_unit||0,h,hr]);
    if (tipo!=='devol') await run(pg('UPDATE cervezas SET stock=GREATEST(0,stock-?) WHERE id=?'),[cantidad,cerveza_id]);
    else                await run(pg('UPDATE cervezas SET stock=stock+? WHERE id=?'),[cantidad,cerveza_id]);
    res.json({id});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/bar/turno/:empleada_id', async (req,res) => {
  try {
    const h=hoy(), eid=req.params.empleada_id;
    const out  = await get(pg("SELECT COALESCE(SUM(cantidad*precio_unit),0) as t, COALESCE(SUM(cantidad),0) as q FROM bar_movimientos WHERE empleada_id=? AND tipo!=? AND fecha=?"),[eid,'devol',h]);
    const dev  = await get(pg("SELECT COALESCE(SUM(cantidad*precio_unit),0) as t, COALESCE(SUM(cantidad),0) as q FROM bar_movimientos WHERE empleada_id=? AND tipo=? AND fecha=?"),[eid,'devol',h]);
    const mesa = await get(pg("SELECT COALESCE(SUM(total),0) as t FROM pedidos WHERE empleada_id=? AND fecha=? AND cobrado=0"),[eid,h]);
    const movs = await all(pg("SELECT hora,marca,cantidad,tipo FROM bar_movimientos WHERE empleada_id=? AND fecha=? ORDER BY id DESC LIMIT 10"),[eid,h]);
    const porMarca = (await all(pg("SELECT marca, SUM(CASE WHEN tipo!=? THEN cantidad ELSE -cantidad END) as qty, MAX(precio_unit) as precio FROM bar_movimientos WHERE empleada_id=? AND fecha=? GROUP BY marca"),['devol',eid,h])).filter(r=>parseInt(r.qty)>0);
    res.json({
      total: ((parseFloat(out?.t)||0)-(parseFloat(dev?.t)||0))+(parseFloat(mesa?.t)||0),
      cervezas: (parseInt(out?.q)||0)-(parseInt(dev?.q)||0),
      movimientos: movs,
      porMarca,
      mesaTotal: parseFloat(mesa?.t)||0
    });
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/api/bar/cobrar-turno', async (req,res) => {
  try {
    const {empleada_id} = req.body;
    const h=hoy();
    await run(pg('UPDATE pedidos SET cobrado=1 WHERE empleada_id=? AND fecha=? AND cobrado=0'),[empleada_id,h]);
    res.json({ok:true,hora:hora()});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── CAJA ─────────────────────────────────────────────────
app.post('/api/caja/cerrar', async (req,res) => {
  try {
    const {totalDia,mesasCob,totalCervG,totalMenu,porEmpleada,porCerveza,porPlato} = req.body;
    const fecha = new Date().toLocaleDateString('es',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const ahora = new Date().toISOString();
    const cid = await insert(pg('INSERT INTO cierres_caja (fecha,total_dia,total_mesas,total_cervezas,total_menu,creado_en) VALUES (?,?,?,?,?,?)'),
      [fecha,totalDia,mesasCob,totalCervG,totalMenu,ahora]);
    const ops = [];
    (porEmpleada||[]).forEach(e => ops.push({ sql:pg('INSERT INTO cierre_empleadas (cierre_id,empleada_nombre,cervezas,ventas) VALUES (?,?,?,?)'), params:[cid,e.nombre,e.cervezas,e.ventas] }));
    (porCerveza||[]).forEach(c => ops.push({ sql:pg('INSERT INTO cierre_cervezas (cierre_id,cerveza_nombre,vendidas,ingresos) VALUES (?,?,?,?)'), params:[cid,c.nombre,c.vendidas,c.ingresos] }));
    (porPlato||[]).forEach(p => ops.push({ sql:pg('INSERT INTO cierre_platos (cierre_id,plato_nombre,cantidad,ingresos) VALUES (?,?,?,?)'), params:[cid,p.nombre,p.cantidad,p.ingresos] }));
    if (ops.length) await runBatchImmediate(ops);
    res.json({ok:true,cierre_id:cid});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── ANALYTICS ────────────────────────────────────────────
app.get('/api/analytics', async (req,res) => {
  try {
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
    const cierres = await all(`SELECT * FROM cierres_caja WHERE 1=1 ${filtro} ORDER BY id DESC`);
    const dias = await Promise.all(cierres.map(async c=>({
      ...c,
      porEmpleada: await all(pg('SELECT * FROM cierre_empleadas WHERE cierre_id=?'),[c.id]),
      porCerveza:  await all(pg('SELECT * FROM cierre_cervezas  WHERE cierre_id=? ORDER BY vendidas DESC'),[c.id]),
      porPlato:    await all(pg('SELECT * FROM cierre_platos     WHERE cierre_id=? ORDER BY ingresos DESC'),[c.id]),
    })));
    const rankCerv = await all(`SELECT cerveza_nombre as nombre, SUM(vendidas) as total_qty, SUM(ingresos) as total_ing FROM cierre_cervezas cc JOIN cierres_caja c ON c.id=cc.cierre_id WHERE 1=1 ${filtro} GROUP BY cerveza_nombre ORDER BY total_qty DESC LIMIT 10`);
    const rankPlat = await all(`SELECT plato_nombre as nombre, SUM(cantidad) as total_qty, SUM(ingresos) as total_ing FROM cierre_platos cp JOIN cierres_caja c ON c.id=cp.cierre_id WHERE 1=1 ${filtro} GROUP BY plato_nombre ORDER BY total_ing DESC LIMIT 10`);
    const rankEmp  = await all(`SELECT empleada_nombre as nombre, SUM(cervezas) as total_cerv, SUM(ventas) as total_ventas, COUNT(*) as dias FROM cierre_empleadas ce JOIN cierres_caja c ON c.id=ce.cierre_id WHERE 1=1 ${filtro} GROUP BY empleada_nombre ORDER BY total_ventas DESC`);
    res.json({dias,rankCerv,rankPlat,rankEmp});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── RESUMEN DEL DÍA ──────────────────────────────────────
app.get('/api/dia/resumen', async (req, res) => {
  try {
    const h = hoy();
    const cajaDia    = await get(pg(`SELECT COALESCE(SUM(total),0) as t, COUNT(DISTINCT mesa_id) as m FROM pedidos WHERE fecha=? AND cobrado=1`),[h]);
    const cervsDia   = await get(pg(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha=? AND tipo!='devol'`),[h]);
    const cervsDevol = await get(pg(`SELECT COALESCE(SUM(cantidad),0) as t FROM bar_movimientos WHERE fecha=? AND tipo='devol'`),[h]);
    const menuDia    = await get(pg(`SELECT COALESCE(SUM(pi.subtotal),0) as t FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE p.fecha=? AND pi.tipo!='cerveza' AND p.cobrado=1`),[h]);
    const porEmp = await all(pg(`
      SELECT e.id, e.nombre,
        COALESCE((SELECT SUM(bm.cantidad) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha=? AND bm.tipo!='devol'),0) -
        COALESCE((SELECT SUM(bm.cantidad) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha=? AND bm.tipo='devol'),0) as cervezas,
        COALESCE((SELECT SUM(p.total) FROM pedidos p WHERE p.empleada_id=e.id AND p.fecha=? AND p.cobrado=0),0) as ventas_mesa,
        COALESCE((SELECT SUM(bm.cantidad*bm.precio_unit) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha=? AND bm.tipo!='devol'),0) -
        COALESCE((SELECT SUM(bm.cantidad*bm.precio_unit) FROM bar_movimientos bm WHERE bm.empleada_id=e.id AND bm.fecha=? AND bm.tipo='devol'),0) as ventas_bar
      FROM empleadas e WHERE e.activa=1
    `),[h,h,h,h,h]);
    const movimientos = await all(pg(`
      SELECT bm.*, e.nombre as emp_nombre FROM bar_movimientos bm
      LEFT JOIN empleadas e ON e.id=bm.empleada_id WHERE bm.fecha=? ORDER BY bm.id ASC
    `),[h]);
    const mesasOcupadas = await all(pg(`SELECT DISTINCT mesa_id FROM pedidos WHERE fecha=? AND cobrado=0`),[h]);
    res.json({
      totalDia: parseFloat(cajaDia?.t)||0,
      mesasCob: parseInt(cajaDia?.m)||0,
      totalCervG: Math.max(0,(parseInt(cervsDia?.t)||0)-(parseInt(cervsDevol?.t)||0)),
      totalMenu: parseFloat(menuDia?.t)||0,
      porEmp,
      movimientos,
      mesasOcupadas: mesasOcupadas.map(m=>m.mesa_id)
    });
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── DETALLE DE MESA ──────────────────────────────────────
app.get('/api/mesas/:id/detalle', async (req, res) => {
  try {
    const h = hoy();
    const mesa    = await get(pg('SELECT m.*, e.nombre as emp_nombre FROM mesas m LEFT JOIN empleadas e ON e.id=m.empleada_id WHERE m.id=?'),[req.params.id]);
    const pedidos = await all(pg('SELECT * FROM pedidos WHERE mesa_id=? AND fecha=? AND cobrado=0 ORDER BY id'),[req.params.id,h]);
    if (pedidos.length===0) return res.json({mesa,items:[],total:0,num_pedidos:0});
    const ids = pedidos.map(p=>p.id);
    const placeholders = ids.map((_,i)=>`$${i+1}`).join(',');
    const allItems = await all(`SELECT pi.*, p.hora FROM pedido_items pi JOIN pedidos p ON p.id=pi.pedido_id WHERE pi.pedido_id IN (${placeholders})`,ids);
    const agrupado = {};
    allItems.forEach(it => {
      const k = it.nombre;
      if (!agrupado[k]) agrupado[k]={nombre:it.nombre,tipo:it.tipo,marca:it.marca,cantidad:0,precio_unit:it.precio_unit,subtotal:0,primera_hora:it.hora};
      agrupado[k].cantidad += parseInt(it.cantidad)||0;
      agrupado[k].subtotal += parseFloat(it.subtotal)||0;
    });
    const total = pedidos.reduce((s,p)=>s+(parseFloat(p.total)||0),0);
    res.json({mesa,items:Object.values(agrupado),total,num_pedidos:pedidos.length});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── BORRAR DATOS DE HOY (modo prueba) ───────────────────
app.delete('/api/dia/reset', async (req, res) => {
  try {
    const h = hoy();
    const pedidosHoy = await all(pg('SELECT id FROM pedidos WHERE fecha=?'),[h]);
    const ops = [];
    pedidosHoy.forEach(p => ops.push({sql:pg('DELETE FROM pedido_items WHERE pedido_id=?'),params:[p.id]}));
    ops.push({sql:pg('DELETE FROM pedidos WHERE fecha=?'),params:[h]});
    ops.push({sql:pg('DELETE FROM bar_movimientos WHERE fecha=?'),params:[h]});
    const cierresHoy = await all(pg("SELECT id FROM cierres_caja WHERE date(creado_en)=?"),[h]);
    cierresHoy.forEach(c => {
      ops.push({sql:pg('DELETE FROM cierre_empleadas WHERE cierre_id=?'),params:[c.id]});
      ops.push({sql:pg('DELETE FROM cierre_cervezas WHERE cierre_id=?'), params:[c.id]});
      ops.push({sql:pg('DELETE FROM cierre_platos WHERE cierre_id=?'),   params:[c.id]});
      ops.push({sql:pg('DELETE FROM cierres_caja WHERE id=?'),           params:[c.id]});
    });
    ops.push({sql:pg("UPDATE mesas SET estado=?, empleada_id=NULL WHERE 1=1"),params:['libre']});
    await runBatchImmediate(ops);
    res.json({ok:true,fecha:h});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// ── INICIO ───────────────────────────────────────────────
getDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🌸 ==========================================');
    console.log('   CARIÑO BONITO — Sistema de Gestión');
    console.log('🌸 ==========================================');
    console.log(`✅ Puerto: ${PORT}`);
    console.log(`✅ DB: PostgreSQL (Railway)`);
    console.log('🌸 ==========================================\n');
  });
}).catch(err => {
  console.error('❌ Error iniciando base de datos:', err);
  process.exit(1);
});
