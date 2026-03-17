import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://sbdmpkqvsmxlufvbfbev.supabase.co';
const supabaseKey = 'sb_publishable_gQXtYWbSVJN1xgYoexgEvQ_5gcJWNj_';

export const supabase = createClient(supabaseUrl, supabaseKey);

// ESTA FUNCIÓN HARÁ LA MAGIA EN TODAS TUS PÁGINAS (V2.1.0)
export async function cargarFranquiciasSelect(idSelect, incluirTodas = false) {
    const { data } = await supabase.from('franquicias').select('*').order('nombre');
    let select = document.getElementById(idSelect);
    if(!select) return;
    
    let valorPrevio = select.value;
    let html = incluirTodas ? '<option value="TODAS">Todas (Global)</option>' : '';
    data.forEach(f => html += `<option value="${f.nombre}">${f.nombre}</option>`);
    select.innerHTML = html;
    
    if (valorPrevio && valorPrevio !== '') select.value = valorPrevio;
}