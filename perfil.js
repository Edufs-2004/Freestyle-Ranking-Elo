import { supabase } from './supabase.js';

let listaMCs = [];
let miGrafico = null; 

async function inicializar() {
    const { data } = await supabase.from('competidores').select('*').order('aka', { ascending: true });
    listaMCs = data;
}

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

async function cargarPerfil(idMC) {
    let mcPrincipal = listaMCs.find(m => m.id == idMC);
    document.getElementById('buscadorMCs').value = mcPrincipal.aka;
    document.getElementById('sugerenciasMCs').style.display = 'none';

    // --- CARGAMOS LOS DATOS VISUALES (V1.4.0) ---
    document.getElementById('nombreMC').innerText = mcPrincipal.aka;
    document.getElementById('imgAtleta').src = mcPrincipal.foto || 'https://via.placeholder.com/150/373752/FFFFFF?text=MC';
    document.getElementById('banderaMC').innerText = mcPrincipal.nacionalidad || '🌍';
    
    document.getElementById('statEloActual').innerText = mcPrincipal.elo_actual;
    document.getElementById('statBatallas').innerText = mcPrincipal.batallas_totales;

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
    
    batallasValidas.sort((a, b) => {
        let dateA = new Date(a.torneos.fecha_evento).getTime();
        let dateB = new Date(b.torneos.fecha_evento).getTime();
        if (dateA === dateB) return a.id - b.id; 
        return dateA - dateB;
    });

    let historialHtml = '';
    let etiquetasGrafico = ['Inicio'];
    let datosGrafico = [1500]; 
    let esPremioSegmento = [false]; 
    let peakElo = 1500;
    let victorias = 0;
    let rastreadorDeElo = 1500; 

    batallasValidas.forEach((b, index) => {
        let soyMC1 = b.mc1.id == idMC;
        let oponente = soyMC1 ? b.mc2.aka : b.mc1.aka;
        let miEloPrevio = soyMC1 ? b.elo_previo_mc1 : b.elo_previo_mc2;
        let miCambio = soyMC1 ? b.cambio_mc1 : b.cambio_mc2;
        let miEloDespues = miEloPrevio + miCambio;

        if (index > 0 && miEloPrevio > rastreadorDeElo) {
            let gapPremio = miEloPrevio - rastreadorDeElo;
            let fechaAnterior = batallasValidas[index-1].torneos.fecha_evento;

            etiquetasGrafico.push("🏆 Pozo");
            datosGrafico.push(miEloPrevio);
            esPremioSegmento.push(true); 
            if(miEloPrevio > peakElo) peakElo = miEloPrevio;

            let filaPremio = `
                <tr style="background-color: rgba(255, 71, 87, 0.1);">
                    <td>${fechaAnterior}</td>
                    <td><strong>👑 Bono de Pozo</strong></td>
                    <td>-</td>
                    <td>-</td>
                    <td><span class='win'>Distribución</span></td>
                    <td>${rastreadorDeElo}</td>
                    <td class="win" style="color: #ff4757;">+${gapPremio} pts</td>
                </tr>
            `;
            historialHtml = filaPremio + historialHtml;
        }

        let gane = soyMC1 ? ['victoria', 'victoria_replica', 'victoria_total'].includes(b.resultado) : ['derrota', 'derrota_replica', 'derrota_total'].includes(b.resultado);
        if (gane) victorias++;
        let textoResultado = gane ? "<span class='win'>Victoria</span>" : "<span class='loss'>Derrota</span>";
        let claseCambio = miCambio >= 0 ? "win" : "loss";
        let signoCambio = miCambio >= 0 ? "+" : "";

        if (miEloDespues > peakElo) peakElo = miEloDespues;

        etiquetasGrafico.push(b.fase);
        datosGrafico.push(miEloDespues);
        esPremioSegmento.push(false); 

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
        rastreadorDeElo = miEloDespues;
    });

    if (batallasValidas.length > 0 && mcPrincipal.elo_actual > rastreadorDeElo) {
        let gapPremioFinal = mcPrincipal.elo_actual - rastreadorDeElo;
        let fechaUltima = batallasValidas[batallasValidas.length - 1].torneos.fecha_evento;

        etiquetasGrafico.push("🏆 Pozo Final");
        datosGrafico.push(mcPrincipal.elo_actual);
        esPremioSegmento.push(true); 
        
        if(mcPrincipal.elo_actual > peakElo) peakElo = mcPrincipal.elo_actual;

        let filaPremioFinal = `
            <tr style="background-color: rgba(255, 71, 87, 0.1);">
                <td>${fechaUltima}</td>
                <td><strong>👑 Bono de Pozo</strong></td>
                <td>-</td>
                <td>-</td>
                <td><span class='win'>Distribución</span></td>
                <td>${rastreadorDeElo}</td>
                <td class="win" style="color: #ff4757;">+${gapPremioFinal} pts</td>
            </tr>
        `;
        historialHtml = filaPremioFinal + historialHtml;
    }

    document.getElementById('statPeakElo').innerText = peakElo;
    let winRate = batallasValidas.length > 0 ? Math.round((victorias / batallasValidas.length) * 100) : 0;
    document.getElementById('statWinRate').innerText = `${winRate}%`;
    
    if(historialHtml === '') historialHtml = '<tr><td colspan="7" style="text-align:center;">No hay batallas registradas aún.</td></tr>';
    document.getElementById('cuerpoHistorial').innerHTML = historialHtml;

    document.getElementById('zonaPerfil').style.display = 'block';
    dibujarGrafico(etiquetasGrafico, datosGrafico, mcPrincipal.aka, esPremioSegmento);
}

function dibujarGrafico(etiquetas, datos, nombre, arraySegmentos) {
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
                backgroundColor: 'rgba(30, 144, 255, 0.2)',
                borderWidth: 3,
                pointBackgroundColor: '#eccc68',
                pointRadius: 4,
                fill: true,
                tension: 0.3,
                segment: {
                    borderColor: ctx => arraySegmentos[ctx.p1DataIndex] ? '#ff4757' : '#1e90ff'
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: 'white' } } },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: '#373752' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#373752' } }
            }
        }
    });
}

window.filtrarBuscador = filtrarBuscador;
window.cargarPerfil = cargarPerfil;

inicializar();