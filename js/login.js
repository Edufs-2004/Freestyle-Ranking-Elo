import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const formLogin = document.getElementById('formLogin');
    const mensajeError = document.getElementById('mensajeError');
    const btnIngresar = document.getElementById('btnIngresar');

    // Verificar si ya hay una sesión activa, si la hay, mandarlo directo al cuartel
    async function verificarSesionExistente() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            window.location.href = 'admin.html';
        }
    }
    verificarSesionExistente();

    // Lógica del formulario de acceso
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            mensajeError.innerText = "Por favor, completa todos los campos.";
            return;
        }

        btnIngresar.innerText = "Verificando credenciales...";
        btnIngresar.disabled = true;
        mensajeError.innerText = "";

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                mensajeError.innerText = "Acceso denegado. Credenciales incorrectas.";
                btnIngresar.innerText = "Desbloquear Sistema";
                btnIngresar.disabled = false;
            } else {
                mensajeError.style.color = "#2ed573"; // Verde
                mensajeError.innerText = "Acceso concedido. Redirigiendo...";
                // LA REDIRECCIÓN CORREGIDA: Ahora va a la zona de creación de torneos (admin.html)
                window.location.href = 'admin.html'; 
            }
        } catch (err) {
            console.error("Error en login:", err);
            mensajeError.innerText = "Error de conexión con la base de datos.";
            btnIngresar.innerText = "Desbloquear Sistema";
            btnIngresar.disabled = false;
        }
    });
});