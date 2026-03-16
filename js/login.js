import { supabase } from './supabase.js';

async function iniciarSesion() {
    let email = document.getElementById('email').value;
    let password = document.getElementById('password').value;
    let msg = document.getElementById('msgError');

    msg.style.display = 'none';
    if (!email || !password) {
        msg.innerText = "Llena todos los campos.";
        msg.style.display = 'block';
        return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: email, password: password });

    if (error) {
        msg.innerText = "Error: Verifica tu correo o contraseña.";
        msg.style.display = 'block';
    } else {
        window.location.href = "index.html"; // Redirige al organizador al entrar
    }
}
window.iniciarSesion = iniciarSesion;