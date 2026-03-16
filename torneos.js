import { supabase } from './supabase.js';
const K = 32;

// Mapa inteligente de conexiones: ¿Quién pasa a dónde?
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

let evento = { id: null, pozo: 0, nombre: "" };
// Inicializar la estructura vacía en el objeto evento
Object.keys(RUTA_TORNEO).forEach(fase => {
    evento[fase] = { mc1: null, mc2: null, ganador: null, perdedor: null };
});

let mcsDisponibles = [];
let mcsSeleccionados = []; 

// ==========================================
// 1. CARGA INICIAL Y BUSCADOR (Igual que antes pero límite 16)
// ==========================================
async function cargarBD() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    mcsDisponibles = data;
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
        resultados.forEach(mc => {
            html += `<div class="sugerencia-item" onclick="agregarChip(${mc.id})"><span>${mc.aka}</span><span style="color: #888;">Elo: ${mc.elo_actual}</span></div>`;
        });
        cajaSugerencias.innerHTML = html;
    }
    cajaSugerencias.style.display = 'block';
}

function agregarChip(id) {
    if (mcsSeleccionados.length >= 16) {
        alert("Límite alcanzado: Ya tienes a los 16 competidores.");
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
    mcsSeleccionados.forEach(mc => {
        html += `<div class="chip">${mc.aka} <button class="chip-btn" onclick="quitarChip(${mc.id})">✖</button></div>`;
    });
    // Mostrar contador
    html += `<div style="width: 100%; text-align: center; color: #aaa; margin-top: 10px;">${mcsSeleccionados.length} / 16 MCs</div>`;
    contenedor.innerHTML = html;
}

// ==========================================
// 2. CONSTRUIR HTML DINÁMICO Y FILTRADO (V0.7.0)
// ==========================================
function irACruces() {
    evento.nombre = document.getElementById('nombreTorneo').value.trim();
    if (!evento.nombre) return alert("Ponle un nombre al evento.");
    if (mcsSeleccionados.length !== 16) return alert(`Para un formato de Octavos necesitas 16 MCs. Llevas ${mcsSeleccionados.length}.`);

    // DIBUJAR LAS 8 CAJAS DE CONFIGURACIÓN AUTOMÁTICAMENTE
    let htmlSetup = '';
    for(let i=1; i<=8; i++) {
        htmlSetup += `
        <div class="setup-cruce">
            <h4 style="margin: 0 0 10px 0; color: #1e90ff;">Llave ${i} (Octavos ${i})</h4>
            <select id="setup_O${i}_mc1" class="select-octavos" onchange="actualizarDesplegablesOctavos()"></select> 
            <div style="text-align: center; font-weight: bold; margin: 5px 0;">VS</div>
            <select id="setup_O${i}_mc2" class="select-octavos" onchange="actualizarDesplegablesOctavos()"></select>
        </div>`;
    }
    document.getElementById('contenedorSetupCruces').innerHTML = htmlSetup;

    // Llenamos los desplegables por primera vez con los 16 disponibles
    actualizarDesplegablesOctavos();

    document.getElementById('tituloPaso2').innerText = `Evento: ${evento.nombre}`;
    document.getElementById('panelSeleccion').style.display = 'none';
    document.getElementById('panelCreacion').style.display = 'block';
}

// --- ESCÁNER DE DISPONIBILIDAD ---
function actualizarDesplegablesOctavos() {
    let selects = document.querySelectorAll('.select-octavos'); // Atrapamos los 16 menús
    
    // 1. Mirar quiénes ya están seleccionados en toda la pantalla
    let idsOcupados = [];
    selects.forEach(s => {
        if(s.value !== "") idsOcupados.push(parseInt(s.value));
    });

    // 2. Actualizar las opciones de cada menú uno por uno
    selects.forEach(select => {
        let valorActual = select.value; // Guardamos a quién tiene seleccionado ESTE menú
        
        let opcionesHTML = '<option value="">Selecciona...</option>';
        
        mcsSeleccionados.forEach(mc => {
            // Mostrar al MC solo si NO está ocupado, o si está ocupado exactamente en ESTA caja.
            if (!idsOcupados.includes(mc.id) || parseInt(valorActual) === mc.id) {
                opcionesHTML += `<option value="${mc.id}">${mc.aka}</option>`;
            }
        });

        select.innerHTML = opcionesHTML;
        select.value = valorActual; 
    });
}

function generarHTMLBatalla(faseId, tituloFase) {
    // Si no es Octavos (O), el botón arranca bloqueado hasta que lleguen los MCs
    let btnBloqueado = faseId.startsWith('O') ? '' : 'disabled'; 
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
// 3. INICIAR EL TORNEO GIGANTE
// ==========================================
async function iniciarTorneo() {
    let idsAValidar = [];
    let sumaElo = 0;

    // Leer los 16 inputs de los Octavos
    for(let i=1; i<=8; i++) {
        let id1 = parseInt(document.getElementById(`setup_O${i}_mc1`).value);
        let id2 = parseInt(document.getElementById(`setup_O${i}_mc2`).value);
        idsAValidar.push(id1, id2);

        let mc1Obj = mcsSeleccionados.find(m => m.id === id1);
        let mc2Obj = mcsSeleccionados.find(m => m.id === id2);
        
        if(mc1Obj) sumaElo += mc1Obj.elo_actual;
        if(mc2Obj) sumaElo += mc2Obj.elo_actual;

        evento[`O${i}`].mc1 = mc1Obj;
        evento[`O${i}`].mc2 = mc2Obj;
    }

    let unicos = new Set(idsAValidar);
    if (unicos.has(NaN) || unicos.size !== 16) return alert("Debes asignar a los 16 participantes correctamente sin repetir.");

    // Calcular pozo (Media de los 16)
    evento.pozo = Math.round((sumaElo / 16) * 0.05);

    document.getElementById('mensajeConsola').innerHTML = "Registrando en la base de datos...";

    const { data: torneoDB } = await supabase.from('torneos').insert([{ 
        nombre: evento.nombre, estado: 'En Curso', elo_medio_calculado: Math.round(sumaElo/16), pozo_total: evento.pozo 
    }]).select();
    evento.id = torneoDB[0].id;

    // Inscribir a los 16 en lote
    let registrosInscripcion = idsAValidar.map(id => ({ torneo_id: evento.id, competidor_id: id }));
    await supabase.from('inscripciones').insert(registrosInscripcion);

    // DIBUJAR EL BRACKET ACTIVO DINÁMICAMENTE
    ['O', 'C', 'S', 'F'].forEach(faseLetra => {
        let maxIteraciones = faseLetra === 'O' ? 8 : (faseLetra === 'C' ? 4 : (faseLetra === 'S' ? 2 : 1));
        let contenedorDiv = document.getElementById(faseLetra === 'O' ? 'bracketOctavos' : (faseLetra === 'C' ? 'bracketCuartos' : (faseLetra === 'S' ? 'bracketSemis' : 'bracketFinal')));
        
        let htmlAcumulado = '';
        for(let i=1; i<=maxIteraciones; i++) {
            let idFase = faseLetra + (faseLetra === 'F' ? '' : i);
            let titulo = faseLetra === 'O' ? `Octavos ${i}` : (faseLetra === 'C' ? `Cuartos ${i}` : (faseLetra === 'S' ? `Semifinal ${i}` : 'Final'));
            htmlAcumulado += generarHTMLBatalla(idFase, titulo);
        }
        contenedorDiv.innerHTML = htmlAcumulado;
    });

    // Rellenar los nombres reales solo de la Fase Octavos
    for(let i=1; i<=8; i++) {
        document.getElementById(`O${i}_mc1_nombre`).innerText = evento[`O${i}`].mc1.aka;
        document.getElementById(`O${i}_mc2_nombre`).innerText = evento[`O${i}`].mc2.aka;
    }

    document.getElementById('panelCreacion').style.display = 'none';
    document.getElementById('panelTorneoActivo').style.display = 'block';
    document.getElementById('tituloTorneoActivo').innerText = `🔥 ${evento.nombre} 🔥`;
    document.getElementById('infoPozoActivo').innerText = `Pozo Histórico Generado: 🏆 ${evento.pozo} pts`;
}

// ==========================================
// 4. PROCESAR BATALLAS (CON CASCADA DE 16)
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

    // Registro Histórico en DB
    await supabase.from('batallas').insert([{ torneo_id: evento.id, fase: faseStr, mc1_id: llave.mc1.id, mc2_id: llave.mc2.id, resultado: resultado }]);

    // AUTO-AVANCE INTELIGENTE
    let ganoElUno = ['victoria', 'victoria_replica', 'victoria_total'].includes(resultado);
    llave.ganador = ganoElUno ? llave.mc1 : llave.mc2;
    llave.perdedor = ganoElUno ? llave.mc2 : llave.mc1;

    let destino = RUTA_TORNEO[faseStr]; // Miramos el mapa para saber a dónde va el ganador

    if(destino.sig !== 'FIN') {
        // Empujamos al ganador a la siguiente fase
        evento[destino.sig][destino.slot] = llave.ganador;
        document.getElementById(`${destino.sig}_${destino.slot}_nombre`).innerText = llave.ganador.aka;
        document.getElementById(`${destino.sig}_${destino.slot}_nombre`).style.color = "#fff"; // Resaltarlo

        // Desbloquear el botón de la siguiente fase SI AMBOS ya llegaron
        if(evento[destino.sig].mc1 !== null && evento[destino.sig].mc2 !== null) {
            let btnSig = document.getElementById(`btn_${destino.sig}`);
            btnSig.disabled = false;
            btnSig.style.backgroundColor = "#ff4757"; // Ponerlo en rojo activo
        }
    } else {
        // Llegamos al final de la ruta ('FIN')
        document.getElementById('resumen_final').style.display = 'block';
        document.getElementById('c_camp').innerText = llave.ganador.aka;
        document.getElementById('c_sub').innerText = llave.perdedor.aka;
    }

    btn.disabled = true;
    btn.style.backgroundColor = "#2ed573";
    btn.innerText = "✅ Registrado";
}

// ==========================================
// 5. CIERRE AUTOMÁTICO
// ==========================================
async function cerrarTorneoAutomatico() {
    if(!confirm("¿Cerrar el evento y sumar la distribución de 16 participantes?")) return;

    // Distribución perfecta de 100% para formato Octavos
    let bonoCamp = Math.round(evento.pozo * 0.40);
    let bonoSub = Math.round(evento.pozo * 0.20);
    let bonoSemi = Math.round(evento.pozo * 0.10); // x2 = 20%
    let bonoCuartos = Math.round(evento.pozo * 0.05); // x4 = 20%

    async function sumarPremio(idMC, bono) {
        const { data } = await supabase.from('competidores').select('elo_actual').eq('id', idMC).single();
        await supabase.from('competidores').update({ elo_actual: data.elo_actual + bono }).eq('id', idMC);
    }

    await sumarPremio(evento.F.ganador.id, bonoCamp);     
    await sumarPremio(evento.F.perdedor.id, bonoSub);     
    await sumarPremio(evento.S1.perdedor.id, bonoSemi);   
    await sumarPremio(evento.S2.perdedor.id, bonoSemi);   
    await sumarPremio(evento.C1.perdedor.id, bonoCuartos);
    await sumarPremio(evento.C2.perdedor.id, bonoCuartos);
    await sumarPremio(evento.C3.perdedor.id, bonoCuartos);
    await sumarPremio(evento.C4.perdedor.id, bonoCuartos);

    await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', evento.id);

    alert(`¡Registro Finalizado!\nCampeón: +${bonoCamp}\nSubcampeón: +${bonoSub}\nSemifinalistas: +${bonoSemi}\nCuartos: +${bonoCuartos}`);
    window.location.reload();
}

// Exportar al HTML
window.filtrarBuscador = filtrarBuscador; 
window.agregarChip = agregarChip; 
window.quitarChip = quitarChip;
window.irACruces = irACruces; 
window.actualizarDesplegablesOctavos = actualizarDesplegablesOctavos;
window.iniciarTorneo = iniciarTorneo; 
window.procesarBatallaAuto = procesarBatallaAuto; 
window.cerrarTorneoAutomatico = cerrarTorneoAutomatico;

cargarBD();