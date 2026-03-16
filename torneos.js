import { supabase } from './supabase.js';
const K = 32;

// Mapa inteligente de conexiones global
const RUTA_TORNEO = {
    'O1': { sig: 'C1', slot: 'mc1' }, 'O2': { sig: 'C1', slot: 'mc2' },
    'O3': { sig: 'C2', slot: 'mc1' }, 'O4': { sig: 'C2', slot: 'mc2' },
    'O5': { sig: 'C3', slot: 'mc1' }, 'O6': { sig: 'C3', slot: 'mc2' },
    'O7': { sig: 'C4', slot: 'mc1' }, 'O8': { sig: 'C4', slot: 'mc2' },
    'C1': { sig: 'S1', slot: 'mc1' }, 'C2': { sig: 'S1', slot: 'mc2' },
    'C3': { sig: 'S2', slot: 'mc1' }, 'C4': { sig: 'S2', slot: 'mc2' },
    'S1': { sig: 'F', slot: 'mc1' },  'S2': { sig: 'F', slot: 'mc2' },
    'F':  { sig: 'FIN', slot: null }
};

let evento = { id: null, pozo: 0, nombre: "", franquicia: "", formatoStr: "", fecha: "" };
Object.keys(RUTA_TORNEO).forEach(fase => { evento[fase] = { mc1: null, mc2: null, ganador: null, perdedor: null }; });

let mcsDisponibles = [];
let mcsSeleccionados = []; 
let limiteMcsActual = 16; // Por defecto es Octavos

// ==========================================
// 1. CARGA INICIAL, BUSCADOR Y FORMATOS
// ==========================================
async function cargarBD() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    mcsDisponibles = data;
}

function cambiarFormato() {
    limiteMcsActual = parseInt(document.getElementById('formatoTorneo').value);
    document.getElementById('tituloRoster').innerText = `Roster del Torneo (Elige ${limiteMcsActual} MCs)`;
    
    // Si el usuario cambia el formato y ya tenía más chips de la cuenta, los borramos
    if(mcsSeleccionados.length > limiteMcsActual) {
        mcsSeleccionados = mcsSeleccionados.slice(0, limiteMcsActual);
        dibujarChips();
    }
}

function filtrarBuscador() {
    let texto = document.getElementById('buscadorMCs').value.toLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');
    if (texto.length < 1) return cajaSugerencias.style.display = 'none';

    let resultados = mcsDisponibles.filter(mc => mc.aka.toLowerCase().includes(texto) && !mcsSeleccionados.find(sel => sel.id === mc.id));

    if (resultados.length === 0) {
        cajaSugerencias.innerHTML = '<div class="sugerencia-item">No se encontraron MCs</div>';
    } else {
        let html = '';
        resultados.forEach(mc => { html += `<div class="sugerencia-item" onclick="agregarChip(${mc.id})"><span>${mc.aka}</span><span style="color: #888;">Elo: ${mc.elo_actual}</span></div>`; });
        cajaSugerencias.innerHTML = html;
    }
    cajaSugerencias.style.display = 'block';
}

function agregarChip(id) {
    if (mcsSeleccionados.length >= limiteMcsActual) {
        alert(`Límite alcanzado: El formato elegido solo admite ${limiteMcsActual} competidores.`);
        document.getElementById('buscadorMCs').value = '';
        document.getElementById('sugerenciasMCs').style.display = 'none';
        return;
    }
    mcsSeleccionados.push(mcsDisponibles.find(m => m.id === id));
    document.getElementById('buscadorMCs').value = '';
    document.getElementById('sugerenciasMCs').style.display = 'none';
    dibujarChips();
}

function quitarChip(id) { mcsSeleccionados = mcsSeleccionados.filter(mc => mc.id !== id); dibujarChips(); }

function dibujarChips() {
    let contenedor = document.getElementById('contenedorChips');
    if (mcsSeleccionados.length === 0) {
        contenedor.innerHTML = '<span style="color: #57606f; margin: auto;">Esperando competidores...</span>';
        return;
    }
    let html = '';
    mcsSeleccionados.forEach(mc => { html += `<div class="chip">${mc.aka} <button class="chip-btn" onclick="quitarChip(${mc.id})">✖</button></div>`; });
    html += `<div style="width: 100%; text-align: center; color: #aaa; margin-top: 10px;">${mcsSeleccionados.length} / ${limiteMcsActual} MCs</div>`;
    contenedor.innerHTML = html;
}

// ==========================================
// 2. CONSTRUIR HTML DINÁMICO SEGÚN FORMATO
// ==========================================
function irACruces() {
    evento.nombre = document.getElementById('nombreTorneo').value.trim();
    evento.franquicia = document.getElementById('franquiciaTorneo').value;
    evento.formatoStr = document.getElementById('formatoTorneo').options[document.getElementById('formatoTorneo').selectedIndex].text;
    evento.fecha = document.getElementById('fechaTorneo').value;
    
    if (!evento.nombre) return alert("Ponle un nombre al evento.");
    if (!evento.fecha) return alert("Por favor, selecciona la fecha oficial en la que ocurrió el evento.");
    if (mcsSeleccionados.length !== limiteMcsActual) return alert(`Necesitas exactamente ${limiteMcsActual} MCs. Llevas ${mcsSeleccionados.length}.`);

    let htmlSetup = '';
    let prefijo = limiteMcsActual === 16 ? 'O' : (limiteMcsActual === 8 ? 'C' : 'S');
    let nombreFase = limiteMcsActual === 16 ? 'Octavos' : (limiteMcsActual === 8 ? 'Cuartos' : 'Semifinal');
    let totalLlaves = limiteMcsActual / 2;

    for(let i=1; i<=totalLlaves; i++) {
        htmlSetup += `
        <div class="setup-cruce">
            <h4 style="margin: 0 0 10px 0; color: #1e90ff;">Llave ${i} (${nombreFase} ${i})</h4>
            <select id="setup_${prefijo}${i}_mc1" class="select-fase" onchange="actualizarDesplegables()"></select> 
            <div style="text-align: center; font-weight: bold; margin: 5px 0;">VS</div>
            <select id="setup_${prefijo}${i}_mc2" class="select-fase" onchange="actualizarDesplegables()"></select>
        </div>`;
    }
    document.getElementById('contenedorSetupCruces').innerHTML = htmlSetup;
    document.getElementById('tituloFaseArmado').innerText = `Paso 2: Cruces Oficiales (${nombreFase})`;

    actualizarDesplegables();

    document.getElementById('tituloPaso2').innerText = `${evento.franquicia} | ${evento.nombre}`;
    document.getElementById('panelSeleccion').style.display = 'none';
    document.getElementById('panelCreacion').style.display = 'block';
}

function actualizarDesplegables() {
    let selects = document.querySelectorAll('.select-fase');
    let idsOcupados = [];
    selects.forEach(s => { if(s.value !== "") idsOcupados.push(parseInt(s.value)); });

    selects.forEach(select => {
        let valorActual = select.value; 
        let opcionesHTML = '<option value="">Selecciona...</option>';
        mcsSeleccionados.forEach(mc => {
            if (!idsOcupados.includes(mc.id) || parseInt(valorActual) === mc.id) {
                opcionesHTML += `<option value="${mc.id}">${mc.aka}</option>`;
            }
        });
        select.innerHTML = opcionesHTML;
        select.value = valorActual; 
    });
}

function generarHTMLBatalla(faseId, tituloFase, faseArranque) {
    let btnBloqueado = faseId.startsWith(faseArranque) ? '' : 'disabled'; 
    return `
    <div class="batalla-caja" id="caja_${faseId}">
        <h4>${tituloFase}</h4>
        <div class="versus">
            <span class="mc-name" id="${faseId}_mc1_nombre">Esperando...</span> 
            <span class="vs-text">VS</span> 
            <span class="mc-name" id="${faseId}_mc2_nombre">Esperando...</span>
        </div>
        <select id="${faseId}_res">
            <option value="victoria">Victoria Izquierda</option>
            <option value="victoria_replica">Victoria Réplica Izquierda</option>
            <option value="derrota_replica">Victoria Réplica Derecha</option>
            <option value="derrota">Victoria Derecha</option>
            <option value="victoria_total">Victoria Total Izquierda</option>
            <option value="derrota_total">Victoria Total Derecha</option>
        </select>
        <button class="btn-batalla" id="btn_${faseId}" onclick="procesarBatallaAuto('${faseId}')" ${btnBloqueado}>⚔️ Registrar</button>
    </div>`;
}

// ==========================================
// 3. INICIAR EL TORNEO
// ==========================================
async function iniciarTorneo() {
    let idsAValidar = [];
    let sumaElo = 0;
    let prefijo = limiteMcsActual === 16 ? 'O' : (limiteMcsActual === 8 ? 'C' : 'S');
    let totalLlaves = limiteMcsActual / 2;

    for(let i=1; i<=totalLlaves; i++) {
        let id1 = parseInt(document.getElementById(`setup_${prefijo}${i}_mc1`).value);
        let id2 = parseInt(document.getElementById(`setup_${prefijo}${i}_mc2`).value);
        idsAValidar.push(id1, id2);

        let mc1Obj = mcsSeleccionados.find(m => m.id === id1);
        let mc2Obj = mcsSeleccionados.find(m => m.id === id2);
        
        if(mc1Obj) sumaElo += mc1Obj.elo_actual;
        if(mc2Obj) sumaElo += mc2Obj.elo_actual;

        evento[`${prefijo}${i}`].mc1 = mc1Obj;
        evento[`${prefijo}${i}`].mc2 = mc2Obj;
    }

    let unicos = new Set(idsAValidar);
    if (unicos.has(NaN) || unicos.size !== limiteMcsActual) return alert("Debes asignar a todos los participantes sin repetir.");

    evento.pozo = Math.round((sumaElo / limiteMcsActual) * 0.05);
    document.getElementById('mensajeConsola').innerHTML = "Registrando en la base de datos...";

    // Guardar en DB con Franquicia, Formato y FECHA (V0.9.0)
    const { data: torneoDB, error } = await supabase.from('torneos').insert([{ 
        nombre: evento.nombre, franquicia: evento.franquicia, formato: evento.formatoStr,
        fecha_evento: evento.fecha,
        estado: 'En Curso', elo_medio_calculado: Math.round(sumaElo/limiteMcsActual), pozo_total: evento.pozo 
    }]).select();
    
    if (error) {
        console.error(error);
        return alert("Error al guardar en la nube. Revisa que agregaste la columna 'fecha_evento' en Supabase.");
    }
    
    evento.id = torneoDB[0].id;

    let registrosInscripcion = idsAValidar.map(id => ({ torneo_id: evento.id, competidor_id: id }));
    await supabase.from('inscripciones').insert(registrosInscripcion);

    // Ocultar zonas que no se usarán
    if(limiteMcsActual <= 8) document.getElementById('zonaOctavos').style.display = 'none';
    if(limiteMcsActual === 4) document.getElementById('zonaCuartos').style.display = 'none';

    // DIBUJAR BRACKET
    let fasesAdibujar = ['O', 'C', 'S', 'F'];
    if(limiteMcsActual === 8) fasesAdibujar = ['C', 'S', 'F'];
    if(limiteMcsActual === 4) fasesAdibujar = ['S', 'F'];

    fasesAdibujar.forEach(faseLetra => {
        let maxIteraciones = faseLetra === 'O' ? 8 : (faseLetra === 'C' ? 4 : (faseLetra === 'S' ? 2 : 1));
        let contenedorDiv = document.getElementById(faseLetra === 'O' ? 'bracketOctavos' : (faseLetra === 'C' ? 'bracketCuartos' : (faseLetra === 'S' ? 'bracketSemis' : 'bracketFinal')));
        
        let htmlAcumulado = '';
        for(let i=1; i<=maxIteraciones; i++) {
            let idFase = faseLetra + (faseLetra === 'F' ? '' : i);
            let titulo = faseLetra === 'O' ? `Octavos ${i}` : (faseLetra === 'C' ? `Cuartos ${i}` : (faseLetra === 'S' ? `Semifinal ${i}` : 'Final'));
            htmlAcumulado += generarHTMLBatalla(idFase, titulo, prefijo); 
        }
        contenedorDiv.innerHTML = htmlAcumulado;
    });

    // Rellenar los nombres reales de la primera fase
    for(let i=1; i<=totalLlaves; i++) {
        document.getElementById(`${prefijo}${i}_mc1_nombre`).innerText = evento[`${prefijo}${i}`].mc1.aka;
        document.getElementById(`${prefijo}${i}_mc2_nombre`).innerText = evento[`${prefijo}${i}`].mc2.aka;
    }

    document.getElementById('panelCreacion').style.display = 'none';
    document.getElementById('panelTorneoActivo').style.display = 'block';
    document.getElementById('tituloTorneoActivo').innerText = `🔥 ${evento.franquicia}: ${evento.nombre} 🔥`;
    document.getElementById('infoPozoActivo').innerText = `Pozo Histórico Generado: 🏆 ${evento.pozo} pts`;
}

// ==========================================
// 4. PROCESAR BATALLAS
// ==========================================
async function procesarBatallaAuto(faseStr) {
    let llave = evento[faseStr];
    let resultado = document.getElementById(`${faseStr}_res`).value;
    let btn = document.getElementById(`btn_${faseStr}`);

    const { data: db1 } = await supabase.from('competidores').select('elo_actual, batallas_totales').eq('id', llave.mc1.id).single();
    const { data: db2 } = await supabase.from('competidores').select('elo_actual, batallas_totales').eq('id', llave.mc2.id).single();

    let R1 = db1.elo_actual; let R2 = db2.elo_actual;
    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
    let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));

    let S1 = 0, S2 = 0; let bonoTotal1 = false, bonoTotal2 = false;

    if (resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bonoTotal1 = true; } 
    else if (resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
    else if (resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
    else if (resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
    else if (resultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
    else if (resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bonoTotal2 = true; }

    let p1 = K * (S1 - E1); let p2 = K * (S2 - E2);
    if (bonoTotal1) p1 *= 1.2; if (bonoTotal2) p2 *= 1.2;

    await supabase.from('competidores').update({ elo_actual: Math.round(R1 + p1), batallas_totales: db1.batallas_totales + 1 }).eq('id', llave.mc1.id);
    await supabase.from('competidores').update({ elo_actual: Math.round(R2 + p2), batallas_totales: db2.batallas_totales + 1 }).eq('id', llave.mc2.id);

    await supabase.from('batallas').insert([{ torneo_id: evento.id, fase: faseStr, mc1_id: llave.mc1.id, mc2_id: llave.mc2.id, resultado: resultado }]);

    let ganoElUno = ['victoria', 'victoria_replica', 'victoria_total'].includes(resultado);
    llave.ganador = ganoElUno ? llave.mc1 : llave.mc2;
    llave.perdedor = ganoElUno ? llave.mc2 : llave.mc1;

    let destino = RUTA_TORNEO[faseStr]; 

    if(destino.sig !== 'FIN') {
        evento[destino.sig][destino.slot] = llave.ganador;
        document.getElementById(`${destino.sig}_${destino.slot}_nombre`).innerText = llave.ganador.aka;
        document.getElementById(`${destino.sig}_${destino.slot}_nombre`).style.color = "#fff"; 

        if(evento[destino.sig].mc1 !== null && evento[destino.sig].mc2 !== null) {
            let btnSig = document.getElementById(`btn_${destino.sig}`);
            btnSig.disabled = false;
            btnSig.style.backgroundColor = "#ff4757"; 
        }
    } else {
        document.getElementById('resumen_final').style.display = 'block';
        document.getElementById('c_camp').innerText = llave.ganador.aka;
        document.getElementById('c_sub').innerText = llave.perdedor.aka;
    }

    btn.disabled = true; btn.style.backgroundColor = "#2ed573"; btn.innerText = "✅ Registrado";
}

// ==========================================
// 5. CIERRE AUTOMÁTICO DINÁMICO
// ==========================================
async function cerrarTorneoAutomatico() {
    if(!confirm("¿Cerrar el evento y sumar la distribución de puntos?")) return;

    let bonoCamp = 0, bonoSub = 0, bonoSemi = 0, bonoCuartos = 0;

    if(limiteMcsActual === 16) {
        bonoCamp = Math.round(evento.pozo * 0.40);
        bonoSub = Math.round(evento.pozo * 0.20);
        bonoSemi = Math.round(evento.pozo * 0.10); // x2
        bonoCuartos = Math.round(evento.pozo * 0.05); // x4
    } else if (limiteMcsActual === 8) {
        bonoCamp = Math.round(evento.pozo * 0.40);
        bonoSub = Math.round(evento.pozo * 0.30);
        bonoSemi = Math.round(evento.pozo * 0.15); // x2
    } else if (limiteMcsActual === 4) {
        bonoCamp = Math.round(evento.pozo * 0.50);
        bonoSub = Math.round(evento.pozo * 0.30);
        bonoSemi = Math.round(evento.pozo * 0.10); // x2
    }

    async function sumarPremio(idMC, bono) {
        const { data } = await supabase.from('competidores').select('elo_actual').eq('id', idMC).single();
        await supabase.from('competidores').update({ elo_actual: data.elo_actual + bono }).eq('id', idMC);
    }

    await sumarPremio(evento.F.ganador.id, bonoCamp);     
    await sumarPremio(evento.F.perdedor.id, bonoSub);     
    await sumarPremio(evento.S1.perdedor.id, bonoSemi);   
    await sumarPremio(evento.S2.perdedor.id, bonoSemi);   
    
    if(limiteMcsActual >= 8) {
        await sumarPremio(evento.C1.perdedor.id, bonoCuartos);
        await sumarPremio(evento.C2.perdedor.id, bonoCuartos);
        await sumarPremio(evento.C3.perdedor.id, bonoCuartos);
        await sumarPremio(evento.C4.perdedor.id, bonoCuartos);
    }

    await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', evento.id);

    alert(`¡Finalizado!\nCampeón: +${bonoCamp}\nSubcampeón: +${bonoSub}\nSemifinalistas: +${bonoSemi}\nCuartos: +${bonoCuartos}`);
    window.location.reload();
}

// Exportar al HTML
window.cambiarFormato = cambiarFormato; window.filtrarBuscador = filtrarBuscador; 
window.agregarChip = agregarChip; window.quitarChip = quitarChip;
window.irACruces = irACruces; window.actualizarDesplegables = actualizarDesplegables;
window.iniciarTorneo = iniciarTorneo; window.procesarBatallaAuto = procesarBatallaAuto; 
window.cerrarTorneoAutomatico = cerrarTorneoAutomatico;

cargarBD();