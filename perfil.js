import { supabase } from './supabase.js';

let listaMCs = [];
let miGrafico = null; 

// 1. CARGA INICIAL
async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = data;
}

// 2. EL BUSCADOR AUTOCOMPLETADO
function filtrarBuscador() {
    let texto = document.getElementById('buscadorMCs').value.toLowerCase();
    let cajaSugerencias = document.getElementById('sugerenciasMCs');

    if (texto.length < 1) return cajaSugerencias.style.display = 'none';

    let resultados = listaMCs.filter(mc => mc.aka.toLowerCase().includes(texto));

    let html = '';
    if (resultados.length === 0) {
        html += `<div class="sugerencia-item" style="color: #888;">No se encontraron MCs</div>`;
    } else {
        resultados.forEach(mc => { 
            html += `<div class="sugerencia-item" onclick="cargarPerfil(${mc.id})"><span>${mc.aka}</span><span style="color: #888;">Elo: ${mc.elo_actual}</span></div>`; 
        });
    }
    cajaSugerencias.innerHTML = html;
    cajaSugerencias.style.display = 'block';
}

// 3. CARGAR EL PERFIL DEL MC
async function cargarPerfil(idMC) {
    // Esconder sugerencias y poner el nombre en el buscador
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('buscadorMCs').value = mcPrincipal.aka;
    document.getElementById('sugerenciasMCs').style.display = 'none';

    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    document.getElementById('statBatallas').innerText = mcPrincipal.batallas_totales;

    // SE AGREGA 'id' AL SELECT PARA PODER ORDENAR CRONOLÓGICAMENTE SI COMPARTEN FECHA
    const { data: batallas, error } = await supabase
        .from('batallas')
        .select(`
            id, fase, resultado, elo_previo_mc1, elo_previo_mc2, cambio_mc1, cambio_mc2,
            torneos(nombre, franquicia, fecha_evento),
            mc1:competidores!batallas_mc1_id_fkey(id, aka),
            mc2:competidores!batallas_mc2_id_fkey(id, aka)
        `)
        .or(`mc1_id.eq.${idMC},mc2_id.eq.${idMC}`);

    if (error) return alert("Error cargando historial.");

    let batallasValidas = batallas.filter(b => b.torneos !== null);
    
    // EL TRUCO DEL ORDEN PERFECTO (Por Fecha, y luego por ID de inserción)
    batallasValidas.sort((a, b) => {
        let dateA = new Date(a.torneos.fecha_evento).getTime();
        let dateB = new Date(b.torneos.fecha_evento).getTime();
        if (dateA === dateB) {
            return a.id - b.id; // Si jugaron el mismo día, el ID nos dice qué fue primero (Octavos -> Cuartos)
        }
        return dateA - dateB;
    });

    let historialHtml = '';
    let etiquetasGrafico = ['Inicio'];
    let datosGrafico = [1500]; 
    let peakElo = 1500;
    let victorias = 0;

    batallasValidas.forEach(b => {
        let soyMC1 = b.mc1.id == idMC;
        let oponente = soyMC1 ? b.mc2.aka : b.mc1.aka;
        let miEloPrevio = soyMC1 ? b.elo_previo_mc1 : b.elo_previo_mc2;
        let miCambio = soyMC1 ? b.cambio_mc1 : b.cambio_mc2;
        let miEloDespues = miEloPrevio + miCambio;

        let gane = false;
        let textoResultado = "";
        
        if (soyMC1) gane = ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado);
        else gane = ['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado);

        if (gane) victorias++;
        textoResultado = gane ? "<span class='win'>Victoria</span>" : "<span class='loss'>Derrota</span>";
        let claseCambio = miCambio >= 0 ? "win" : "loss";
        let signoCambio = miCambio >= 0 ? "+" : "";

        if (miEloDespues > peakElo) peakElo = miEloDespues;

        etiquetasGrafico.push(b.fase); // Cambié la etiqueta para que diga "O3", "S1", "F" en el gráfico, se ve mejor
        datosGrafico.push(miEloDespues);

        // Se inserta al revés para ver las más nuevas arriba en la tabla
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

    document.getElementById('statPeakElo').innerText = peakElo;
    let winRate = batallasValidas.length > 0 ? Math.round((victorias / batallasValidas.length) * 100) : 0;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    
    if(historialHtml === '') historialHtml = '<tr><td colspan="7" style="text-align:center;">No hay batallas registradas aún.</td></tr>';
    document.getElementById('cuerpoHistorial').innerHTML = historialHtml;

    document.getElementById('zonaPerfil').style.display = 'block';
    dibujarGrafico(etiquetasGrafico, datosGrafico, mcPrincipal.aka);
}

// 4. DIBUJAR EL GRÁFICO (CHART.JS)
function dibujarGrafico(etiquetas, datos, nombre) {
    let ctx = document.getElementById('eloChart').getContext('2d');
    
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
                tension: 0.3 
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

// EXPORTAR AL HTML
window.filtrarBuscador = filtrarBuscador;
window.cargarPerfil = cargarPerfil;

inicializar();