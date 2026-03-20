import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://sbdmpkqvsmxlufvbfbev.supabase.co';
const supabaseKey = 'sb_publishable_gQXtYWbSVJN1xgYoexgEvQ_5gcJWNj_';

export const supabase = createClient(supabaseUrl, supabaseKey);

export let listaFranquiciasGlobal = [];

export async function cargarFranquiciasSelect(idSelect, incluirTodas = false) {
    const { data } = await supabase.from('franquicias').select('*').order('nombre');
    listaFranquiciasGlobal = data || [];

    let select = document.getElementById(idSelect);
    if(!select) return;

    let valorPrevio = select.value;
    let html = incluirTodas ? '<option value="TODAS">Todas (Global)</option>' : '';

    let principales = listaFranquiciasGlobal.filter(f => !f.padre);
    let subs = listaFranquiciasGlobal.filter(f => f.padre);

    principales.forEach(p => {
        let hijos = subs.filter(s => s.padre === p.nombre);
        if (hijos.length > 0) {
            html += `<optgroup label="📂 ${p.nombre}">`;
            html += `<option value="${p.nombre}">${p.nombre} (General)</option>`;
            hijos.forEach(h => html += `<option value="${h.nombre}">↳ ${h.nombre}</option>`);
            html += `</optgroup>`;
        } else {
            html += `<option value="${p.nombre}">📂 ${p.nombre}</option>`;
        }
    });

    select.innerHTML = html;
    if (valorPrevio && valorPrevio !== '') select.value = valorPrevio;
}

export function obtenerFranquiciasValidas(nombrePadre) {
    if (nombrePadre === 'TODAS') return ['TODAS'];
    let validas = [nombrePadre];
    let hijos = listaFranquiciasGlobal.filter(f => f.padre === nombrePadre);
    hijos.forEach(h => validas.push(h.nombre));
    return validas; 
}