import { supabase } from './supabase.js';

const K = 32;

let evento = {
    id: null, pozo: 0,
    s1: { mc1: null, mc2: null, ganador: null, perdedor: null },
    s2: { mc1: null, mc2: null, ganador: null, perdedor: null },
    f:  { mc1: null, mc2: null, ganador: null, perdedor: null }
};

let mcsDisponibles = [];

// ==========================================
// 1. CARGAR MCs EN LOS DESPLEGABLES DE CONFIGURACIÓN
// ==========================================
async function cargarMCsParaCheckboxes() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    mcsDisponibles = data;
    
    let opcionesHTML = '<option value="">Selecciona un MC...</option>';
    mcsDisponibles.forEach(mc => {
        opcionesHTML += `<option value="${mc.id}">${mc.aka} (${mc.elo_actual})</option>`;
    });

    // Llenamos los 4 menús del Panel 1
    ['setup_s1_mc1', 'setup_s1_mc2', 'setup_s2_mc1', 'setup_s2_mc2'].forEach(id => {
        document.getElementById(id).innerHTML = opcionesHTML;
    });
}

// ==========================================
// 2. INICIAR (FIJAR CRUCES MANUALES)
// ==========================================
async function iniciarTorneo() {
    let nombre = document.getElementById('nombreTorneo').value.trim();
    if (!nombre) return alert("Ponle un nombre al evento.");

    let id_s1_1 = parseInt(document.getElementById('setup_s1_mc1').value);
    let id_s1_2 = parseInt(document.getElementById('setup_s1_mc2').value);
    let id_s2_1 = parseInt(document.getElementById('setup_s2_mc1').value);
    let id_s2_2 = parseInt(document.getElementById('setup_s2_mc2').value);

    // Validar que se seleccionaron todos y no hay repetidos
    let unicos = new Set([id_s1_1, id_s1_2, id_s2_1, id_s2_2]);
    if (unicos.has(NaN)) return alert("Debes seleccionar a los 4 MCs.");
    if (unicos.size !== 4) return alert("No puedes repetir al mismo MC en el torneo.");

    // Buscar los objetos completos en nuestra lista
    evento.s1.mc1 = mcsDisponibles.find(m => m.id === id_s1_1);
    evento.s1.mc2 = mcsDisponibles.find(m => m.id === id_s1_2);
    evento.s2.mc1 = mcsDisponibles.find(m => m.id === id_s2_1);
    evento.s2.mc2 = mcsDisponibles.find(m => m.id === id_s2_2);

    // Calcular pozo inicial basado en los 4 exactos
    let sumaElo = evento.s1.mc1.elo_actual + evento.s1.mc2.elo_actual + evento.s2.mc1.elo_actual + evento.s2.mc2.elo_actual;
    evento.pozo = Math.round((sumaElo / 4) * 0.05);

    document.getElementById('mensajeConsola').innerHTML = "Creando registro oficial en la nube...";

    // A. Crear Torneo en DB
    const { data: torneoDB } = await supabase.from('torneos').insert([{ 
        nombre: nombre, estado: 'En Curso', elo_medio_calculado: Math.round(sumaElo/4), pozo_total: evento.pozo 
    }]).select();
    
    evento.id = torneoDB[0].id;

    // B. Inscribir en DB
    let registros = [
        { torneo_id: evento.id, competidor_id: id_s1_1 },
        { torneo_id: evento.id, competidor_id: id_s1_2 },
        { torneo_id: evento.id, competidor_id: id_s2_1 },
        { torneo_id: evento.id, competidor_id: id_s2_2 }
    ];
    await supabase.from('inscripciones').insert(registros);

    // C. Mostrar la pantalla del Bracket y pintar los nombres FIJADOS
    document.getElementById('panelCreacion').style.display = 'none';
    document.getElementById('panelTorneoActivo').style.display = 'block';
    document.getElementById('tituloTorneoActivo').innerText = `🔥 ${nombre} 🔥`;
    document.getElementById('infoPozoActivo').innerText = `Pozo en juego: 🏆 ${evento.pozo} pts`;

    document.getElementById('s1_mc1_nombre').innerText = evento.s1.mc1.aka;
    document.getElementById('s1_mc2_nombre').innerText = evento.s1.mc2.aka;
    document.getElementById('s2_mc1_nombre').innerText = evento.s2.mc1.aka;
    document.getElementById('s2_mc2_nombre').innerText = evento.s2.mc2.aka;
}

// ==========================================
// 3. PROCESAR BATALLAS (AUTO-AVANCE INTACTO)
// ==========================================
async function procesarBatallaAuto(faseStr) {
    let llave, idSelect, idBoton, nombreFase;
    
    if(faseStr === 'S1') { llave = evento.s1; idSelect = 's1_res'; idBoton = 'btn_s1'; nombreFase = 'Semifinal 1'; }
    if(faseStr === 'S2') { llave = evento.s2; idSelect = 's2_res'; idBoton = 'btn_s2'; nombreFase = 'Semifinal 2'; }
    if(faseStr === 'F')  { llave = evento.f;  idSelect = 'f_res';  idBoton = 'btn_f';  nombreFase = 'Final'; }

    let resultado = document.getElementById(idSelect).value;
    
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

    await supabase.from('batallas').insert([{ torneo_id: evento.id, fase: nombreFase, mc1_id: llave.mc1.id, mc2_id: llave.mc2.id, resultado: resultado }]);

    // AUTO-AVANCE: Mueve a los ganadores a la Final
    let ganoElUno = ['victoria', 'victoria_replica', 'victoria_total'].includes(resultado);
    llave.ganador = ganoElUno ? llave.mc1 : llave.mc2;
    llave.perdedor = ganoElUno ? llave.mc2 : llave.mc1;

    if(faseStr === 'S1') {
        evento.f.mc1 = llave.ganador; 
        document.getElementById('f_mc1_nombre').innerText = llave.ganador.aka;
    } else if(faseStr === 'S2') {
        evento.f.mc2 = llave.ganador; 
        document.getElementById('f_mc2_nombre').innerText = llave.ganador.aka;
    } else if(faseStr === 'F') {
        document.getElementById('resumen_final').style.display = 'block';
        document.getElementById('c_camp').innerText = llave.ganador.aka;
        document.getElementById('c_sub').innerText = llave.perdedor.aka;
    }

    let btn = document.getElementById(idBoton);
    btn.disabled = true;
    btn.innerText = "✅ Registrado";

    if(evento.s1.ganador && evento.s2.ganador) {
        let btnFinal = document.getElementById('btn_f');
        btnFinal.disabled = false;
        btnFinal.style.backgroundColor = "#ff4757"; 
    }
}

// ==========================================
// 4. CIERRE AUTOMÁTICO (REPARTIR POZO)
// ==========================================
async function cerrarTorneoAutomatico() {
    if(!confirm("¿Cerrar el evento histórico y sumar el pozo?")) return;

    let bonoCamp = Math.round(evento.pozo * 0.40);
    let bonoSub = Math.round(evento.pozo * 0.20);
    let bonoSemi = Math.round(evento.pozo * 0.10);

    async function sumarPremio(idMC, bono) {
        const { data } = await supabase.from('competidores').select('elo_actual').eq('id', idMC).single();
        await supabase.from('competidores').update({ elo_actual: data.elo_actual + bono }).eq('id', idMC);
    }

    await sumarPremio(evento.f.ganador.id, bonoCamp);     
    await sumarPremio(evento.f.perdedor.id, bonoSub);     
    await sumarPremio(evento.s1.perdedor.id, bonoSemi);   
    await sumarPremio(evento.s2.perdedor.id, bonoSemi);   

    await supabase.from('torneos').update({ estado: 'Finalizado' }).eq('id', evento.id);

    alert(`¡Registro Finalizado!\nCampeón: +${bonoCamp} pts\nSubcampeón: +${bonoSub} pts\nSemifinalistas: +${bonoSemi} pts`);
    window.location.reload();
}

window.iniciarTorneo = iniciarTorneo;
window.procesarBatallaAuto = procesarBatallaAuto;
window.cerrarTorneoAutomatico = cerrarTorneoAutomatico;

cargarMCsParaCheckboxes();