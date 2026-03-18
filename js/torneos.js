import { supabase, cargarFranquiciasSelect } from './supabase.js';
import { configurarSesion } from './auth.js';
const K = 32;

const RUTA_TORNEO = {
    'O1': { sig: 'C1', slot: 'mc1' }, 'O2': { sig: 'C1', slot: 'mc2' },
    'O3': { sig: 'C2', slot: 'mc1' }, 'O4': { sig: 'C2', slot: 'mc2' },
    'O5': { sig: 'C3', slot: 'mc1' }, 'O6': { sig: 'C3', slot: 'mc2' },
    'O7': { sig: 'C4', slot: 'mc1' }, 'O8': { sig: 'C4', slot: 'mc2' },
    'C1': { sig: 'S1', slot: 'mc1' }, 'C2': { sig: 'S1', slot: 'mc2' },
    'C3': { sig: 'S2', slot: 'mc1' }, 'C4': { sig: 'S2', slot: 'mc2' },
    'S1': { sig: 'F', slot: 'mc1' },  'S2': { sig: 'F', slot: 'mc2' },
    'F':  { sig: 'FIN', slot: null }, '3P': { sig: 'FIN', slot: null } // Agregamos 3P a la ruta
};

let evento = { id: null, pozo: 0, nombre: "", franquicia: "", formatoStr: "", fecha: "" };
Object.keys(RUTA_TORNEO).forEach(fase => { evento[fase] = { mc1: null, mc2: null, ganador: null, perdedor: null }; });

let mcsDisponibles = []; let mcsSeleccionados = []; let limiteMcsActual = 16; let batallasLigaPreparadas = []; 

async function cargarBD() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    mcsDisponibles = data;
}

function cambiarFormato() {
    let val = document.getElementById('formatoTorneo').value;
    if (val === 'liga') {
        limiteMcsActual = 30; document.getElementById('tituloRoster').innerText = `Roster de la Jornada (Añade a los participantes de hoy)`;
    } else {
        limiteMcsActual = parseInt(val); document.getElementById('tituloRoster').innerText = `Roster del Torneo (Elige ${limiteMcsActual} MCs)`;
    }
    if(mcsSeleccionados.length > limiteMcsActual) { mcsSeleccionados = mcsSeleccionados.slice(0, limiteMcsActual); dibujarChips(); }
}

function filtrarBuscador() {
    let textoOriginal = document.getElementById('buscadorMCs').value.trim(); let texto = textoOriginal.toLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');
    if (texto.length < 1) return cajaSugerencias.style.display = 'none';

    let resultados = mcsDisponibles.filter(mc => mc.aka.toLowerCase().includes(texto) && !mcsSeleccionados.find(sel => sel.id === mc.id));
    let html = '';
    if (resultados.length === 0) html += `<div class="sugerencia-item" style="color: #888;">No se encontraron MCs</div>`;
    else resultados.forEach(mc => { html += `<div class="sugerencia-item" onclick="agregarChip(${mc.id})"><span>${mc.aka}</span><span style="color: #888;">Elo: ${mc.elo_actual}</span></div>`; });

    let coincidenciaExacta = mcsDisponibles.find(mc => mc.aka.toLowerCase() === texto);
    if (!coincidenciaExacta && textoOriginal.length > 0) html += `<div class="sugerencia-item" style="background: #eef9f0; color: #28a745; font-weight: bold;" onclick="crearYAgregarMC('${textoOriginal}')">➕ Crear "${textoOriginal}"</div>`;
    cajaSugerencias.innerHTML = html; cajaSugerencias.style.display = 'block';
}

function agregarChip(id) {
    if (mcsSeleccionados.length >= limiteMcsActual) return alert(`Límite alcanzado.`);
    mcsSeleccionados.push(mcsDisponibles.find(m => m.id === id));
    document.getElementById('buscadorMCs').value = ''; document.getElementById('sugerenciasMCs').style.display = 'none'; dibujarChips();
}

async function crearYAgregarMC(nombre) {
    if (mcsSeleccionados.length >= limiteMcsActual) return;
    document.getElementById('sugerenciasMCs').innerHTML = '<div class="sugerencia-item">⏳ Creando...</div>';
    const { data, error } = await supabase.from('competidores').insert([{ aka: nombre, nacionalidad: '🌍', foto: 'https://via.placeholder.com/150/373752/FFFFFF?text=MC', elo_actual: 1500, batallas_totales: 0 }]).select();
    if (error) return alert("Error al crear el MC.");
    let nuevoMC = data[0]; mcsDisponibles.push(nuevoMC); mcsSeleccionados.push(nuevoMC);
    document.getElementById('buscadorMCs').value = ''; document.getElementById('sugerenciasMCs').style.display = 'none'; dibujarChips();
}

function quitarChip(id) { mcsSeleccionados = mcsSeleccionados.filter(mc => mc.id !== id); dibujarChips(); }

function dibujarChips() {
    let contenedor = document.getElementById('contenedorChips');
    if (mcsSeleccionados.length === 0) return contenedor.innerHTML = '<span style="color: #57606f; margin: auto;">Esperando competidores...</span>';
    let html = '';
    mcsSeleccionados.forEach(mc => { html += `<div class="chip">${mc.aka} <button class="chip-btn" onclick="quitarChip(${mc.id})">✖</button></div>`; });
    html += `<div style="width: 100%; text-align: center; color: #aaa; margin-top: 10px;">${document.getElementById('formatoTorneo').value === 'liga' ? mcsSeleccionados.length + ' MCs Listos' : mcsSeleccionados.length + ' / ' + limiteMcsActual + ' MCs'}</div>`;
    contenedor.innerHTML = html;
}

function irACruces() {
    evento.nombre = document.getElementById('nombreTorneo').value.trim(); evento.franquicia = document.getElementById('franquiciaTorneo').value;
    evento.formatoStr = document.getElementById('formatoTorneo').options[document.getElementById('formatoTorneo').selectedIndex].text; evento.fecha = document.getElementById('fechaTorneo').value;
    let isLiga = document.getElementById('formatoTorneo').value === 'liga';
    
    if (!evento.nombre) return alert("Ponle un nombre al evento."); if (!evento.fecha) return alert("Selecciona la fecha.");
    if (!isLiga && mcsSeleccionados.length !== limiteMcsActual) return alert(`Faltan competidores.`);
    if (isLiga && mcsSeleccionados.length < 2) return alert(`Necesitas al menos 2 MCs.`);

    if (isLiga) {
        document.getElementById('contenedorSetupCruces').style.display = 'none'; document.getElementById('setupLigaDiv').style.display = 'block'; document.getElementById('tituloFaseArmado').innerText = `Paso 2: Organizar Jornada`;
        let opts = '<option value="">Seleccionar MC...</option>'; mcsSeleccionados.forEach(mc => opts += `<option value="${mc.id}">${mc.aka}</option>`);
        document.getElementById('ligaMC1').innerHTML = opts; document.getElementById('ligaMC2').innerHTML = opts;
    } else {
        document.getElementById('contenedorSetupCruces').style.display = 'grid'; document.getElementById('setupLigaDiv').style.display = 'none'; document.getElementById('tituloFaseArmado').innerText = `Paso 2: Cruces Oficiales`;
        let htmlSetup = ''; let prefijo = limiteMcsActual === 16 ? 'O' : (limiteMcsActual === 8 ? 'C' : 'S'); let nombreFase = limiteMcsActual === 16 ? 'Octavos' : (limiteMcsActual === 8 ? 'Cuartos' : 'Semifinal');
        for(let i=1; i<=limiteMcsActual/2; i++) {
            htmlSetup += `<div class="setup-cruce"><h4 style="margin: 0 0 10px 0; color: #1e90ff;">Llave ${i} (${nombreFase} ${i})</h4><select id="setup_${prefijo}${i}_mc1" class="select-fase" onchange="actualizarDesplegables()"></select> <div style="text-align: center; font-weight: bold; margin: 5px 0;">VS</div><select id="setup_${prefijo}${i}_mc2" class="select-fase" onchange="actualizarDesplegables()"></select></div>`;
        }
        document.getElementById('contenedorSetupCruces').innerHTML = htmlSetup; actualizarDesplegables();
    }
    document.getElementById('tituloPaso2').innerText = `${evento.franquicia} | ${evento.nombre}`;
    document.getElementById('panelSeleccion').style.display = 'none'; document.getElementById('panelCreacion').style.display = 'block';
}

function actualizarDesplegables() {
    let selects = document.querySelectorAll('.select-fase'); let idsOcupados = [];
    selects.forEach(s => { if(s.value !== "") idsOcupados.push(parseInt(s.value)); });
    selects.forEach(select => {
        let valorActual = select.value; let opcionesHTML = '<option value="">Selecciona...</option>';
        mcsSeleccionados.forEach(mc => { if (!idsOcupados.includes(mc.id) || parseInt(valorActual) === mc.id) { opcionesHTML += `<option value="${mc.id}">${mc.aka}</option>`; } });
        select.innerHTML = opcionesHTML; select.value = valorActual; 
    });
}

function agregarBatallaLiga() {
    let f = document.getElementById('ligaFase').value.trim(); let id1 = document.getElementById('ligaMC1').value; let id2 = document.getElementById('ligaMC2').value;
    if(!f || !id1 || !id2) return alert("Completa todos los campos"); if(id1 === id2) return alert("Un MC no puede batallar contra sí mismo");
    batallasLigaPreparadas.push({ idTemp: 'LIGA_' + (batallasLigaPreparadas.length + 1), fase: f, mc1: mcsSeleccionados.find(m => m.id == id1), mc2: mcsSeleccionados.find(m => m.id == id2) });
    document.getElementById('ligaMC1').value = ""; document.getElementById('ligaMC2').value = ""; renderizarListaLiga();
}

function renderizarListaLiga() {
    let html = '';
    batallasLigaPreparadas.forEach((b, index) => { html += `<div style="background: #1e1e2f; padding: 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid #eccc68; border-radius: 4px;"><span><strong style="color: #eccc68;">[${b.fase}]</strong> ${b.mc1.aka} vs ${b.mc2.aka}</span><button onclick="quitarBatallaLiga(${index})" style="background: transparent; color: #ff4757; width: auto; padding: 0; margin: 0; font-size: 18px;">✖</button></div>`; });
    document.getElementById('listaBatallasLiga').innerHTML = html;
}

function quitarBatallaLiga(index) { batallasLigaPreparadas.splice(index, 1); renderizarListaLiga(); }

function generarHTMLBatalla(faseId, tituloFase, faseArranque, esLiga = false) {
    let btnBloqueado = (!esLiga && !faseId.startsWith(faseArranque)) ? 'disabled' : ''; 
    return `
    <div class="batalla-caja" id="caja_${faseId}">
        <h4>${tituloFase}</h4>
        <div class="versus"><span class="mc-name" id="${faseId}_mc1_nombre">Esperando...</span> <span class="vs-text">VS</span> <span class="mc-name" id="${faseId}_mc2_nombre">Esperando...</span></div>
        <select id="${faseId}_res">
            <option value="victoria">Victoria Izquierda</option>
            <option value="victoria_replica">Victoria Réplica Izquierda</option>
            <option value="derrota_replica">Victoria Réplica Derecha</option>
            <option value="derrota">Victoria Derecha</option>
            <option value="victoria_total">Victoria Total Izquierda</option>
            <option value="derrota_total">Victoria Total Derecha</option>
        </select>
        <button class="btn-batalla" id="btn_${faseId}" onclick="procesarBatallaAuto('${faseId}', ${esLiga})" ${btnBloqueado}>⚔️ Registrar</button>
    </div>`;
}

async function iniciarTorneo() {
    let isLiga = document.getElementById('formatoTorneo').value === 'liga'; let sumaElo = 0;

    if (isLiga) {
        if (batallasLigaPreparadas.length === 0) return alert("Añade al menos una batalla.");
        evento.pozo = 0; document.getElementById('mensajeConsola').innerHTML = "Creando Jornada...";
        const { data: torneoDB, error } = await supabase.from('torneos').insert([{ nombre: evento.nombre, franquicia: evento.franquicia, formato: evento.formatoStr, fecha_evento: evento.fecha, estado: 'En Curso', elo_medio_calculado: 1500, pozo_total: 0 }]).select();
        if (error) return alert("Error al guardar."); evento.id = torneoDB[0].id;

        let idsUnicos = [...new Set(batallasLigaPreparadas.flatMap(b => [b.mc1.id, b.mc2.id]))];
        await supabase.from('inscripciones').insert(idsUnicos.map(id => ({ torneo_id: evento.id, competidor_id: id })));

        document.getElementById('zonaOctavos').style.display = 'none'; document.getElementById('zonaCuartos').style.display = 'none'; document.getElementById('zonaSemis').style.display = 'none'; document.getElementById('zonaFinal').style.display = 'none'; document.getElementById('cierre_eliminatoria').style.display = 'none';
        document.getElementById('zonaLigaActiva').style.display = 'block'; document.getElementById('resumen_final').style.display = 'block'; document.getElementById('cierre_liga').style.display = 'block';

        let htmlAcumulado = '';
        batallasLigaPreparadas.forEach(b => { evento[b.idTemp] = { mc1: b.mc1, mc2: b.mc2, faseReal: b.fase }; htmlAcumulado += generarHTMLBatalla(b.idTemp, b.fase, '', true); });
        document.getElementById('bracketLiga').innerHTML = htmlAcumulado;

        batallasLigaPreparadas.forEach(b => { document.getElementById(`${b.idTemp}_mc1_nombre`).innerText = b.mc1.aka; document.getElementById(`${b.idTemp}_mc2_nombre`).innerText = b.mc2.aka; document.getElementById(`${b.idTemp}_mc1_nombre`).style.color = "#fff"; document.getElementById(`${b.idTemp}_mc2_nombre`).style.color = "#fff"; });

    } else {
        let idsAValidar = []; let prefijo = limiteMcsActual === 16 ? 'O' : (limiteMcsActual === 8 ? 'C' : 'S');
        for(let i=1; i<=limiteMcsActual/2; i++) {
            let id1 = parseInt(document.getElementById(`setup_${prefijo}${i}_mc1`).value); let id2 = parseInt(document.getElementById(`setup_${prefijo}${i}_mc2`).value);
            idsAValidar.push(id1, id2);
            let mc1Obj = mcsSeleccionados.find(m => m.id === id1); let mc2Obj = mcsSeleccionados.find(m => m.id === id2);
            if(mc1Obj) sumaElo += mc1Obj.elo_actual; if(mc2Obj) sumaElo += mc2Obj.elo_actual;
            evento[`${prefijo}${i}`].mc1 = mc1Obj; evento[`${prefijo}${i}`].mc2 = mc2Obj;
        }

        let unicos = new Set(idsAValidar); if (unicos.has(NaN) || unicos.size !== limiteMcsActual) return alert("Asigna a todos sin repetir.");
        evento.pozo = Math.round((sumaElo / limiteMcsActual) * 0.05); document.getElementById('mensajeConsola').innerHTML = "Registrando...";

        const { data: torneoDB, error } = await supabase.from('torneos').insert([{ nombre: evento.nombre, franquicia: evento.franquicia, formato: evento.formatoStr, fecha_evento: evento.fecha, estado: 'En Curso', elo_medio_calculado: Math.round(sumaElo/limiteMcsActual), pozo_total: evento.pozo }]).select();
        if (error) return alert("Error al guardar."); evento.id = torneoDB[0].id;

        await supabase.from('inscripciones').insert(idsAValidar.map(id => ({ torneo_id: evento.id, competidor_id: id })));

        if(limiteMcsActual <= 8) document.getElementById('zonaOctavos').style.display = 'none'; if(limiteMcsActual === 4) document.getElementById('zonaCuartos').style.display = 'none';

        let fasesAdibujar = limiteMcsActual === 16 ? ['O', 'C', 'S', 'F'] : (limiteMcsActual === 8 ? ['C', 'S', 'F'] : ['S', 'F']);
        fasesAdibujar.forEach(faseLetra => {
            let max = faseLetra === 'O' ? 8 : (faseLetra === 'C' ? 4 : (faseLetra === 'S' ? 2 : 1));
            let contenedor = document.getElementById(faseLetra === 'O' ? 'bracketOctavos' : (faseLetra === 'C' ? 'bracketCuartos' : (faseLetra === 'S' ? 'bracketSemis' : 'bracketFinal')));
            let htmlAcumulado = '';
            for(let i=1; i<=max; i++) {
                let idFase = faseLetra + (faseLetra === 'F' ? '' : i);
                let titulo = faseLetra === 'O' ? `Octavos ${i}` : (faseLetra === 'C' ? `Cuartos ${i}` : (faseLetra === 'S' ? `Semifinal ${i}` : 'Final'));
                htmlAcumulado += generarHTMLBatalla(idFase, titulo, prefijo, false); 
            }
            contenedor.innerHTML = htmlAcumulado;
        });
        
        // V2.2: Generar y dibujar el 3er Puesto siempre que no sea Liga
        document.getElementById('bracketTercero').innerHTML = generarHTMLBatalla('3P', 'Batalla por el Bronce', 'ZZZ', false); // ZZZ para que inicie bloqueado

        for(let i=1; i<=limiteMcsActual/2; i++) {
            document.getElementById(`${prefijo}${i}_mc1_nombre`).innerText = evento[`${prefijo}${i}`].mc1.aka; document.getElementById(`${prefijo}${i}_mc2_nombre`).innerText = evento[`${prefijo}${i}`].mc2.aka;
        }
    }

    document.getElementById('panelCreacion').style.display = 'none'; document.getElementById('panelTorneoActivo').style.display = 'block';
    document.getElementById('tituloTorneoActivo').innerText = `🔥 ${evento.franquicia}: ${evento.nombre} 🔥`;
    document.getElementById('infoPozoActivo').innerText = isLiga ? 'Modo Liga: Cálculo de Elo Directo' : `Pozo Histórico Generado: 🏆 ${evento.pozo} pts`;
}

async function procesarBatallaAuto(faseStr, esLiga = false) {
    let llave = evento[faseStr]; let resultado = document.getElementById(`${faseStr}_res`).value; let btn = document.getElementById(`btn_${faseStr}`);
    
    const { data: db1 } = await supabase.from('competidores').select('elo_actual, batallas_totales').eq('id', llave.mc1.id).single();
    const { data: db2 } = await supabase.from('competidores').select('elo_actual, batallas_totales').eq('id', llave.mc2.id).single();

    let R1 = db1.elo_actual; let R2 = db2.elo_actual;
    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400)); let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
    let S1 = 0, S2 = 0; let bonoTotal1 = false, bonoTotal2 = false;

    if (resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bonoTotal1 = true; } else if (resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
    else if (resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } else if (resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
    else if (resultado === "derrota") { S1 = 0.0; S2 = 1.0; } else if (resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bonoTotal2 = true; }

    let p1 = Math.round(K * (S1 - E1) * (bonoTotal1 ? 1.2 : 1)); let p2 = Math.round(K * (S2 - E2) * (bonoTotal2 ? 1.2 : 1));

    await supabase.from('competidores').update({ elo_actual: R1 + p1, batallas_totales: db1.batallas_totales + 1 }).eq('id', llave.mc1.id);
    await supabase.from('competidores').update({ elo_actual: R2 + p2, batallas_totales: db2.batallas_totales + 1 }).eq('id', llave.mc2.id);

    let stringFase = esLiga ? llave.faseReal : (faseStr === '3P' ? '3er Puesto' : faseStr);

    await supabase.from('batallas').insert([{ torneo_id: evento.id, fase: stringFase, mc1_id: llave.mc1.id, mc2_id: llave.mc2.id, resultado: resultado, elo_previo_mc1: R1, elo_previo_mc2: R2, cambio_mc1: p1, cambio_mc2: p2 }]);

    if (!esLiga) {
        let ganoElUno = ['victoria', 'victoria_replica', 'victoria_total'].includes(resultado);
        llave.ganador = ganoElUno ? llave.mc1 : llave.mc2; llave.perdedor = ganoElUno ? llave.mc2 : llave.mc1;

        // MAGIA DEL 3ER PUESTO (Envía a los perdedores de Semis a la batalla 3P)
        if (faseStr === 'S1') evento['3P'].mc1 = llave.perdedor;
        if (faseStr === 'S2') evento['3P'].mc2 = llave.perdedor;

        if (faseStr === 'S1' || faseStr === 'S2') {
            if (evento['3P'].mc1 !== null && evento['3P'].mc2 !== null) {
                document.getElementById(`3P_mc1_nombre`).innerText = evento['3P'].mc1.aka;
                document.getElementById(`3P_mc2_nombre`).innerText = evento['3P'].mc2.aka;
                document.getElementById(`3P_mc1_nombre`).style.color = "#fff"; document.getElementById(`3P_mc2_nombre`).style.color = "#fff";
                document.getElementById(`btn_3P`).disabled = false; document.getElementById(`btn_3P`).style.backgroundColor = "#ff4757";
            }
        }

        let destino = RUTA_TORNEO[faseStr]; 
        if(destino.sig !== 'FIN') {
            evento[destino.sig][destino.slot] = llave.ganador;
            document.getElementById(`${destino.sig}_${destino.slot}_nombre`).innerText = llave.ganador.aka; document.getElementById(`${destino.sig}_${destino.slot}_nombre`).style.color = "#fff"; 
            if(evento[destino.sig].mc1 !== null && evento[destino.sig].mc2 !== null) {
                document.getElementById(`btn_${destino.sig}`).disabled = false; document.getElementById(`btn_${destino.sig}`).style.backgroundColor = "#ff4757"; 
            }
        }
        
        // Verifica si ya terminaron la Final Y el 3er Puesto para habilitar el cierre
        if ((faseStr === 'F' || faseStr === '3P') && evento.F.ganador && evento['3P'].ganador) {
            document.getElementById('resumen_final').style.display = 'block';
            document.getElementById('c_camp').innerText = evento.F.ganador.aka;
            document.getElementById('c_sub').innerText = evento.F.perdedor.aka;
            document.getElementById('c_tercero').innerText = evento['3P'].ganador.aka;
        }
    }

    btn.disabled = true; btn.style.backgroundColor = "#2ed573"; btn.innerText = "✅ Registrado";
}

async function cerrarTorneoAutomatico() {
    if(!confirm("¿Cerrar el evento y sumar la distribución de puntos?")) return;

    let bonoCamp = 0, bonoSub = 0, bonoTercero = 0, bonoCuarto = 0, bonoCuartos = 0;

    if(limiteMcsActual === 16) {
        bonoCamp = Math.round(evento.pozo * 0.35); bonoSub = Math.round(evento.pozo * 0.20);
        bonoTercero = Math.round(evento.pozo * 0.12); bonoCuarto = Math.round(evento.pozo * 0.08); bonoCuartos = Math.round(evento.pozo * 0.05); 
    } else if (limiteMcsActual === 8) {
        bonoCamp = Math.round(evento.pozo * 0.40); bonoSub = Math.round(evento.pozo * 0.25); 
        bonoTercero = Math.round(evento.pozo * 0.15); bonoCuarto = Math.round(evento.pozo * 0.10);
    } else if (limiteMcsActual === 4) {
        bonoCamp = Math.round(evento.pozo * 0.45); bonoSub = Math.round(evento.pozo * 0.30); 
        bonoTercero = Math.round(evento.pozo * 0.15); bonoCuarto = Math.round(evento.pozo * 0.10);
    }

    async function sumarPremio(idMC, bono, tituloPremio) {
        const { data } = await supabase.from('competidores').select('elo_actual').eq('id', idMC).single();
        await supabase.from('competidores').update({ elo_actual: data.elo_actual + bono }).eq('id', idMC);
        await supabase.from('batallas').insert([{ torneo_id: evento.id, fase: tituloPremio, mc1_id: idMC, mc2_id: idMC, resultado: 'bono', elo_previo_mc1: data.elo_actual, elo_previo_mc2: data.elo_actual, cambio_mc1: bono, cambio_mc2: 0 }]);
    }

    document.querySelector('.btn-cerrar').innerText = "⏳ Repartiendo Pozos...";

    await sumarPremio(evento.F.ganador.id, bonoCamp, '🏆 Campeón');     
    await sumarPremio(evento.F.perdedor.id, bonoSub, '🥈 Subcampeón');     
    await sumarPremio(evento['3P'].ganador.id, bonoTercero, '🥉 Tercer Lugar');   
    await sumarPremio(evento['3P'].perdedor.id, bonoCuarto, '🎖️ Cuarto Lugar');   
    
    if(limiteMcsActual >= 8) {
        await sumarPremio(evento.C1.perdedor.id, bonoCuartos, '🏅 Cuartofinalista'); await sumarPremio(evento.C2.perdedor.id, bonoCuartos, '🏅 Cuartofinalista');
        await sumarPremio(evento.C3.perdedor.id, bonoCuartos, '🏅 Cuartofinalista'); await sumarPremio(evento.C4.perdedor.id, bonoCuartos, '🏅 Cuartofinalista');
    }

    await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', evento.id);
    alert(`¡Finalizado!\nCampeón: +${bonoCamp} pts\n3er Lugar: +${bonoTercero} pts`);
    window.location.reload();
}

async function cerrarLiga() {
    if(!confirm("¿Deseas dar por terminada esta Jornada/Liga? Todo ha quedado guardado automáticamente.")) return;
    await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', evento.id); alert("¡Jornada finalizada con éxito!"); window.location.reload();
}

window.cambiarFormato = cambiarFormato; window.filtrarBuscador = filtrarBuscador; window.agregarChip = agregarChip; window.quitarChip = quitarChip; window.irACruces = irACruces; window.actualizarDesplegables = actualizarDesplegables; window.iniciarTorneo = iniciarTorneo; window.procesarBatallaAuto = procesarBatallaAuto; window.cerrarTorneoAutomatico = cerrarTorneoAutomatico; window.crearYAgregarMC = crearYAgregarMC; window.agregarBatallaLiga = agregarBatallaLiga; window.quitarBatallaLiga = quitarBatallaLiga; window.cerrarLiga = cerrarLiga;

configurarSesion();
cargarBD();
cargarFranquiciasSelect('franquiciaTorneo', false);