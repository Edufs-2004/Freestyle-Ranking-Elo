import { supabase } from './supabase.js';
const K = 32;
let listaMCs = [];

async function cargarRanking() {
    const { data, error } = await supabase.from('competidores').select('*').order('elo_actual', { ascending: false });
    if (error) return console.error("Error:", error);
    listaMCs = data;
    dibujarInterfaz();
}

function dibujarInterfaz() {
    let htmlSelects = '<option value="">Selecciona un MC...</option>';
    let htmlTabla = '';

    listaMCs.forEach((mc, index) => {
        htmlSelects += `<option value="${mc.id}">${mc.aka} (${mc.elo_actual})</option>`;
        htmlTabla += `<tr><td><strong>#${index + 1}</strong></td><td>${mc.aka}</td><td><strong>${mc.elo_actual}</strong></td><td>${mc.batallas_totales}</td></tr>`;
    });

    if(document.getElementById('selectMc1')) document.getElementById('selectMc1').innerHTML = htmlSelects;
    if(document.getElementById('selectMc2')) document.getElementById('selectMc2').innerHTML = htmlSelects;
    if(document.getElementById('cuerpoRanking')) document.getElementById('cuerpoRanking').innerHTML = htmlTabla;
}

async function agregarMC() {
    let aka = document.getElementById('nuevoAka').value.trim();
    if (aka === "") return alert("Escribe un A.K.A");
    const { error } = await supabase.from('competidores').insert([{ aka: aka, elo_actual: 1500, batallas_totales: 0 }]);
    if (error) return alert("Error guardando.");
    document.getElementById('nuevoAka').value = ""; 
    cargarRanking(); 
}

async function procesarBatalla() {
    let id1 = parseInt(document.getElementById('selectMc1').value);
    let id2 = parseInt(document.getElementById('selectMc2').value);
    let resultado = document.getElementById('resultadoBatalla').value;

    if (id1 === id2) return alert("Selecciona dos distintos.");
    if (!id1 || !id2) return alert("Faltan competidores.");

    let mc1 = listaMCs.find(mc => mc.id === id1);
    let mc2 = listaMCs.find(mc => mc.id === id2);
    let R1 = mc1.elo_actual; let R2 = mc2.elo_actual;

    let E1 = 1 / (1 + Math.pow(10, (R2 - R1) / 400));
    let E2 = 1 / (1 + Math.pow(10, (R1 - R2) / 400));
    let S1 = 0, S2 = 0; let bono1 = false, bono2 = false;

    if (resultado === "victoria_total") { S1 = 1.0; S2 = 0.0; bono1 = true; } 
    else if (resultado === "victoria") { S1 = 1.0; S2 = 0.0; } 
    else if (resultado === "victoria_replica") { S1 = 0.75; S2 = 0.25; } 
    else if (resultado === "derrota_replica") { S1 = 0.25; S2 = 0.75; } 
    else if (resultado === "derrota") { S1 = 0.0; S2 = 1.0; } 
    else if (resultado === "derrota_total") { S1 = 0.0; S2 = 1.0; bono2 = true; }

    let p1 = K * (S1 - E1); let p2 = K * (S2 - E2);
    if (bono1) p1 *= 1.2; if (bono2) p2 *= 1.2;

    let n1 = Math.round(R1 + p1); let n2 = Math.round(R2 + p2);

    await supabase.from('competidores').update({ elo_actual: n1, batallas_totales: mc1.batallas_totales + 1 }).eq('id', id1);
    await supabase.from('competidores').update({ elo_actual: n2, batallas_totales: mc2.batallas_totales + 1 }).eq('id', id2);

    document.getElementById('textoResultado').innerHTML = `${mc1.aka}: ${n1} pts <br>${mc2.aka}: ${n2} pts`;
    cargarRanking(); 
}

window.agregarMC = agregarMC;
window.procesarBatalla = procesarBatalla;
cargarRanking();