import { supabase, cargarFranquiciasSelect } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

let torneoEditandoId = null;
let fechaOriginalEdicion = null;

async function cargarTorneos() {
    const { data: torneos, error } = await supabase.from('torneos').select('*').order('fecha_evento', { ascending: false });
    if (error) return console.error(error);
    let html = '';
    torneos.forEach(t => {
        let colorEstado = t.estado === 'Finalizado' ? '#2ed573' : '#ffa502';
        html += `<tr>
            <td>${t.fecha_evento || 'Sin fecha'}</td>
            <td><strong>${t.franquicia || '-'}</strong></td>
            <td>${t.nombre}</td>
            <td style="color: ${colorEstado}; font-weight: bold;">${t.estado}</td>
            <td>
                <button class="btn-ver" onclick="verTorneo(${t.id}, '${t.nombre}')">👁️</button>
                <button class="btn-editar" onclick="abrirEdicionTorneo(${t.id}, '${t.nombre}', '${t.franquicia}', '${t.fecha_evento}')">✏️</button>
                <button class="btn-borrar" onclick="eliminarTorneo(${t.id}, '${t.nombre}')">🗑️</button>
            </td>
        </tr>`;
    });
    document.getElementById('cuerpoTorneos').innerHTML = html || '<tr><td colspan="5" style="text-align:center;">No hay torneos registrados.</td></tr>';
}

async function eliminarTorneo(id, nombre) {
    if (!confirm(`⚠️ ¿Borrar para siempre el torneo "${nombre}"?\n\nRecuerda Recalcular el Elo después.`)) return;
    document.getElementById('cuerpoTorneos').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ff4757;">Borrando...</td></tr>';
    await supabase.from('batallas').delete().eq('torneo_id', id);
    await supabase.from('inscripciones').delete().eq('torneo_id', id);
    await supabase.from('torneos').delete().eq('id', id);
    cargarTorneos();
}

async function repararEloGlobal(silent = false) {
    if (!silent && !confirm("🔄 ¿Iniciar Recálculo Global?")) return;
    let msg = document.getElementById('msgReparacion'); msg.style.color = "#eccc68"; msg.innerText = "⏳ 1. Reseteando MCs...";

    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingNube = {}; mcs.forEach(mc => { rankingNube[mc.id] = { id: mc.id, elo: 1500, batallas: 0 }; });

    msg.innerText = "⏳ 2. Simulando y reparando...";
    const { data: batallas } = await supabase.from('batallas').select(`*, torneos(fecha_evento)`).order('id', { ascending: true });
    batallas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    for (let b of batallas) {
        if (b.resultado === 'bono') {
            let R1 = rankingNube[b.mc1_id].elo;
            rankingNube[b.mc1_id].elo += b.cambio_mc1;
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
    msg.style.color = "#2ed573"; msg.innerText = "✅ ¡Reparado!";
}

async function verTorneo(idTorneo, nombre) {
    document.getElementById('panelLista').style.display = 'none'; document.getElementById('panelEdicion').style.display = 'none';
    document.getElementById('panelDetalle').style.display = 'block';
    document.getElementById('detalleTitulo').innerText = `🏆 ${nombre}`; document.getElementById('contenedorBatallas').innerHTML = '<p>Cargando...</p>';

    const { data: batallas, error } = await supabase.from('batallas').select(`fase, resultado, mc1_id, mc2_id`).eq('torneo_id', idTorneo);
    if(error || !batallas || batallas.length === 0) return document.getElementById('contenedorBatallas').innerHTML = '<p>No hay batallas.</p>';

    const { data: competidores } = await supabase.from('competidores').select('id, aka');
    let mapMcs = {}; competidores.forEach(c => mapMcs[c.id] = c.aka);

    let htmlVisual = '';
    batallas.forEach(b => {
        if(b.resultado === 'bono') return;
        let n1 = mapMcs[b.mc1_id] || 'Desc'; let n2 = mapMcs[b.mc2_id] || 'Desc';
        let ganoIzquierda = ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado);
        let mc1Final = ganoIzquierda ? `<span class="ganador-text">👑 ${n1}</span>` : n1;
        let mc2Final = !ganoIzquierda ? `<span class="ganador-text">${n2} 👑</span>` : n2;
        let textoRes = b.resultado.replace('_', ' ').toUpperCase();
        htmlVisual += `<div class="batalla-item"><div style="flex: 1; text-align: right; padding-right: 15px;">${mc1Final}</div><div style="font-size: 12px; color: #aaa; background: #1e1e2f; padding: 5px 10px; border-radius: 10px;">[${b.fase}] ${textoRes}</div><div style="flex: 1; text-align: left; padding-left: 15px;">${mc2Final}</div></div>`;
    });
    document.getElementById('contenedorBatallas').innerHTML = htmlVisual;
}

function cerrarDetalle() { document.getElementById('panelDetalle').style.display = 'none'; document.getElementById('panelLista').style.display = 'block'; }

// ===================================
// SISTEMA DE FRANQUICIAS Y EDICIÓN (V2.1.0)
// ===================================
async function cargarFranquiciasPanel() {
    const { data } = await supabase.from('franquicias').select('*').order('nombre');
    let html = '';
    data.forEach(f => {
        html += `<li style="display:flex; justify-content:space-between; margin-bottom:10px; background:#2f3542; padding:8px; border-radius:4px;">
            ${f.nombre} <button class="btn-borrar" onclick="borrarFranquicia(${f.id})" style="background:transparent; color:#ff4757; width:auto; padding:0; margin:0; font-size:16px;">✖</button>
        </li>`;
    });
    document.getElementById('listaFranq').innerHTML = html;
    cargarFranquiciasSelect('editFranqTorneo', false);
}

async function agregarFranquicia() {
    let nom = document.getElementById('nuevaFranq').value.trim();
    if(!nom) return;
    await supabase.from('franquicias').insert([{nombre: nom}]);
    document.getElementById('nuevaFranq').value = '';
    cargarFranquiciasPanel();
}

async function borrarFranquicia(id) {
    if(!confirm("¿Borrar esta franquicia del sistema?")) return;
    await supabase.from('franquicias').delete().eq('id', id);
    cargarFranquiciasPanel();
}

async function abrirEdicionTorneo(id, nombre, franquicia, fecha) {
    torneoEditandoId = id;
    fechaOriginalEdicion = fecha;
    document.getElementById('editNomTorneo').value = nombre;
    document.getElementById('editFechaTorneo').value = fecha;
    
    // Esperamos a que el desplegable termine de cargar sus datos de la nube
    setTimeout(() => { document.getElementById('editFranqTorneo').value = franquicia; }, 100);
    
    document.getElementById('panelLista').style.display = 'none';
    document.getElementById('panelEdicion').style.display = 'block';
}

async function guardarEdicionTorneo() {
    let n = document.getElementById('editNomTorneo').value.trim();
    let f = document.getElementById('editFranqTorneo').value;
    let d = document.getElementById('editFechaTorneo').value;
    
    if(!n || !f || !d) return alert("Completa todos los campos");

    const {error} = await supabase.from('torneos').update({nombre: n, franquicia: f, fecha_evento: d}).eq('id', torneoEditandoId);
    if(error) return alert("Error al actualizar");
    
    cerrarEdicionTorneo();
    
    if (d !== fechaOriginalEdicion) {
        alert("Has cambiado la fecha del evento.\\n\\nEl sistema recalculará toda la historia automáticamente para mantener la línea temporal perfecta.");
        await repararEloGlobal(true);
    } else {
        alert("Torneo actualizado correctamente.");
    }
    cargarTorneos();
}

function cerrarEdicionTorneo() {
    document.getElementById('panelEdicion').style.display = 'none';
    document.getElementById('panelLista').style.display = 'block';
}

window.verTorneo = verTorneo; window.eliminarTorneo = eliminarTorneo; window.repararEloGlobal = repararEloGlobal; window.cerrarDetalle = cerrarDetalle;
window.agregarFranquicia = agregarFranquicia; window.borrarFranquicia = borrarFranquicia;
window.abrirEdicionTorneo = abrirEdicionTorneo; window.guardarEdicionTorneo = guardarEdicionTorneo; window.cerrarEdicionTorneo = cerrarEdicionTorneo;

configurarSesion();
cargarTorneos();
cargarFranquiciasPanel();