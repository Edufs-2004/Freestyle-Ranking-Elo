import { supabase, cargarFranquiciasSelect, obtenerFranquiciasValidas } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

let torneoEditandoId = null; let fechaOriginalEdicion = null;
let batallaEditandoId = null; let listaMcsGlobal = []; let torneoAbiertoId = null; let torneoAbiertoNombre = "";
let torneosGlobal = [];

async function cargarMcsParaEdicion() {
    const {data} = await supabase.from('competidores').select('*').order('aka');
    listaMcsGlobal = data || [];
    let opts = ''; data.forEach(mc => opts += `<option value="${mc.id}">${mc.aka}</option>`);
    document.getElementById('editBatMC1').innerHTML = opts;
    document.getElementById('editBatMC2').innerHTML = opts;
}

async function cargarTorneos() {
    const { data: torneos, error } = await supabase.from('torneos').select('*').order('fecha_evento', { ascending: false });
    if (error) return console.error(error);
    torneosGlobal = torneos; 
    aplicarFiltroMuseo(); 
}

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
    if (!silent && !confirm("🔄 ¿Iniciar Recálculo Global Maestro?\n\nEl sistema viajará en el tiempo, ordenará los torneos cronológicamente y ajustará el tamaño de los pozos de premios a la regla del 0.3%.")) return;
    
    let msg = document.getElementById('msgReparacion'); msg.style.color = "#eccc68"; msg.innerText = "⏳ 1. Reseteando Línea Temporal...";

    const { data: mcs } = await supabase.from('competidores').select('*');
    let rankingNube = {}; mcs.forEach(mc => { rankingNube[mc.id] = { id: mc.id, elo: 1500, batallas: 0 }; });

    msg.innerText = "⏳ 2. Descargando Archivos Históricos...";
    const { data: torneos } = await supabase.from('torneos').select('*').order('fecha_evento', { ascending: true });
    const { data: batallas } = await supabase.from('batallas').select('*');

    msg.innerText = "⏳ 3. Simulando Historia y Regenerando Premios...";
    
    for (let torneo of torneos) {
        let batallasTorneo = batallas.filter(b => b.torneo_id === torneo.id);
        
        batallasTorneo.sort((a, b) => {
            if (a.resultado === 'bono' && b.resultado !== 'bono') return 1;
            if (a.resultado !== 'bono' && b.resultado === 'bono') return -1;
            return a.id - b.id;
        });

        let uniqueIds = new Set();
        batallasTorneo.filter(b => b.resultado !== 'bono').forEach(bx => { uniqueIds.add(bx.mc1_id); uniqueIds.add(bx.mc2_id); });
        let sizeReal = uniqueIds.size;
        
        let isLiga = torneo.formato && torneo.formato.toLowerCase().includes('liga');
        let pozoHistorico = 0; let eloMedioHistorico = 1500;

        if (!isLiga && sizeReal >= 4) {
            let sumaElo = 0;
            uniqueIds.forEach(id => { sumaElo += rankingNube[id].elo; });
            eloMedioHistorico = Math.round(sumaElo / sizeReal);
            pozoHistorico = Math.round(eloMedioHistorico * (sizeReal * 0.003)); 
            await supabase.from('torneos').update({ elo_medio_calculado: eloMedioHistorico, pozo_total: pozoHistorico }).eq('id', torneo.id);
        }

        let formatoOficial = sizeReal > 16 ? 32 : (sizeReal > 8 ? 16 : (sizeReal > 4 ? 8 : 4));

        for (let b of batallasTorneo) {
            if (b.resultado === 'bono') {
                let bono = 0;
                let f = b.fase || '';
                let hayTercero = batallasTorneo.some(bx => bx.resultado === 'bono' && (bx.fase || '').includes('Tercer'));

                if (!isLiga && pozoHistorico > 0) {
                    if (formatoOficial === 32) { 
                        if (f.includes('Campeón')) bono = Math.round(pozoHistorico * 0.35);
                        else if (f.includes('Subcampeón')) bono = Math.round(pozoHistorico * 0.18);
                        else if (f.includes('Tercer')) bono = Math.round(pozoHistorico * 0.10);
                        else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoHistorico * 0.07);
                        else if (f.includes('Semifinalista')) bono = Math.round(pozoHistorico * 0.085);
                        else if (f.includes('Cuartofinalista')) bono = Math.round(pozoHistorico * 0.05);
                        else if (f.includes('Octavofinalista')) bono = Math.round(pozoHistorico * 0.0125);
                    }
                    else if (formatoOficial === 16) { 
                        if (f.includes('Campeón')) bono = Math.round(pozoHistorico * 0.40);
                        else if (f.includes('Subcampeón')) bono = Math.round(pozoHistorico * 0.20);
                        else if (f.includes('Tercer')) bono = Math.round(pozoHistorico * 0.12);
                        else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoHistorico * 0.08);
                        else if (f.includes('Cuartofinalista')) bono = Math.round(pozoHistorico * 0.05);
                        else if (f.includes('Semifinalista')) bono = Math.round(pozoHistorico * 0.10); 
                    } 
                    else if (formatoOficial === 8) { 
                        if (f.includes('Campeón')) bono = Math.round(pozoHistorico * 0.45);
                        else if (f.includes('Subcampeón')) bono = Math.round(pozoHistorico * 0.25);
                        else if (f.includes('Tercer')) bono = Math.round(pozoHistorico * 0.18);
                        else if (f.includes('Cuarto Lugar')) bono = Math.round(pozoHistorico * 0.12);
                        else if (f.includes('Semifinalista')) bono = Math.round(pozoHistorico * 0.15); 
                    } 
                    else if (formatoOficial === 4) { 
                        if (hayTercero) {
                            if (f.includes('Campeón')) bono = Math.round(pozoHistorico * 0.50);
                            else if (f.includes('Subcampeón')) bono = Math.round(pozoHistorico * 0.30);
                            else if (f.includes('Tercer')) bono = Math.round(pozoHistorico * 0.20);
                        } else {
                            if (f.includes('Campeón')) bono = Math.round(pozoHistorico * 0.60);
                            else if (f.includes('Subcampeón')) bono = Math.round(pozoHistorico * 0.40);
                        }
                    }
                }

                if (bono === 0 && b.cambio_mc1 > 0 && isLiga) bono = b.cambio_mc1; 

                let R1 = rankingNube[b.mc1_id].elo;
                rankingNube[b.mc1_id].elo += bono;
                
                await supabase.from('batallas').update({ elo_previo_mc1: R1, elo_previo_mc2: R1, cambio_mc1: bono, cambio_mc2: 0 }).eq('id', b.id);
            } else {
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
        }
    }

    msg.innerText = "⏳ 4. Guardando Puntos Actualizados...";
    for (const key in rankingNube) {
        let mc = rankingNube[key];
        await supabase.from('competidores').update({ elo_actual: mc.elo, batallas_totales: mc.batallas }).eq('id', mc.id);
    }
    
    msg.style.color = "#2ed573"; msg.innerText = "✅ ¡Línea Temporal Alineada y Premios Restaurados!";
    setTimeout(() => { msg.innerText = ""; }, 4000);
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
            <div style="display: flex; gap: 5px;">
                <button onclick="abrirAnalisisBatalla(${b.id})" style="background:transparent; color:#1e90ff; padding: 5px; cursor: pointer; font-size: 16px; border: 1px solid #1e90ff; border-radius: 4px;" title="Ver Análisis Histórico">👁️</button>
                <button class="btn-editar" onclick="abrirEdicionBatalla(${b.id}, '${b.fase}', ${b.mc1_id}, ${b.mc2_id}, '${b.resultado}')" style="padding: 5px 10px;">⚙️</button>
            </div>
        </div>`;
    });
    document.getElementById('contenedorBatallas').innerHTML = htmlVisual;
}

function cerrarDetalle() { document.getElementById('panelDetalle').style.display = 'none'; document.getElementById('panelLista').style.display = 'block'; }

function abrirEdicionBatalla(id, fase, mc1, mc2, res) {
    batallaEditandoId = id; document.getElementById('editBatFase').value = fase; document.getElementById('editBatMC1').value = mc1; document.getElementById('editBatMC2').value = mc2; document.getElementById('editBatRes').value = res;
    document.getElementById('overlayEditBat').style.display = 'block'; document.getElementById('modalEditBat').style.display = 'block';
}
function cerrarEdicionBatalla() { document.getElementById('overlayEditBat').style.display = 'none'; document.getElementById('modalEditBat').style.display = 'none'; }

async function guardarEdicionBatalla(recalcular = true) {
    let f = document.getElementById('editBatFase').value.trim(); let m1 = parseInt(document.getElementById('editBatMC1').value); let m2 = parseInt(document.getElementById('editBatMC2').value); let r = document.getElementById('editBatRes').value;
    if(!f || !m1 || !m2) return alert("Completa todos los campos"); if(m1 === m2) return alert("Un MC no puede batallar consigo mismo.");
    await supabase.from('batallas').update({ fase: f, mc1_id: m1, mc2_id: m2, resultado: r }).eq('id', batallaEditandoId);

    if (recalcular) {
        document.getElementById('modalEditBat').innerHTML = '<h3 style="text-align:center; color:#1e90ff;">⏳ Guardando y Recalculando Línea Temporal...</h3>';
        await repararEloGlobal(true);
    }
    cerrarEdicionBatalla();
    
    document.getElementById('modalEditBat').innerHTML = `
        <h2 style="margin-top:0; color:#1e90ff;">⚙️ Editor Quirúrgico</h2>
        <input type="text" id="editBatFase"> <select id="editBatMC1"></select> <select id="editBatMC2"></select>
        <select id="editBatRes">
            <option value="victoria">Victoria Normal</option><option value="victoria_replica">Victoria tras Réplica</option><option value="derrota_replica">Derrota tras Réplica</option>
            <option value="derrota">Derrota Normal</option><option value="victoria_total">Victoria Total</option><option value="derrota_total">Derrota Total</option>
        </select>
        <div style="display:flex; gap:10px; margin-top:20px;">
            <button style="background:#eccc68; color:#2f3542; flex:1;" onclick="guardarEdicionBatalla(false)">💾 Aplicar</button>
            <button style="background:#2ed573; flex:1;" onclick="guardarEdicionBatalla(true)">🔄 Recalcular</button>
            <button style="background:#ff4757; flex:1;" onclick="cerrarEdicionBatalla()">❌ Cancelar</button>
        </div>`;
    
    cargarMcsParaEdicion(); verTorneo(torneoAbiertoId, torneoAbiertoNombre);
}

// ============================================================================
// MOTOR CORREGIDO: TALE OF THE TAPE (CRONOLOGÍA EXACTA Y DISEÑO SEGURO)
// ============================================================================
async function abrirAnalisisBatalla(idBatalla) {
    document.getElementById('overlayAnalisis').style.display = 'block';
    document.getElementById('modalAnalisis').style.display = 'block';
    document.getElementById('contenidoAnalisis').innerHTML = '<h3 style="text-align:center; color:#eccc68; padding: 40px;">⏳ Viajando en el tiempo...</h3>';

    try {
        const { data: bTarget } = await supabase.from('batallas').select('*, torneos(nombre, franquicia)').eq('id', idBatalla).single();
        if (!bTarget) throw new Error("Batalla no encontrada");
        
        let mc1 = listaMcsGlobal.find(m => m.id === bTarget.mc1_id);
        let mc2 = listaMcsGlobal.find(m => m.id === bTarget.mc2_id);
        
        document.getElementById('analisisTitulo').innerText = `${bTarget.torneos.franquicia} - ${bTarget.torneos.nombre} [${bTarget.fase}]`;

        // EL SECRETO CRONOLÓGICO
        const { data: torneosData } = await supabase.from('torneos').select('id, fecha_evento').order('fecha_evento', { ascending: true });
        const { data: batallasData } = await supabase.from('batallas').select('id, torneo_id, fase, mc1_id, mc2_id, cambio_mc1, cambio_mc2, resultado');

        let todasBatallasOrdenadas = [];
        for (let t of torneosData) {
            let bts = batallasData.filter(b => b.torneo_id === t.id);
            bts.sort((a, b) => {
                if (a.resultado === 'bono' && b.resultado !== 'bono') return 1;
                if (a.resultado !== 'bono' && b.resultado === 'bono') return -1;
                return a.id - b.id; 
            });
            todasBatallasOrdenadas.push(...bts);
        }

        let ledger = {};
        listaMcsGlobal.forEach(m => ledger[m.id] = { elo: 1500, maxElo: 1500, bestRank: 99999, batallas: 0 });

        let snapshotPre = null; let snapshotPost = null; let objetivoEncontrado = false;

        for (let i = 0; i < todasBatallasOrdenadas.length; i++) {
            let b = todasBatallasOrdenadas[i];

            if (b.id === idBatalla) {
                objetivoEncontrado = true;
                let tablaRank = Object.keys(ledger).map(id => ({id: parseInt(id), elo: ledger[id].elo})).sort((x,y) => y.elo - x.elo);
                snapshotPre = {
                    rank1: tablaRank.findIndex(r => r.id === mc1.id) + 1,
                    rank2: tablaRank.findIndex(r => r.id === mc2.id) + 1,
                    max1: ledger[mc1.id].maxElo,
                    max2: ledger[mc2.id].maxElo,
                    bestRank1: ledger[mc1.id].bestRank === 99999 ? '-' : ledger[mc1.id].bestRank,
                    bestRank2: ledger[mc2.id].bestRank === 99999 ? '-' : ledger[mc2.id].bestRank
                };
            }

            let huboCambio = false;
            if (ledger[b.mc1_id]) {
                ledger[b.mc1_id].elo += b.cambio_mc1;
                if (b.resultado !== 'bono') ledger[b.mc1_id].batallas += 1;
                if (ledger[b.mc1_id].elo > ledger[b.mc1_id].maxElo) ledger[b.mc1_id].maxElo = ledger[b.mc1_id].elo;
                huboCambio = true;
            }
            if (b.resultado !== 'bono' && ledger[b.mc2_id]) {
                ledger[b.mc2_id].elo += b.cambio_mc2;
                ledger[b.mc2_id].batallas += 1;
                if (ledger[b.mc2_id].elo > ledger[b.mc2_id].maxElo) ledger[b.mc2_id].maxElo = ledger[b.mc2_id].elo;
                huboCambio = true;
            }

            if (huboCambio) {
                let tablaRankTemp = Object.keys(ledger).map(id => ({id: parseInt(id), elo: ledger[id].elo, bts: ledger[id].batallas})).sort((x,y) => y.elo - x.elo);
                tablaRankTemp.forEach((r, index) => {
                    let rnk = index + 1;
                    if (r.bts > 0 && rnk < ledger[r.id].bestRank) {
                        ledger[r.id].bestRank = rnk;
                    }
                });
            }

            if (objetivoEncontrado && !snapshotPost) {
                let sigBat = todasBatallasOrdenadas[i+1];
                let finDeFase = !sigBat || sigBat.torneo_id !== bTarget.torneo_id || sigBat.fase !== bTarget.fase;
                if (finDeFase) {
                    let tablaRankPost = Object.keys(ledger).map(id => ({id: parseInt(id), elo: ledger[id].elo})).sort((x,y) => y.elo - x.elo);
                    snapshotPost = {
                        rank1: tablaRankPost.findIndex(r => r.id === mc1.id) + 1,
                        rank2: tablaRankPost.findIndex(r => r.id === mc2.id) + 1
                    };
                    break;
                }
            }
        }

        let img1 = mc1.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC1';
        let img2 = mc2.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC2';
        
        let difPos1 = snapshotPre.rank1 - snapshotPost.rank1; 
        let flechaPos1 = difPos1 > 0 ? `<span style="color:#2ed573; font-size: 12px;">(Subió ${difPos1}) ⬆️</span>` : (difPos1 < 0 ? `<span style="color:#ff4757; font-size: 12px;">(Bajó ${Math.abs(difPos1)}) ⬇️</span>` : `<span style="color:#aaa; font-size: 12px;">(Se mantuvo) ➖</span>`);
        
        let difPos2 = snapshotPre.rank2 - snapshotPost.rank2;
        let flechaPos2 = difPos2 > 0 ? `<span style="color:#2ed573; font-size: 12px;">(Subió ${difPos2}) ⬆️</span>` : (difPos2 < 0 ? `<span style="color:#ff4757; font-size: 12px;">(Bajó ${Math.abs(difPos2)}) ⬇️</span>` : `<span style="color:#aaa; font-size: 12px;">(Se mantuvo) ➖</span>`);

        let html = `
        <div id="tarjetaCaptura" style="background: #1e1e2f; padding: 20px; color: white; font-family: Arial, sans-serif;">
            
            <div style="text-align: center; margin-bottom: 15px;">
                <h3 style="margin:0; color:#aaa; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">HEAD TO HEAD</h3>
                <h2 style="margin:5px 0 0 0; color:#fff;">${bTarget.torneos.franquicia} ${bTarget.torneos.nombre.replace(bTarget.torneos.franquicia,'')}</h2>
                <div style="color:#eccc68; font-size: 14px; font-weight: bold; margin-top: 5px;">[ ${bTarget.fase} ]</div>
            </div>

            <div style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 0px; background: #2f3542; padding: 20px 15px; border-radius: 8px 8px 0 0;">
                <div style="text-align: center; flex: 1;">
                    <img src="${img1}" style="width: 90px; height: 90px; object-fit: cover; border-radius: 50%; border: 3px solid #1e90ff;">
                    <h3 style="margin: 10px 0 0 0; color: #1e90ff; font-size: 20px;">${mc1.aka}</h3>
                </div>
                <div style="font-size: 30px; font-weight: bold; color: #ff4757; flex: 0.5; text-align: center; text-shadow: 0px 2px 5px rgba(0,0,0,0.5);">VS</div>
                <div style="text-align: center; flex: 1;">
                    <img src="${img2}" style="width: 90px; height: 90px; object-fit: cover; border-radius: 50%; border: 3px solid #ff4757;">
                    <h3 style="margin: 10px 0 0 0; color: #ff4757; font-size: 20px;">${mc2.aka}</h3>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 15px; background: #2a2a40;">
                <tr style="background: #373752; color: white;">
                    <th style="padding: 12px; width: 33%; color: #1e90ff;">Esquina Azul</th>
                    <th style="padding: 12px; width: 34%; color: #eccc68; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Métricas</th>
                    <th style="padding: 12px; width: 33%; color: #ff4757;">Esquina Roja</th>
                </tr>
                
                <tr style="border-bottom: 1px solid #373752;">
                    <td style="padding: 12px; font-size: 18px; font-weight: bold; color: #fff;">${bTarget.elo_previo_mc1}</td>
                    <td style="padding: 12px; font-weight: bold; color: #aaa; background: rgba(0,0,0,0.2);">Elo Previo</td>
                    <td style="padding: 12px; font-size: 18px; font-weight: bold; color: #fff;">${bTarget.elo_previo_mc2}</td>
                </tr>
                
                <tr style="border-bottom: 1px solid #373752;">
                    <td style="padding: 12px; font-size: 16px; font-weight: bold; color: #fff;">#${snapshotPre.rank1}</td>
                    <td style="padding: 12px; font-weight: bold; color: #aaa; background: rgba(0,0,0,0.2);">Ranking Previo</td>
                    <td style="padding: 12px; font-size: 16px; font-weight: bold; color: #fff;">#${snapshotPre.rank2}</td>
                </tr>

                <tr style="border-bottom: 1px solid #373752; background: rgba(46, 213, 115, 0.05);">
                    <td style="padding: 12px; font-size: 16px; color: #fff; font-weight: bold;">${bTarget.elo_previo_mc1 + bTarget.cambio_mc1} <br><span style="font-size: 13px; color: ${bTarget.cambio_mc1 > 0 ? '#2ed573' : '#ff4757'}">(${bTarget.cambio_mc1 > 0 ? '+'+bTarget.cambio_mc1 : bTarget.cambio_mc1})</span></td>
                    <td style="padding: 12px; font-weight: bold; color: #2ed573; background: rgba(0,0,0,0.2);">Elo Post Batalla</td>
                    <td style="padding: 12px; font-size: 16px; color: #fff; font-weight: bold;">${bTarget.elo_previo_mc2 + bTarget.cambio_mc2} <br><span style="font-size: 13px; color: ${bTarget.cambio_mc2 > 0 ? '#2ed573' : '#ff4757'}">(${bTarget.cambio_mc2 > 0 ? '+'+bTarget.cambio_mc2 : bTarget.cambio_mc2})</span></td>
                </tr>

                <tr style="border-bottom: 1px solid #373752;">
                    <td style="padding: 12px; font-size: 16px; font-weight: bold; color: #fff;">#${snapshotPost.rank1}<br>${flechaPos1}</td>
                    <td style="padding: 12px; font-weight: bold; color: #aaa; background: rgba(0,0,0,0.2);">Ranking al Finalizar</td>
                    <td style="padding: 12px; font-size: 16px; font-weight: bold; color: #fff;">#${snapshotPost.rank2}<br>${flechaPos2}</td>
                </tr>

                <tr style="border-bottom: 1px solid #373752; border-top: 2px dashed #373752;">
                    <td style="padding: 12px; font-size: 15px; color: #1e90ff; font-weight: bold;">${snapshotPre.max1} pts</td>
                    <td style="padding: 12px; font-weight: bold; color: #1e90ff; background: rgba(0,0,0,0.2);">Pico Máx. Histórico</td>
                    <td style="padding: 12px; font-size: 15px; color: #1e90ff; font-weight: bold;">${snapshotPre.max2} pts</td>
                </tr>

                <tr>
                    <td style="padding: 12px; font-size: 15px; color: #eccc68; font-weight: bold;">#${snapshotPre.bestRank1}</td>
                    <td style="padding: 12px; font-weight: bold; color: #eccc68; background: rgba(0,0,0,0.2);">Mejor Rango Histórico</td>
                    <td style="padding: 12px; font-size: 15px; color: #eccc68; font-weight: bold;">#${snapshotPre.bestRank2}</td>
                </tr>
            </table>
        </div>
        `;
        document.getElementById('contenidoAnalisis').innerHTML = html;

    } catch (e) {
        console.error(e);
        document.getElementById('contenidoAnalisis').innerHTML = `<h3 style="text-align:center; color:#ff4757;">Error al procesar el análisis.</h3>`;
    }
}

function cerrarAnalisisBatalla() {
    document.getElementById('overlayAnalisis').style.display = 'none';
    document.getElementById('modalAnalisis').style.display = 'none';
}

window.descargarCaraACara = function() {
    let tarjeta = document.getElementById('tarjetaCaptura');
    if (!tarjeta) return;
    
    html2canvas(tarjeta, { backgroundColor: '#1e1e2f', scale: 2 }).then(canvas => {
        let enlace = document.createElement('a');
        let titulo = document.getElementById('analisisTitulo').innerText.replace(/[^a-zA-Z0-9]/g, '_');
        enlace.download = `HeadToHead_${titulo}.png`;
        enlace.href = canvas.toDataURL('image/png');
        enlace.click();
    });
}

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
    cargarFranquiciasSelect('filtroFranqMuseo', true);
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
window.aplicarFiltroMuseo = aplicarFiltroMuseo;
window.abrirAnalisisBatalla = abrirAnalisisBatalla; window.cerrarAnalisisBatalla = cerrarAnalisisBatalla; window.descargarCaraACara = descargarCaraACara;

configurarSesion();
cargarMcsParaEdicion();
cargarTorneos();
cargarFranquiciasPanel();
cargarFranquiciasSelect('filtroFranqMuseo', true);