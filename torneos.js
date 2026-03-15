import { supabase } from './supabase.js';

let mcsDisponibles = [];

// ==========================================
// 1. CARGAR MCs PARA LOS CHECKBOXES
// ==========================================
async function cargarMCsParaCheckboxes() {
    const { data, error } = await supabase
        .from('competidores')
        .select('*')
        .order('aka', { ascending: true }); // Ordenados alfabéticamente

    if (error) return console.error("Error cargando MCs:", error);
    
    mcsDisponibles = data;
    let html = '';

    mcsDisponibles.forEach(mc => {
        html += `
            <label>
                <input type="checkbox" class="mc-checkbox" value="${mc.id}" data-elo="${mc.elo_actual}">
                ${mc.aka} (${mc.elo_actual})
            </label>
        `;
    });

    document.getElementById('listaCheckboxes').innerHTML = html;
}

// ==========================================
// 2. LA LÓGICA DE INICIAR EL TORNEO
// ==========================================
async function iniciarTorneo() {
    let nombre = document.getElementById('nombreTorneo').value.trim();
    if (!nombre) return alert("Por favor, ponle un nombre al torneo.");

    // Recolectar todas las casillas que el usuario marcó
    let checkboxesMarcados = document.querySelectorAll('.mc-checkbox:checked');

    // Validación estricta para nuestra prueba
    if (checkboxesMarcados.length !== 4) {
        return alert(`Para esta prueba debes seleccionar exactamente 4 MCs. Has seleccionado ${checkboxesMarcados.length}.`);
    }

    // Calcular la media y preparar IDs
    let sumaElo = 0;
    let idsSeleccionados = [];

    checkboxesMarcados.forEach(cb => {
        sumaElo += parseInt(cb.getAttribute('data-elo'));
        idsSeleccionados.push(parseInt(cb.value));
    });

    let mediaElo = sumaElo / 4;
    let pozoCalculado = Math.round(mediaElo * 0.05);

    document.getElementById('mensajeConsola').innerHTML = "⏳ Creando el torneo en la nube...";

    // --- PASO A: CREAR EL TORNEO ---
    const { data: torneoCreado, error: errorTorneo } = await supabase
        .from('torneos')
        .insert([{
            nombre: nombre,
            estado: 'En Curso',
            elo_medio_calculado: Math.round(mediaElo),
            pozo_total: pozoCalculado
        }])
        .select(); // IMPORTANTE: Esto le pide a Supabase que nos devuelva la fila recién creada

    if (errorTorneo) return alert("Error al crear el torneo en la base de datos.");

    // Obtenemos el ID oficial que Supabase le asignó a este evento
    let idDelTorneoNuevo = torneoCreado[0].id;

    // --- PASO B: INSCRIBIR A LOS PARTICIPANTES ---
    // Preparamos un paquete de datos con los 4 MCs apuntando al mismo torneo
    let inscripcionesParaInsertar = idsSeleccionados.map(mcId => {
        return { torneo_id: idDelTorneoNuevo, competidor_id: mcId };
    });

    const { error: errorInscripciones } = await supabase
        .from('inscripciones')
        .insert(inscripcionesParaInsertar);

    if (errorInscripciones) return alert("Error al registrar a los participantes.");

    // --- ÉXITO ---
    document.getElementById('mensajeConsola').innerHTML = `
        ✅ ¡Torneo "${nombre}" creado con éxito!<br><br>
        Media de Elo: ${Math.round(mediaElo)} pts.<br>
        Pozo de Premios Fijado: 🏆 ${pozoCalculado} pts.
    `;
    
    // Limpiamos la pantalla
    document.getElementById('nombreTorneo').value = "";
    checkboxesMarcados.forEach(cb => cb.checked = false);
}

// ==========================================
// 3. EXPORTAR Y ARRANCAR
// ==========================================
window.iniciarTorneo = iniciarTorneo;
cargarMCsParaCheckboxes();