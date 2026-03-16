import { supabase } from './supabase.js';
const K = 32;

// ==========================================
// 1. CARGAR LISTA DE TORNEOS
// ==========================================
async function cargarTorneos() {
    const { data: torneos, error } = await supabase.from('torneos').select('*').order('fecha_evento', { ascending: false });
    
    if (error) return console.error(error);

    let html = '';
    torneos.forEach(t => {
        let colorEstado = t.estado === 'Finalizado' ? '#2ed573' : '#ffa502';
        html += `
            <tr>
                <td>${t.fecha_evento || 'Sin fecha'}</td>
                <td><strong>${t.franquicia || '-'}</strong></td>
                <td>${t.nombre}</td>
                <td style="color: ${colorEstado}; font-weight: bold;">${t.estado}</td>
                <td>
                    <button class="btn-ver" onclick="verTorneo(${t.id}, '${t.nombre}')">👁️ Ver</button>
                    <button class="btn-borrar" onclick="eliminarTorneo(${t.id}, '${t.nombre}')">🗑️ Borrar</button>
                </td>
            </tr>
        `;
    });

    if(html === '') html = '<tr><td colspan="5" style="text-align:center;">No hay torneos registrados.</td></tr>';
    document.getElementById('cuerpoTorneos').innerHTML = html;
}

// ==========================================
// 2. ELIMINAR TORNEO
// ==========================================
async function eliminarTorneo(id, nombre) {
    let confirmacion = confirm(`⚠️ PELIGRO ⚠️\n¿Estás seguro de que quieres borrar para siempre el torneo "${nombre}"?\n\nRecuerda darle al botón amarillo de "Recalcular Elo" después de borrarlo para arreglar los puntajes.`);
    if (!confirmacion) return;

    document.getElementById('cuerpoTorneos').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ff4757;">Borrando de la nube...</td></tr>';

    await supabase.from('batallas').delete().eq('torneo_id', id);
    await supabase.from('inscripciones').delete().eq('torneo_id', id);
    await supabase.from('torneos').delete().eq('id', id);

    alert(`Torneo "${nombre}" eliminado con éxito.`);
    cargarTorneos();
}

// ==========================================
// 3. REPARAR ELO (LA MÁQUINA DEL TIEMPO V1.2.0)
// ==========================================
async function repararEloGlobal() {
    let confirmacion = confirm("🔄 ¿Iniciar Recálculo Global?\n\nEsto bajará a todos los MCs a 1500 puntos y simulará la historia completa re-escribiendo los registros contables.");
    if (!confirmacion) return;

    let msg = document.getElementById('msgReparacion');
    msg.style.color = "#eccc68";
    msg.innerText = "⏳ 1. Reseteando a todos los MCs a 1500 puntos...";

    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingNube = {};
    mcs.forEach(mc => { rankingNube[mc.id] = { id: mc.id, elo: 1500, batallas: 0 }; });

    msg.innerText = "⏳ 2. Descargando el archivo histórico...";
    const { data: batallas } = await supabase.from('batallas').select(`*, torneos(fecha_evento)`).order('id', { ascending: true });
    
    batallas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    msg.innerText = "⏳ 3. Simulando años de batallas y re-escribiendo el Libro Mayor...";
    
    // Este ciclo reescribe la tabla de batallas con los puntos reales (Aísla errores)
    for (let b of batallas) {
        let R1 = rankingNube[b.mc1_id].elo;
        let R2 = rankingNube[b.mc2_id].elo;
        let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
        let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

        let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;
        
        if (b.resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } 
        else if (b.resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
        else if (b.resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
        else if (b.resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
        else if (b.resultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
        else if (b.resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }

        let p1 = K * (S1 - E1); let p2 = K * (S2 - E2);
        if (bono1) p1 *= 1.2; if (bono2) p2 *= 1.2;

        let p1_red = Math.round(p1);
        let p2_red = Math.round(p2);

        // ¡ACTUALIZAMOS EL LIBRO MAYOR EN SUPABASE CON LOS PUNTOS CORREGIDOS!
        await supabase.from('batallas').update({
            elo_previo_mc1: R1,
            elo_previo_mc2: R2,
            cambio_mc1: p1_red,
            cambio_mc2: p2_red
        }).eq('id', b.id);

        rankingNube[b.mc1_id].elo = R1 + p1_red;
        rankingNube[b.mc2_id].elo = R2 + p2_red;
        rankingNube[b.mc1_id].batallas += 1;
        rankingNube[b.mc2_id].batallas += 1;
    }

    msg.innerText = "⏳ 4. Guardando nueva realidad en la Base de Datos...";
    for (const key in rankingNube) {
        let mc = rankingNube[key];
        await supabase.from('competidores').update({ elo_actual: mc.elo, batallas_totales: mc.batallas }).eq('id', mc.id);
    }

    msg.style.color = "#2ed573";
    msg.innerText = "✅ ¡Línea temporal y Libro Mayor reparados con éxito!";
}

// ==========================================
// 4. VER EL BRACKET
// ==========================================
async function verTorneo(idTorneo, nombre) {
    document.getElementById('panelLista').style.display = 'none';
    document.getElementById('panelDetalle').style.display = 'block';
    document.getElementById('detalleTitulo').innerText = `🏆 ${nombre}`;
    document.getElementById('contenedorBatallas').innerHTML = '<p>Cargando llaves...</p>';

    const { data: batallas, error } = await supabase
        .from('batallas')
        .select(`fase, resultado, mc1_id, mc2_id`)
        .eq('torneo_id', idTorneo);

    if(error || !batallas || batallas.length === 0) {
        document.getElementById('contenedorBatallas').innerHTML = '<p>No hay batallas registradas en este evento.</p>';
        return;
    }

    const { data: competidores } = await supabase.from('competidores').select('id, aka');
    let mapMcs = {};
    competidores.forEach(c => mapMcs[c.id] = c.aka);

    let fasesOrdenadas = { 'O': [], 'C': [], 'S': [], 'F': [] };
    
    batallas.forEach(b => {
        let letra = b.fase.charAt(0);
        if(fasesOrdenadas[letra]) fasesOrdenadas[letra].push(b);
    });

    let htmlVisual = '';
    const dicNombresFases = { 'O': '🔥 Octavos', 'C': '⚡ Cuartos', 'S': '🌪️ Semifinales', 'F': '🏆 Final' };

    ['O', 'C', 'S', 'F'].forEach(letra => {
        if(fasesOrdenadas[letra].length > 0) {
            htmlVisual += `<h3 class="fase-titulo">${dicNombresFases[letra]}</h3>`;
            
            fasesOrdenadas[letra].forEach(batalla => {
                let nombre1 = mapMcs[batalla.mc1_id] || 'Desconocido';
                let nombre2 = mapMcs[batalla.mc2_id] || 'Desconocido';

                let ganoIzquierda = ['victoria', 'victoria_replica', 'victoria_total'].includes(batalla.resultado);
                let mc1Final = ganoIzquierda ? `<span class="ganador-text">👑 ${nombre1}</span>` : nombre1;
                let mc2Final = !ganoIzquierda ? `<span class="ganador-text">${nombre2} 👑</span>` : nombre2;
                
                let textoRes = batalla.resultado.replace('_', ' ').toUpperCase();

                htmlVisual += `
                    <div class="batalla-item">
                        <div style="flex: 1; text-align: right; padding-right: 15px;">${mc1Final}</div>
                        <div style="font-size: 12px; color: #aaa; background: #1e1e2f; padding: 5px 10px; border-radius: 10px;">${textoRes}</div>
                        <div style="flex: 1; text-align: left; padding-left: 15px;">${mc2Final}</div>
                    </div>
                `;
            });
        }
    });

    document.getElementById('contenedorBatallas').innerHTML = htmlVisual;
}

function cerrarDetalle() {
    document.getElementById('panelDetalle').style.display = 'none';
    document.getElementById('panelLista').style.display = 'block';
}

window.verTorneo = verTorneo; window.eliminarTorneo = eliminarTorneo;
window.repararEloGlobal = repararEloGlobal; window.cerrarDetalle = cerrarDetalle;

cargarTorneos();