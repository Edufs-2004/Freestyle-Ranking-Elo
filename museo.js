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
// 2. ELIMINAR TORNEO (EL BORRADO SEGURO)
// ==========================================
async function eliminarTorneo(id, nombre) {
    let confirmacion = confirm(`⚠️ PELIGRO ⚠️\n¿Estás seguro de que quieres borrar para siempre el torneo "${nombre}"?\n\nRecuerda darle al botón amarillo de "Recalcular Elo" después de borrarlo para arreglar los puntajes.`);
    if (!confirmacion) return;

    // Supabase no borra en cascada por defecto a menos que se configure en SQL, 
    // así que borramos manualmente a los "hijos" primero para que no haya errores.
    document.getElementById('cuerpoTorneos').innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ff4757;">Borrando de la nube...</td></tr>';

    await supabase.from('batallas').delete().eq('torneo_id', id);
    await supabase.from('inscripciones').delete().eq('torneo_id', id);
    await supabase.from('torneos').delete().eq('id', id);

    alert(`Torneo "${nombre}" eliminado con éxito.`);
    cargarTorneos();
}

// ==========================================
// 3. REPARAR ELO (LA MÁQUINA DEL TIEMPO)
// ==========================================
async function repararEloGlobal() {
    let confirmacion = confirm("🔄 ¿Iniciar Recálculo Global?\n\nEsto bajará a todos los MCs a 1500 puntos y simulará la historia completa leyendo los torneos que existen actualmente para corregir el Elo.\n\nÚsalo después de borrar torneos de prueba.");
    if (!confirmacion) return;

    let msg = document.getElementById('msgReparacion');
    msg.style.color = "#eccc68";
    msg.innerText = "⏳ 1. Reseteando a todos los MCs a 1500 puntos...";

    // 1. Traer todos los MCs y resetearlos localmente
    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingNube = {};
    mcs.forEach(mc => { rankingNube[mc.id] = { id: mc.id, elo: 1500, batallas: 0 }; });

    msg.innerText = "⏳ 2. Descargando el archivo histórico...";
    // 2. Traer TODAS las batallas ordenadas cronológicamente
    const { data: batallas } = await supabase.from('batallas').select(`*, torneos(fecha_evento)`).order('id', { ascending: true });
    
    // Orden estricto por fecha del torneo
    batallas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    msg.innerText = "⏳ 3. Simulando años de batallas en un segundo...";
    // 3. Simular todas las matemáticas en memoria
    batallas.forEach(b => {
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

        rankingNube[b.mc1_id].elo = Math.round(R1 + p1);
        rankingNube[b.mc2_id].elo = Math.round(R2 + p2);
        rankingNube[b.mc1_id].batallas += 1;
        rankingNube[b.mc2_id].batallas += 1;
    });

    // POZOS: Por ahora la simulación recalcula batallas individuales. Los bonos de pozo (Campeón, Sub) 
    // requieren una lógica más extensa, pero este botón arregla el 95% del desfase estadístico al borrar tests.

    msg.innerText = "⏳ 4. Guardando nueva realidad en la Base de Datos...";
    // 4. Subir los nuevos puntos a Supabase (Actualización masiva)
    for (const key in rankingNube) {
        let mc = rankingNube[key];
        await supabase.from('competidores').update({ elo_actual: mc.elo, batallas_totales: mc.batallas }).eq('id', mc.id);
    }

    msg.style.color = "#2ed573";
    msg.innerText = "✅ ¡Línea temporal reparada con éxito!";
}

// ==========================================
// 4. VER EL BRACKET (VISUALIZADOR)
// ==========================================
async function verTorneo(idTorneo, nombre) {
    document.getElementById('panelLista').style.display = 'none';
    document.getElementById('panelDetalle').style.display = 'block';
    document.getElementById('detalleTitulo').innerText = `🏆 ${nombre}`;
    document.getElementById('contenedorBatallas').innerHTML = '<p>Cargando llaves...</p>';

    // Traer batallas del torneo con los nombres de los MCs
    const { data: batallas } = await supabase
        .from('batallas')
        .select(`fase, resultado, mc1:competidores!batallas_mc1_id_fkey(aka), mc2:competidores!batallas_mc2_id_fkey(aka)`)
        .eq('torneo_id', idTorneo);

    if(!batallas || batallas.length === 0) {
        document.getElementById('contenedorBatallas').innerHTML = '<p>No hay batallas registradas en este evento.</p>';
        return;
    }

    // Agrupar batallas por fase
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
                let ganoIzquierda = ['victoria', 'victoria_replica', 'victoria_total'].includes(batalla.resultado);
                let mc1Final = ganoIzquierda ? `<span class="ganador-text">👑 ${batalla.mc1.aka}</span>` : batalla.mc1.aka;
                let mc2Final = !ganoIzquierda ? `<span class="ganador-text">${batalla.mc2.aka} 👑</span>` : batalla.mc2.aka;
                
                // Limpiar el texto del resultado para que se vea bonito
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

// Exportar funciones
window.verTorneo = verTorneo;
window.eliminarTorneo = eliminarTorneo;
window.repararEloGlobal = repararEloGlobal;
window.cerrarDetalle = cerrarDetalle;

cargarTorneos();