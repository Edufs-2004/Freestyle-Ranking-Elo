// Aquí importamos la librería de Supabase directamente en tu navegador
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// REEMPLAZA ESTO CON TUS DATOS DE SUPABASE (mantén las comillas simples)
const supabaseUrl = 'https://sbdmpkqvsmxlufvbfbev.supabase.co';
const supabaseKey = 'sb_publishable_gQXtYWbSVJN1xgYoexgEvQ_5gcJWNj_';

// Creamos la conexión oficial y la exportamos para que los otros archivos la usen
export const supabase = createClient(supabaseUrl, supabaseKey);