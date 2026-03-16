import { supabase } from './supabase.js';

export async function configurarSesion() {
    const { data: { session } } = await supabase.auth.getSession();
    
    // 1. Inyectar botón en la barra de navegación superior
    let nav = document.querySelector('.navegacion');
    if (nav) {
        let authBtn = document.createElement('a');
        authBtn.style.cursor = 'pointer';
        if (session) {
            authBtn.innerHTML = '🚪 Cerrar Sesión';
            authBtn.style.background = '#ff4757';
            authBtn.onclick = async () => { await supabase.auth.signOut(); window.location.href = 'batallas.html'; };
        } else {
            authBtn.innerHTML = '🔑 Admin Login';
            authBtn.style.background = '#eccc68';
            authBtn.style.color = '#2f3542';
            authBtn.href = 'login.html';
        }
        nav.appendChild(authBtn);
    }

    // 2. Ocultar paneles si es un visitante (Espectador)
    if (!session) {
        // Oculta todos los botones peligrosos inyectando un CSS
        let style = document.createElement('style');
        style.innerHTML = `.btn-borrar, .btn-recalcular, .btn-editar, .setup-cruce, .btn-batalla, .btn-cerrar { display: none !important; }`;
        document.head.appendChild(style);

        // Bloquea el organizador de torneos (index.html)
        if (window.location.pathname.includes('index.html') || window.location.pathname.endsWith('/')) {
            let panelOrg = document.getElementById('panelSeleccion');
            if (panelOrg) panelOrg.innerHTML = '<h2 style="text-align:center; color:#ff4757;">🔒 Modo Espectador</h2><p style="text-align:center;">Solo los administradores pueden organizar eventos. Ve a la calculadora o al museo para ver los rankings históricos.</p>';
        }

        // Oculta la creación de MCs (batallas.html)
        if (window.location.pathname.includes('batallas.html')) {
            let panelMC = document.getElementById('nuevoAka');
            if (panelMC) panelMC.parentElement.style.display = 'none'; 
        }
    }
}