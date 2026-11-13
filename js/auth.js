let client;
let revision = 0;
let busy = false;
let listener = () => {};
const callbackURL = new URL(location.href);
const hashParams = new URLSearchParams(callbackURL.hash.slice(1));
const queryParams = callbackURL.searchParams;
const callbackKeys = ['access_token', 'refresh_token', 'code', 'token_hash', 'error', 'error_code', 'error_description', 'type'];
export let authCallbackPending = callbackKeys.some((key) => hashParams.has(key) || queryParams.has(key));
const arrivedWithCallback = authCallbackPending;
let recovery = authCallbackPending;
try { recovery ||= sessionStorage.getItem('vademecum-password-recovery') === 'true'; } catch { /* El modo sigue protegido en memoria. */ }
let recoveryReady = false;
let recoveryComplete = false;
export let profile = null;
export let authInitializing = true;
const form = document.querySelector('#login-form');
const button = form.querySelector('button');
const status = document.querySelector('#login-status');
const recoveryForm = document.querySelector('#recovery-form');
const requestForm = document.querySelector('#reset-request-form');
const forgotButton = document.querySelector('#forgot-password');
const updateButton = document.querySelector('#update-password');
const returnButton = document.querySelector('#recovery-return');

function setRecovery() {
  recovery = true;
  revision++;
  try { sessionStorage.setItem('vademecum-password-recovery', 'true'); } catch { /* Sin datos sensibles. */ }
  form.hidden = true;
  requestForm.hidden = true;
  forgotButton.hidden = true;
  recoveryForm.hidden = false;
  returnButton.hidden = false;
  document.querySelector('#login-title').textContent = 'Nueva contraseña';
  publish(null);
}

function cleanCallbackURL() {
  const cleaned = new URL(location.href);
  callbackKeys.forEach((key) => cleaned.searchParams.delete(key));
  cleaned.hash = 'acceso';
  history.replaceState(null, '', cleaned.pathname + cleaned.search + cleaned.hash);
  authCallbackPending = false;
}

async function checkRecoverySession() {
  recoveryReady = false;
  updateButton.disabled = true;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    await rejectSession('El enlace de recuperación ha caducado o no es válido. Solicita uno nuevo desde el inicio de sesión.');
    return;
  }
  recoveryReady = true;
  updateButton.disabled = false;
  message('Establece y confirma tu nueva contraseña.');
}

function message(text) { status.textContent = text; }
function publish(value) {
  if (recovery) value = null;
  profile = value;
  document.querySelector('[data-nav="administracion"]').hidden = value?.rol !== 'administrador';
  document.querySelector('#session-controls').hidden = !value;
  document.querySelector('#user-greeting').textContent = value ? `Hola, ${value.nombres.trim()}` : '';
  listener();
}

async function rejectSession(text) {
  revision++;
  publish(null);
  message(text);
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) message(`${text} No se pudo completar el cierre de sesión; vuelve a intentarlo.`);
  } catch {
    message(`${text} No se pudo completar el cierre de sesión. Revisa tu conexión y recarga la página.`);
  }
}

async function verify() {
  if (recovery || authCallbackPending) return false;
  const current = ++revision;
  // Una comprobación en curso no equivale a cerrar la sesión.
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (current !== revision) return false;
    if (error || !user) {
      await rejectSession('Inicia sesión para acceder al catálogo.');
      return false;
    }
    // Nunca conservar la interfaz de otra cuenta mientras se consulta su perfil.
    if (profile && profile.id !== user.id) publish(null);
    const { data, error: profileError } = await client.schema('public').from('perfiles')
      .select('id,usuario,nombres,apellidos,rol,activo').eq('id', user.id).maybeSingle();
    if (current !== revision) return false;
    if (profileError || !data || data.activo !== true || typeof data.nombres !== 'string' || !data.nombres.trim() || !['administrador', 'tecnico'].includes(data.rol)) {
      await rejectSession(profileError
        ? 'No se pudo consultar tu perfil. Comprueba la conexión y los permisos con el administrador.'
        : 'Tu perfil no existe, está incompleto o está inactivo. Contacta al administrador.');
      return false;
    }
    publish(data);
    message('');
    return true;
  } catch {
    if (current === revision) await rejectSession('No se pudo verificar tu acceso. Revisa tu conexión e inténtalo de nuevo.');
    return false;
  }
}

export async function initializeAuth(onChange) {
  listener = onChange;
  if (recovery) setRecovery();
  forgotButton.addEventListener('click', () => {
    form.hidden = true;
    forgotButton.hidden = true;
    requestForm.hidden = false;
    document.querySelector('#login-title').textContent = 'Recuperar contraseña';
    message('Te enviaremos un enlace para establecer una contraseña nueva.');
  });
  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || busy || recovery) return;
    busy = true;
    const sendButton = requestForm.querySelector('button[type="submit"]');
    sendButton.disabled = true;
    message('Solicitando enlace de recuperación…');
    try {
      const { error } = await client.auth.resetPasswordForEmail(document.querySelector('#reset-email').value.trim(), {
        redirectTo: 'http://127.0.0.1:5500/index.html'
      });
      message(error ? (error.status === 429 ? 'Demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.'
        : 'No se pudo enviar el enlace. Revisa tu conexión e inténtalo de nuevo.')
        : 'Si el correo corresponde a una cuenta, recibirás un enlace de recuperación. Revisa también la carpeta de correo no deseado.');
    } catch { message('No se pudo enviar el enlace. Revisa tu conexión e inténtalo de nuevo.'); }
    finally { busy = false; sendButton.disabled = false; }
  });
  document.querySelectorAll('[data-return-login]').forEach((control) => control.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      if (recovery && client) {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      }
      recovery = false;
      recoveryReady = false;
      recoveryComplete = false;
      try { sessionStorage.removeItem('vademecum-password-recovery'); } catch { /* Sin datos sensibles. */ }
      cleanCallbackURL();
      recoveryForm.reset();
      requestForm.reset();
      form.reset();
      recoveryForm.hidden = true;
      requestForm.hidden = true;
      returnButton.hidden = true;
      form.hidden = false;
      forgotButton.hidden = false;
      document.querySelector('#login-title').textContent = 'Inicio de sesión';
      publish(null);
      message('Introduce tu correo electrónico y contraseña para iniciar sesión.');
    } catch { message('No se pudo cerrar la sesión de recuperación. Revisa tu conexión y vuelve a intentarlo.'); }
    finally { busy = false; }
  }));
  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || busy || !recovery || !recoveryReady || recoveryComplete) return;
    const password = document.querySelector('#new-password');
    const confirmation = document.querySelector('#confirm-password');
    if (password.value !== confirmation.value) { message('Las contraseñas no coinciden.'); return; }
    if (password.value.length < 12 || !/[A-Z]/.test(password.value) || !/[a-z]/.test(password.value) || !/[0-9]/.test(password.value) || !/[^A-Za-z0-9\s]/.test(password.value)) {
      message('Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.');
      return;
    }
    busy = true;
    updateButton.disabled = true;
    recoveryForm.setAttribute('aria-busy', 'true');
    message('Guardando tu nueva contraseña…');
    try {
      const { data: userData, error: sessionError } = await client.auth.getUser();
      if (sessionError || !userData.user) {
        recoveryReady = false;
        await rejectSession('El enlace ha caducado o no es válido. Solicita uno nuevo.');
        return;
      }
      const request = client.auth.updateUser({ password: password.value });
      recoveryForm.reset();
      const { data, error } = await request;
      if (error) {
        if (['session_not_found', 'session_expired', 'refresh_token_not_found', 'bad_jwt'].includes(error.code) || error.status === 401 || error.status === 403) {
          recoveryReady = false;
          await rejectSession('El enlace ha caducado o no es válido. Solicita uno nuevo.');
        } else message(error.code === 'same_password' ? 'La nueva contraseña debe ser diferente de la anterior.'
          : error.code === 'weak_password' ? 'Supabase rechazó la contraseña por su política de seguridad. Usa una contraseña más larga, compleja y que no haya sido filtrada.'
          : error.status === 429 ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
          : 'No se pudo cambiar la contraseña. Revisa tu conexión e inténtalo de nuevo.');
      } else if (data.user) {
        recoveryComplete = true;
        recoveryReady = false;
        recoveryForm.hidden = true;
        await rejectSession('Supabase confirmó el cambio de contraseña. Ya puedes volver al inicio de sesión.');
      } else message('Supabase no confirmó el cambio. Vuelve a intentarlo.');
    } catch { message('No se pudo confirmar el cambio. Revisa tu conexión e inténtalo de nuevo.'); }
    finally {
      recoveryForm.reset();
      busy = false;
      updateButton.disabled = !recoveryReady || recoveryComplete;
      recoveryForm.removeAttribute('aria-busy');
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || busy || recovery || authCallbackPending) return;
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message('Comprobando tus credenciales…');
    const passwordInput = document.querySelector('#password');
    try {
      const request = client.auth.signInWithPassword({
        email: document.querySelector('#username').value.trim(), password: passwordInput.value
      });
      passwordInput.value = '';
      const { error } = await request;
      if (error) {
        message(error.code === 'invalid_credentials' ? 'Correo electrónico o contraseña incorrectos.'
          : error.code === 'email_not_confirmed' ? 'Debes confirmar tu correo electrónico antes de iniciar sesión.'
          : error.status === 429 ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
          : 'No se pudo iniciar sesión. Revisa tu conexión y vuelve a intentarlo.');
      } else if (await verify()) {
        form.reset();
        location.hash = '#catalogo';
      }
    } catch {
      message('No se pudo conectar con el servicio. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      passwordInput.value = '';
      busy = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  document.querySelector('#logout-button').addEventListener('click', async () => {
    await rejectSession('Has cerrado sesión.');
    form.reset();
  });
  try {
    const config = window.SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) throw new Error('config');
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || !config.publishableKey.startsWith('sb_publishable_')) throw new Error('config');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        flowType: queryParams.has('code') ? 'pkce' : 'implicit'
      }
    });
    client.auth.onAuthStateChange((event, session) => {
      // No llamar métodos Auth dentro del callback: diferir hasta liberar su bloqueo.
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery();
        if (!authCallbackPending) setTimeout(() => { void checkRecoverySession().catch(() => message('No se pudo verificar el enlace. Revisa tu conexión y solicita uno nuevo.')); }, 0);
      } else if (event === 'SIGNED_OUT') {
        recoveryReady = false;
        updateButton.disabled = true;
        revision++;
        publish(null);
      } else if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) && !busy && !recovery && !authCallbackPending) {
        if (profile && profile.id !== session?.user?.id) {
          revision++;
          publish(null);
        }
        const scheduledRevision = revision;
        setTimeout(() => {
          if (scheduledRevision === revision && !busy && !recovery && !authCallbackPending) void verify();
        }, 0);
      }
    });
    const { error: initializationError } = await client.auth.initialize();
    let callbackError = !!initializationError || hashParams.has('error') || hashParams.has('error_code') || queryParams.has('error') || queryParams.has('error_code');
    const tokenHash = queryParams.get('token_hash');
    let verifiedTokenHash = false;
    if (tokenHash && queryParams.get('type') === 'recovery' && !callbackError) {
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (error) {
        cleanCallbackURL();
        await rejectSession('El enlace de recuperación ha caducado o no es válido. Solicita uno nuevo.');
        forgotButton.disabled = false;
        button.disabled = false;
        return;
      }
      verifiedTokenHash = true;
    }
    const { data, error } = await client.auth.getSession();
    if (arrivedWithCallback) {
      const implicitRecovery = (hashParams.get('type') || queryParams.get('type')) === 'recovery'
        && !!(hashParams.get('access_token') || queryParams.get('access_token'))
        && !!(hashParams.get('refresh_token') || queryParams.get('refresh_token'));
      const exchangedCode = queryParams.has('code') && !new URL(location.href).searchParams.has('code');
      // Un perfil ya autenticado no convierte un enlace incompleto en uno válido.
      callbackError ||= !implicitRecovery && !exchangedCode && !verifiedTokenHash;
    }
    if (authCallbackPending) cleanCallbackURL();
    if (recovery) {
      setRecovery();
      if (error || callbackError || !data.session || (callbackURL.searchParams.has('token_hash') && queryParams.get('type') !== 'recovery')) {
        await rejectSession('El enlace de recuperación ha caducado o no es válido. Solicita uno nuevo desde el inicio de sesión.');
      } else await checkRecoverySession();
    } else if (error) await rejectSession('No se pudo recuperar la sesión. Inicia sesión de nuevo.');
    else if (data.session) await verify();
    else message('Introduce tu correo electrónico y contraseña.');
    button.disabled = false;
    forgotButton.disabled = false;
  } catch (error) {
    if (authCallbackPending) cleanCallbackURL();
    publish(null);
    message(error.message === 'config'
      ? 'Configura la Project URL y la Publishable Key en js/supabase-config.js.'
      : 'No se pudo cargar Supabase. Revisa tu conexión y recarga la página.');
  } finally {
    authInitializing = false;
    listener();
  }
}
