import { usersRequest, usersErrorText } from './usuarios-api.js';
let available, exchange = null, activation = null, pending = false, activationOpen = false;
let activationSubmitting = false;
let loginControlState = [];
let clearPasswordState = () => {};
function restoreLoginControls() {
  loginControlState.forEach(([control,disabled]) => { control.disabled = disabled; });
  loginControlState = [];
}
const clear = () => { exchange = null; activation = null; pending = false; };
const nonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function syncTechnicalAccess() {
  const panel = document.querySelector('#technical-access');
  if (!panel || !available) return;
  const canUse = available();
  const trigger = document.querySelector('#technical-show-activation');
  if (trigger) { trigger.hidden = !canUse; trigger.disabled = !canUse; }
  panel.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = !canUse || pending; });
  if (!canUse) { activationOpen = false; clear(); clearPasswordState(); restoreLoginControls(); panel.querySelectorAll('form').forEach(form => form.reset()); }
  panel.hidden = !canUse || !activationOpen;
}
export function initializeTechnicalAccess(canUse) {
  available = canUse;
  const panel = document.querySelector('#technical-access');
  if (!panel) return;
  const loginForm = document.querySelector('#login-form');
  const actions = document.querySelector('#login-actions');
  const exchangeForm = panel.querySelector('#technical-exchange-form');
  const passwordForm = panel.querySelector('#technical-password-form');
  const passwordInput = passwordForm.elements.new_password;
  const confirmationInput = passwordForm.elements.new_password_confirmation;
  const typedPasswords = new Map(); // Solo memoria; nunca registros ni almacenamiento.
  const reveal = panel.querySelector('#activation-show-passwords');
  const conceal = () => {
    passwordInput.type = confirmationInput.type = 'password';
    if (reveal) { reveal.textContent = 'Mostrar contraseñas'; reveal.setAttribute('aria-pressed','false'); }
  };
  clearPasswordState = () => { typedPasswords.clear(); conceal(); };
  [passwordInput,confirmationInput].forEach(input => input.addEventListener('input',event => {
    if (['insertText','insertFromPaste','deleteContentBackward','deleteContentForward','insertCompositionText'].includes(event.inputType)) typedPasswords.set(input,input.value);
  }));
  reveal?.addEventListener('click',() => {
    const visible = passwordInput.type === 'password';
    passwordInput.type = confirmationInput.type = visible ? 'text' : 'password';
    reveal.textContent = visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas';
    reveal.setAttribute('aria-pressed',String(visible));
  });
  const status = panel.querySelector('#technical-status');
  const show = (form) => {
    activationOpen = true; panel.hidden = false; loginForm.hidden = true;
    if (!loginControlState.length) loginControlState = [...loginForm.querySelectorAll('input,button')].map(control => [control,control.disabled]);
    loginControlState.forEach(([control]) => { control.disabled = true; });
    if (actions) actions.hidden = true;
    document.querySelector('#login-title').textContent = 'Activar cuenta';
    [exchangeForm,passwordForm].forEach(item => { item.hidden = item !== form; });
    if (form === passwordForm) { passwordForm.reset(); typedPasswords.clear(); conceal(); }
  };
  const returnToLogin = (message = '') => {
    activationOpen = false; clear(); panel.querySelectorAll('form').forEach(form => form.reset()); panel.hidden = true;
    typedPasswords.clear(); conceal(); restoreLoginControls();
    if (available()) {
      loginForm.hidden = false; if (actions) actions.hidden = false;
      document.querySelector('#login-title').textContent = 'Inicio de sesión';
      document.querySelector('#login-status').textContent = message;
    }
    status.textContent = '';
  };
  const busy = (value) => { panel.querySelectorAll('button').forEach(button => { button.disabled = value; }); };
  document.querySelector('#technical-show-activation').addEventListener('click', () => {
    if (!available()) return;
    clear(); show(exchangeForm); status.textContent = 'Introduce la clave temporal entregada por el administrador. Es de un solo uso y vence a las 24 horas.';
    const username = document.querySelector('#username').value.trim();
    if (username && !username.includes('@')) exchangeForm.elements.usuario.value = username;
    document.querySelector('#login-status').textContent = '';
  });
  panel.querySelectorAll('[data-technical-return]').forEach(button => button.addEventListener('click', () => {
    returnToLogin(); busy(false);
  }));
  exchangeForm.addEventListener('submit', async event => {
    event.preventDefault(); if (!available()) return;
    const data = new FormData(exchangeForm);
    exchange ||= { request_id: crypto.randomUUID(), exchange_nonce: nonce(),
      usuario: String(data.get('usuario')).trim().toLowerCase(), clave_temporal: String(data.get('clave_temporal')) };
    busy(true); status.textContent = 'Verificando la clave temporal…'; exchangeForm.elements.clave_temporal.value = '';
    try {
      const result = await usersRequest('access','exchange',exchange);
      if (!result?.challenge_id || !result.desafio || !Number.isFinite(Date.parse(result.expires_at))) throw Error('INVALID_RESPONSE');
      activation = { request_id: crypto.randomUUID(), challenge_id: result.challenge_id, desafio: result.desafio, expires_at: result.expires_at };
      const username = exchange.usuario;
      exchange = null; exchangeForm.reset(); show(passwordForm);
      passwordForm.elements.username.value = username;
      status.textContent = 'Clave aceptada. Establece tu contraseña en los próximos 10 minutos.';
    } catch (error) {
      status.textContent = usersErrorText(error) + (error.code === 'RESULT_NOT_CONFIRMED' ? ' Puedes comprobar el mismo intercambio; no recargues esta página.' : '');
      if (error.code !== 'RESULT_NOT_CONFIRMED') exchange = null;
    } finally { busy(false); }
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault(); if (!available() || !activation || pending || activationSubmitting) return;
    // Leer exclusivamente los campos nuevos de este paso, nunca el login oculto.
    const password = passwordInput.value, confirmation = confirmationInput.value;
    if ([passwordInput,confirmationInput].some(input => typedPasswords.has(input) && typedPasswords.get(input) !== input.value)) {
      passwordInput.value = confirmationInput.value = ''; typedPasswords.clear(); conceal();
      status.textContent = 'El navegador modificó la contraseña después de escribirla. Vuelve a introducir ambos campos o revisa el autocompletado. No se envió la contraseña ni se utilizó el desafío.';
      return;
    }
    if (password !== confirmation) { status.textContent = 'Las contraseñas no coinciden.'; return; }
    if (password.length < 10 || new TextEncoder().encode(password).length > 72) { status.textContent = 'Usa al menos 10 caracteres y como máximo 72 bytes UTF-8.'; return; }
    if (Date.parse(activation.expires_at) <= Date.now()) { clear(); passwordForm.reset(); show(exchangeForm); status.textContent = 'La activación venció. Solicita una nueva clave temporal al administrador.'; return; }
    const { expires_at: _expiry, ...body } = activation;
    activationSubmitting = true;
    busy(true); status.textContent = 'Estableciendo tu contraseña…';
    passwordInput.value = confirmationInput.value = ''; typedPasswords.clear(); conceal();
    try {
      const result = await usersRequest('access','activate',{ ...body, password, confirmacion: confirmation });
      if (result.activated === true && result.next === 'login') {
        returnToLogin('Cuenta activada. Ya puedes ingresar con tu usuario y tu contraseña.');
      } else { pending = true; status.textContent = 'La activación no se confirmó. Conserva este identificador y consulta al administrador: ' + body.request_id; }
    } catch (error) {
      if (error.code === 'PASSWORD_REUSED') {
        // El servidor ya consumio el desafio y aborto antes de escribir en Auth.
        // No reenviar ese request_id/desafio ni recuperar una temporal de un solo uso.
        clear(); passwordForm.reset(); exchangeForm.reset(); show(exchangeForm);
        status.textContent = 'La contraseña coincide con la anterior. La clave temporal ya se utilizó: solicita una nueva al administrador y establece una contraseña diferente.';
      } else {
        pending = error.code === 'RESULT_NOT_CONFIRMED'; status.textContent = usersErrorText(error);
        if (pending) status.textContent += ' Operación: ' + body.request_id;
      }
    } finally { activationSubmitting = false; busy(false); if (pending) passwordForm.querySelector('button[type="submit"]').disabled = true; }
  });
  syncTechnicalAccess();
}
