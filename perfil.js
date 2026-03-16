import { supabase } from './supabase.js';

let listaMCs = [];
let miGrafico = null; // Variable para guardar el gráfico y destruirlo si buscamos otro MC

// 1. CARGAR LISTA DE MCs EN EL BUSCADOR
async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = data;
    
    let html = '<option value="">Selecciona un MC para ver su historia...</option>';
    listaMCs.forEach(mc => {
        html += `<option value="${mc.id}">${mc.aka}</option>`;
    });
    document.getElementById('selectorMC').innerHTML = html;
}

// 2. CARGAR EL PERFIL DEL MC SELECCIONADO
async function cargarPerfil() {
    let idMC = document.getElementById('selectorMC').value;
    if (!idMC) {
        document.getElementById('zonaPerfil').style.display = 'none';
        return;
    }

    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    document.getElementById('statBatallas').innerText = mcPrincipal.batallas_totales;

    // Descargar todas las batallas donde participó este MC (como mc1 o mc2)
    // Traemos también los nombres de los torneos y de los oponentes gracias a los foreign keys
    const { data: batallas, error } = await supabase
        .from('batallas')
        .select(`
            fase, resultado, elo_previo_mc1, elo_previo_mc2, cambio_mc1, cambio_mc2,
            torneos(nombre, franquicia, fecha_evento),
            mc1:competidores!batallas_mc1_id_fkey(id, aka),
            mc2:competidores!batallas_mc2_id_fkey(id, aka)
        `)
        .or(`mc1_id.eq.${idMC},mc2_id.eq.${idMC}`);

    if (error) return alert("Error cargando historial.");

    // Filtrar batallas válidas y ordenar cronológicamente
    let batallasValidas = batallas.filter(b => b.torneos !== null);
    batallasValidas.sort((a, b) => new Date(a.torneos.fecha_evento) - new Date(b.torneos.fecha_evento));

    // Variables para las estadísticas y el gráfico
    let historialHtml = '';
    let etiquetasGrafico = ['Inicio'];
    let datosGrafico = [1500]; // Todos empiezan en 1500
    let peakElo = 1500;
    let victorias = 0;

    // Analizar batalla por batalla
    batallasValidas.forEach(b => {
        let soyMC1 = b.mc1.id == idMC;
        
        let oponente = soyMC1 ? b.mc2.aka : b.mc1.aka;
        let miEloPrevio = soyMC1 ? b.elo_previo_mc1 : b.elo_previo_mc2;
        let miCambio = soyMC1 ? b.cambio_mc1 : b.cambio_mc2;
        let miEloDespues = miEloPrevio + miCambio;

        // Determinar si gané, perdí o fue réplica
        let gane = false;
        let textoResultado = "";
        
        if (soyMC1) {
            gane = ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado);
        } else {
            gane = ['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado);
        }

        if (gane) victorias++;
        textoResultado = gane ? "<span class='win'>Victoria</span>" : "<span class='loss'>Derrota</span>";
        let claseCambio = miCambio >= 0 ? "win" : "loss";
        let signoCambio = miCambio >= 0 ? "+" : "";

        // Calcular Peak Elo
        if (miEloDespues > peakElo) peakElo = miEloDespues;

        // Agregar punto al gráfico
        etiquetasGrafico.push(b.torneos.franquicia);
        datosGrafico.push(miEloDespues);

        // Construir fila de la tabla (Se insertan al revés para ver las más nuevas arriba)
        let fila = `
            <tr>
                <td>${b.torneos.fecha_evento}</td>
                <td><strong>${b.torneos.nombre}</strong></td>
                <td>${b.fase}</td>
                <td>vs ${oponente}</td>
                <td>${textoResultado}</td>
                <td>${miEloPrevio}</td>
                <td class="${claseCambio}">${signoCambio}${miCambio} pts</td>
            </tr>
        `;
        historialHtml = fila + historialHtml; 
    });

    // Rellenar estadísticas finales
    document.getElementById('statPeakElo').innerText = peakElo;
    
    let winRate = batallasValidas.length > 0 ? Math.round((victorias / batallasValidas.length) * 100) : 0;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    
    if(historialHtml === '') historialHtml = '<tr><td colspan="7" style="text-align:center;">No hay batallas registradas aún.</td></tr>';
    document.getElementById('cuerpoHistorial').innerHTML = historialHtml;

    // Mostrar el panel y dibujar el gráfico
    document.getElementById('zonaPerfil').style.display = 'block';
    dibujarGrafico(etiquetasGrafico, datosGrafico, mcPrincipal.aka);
}

// 3. DIBUJAR EL GRÁFICO (CHART.JS)
function dibujarGrafico(etiquetas, datos, nombre) {
    let ctx = document.getElementById('eloChart').getContext('2d');
    
    // Si ya existe un gráfico anterior, lo destruimos para no superponerlos
    if (miGrafico) {
        miGrafico.destroy();
    }

    miGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: [{
                label: `Evolución de Elo - ${nombre}`,
                data: datos,
                borderColor: '#1e90ff',
                backgroundColor: 'rgba(30, 144, 255, 0.2)',
                borderWidth: 3,
                pointBackgroundColor: '#eccc68',
                pointRadius: 4,
                fill: true,
                tension: 0.3 // Hace que la línea sea un poco curva y elegante
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: '#373752' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#373752' } }
            }
        }
    });
}

window.cargarPerfil = cargarPerfil;
inicializar();