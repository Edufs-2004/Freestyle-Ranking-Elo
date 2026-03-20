import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

let torneoEditandoId = null; let fechaOriginalEdicion = null;
let batallaEditandoId = null; let listaMcsGlobal = []; let torneoAbiertoId = null; let torneoAbiertoNombre = "";
let torneosGlobal = []; // Array para almacenar torneos y no llamar a la base de datos en cada filtro

async function cargarMcsParaEdicion() {
    const {data} = await supabase.from('competidores').select('id, aka').order('aka');
    listaMcsGlobal = data;
    let opts = ''; data.forEach(mc => opts += `<option value="${mc.id}">${mc.aka}</option>`);
    document.getElementById('editBatMC1').innerHTML = opts;
    document.getElementById('editBatMC2').innerHTML = opts;
}

// Carga principal desde la Base de Datos
async function cargarTorneos() {
    const { data: torneos, error } = await supabase.from('torneos').select('*').order('fecha_evento', { ascending: false });
    if (error) return console.error(error);
    torneosGlobal = torneos; 
    aplicarFiltroMuseo(); // Aplica el filtro por defecto y dibuja la tabla
}

// Nueva función de Filtrado
function aplicarFiltroMuseo() {
    let f = document.getElementById('filtroFranqMuseo').value;
    let d = document.getElementById('filtroDesdeMuseo').value;
    let h = document.getElementById('filtroHastaMuseo').value;

    let franquiciasPermitidas = f ? obtenerFranquiciasValidas(f) : ['TODAS'];

    let filtrados = torneosGlobal.filter(t => {
        let okF = (!f || f === 'TODAS') ? true : franquiciasPermitidas.includes(t.franquicia);
        let okD = (!d) ? true : t.fecha_evento >= d;
        let okH = (!h) ? true : t.fecha_evento <= h;
        return okF && okD && okH;
    });

    renderizarTablaTorneos(filtrados);
}

// Función encargada solo de dibujar el HTML
function renderizarTablaTorneos(listaTorneos) {
    let html = '';
    listaTorneos.forEach(t => {
        let colorEstado = t.estado === 'Finalizado' ? '#2ed573' : '#ffa502';
        html += `<tr><td>${t.fecha_evento || 'Sin fecha'}</td><td><strong>${t.franquicia || '-'}</strong></td><td>${t.nombre}</td><td style="color: ${colorEstado}; font-weight: bold;">${t.estado}</td>
            <td><button class="btn-ver" onclick="verTorneo(${t.id}, '${t.nombre}')">👁️</button> <button class="btn-editar" onclick="abrirEdicionTorneo(${t.id}, '${t.nombre}', '${t.franquicia}', '${t.fecha_evento}')">✏️</button> <button class="btn-borrar" onclick="eliminarTorneo(${t.id}, '${t.nombre}')">🗑️</button></td></tr>`;
    });
    document.getElementById('cuerpoTorneos').innerHTML = html || '<tr><td colspan="5" style="text-align:center; color: #aaa;">No se encontraron torneos con estos filtros.</td></tr>';
}

async function eliminarTorneo(id, nombre) {
    if (!confirm(`⚠️ ¿Borrar para siempre el torneo "${nombre}"?\n\nRecuerda Recalcular el Elo después.`)) return;
    document.getElementById('cuerpoTorneos').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ff4757;">Borrando...</td></tr>';
    await supabase.from('batallas').delete().eq('torneo_id', id); await supabase.from('inscripciones').delete().eq('torneo_id', id); await supabase.from('torneos').delete().eq('id', id);
    cargarTorneos();
}

async function repararEloGlobal(silent = false) {
    if (!silent && !confirm("🔄 ¿Iniciar Recálculo Global?")) return;
    let msg = document.getElementById('msgReparacion'); msg.style.color = "#eccc68"; msg.innerText = "⏳ 1. Reseteando MCs...";

    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingNube = {}; mcs.forEach(mc => { rankingNube[mc.id] = { id: mc.id, elo: 1500, batallas: 0 }; });

    msg.innerText = "⏳ 2. Simulando Línea Temporal...";
    const { data: batallas } = await supabase.from('batallas').select(`*, torneos(fecha_evento)`).order('id', { ascending: true });
    batallas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    for (let b of batallas) {
        if (b.resultado === 'bono') {
            let R1 = rankingNube[b.mc1_id].elo; rankingNube[b.mc1_id].elo += b.cambio_mc1;
            await supabase.from('batallas').update({ elo_previo_mc1: R1, elo_previo_mc2: R1 }).eq('id', b.id);
            continue;
        }

        let R1 = rankingNube[b.mc1_id].elo; let R2 = rankingNube[b.mc2_id].elo;
        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
        
        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
        else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
        else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }

        let p1 = Math.round(K * (S1 - E1) * (bono1 ? 1.2 : 1)); let p2 = Math.round(K * (S2 - E2) * (bono2 ? 1.2 : 1));
        await supabase.from('batallas').update({ elo_previo_mc1: R1, elo_previo_mc2: R2, cambio_mc1: p1, cambio_mc2: p2 }).eq('id', b.id);

        rankingNube[b.mc1_id].elo = R1 + p1; rankingNube[b.mc2_id].elo = R2 + p2;
        rankingNube[b.mc1_id].batallas += 1; rankingNube[b.mc2_id].batallas += 1;
    }

    msg.innerText = "⏳ 3. Guardando puntos...";
    for (const key in rankingNube) {
        let mc = rankingNube[key];
        await supabase.from('competidores').update({ elo_actual: mc.elo, batallas_totales: mc.batallas }).eq('id', mc.id);
    }
    msg.style.color = "#2ed573"; msg.innerText = "✅ ¡Reparado Perfectamente!";
    setTimeout(() => { msg.innerText = ""; }, 3000);
}

async function verTorneo(idTorneo, nombre) {
    torneoAbiertoId = idTorneo; torneoAbiertoNombre = nombre;
    document.getElementById('panelLista').style.display = 'none'; document.getElementById('panelEdicion').style.display = 'none';
    document.getElementById('panelDetalle').style.display = 'block'; document.getElementById('detalleTitulo').innerText = `🏆 ${nombre}`; 
    document.getElementById('contenedorBatallas').innerHTML = '<p>Cargando...</p>';

    const { data: batallas, error } = await supabase.from('batallas').select(`id, fase, resultado, mc1_id, mc2_id`).eq('torneo_id', idTorneo);
    if(error || !batallas || batallas.length === 0) return document.getElementById('contenedorBatallas').innerHTML = '<p>No hay batallas.</p>';

    batallas.sort((a, b) => a.fase.localeCompare(b.fase));
    let mapMcs = {}; listaMcsGlobal.forEach(c => mapMcs[c.id] = c.aka);

    let htmlVisual = '';
    batallas.forEach(b => {
        if(b.resultado === 'bono') return; 
        let n1 = mapMcs[b.mc1_id] || 'Desc'; let n2 = mapMcs[b.mc2_id] || 'Desc';
        let ganoIzquierda = ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado);
        let mc1Final = ganoIzquierda ? `<span class="ganador-text">👑 ${n1}</span>` : n1; let mc2Final = !ganoIzquierda ? `<span class="ganador-text">${n2} 👑</span>` : n2;
        let textoRes = b.resultado.replace('_', ' ').toUpperCase();
        
        htmlVisual += `
        <div class="batalla-item">
            <div style="flex: 1; text-align: right; padding-right: 15px;">${mc1Final}</div>
            <div style="font-size: 12px; color: #aaa; background: #1e1e2f; padding: 5px 10px; border-radius: 10px; text-align:center; min-width: 120px;">[${b.fase}]<br>${textoRes}</div>
            <div style="flex: 1; text-align: left; padding-left: 15px;">${mc2Final}</div>
            <button class="btn-editar" onclick="abrirEdicionBatalla(${b.id}, '${b.fase}', ${b.mc1_id}, ${b.mc2_id}, '${b.resultado}')" style="margin-left:10px; padding: 5px 10px;">⚙️</button>
        </div>`;
    });
    document.getElementById('contenedorBatallas').innerHTML = htmlVisual;
}

function cerrarDetalle() { document.getElementById('panelDetalle').style.display = 'none'; document.getElementById('panelLista').style.display = 'block'; }

// ===================================
// EDICIÓN QUIRÚRGICA DE BATALLAS
// ===================================
function abrirEdicionBatalla(id, fase, mc1, mc2, res) {
    batallaEditandoId = id; document.getElementById('editBatFase').value = fase; document.getElementById('editBatMC1').value = mc1; document.getElementById('editBatMC2').value = mc2; document.getElementById('editBatRes').value = res;
    document.getElementById('overlayEditBat').style.display = 'block'; document.getElementById('modalEditBat').style.display = 'block';
}

function cerrarEdicionBatalla() { document.getElementById('overlayEditBat').style.display = 'none'; document.getElementById('modalEditBat').style.display = 'none'; }

async function guardarEdicionBatalla(recalcular = true) {
    let f = document.getElementById('editBatFase').value.trim();
    let m1 = parseInt(document.getElementById('editBatMC1').value);
    let m2 = parseInt(document.getElementById('editBatMC2').value);
    let r = document.getElementById('editBatRes').value;

    if(!f || !m1 || !m2) return alert("Completa todos los campos");
    if(m1 === m2) return alert("Un MC no puede batallar consigo mismo.");

    await supabase.from('batallas').update({ fase: f, mc1_id: m1, mc2_id: m2, resultado: r }).eq('id', batallaEditandoId);

    if (recalcular) {
        document.getElementById('modalEditBat').innerHTML = '<h3 style="text-align:center; color:#1e90ff;">⏳ Guardando y Recalculando Línea Temporal...</h3>';
        await repararEloGlobal(true);
    }

    cerrarEdicionBatalla();
    
    document.getElementById('modalEditBat').innerHTML = `
        <h2 style="margin-top:0; color:#1e90ff;">⚙️ Editor Quirúrgico</h2>
        <p style="font-size: 13px; color:#aaa;">Usa <b>"Aplicar"</b> para cambios rápidos (requiere recálculo manual después), o <b>"Aplicar y Recalcular"</b> para arreglar todo al instante.</p>
        <label style="font-size: 12px; color: #eccc68; font-weight: bold;">Fase (Puedes escribir para reordenar llaves o jornadas):</label> <input type="text" id="editBatFase">
        <label style="font-size: 12px; color: #eccc68; font-weight: bold;">MC Izquierdo:</label> <select id="editBatMC1"></select>
        <label style="font-size: 12px; color: #eccc68; font-weight: bold;">MC Derecho:</label> <select id="editBatMC2"></select>
        <label style="font-size: 12px; color: #eccc68; font-weight: bold;">Resultado:</label>
        <select id="editBatRes"><option value="victoria">Victoria Normal</option><option value="victoria_replica">Victoria tras Réplica</option><option value="derrota_replica">Derrota tras Réplica</option><option value="derrota">Derrota Normal</option><option value="victoria_total">Victoria Total</option><option value="derrota_total">Derrota Total</option></select>
        <div style="display:flex; gap:10px; margin-top:20px;">
            <button style="background:#eccc68; color:#2f3542; flex:1; font-size:12px;" onclick="guardarEdicionBatalla(false)">💾 Aplicar</button>
            <button style="background:#2ed573; flex:1; font-size:12px;" onclick="guardarEdicionBatalla(true)">🔄 Aplicar y Recalcular</button>
            <button style="background:#ff4757; flex:1; font-size:12px;" onclick="cerrarEdicionBatalla()">❌ Cancelar</button>
        </div>`;
    
    cargarMcsParaEdicion(); 
    verTorneo(torneoAbiertoId, torneoAbiertoNombre);
}

// ===================================
// SISTEMA DE FRANQUICIAS (CARPETAS)
// ===================================
async function cargarFranquiciasPanel() {
    const { data } = await supabase.from('franquicias').select('*').order('nombre');
    let selectPadre = document.getElementById('nuevaFranqPadre'); let principales = data.filter(f => !f.padre);
    let htmlPadres = '<option value="">Ninguna (Carpeta Principal)</option>';
    principales.forEach(p => htmlPadres += `<option value="${p.nombre}">${p.nombre}</option>`); selectPadre.innerHTML = htmlPadres;

    let html = '';
    principales.forEach(p => {
        html += `<li style="display:flex; justify-content:space-between; margin-bottom:5px; background:#2a2a40; padding:8px; border-radius:4px; border-left: 4px solid #1e90ff;"><strong>📂 ${p.nombre}</strong> <button class="btn-borrar" onclick="borrarFranquicia(${p.id})" style="background:transparent; color:#ff4757; padding:0; font-size:16px;">✖</button></li>`;
        let hijos = data.filter(f => f.padre === p.nombre);
        hijos.forEach(h => { html += `<li style="display:flex; justify-content:space-between; margin-bottom:5px; margin-left:20px; background:#2f3542; padding:8px; border-radius:4px; border-left: 2px solid #eccc68;">↳ ${h.nombre} <button class="btn-borrar" onclick="borrarFranquicia(${h.id})" style="background:transparent; color:#ff4757; padding:0; font-size:16px;">✖</button></li>`; });
    });
    document.getElementById('listaFranq').innerHTML = html; 
    
    cargarFranquiciasSelect('editFranqTorneo', false);
    cargarFranquiciasSelect('filtroFranqMuseo', true); // Actualizamos también el nuevo filtro
}

async function agregarFranquicia() {
    let nom = document.getElementById('nuevaFranq').value.trim(); let padre = document.getElementById('nuevaFranqPadre').value;
    if(!nom) return; let obj = { nombre: nom }; if (padre !== "") obj.padre = padre;
    await supabase.from('franquicias').insert([obj]); document.getElementById('nuevaFranq').value = ''; cargarFranquiciasPanel();
}

async function borrarFranquicia(id) {
    if(!confirm("¿Borrar esta franquicia?")) return;
    await supabase.from('franquicias').delete().eq('id', id); cargarFranquiciasPanel();
}

async function abrirEdicionTorneo(id, nombre, franquicia, fecha) {
    torneoEditandoId = id; fechaOriginalEdicion = fecha;
    document.getElementById('editNomTorneo').value = nombre; document.getElementById('editFechaTorneo').value = fecha;
    setTimeout(() => { document.getElementById('editFranqTorneo').value = franquicia; }, 100);
    document.getElementById('panelLista').style.display = 'none'; document.getElementById('panelEdicion').style.display = 'block';
}

async function guardarEdicionTorneo() {
    let n = document.getElementById('editNomTorneo').value.trim(); let f = document.getElementById('editFranqTorneo').value; let d = document.getElementById('editFechaTorneo').value;
    if(!n || !f || !d) return alert("Completa todos los campos");
    const {error} = await supabase.from('torneos').update({nombre: n, franquicia: f, fecha_evento: d}).eq('id', torneoEditandoId);
    if(error) return alert("Error al actualizar");
    cerrarEdicionTorneo();
    if (d !== fechaOriginalEdicion) { alert("Has cambiado la fecha. Recalculando línea temporal..."); await repararEloGlobal(true); } else { alert("Actualizado correctamente."); }
    cargarTorneos();
}
function cerrarEdicionTorneo() { document.getElementById('panelEdicion').style.display = 'none'; document.getElementById('panelLista').style.display = 'block'; }

window.verTorneo = verTorneo; window.eliminarTorneo = eliminarTorneo; window.repararEloGlobal = repararEloGlobal; window.cerrarDetalle = cerrarDetalle; window.agregarFranquicia = agregarFranquicia; window.borrarFranquicia = borrarFranquicia; window.abrirEdicionTorneo = abrirEdicionTorneo; window.guardarEdicionTorneo = guardarEdicionTorneo; window.cerrarEdicionTorneo = cerrarEdicionTorneo; window.abrirEdicionBatalla = abrirEdicionBatalla; window.cerrarEdicionBatalla = cerrarEdicionBatalla; window.guardarEdicionBatalla = guardarEdicionBatalla; 
window.aplicarFiltroMuseo = aplicarFiltroMuseo; // Exportamos la nueva función

configurarSesion();
cargarMcsParaEdicion();
cargarTorneos();
cargarFranquiciasPanel();
cargarFranquiciasSelect('filtroFranqMuseo', true); // Inicializamos el filtro con TODAS