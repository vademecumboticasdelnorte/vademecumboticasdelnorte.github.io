import { usersRequest, activeBranches, usersErrorText } from './usuarios-api.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let checkAccess, owner = null, root, dialog, users = [], branches = [], offset = 0, revision = 0, returnFocus;
let permissionSchemaReady=false,modalRevision=0;
const iconPaths={edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>',block:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 key:'<circle cx="8" cy="8" r="4"/><path d="m11 11 10 10m-4-4 3-3m-6 0 3-3"/>'};
const icon=key=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[key]}</svg>`;
const visit=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(value)):'No registrado';
const limit = 25;
const allowed = () => Boolean(owner && owner === checkAccess?.());
const status = text => { root.querySelector('#users-status').textContent = text; };
function closeDialog() { if (dialog?.open) { dialog.close(); dialog.replaceChildren(); } }
export function initializeUsers(check) {
  checkAccess = check; root = document.querySelector('#usuarios');
  root.innerHTML = `<div class="heading-row"><div><p class="eyebrow">ADMINISTRACIÓN LOCAL</p><h1 id="users-title">Usuarios</h1><p class="subtitle">Crea técnicos y administra su acceso al vademécum.</p></div><button id="users-add" type="button">＋ Crear técnico</button></div>
    <div class="users-stats" id="users-stats"></div><div class="panel users-panel">
    <div class="users-toolbar"><h2>Técnicos registrados</h2><button id="users-refresh" class="users-secondary" type="button">Actualizar</button></div>
    <label for="users-search">Buscar en esta página</label><input id="users-search" type="search" autocomplete="off" placeholder="Usuario, nombres o DNI">
    <p id="users-status" role="status" aria-live="polite"></p><div class="table-scroll"><table class="users-table"><thead><tr><th>Usuario</th><th>Nombres y apellidos</th><th>DNI</th><th>Última visita</th><th>Sucursal</th><th>Rol</th><th>Activación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="users-rows"></tbody></table></div>
    <div class="users-pagination"><span id="users-range"></span><div><button id="users-prev" class="users-secondary" type="button">Anterior</button><button id="users-next" class="users-secondary" type="button">Siguiente</button></div></div></div>`;
  dialog = document.createElement('dialog'); dialog.className = 'users-dialog'; document.body.append(dialog);
  dialog.addEventListener('close', () => { if (!dialog.open) { dialog.replaceChildren(); returnFocus?.focus(); } });
  root.querySelector('#users-add').onclick = () => openEditor();
  root.querySelector('#users-refresh').onclick = () => { void refresh(); };
  root.querySelector('#users-search').oninput = render;
  root.querySelector('#users-prev').onclick = () => { offset = Math.max(0,offset-limit); void refresh(); };
  root.querySelector('#users-next').onclick = () => { offset += limit; void refresh(); };
  root.querySelector('#users-rows').onclick = event => {
    if (!allowed()) return;
    const button = event.target.closest('button[data-action]');
    const user = users.find(item => item.id === button?.dataset.id);
    if (!user) return;
    if (button.dataset.action === 'edit') openEditor(user);
    else if(button.dataset.action==='permissions')void openPermissions(user);
    else openState(user,button.dataset.action);
  };
  render();
}
export function syncUsersAccess() {
  const id = checkAccess?.() || null;
  document.querySelector('[data-nav="usuarios"]').hidden = !id;
  if (owner !== id) {
    revision++; closeDialog(); owner = id; users = []; branches = []; offset = 0;
    root.querySelector('#users-search').value = ''; status(''); render();
    if (owner) void refresh();
  }
  if (location.hash !== '#usuarios') closeDialog();
}
async function refresh() {
  if (!allowed()) return;
  const current = ++revision, currentOwner = owner;
  status('Consultando técnicos y sucursales…');
  try {
    const [result, loadedBranches] = await Promise.all([usersRequest('admin','list',{limit,offset}),activeBranches()]);
    if (current !== revision || owner !== currentOwner || !allowed()) return;
    if (!Array.isArray(result.users) || result.users.some(user => user.rol !== 'tecnico' || typeof user.id !== 'string')) throw Error('INVALID_USERS');
    users = result.users; branches = loadedBranches; permissionSchemaReady=result.permissions_ready===true;render();
    status(branches.length ? '' : 'No hay sucursales activas. No se pueden crear técnicos todavía.');
  } catch (error) {
    if (current !== revision || owner !== currentOwner) return;
    users = []; render(); status(usersErrorText(error));
  }
}
function render() {
  const query = normalize(root.querySelector('#users-search').value);
  const filtered = users.filter(user => normalize([user.usuario,user.nombres,user.apellido_paterno,user.apellido_materno,user.dni].join(' ')).includes(query));
  root.querySelector('#users-stats').innerHTML = [['Técnicos en esta página',users.length],['Activos',users.filter(user => user.activo).length],['Pendientes de activación',users.filter(user => user.activation_state !== 'ready').length]]
    .map(([label,count]) => `<div><span>${label}</span><strong>${count}</strong></div>`).join('');
  root.querySelector('#users-rows').innerHTML = filtered.map(user => {
    const actions=[['edit','Editar','edit'],[user.activo?'block':'reactivate',user.activo?'Bloquear':'Reactivar','block'],['permissions','Permisos','shield'],...(user.activo?[['reset','Nueva clave temporal','key']]:[])];
    return `<tr><td><strong>${esc(user.usuario)}</strong></td><td>${esc([user.nombres,user.apellido_paterno,user.apellido_materno].filter(Boolean).join(' '))}</td><td>${esc(user.dni)}</td><td title="Último ingreso autorizado">${permissionSchemaReady?esc(visit(user.last_visit)):'Pendiente de habilitar'}</td><td>${esc(user.sucursal)}</td><td><span class="users-role">Técnico</span></td><td>${user.activation_state==='ready'?'Activado':'Pendiente'}</td><td><span class="users-state ${user.activo?'activo':'bloqueado'}">${user.activo?'Activo':'Bloqueado'}</span></td><td><div class="users-actions">${actions.map(([action,label,symbol])=>`<button type="button" class="users-icon" data-action="${action}" data-id="${esc(user.id)}" title="${esc(label)}" aria-label="${esc(label+' a '+user.usuario)}">${icon(symbol)}</button>`).join('')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="9">No hay técnicos para mostrar.</td></tr>';
  root.querySelector('#users-range').textContent = users.length ? `Registros ${offset+1}–${offset+users.length}` : 'Sin registros';
  root.querySelector('#users-prev').disabled = offset === 0 || !allowed();
  root.querySelector('#users-next').disabled = users.length < limit || !allowed();
  root.querySelector('#users-add').disabled = !allowed() || !branches.length;
}
function openDialog(title, content) {
  if (!allowed()) return false;
  modalRevision++;
  returnFocus = document.activeElement;
  dialog.innerHTML = `<div class="users-modal-heading"><h2 id="users-modal-title">${esc(title)}</h2><button type="button" class="users-secondary" data-close>Cerrar</button></div>${content}`;
  dialog.setAttribute('aria-labelledby','users-modal-title');
  dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = closeDialog; });
  if (!dialog.open) dialog.showModal();
  return true;
}
async function openPermissions(user){
  if(!openDialog(`Permisos de ${user.usuario}`,'<p class="muted">Consultando permisos guardados…</p>'))return;
  const actor=owner,requested=modalRevision;
  try{
    const data=await usersRequest('admin','permissions_get',{target_user_id:user.id});
    if(!allowed()||owner!==actor||requested!==modalRevision||!dialog.open)return;
    if(data.user_id!==user.id||!Number.isSafeInteger(data.revision)||!Array.isArray(data.permissions))throw Error('INVALID_PERMISSION_RESPONSE');
    const groups=new Map();
    for(const permission of data.permissions){if(!groups.has(permission.category))groups.set(permission.category,[]);groups.get(permission.category).push(permission);}
    openDialog(`Permisos de ${user.usuario}`,`<form id="user-permissions-form">${[...groups].map(([category,items])=>`<fieldset class="users-permission-group"><legend>${esc(category)}</legend>${items.map(item=>`<label class="users-permission"><span>${esc(item.label)}${item.admin_only?'<small class="muted"> · Exclusivo del administrador</small>':!item.implemented?'<small class="muted"> · Operación pendiente de implementación</small>':''}</span><span class="users-switch"><input type="checkbox" role="switch" name="${esc(item.code)}" aria-label="${esc(item.label)}" ${item.configured?'checked':''} ${item.admin_only?'disabled':''}><span aria-hidden="true" class="users-switch-track"></span><span class="users-switch-text" aria-hidden="true"></span></span></label>`).join('')}</fieldset>`).join('')}<p id="permissions-status" role="status"></p><div class="users-modal-footer"><button type="button" class="users-secondary" data-close>Cancelar</button><button type="submit">Guardar permisos</button></div></form>`);
    const form=dialog.querySelector('form'),opened=modalRevision;
    form.onsubmit=async event=>{
      event.preventDefault();if(!allowed()||owner!==actor||modalRevision!==opened)return;
      const button=form.querySelector('button[type="submit"]');if(button.disabled)return;button.disabled=true;
      const changes=Object.fromEntries(data.permissions.filter(item=>!item.admin_only).map(item=>[item.code,form.elements.namedItem(item.code).checked]));
      try{
        const saved=await usersRequest('admin','permissions_save',{target_user_id:user.id,expected_revision:data.revision,changes});
        if(!allowed()||owner!==actor||modalRevision!==opened)return;
        if(saved.user_id!==user.id||!Number.isSafeInteger(saved.revision)||saved.revision<=data.revision)throw Error('INVALID_PERMISSION_SAVE');
        closeDialog();status(`Permisos de ${user.usuario} guardados en Supabase local.`);
      }catch(error){if(modalRevision===opened){form.querySelector('#permissions-status').textContent=usersErrorText(error);if(error.code!=='RESULT_NOT_CONFIRMED'&&error.code!=='PERMISSION_CONFLICT')button.disabled=false;}}
    };
  }catch(error){if(allowed()&&owner===actor&&requested===modalRevision&&dialog.open)openDialog(`Permisos de ${user.usuario}`,`<p role="alert">${esc(usersErrorText(error))}</p>`);}
}
function showOutcome(result, requestId) {
  if (!allowed()) return;
  if (result.state === 'temporary_issued' && typeof result.temporary_key === 'string' && Number.isFinite(Date.parse(result.expires_at))) {
    openDialog('Clave temporal emitida',`<p>Entrega esta clave al técnico de forma privada. Solo se muestra en esta respuesta, es de un solo uso y dura 24 horas.</p><output id="temporary-credential" class="temporary-credential"></output><p>Vence: ${esc(new Date(result.expires_at).toLocaleString('es-PE'))}</p><p>No se guarda en este navegador ni en registros.</p><button type="button" data-close>He entregado la clave</button>`);
    dialog.querySelector('#temporary-credential').textContent = result.temporary_key;
  } else {
    openDialog('Resultado pendiente',`<p>No se confirmó la entrega de una clave temporal. No repitas la creación.</p><p>Operación: <code>${esc(requestId)}</code></p><button type="button" id="users-reconcile">Comprobar operación</button><p id="reconcile-status" role="status"></p>`);
    dialog.querySelector('#users-reconcile').onclick = async event => {
      if (!allowed()) return; event.target.disabled = true;
      try { const state = await usersRequest('admin','reconcile',{request_id:requestId});
        dialog.querySelector('#reconcile-status').textContent = `Estado: ${state.state}. ${state.requires_review ? 'Requiere revisión; no repitas la operación.' : 'Actualiza el directorio para consultar el registro.'}`;
      } catch (error) { dialog.querySelector('#reconcile-status').textContent = usersErrorText(error); }
    };
  }
}
function openEditor(user) {
  if (!allowed() || !branches.length) return;
  const fields = [['nombres','Nombres'],['apellido_paterno','Apellido paterno'],['apellido_materno','Apellido materno'],['dni','DNI'],['telefono','Teléfono (opcional)']];
  const content = `<form id="users-form"><div class="users-form-grid"><label>Usuario${user ? '' : ' *'}<input name="usuario" value="${esc(user?.usuario)}" ${user ? 'disabled' : 'required pattern="[a-z0-9_]{3,30}" maxlength="30" autocapitalize="none"'} autocomplete="off"></label>${fields.map(([name,label]) => `<label>${label}<input name="${name}" value="${esc(user?.[name])}" ${name === 'telefono' ? 'maxlength="20"' : name === 'dni' ? 'required pattern="[0-9]{8}" inputmode="numeric" maxlength="8"' : 'required maxlength="80"'}></label>`).join('')}<label>Sucursal<select name="sucursal_id" required>${branches.map(branch => `<option value="${esc(branch.id)}" ${user?.sucursal_id === branch.id ? 'selected' : ''}>${esc(branch.nombre)}</option>`).join('')}</select></label><label>Rol<input value="Técnico" disabled></label></div><p>El técnico establecerá su propia contraseña al activar la cuenta.</p><p id="users-form-error" role="alert"></p><div class="users-modal-footer"><button type="button" class="users-secondary" data-close>Cancelar</button><button type="submit">${user ? 'Guardar cambios' : 'Crear técnico'}</button></div></form>`;
  if (!openDialog(user ? 'Editar técnico' : 'Crear técnico',content)) return;
  const form = dialog.querySelector('form'), currentOwner = owner, requestId = crypto.randomUUID();
  form.onsubmit = async event => {
    event.preventDefault(); if (!allowed() || owner !== currentOwner) return;
    const button = form.querySelector('button[type="submit"]'); if (button.disabled) return;
    const data = Object.fromEntries(new FormData(form)); button.disabled = true;
    const payload = { request_id: requestId, nombres: data.nombres.trim(), apellido_paterno:data.apellido_paterno.trim(), apellido_materno:data.apellido_materno.trim(), dni:data.dni, sucursal_id:data.sucursal_id, telefono:data.telefono.trim() || null };
    try {
      const result = await usersRequest('admin',user ? 'edit' : 'create',user
        ? {...payload,target_user_id:user.id,expected_profile_digest_hex:user.profile_digest_hex}
        : {...payload,usuario:data.usuario.trim().toLowerCase(),rol:'tecnico',activo:true});
      if (!allowed() || owner !== currentOwner) return;
      if (user && result.state === 'updated') { closeDialog(); status('Cambios confirmados.'); }
      else showOutcome(result,requestId);
      void refresh();
    } catch (error) {
      if (!allowed() || owner !== currentOwner) return;
      if (error.code === 'RESULT_NOT_CONFIRMED') showOutcome({state:'unknown'},requestId);
      else { form.querySelector('#users-form-error').textContent = usersErrorText(error); button.disabled = false; }
    }
  };
}
function openState(user, action) {
  if (!['block','reactivate','reset'].includes(action)) return;
  if (!openDialog(action === 'block' ? 'Bloquear técnico' : 'Emitir nueva clave temporal',`<p>${esc(user.usuario)}: ${action === 'block' ? 'Se bloqueará su acceso y se invalidarán sus sesiones autorizadas.' : 'Necesitará activar de nuevo su cuenta y establecer una contraseña.'}</p><button type="button" id="users-confirm-state">Confirmar</button><p id="state-status" role="status"></p>`)) return;
  const requestId=crypto.randomUUID(), currentOwner=owner;
  dialog.querySelector('#users-confirm-state').onclick = async event => {
    if (!allowed() || owner !== currentOwner) return; event.target.disabled=true;
    try {
      const result=await usersRequest('admin',action,{request_id:requestId,target_user_id:user.id,...(action === 'block' ? {} : {usuario:user.usuario})});
      if (!allowed() || owner !== currentOwner) return;
      if (action === 'block' && result.state === 'blocked') { closeDialog(); status('Técnico bloqueado.'); }
      else showOutcome(result,requestId);
      void refresh();
    } catch(error) {
      if (!allowed() || owner !== currentOwner) return;
      if (error.code === 'RESULT_NOT_CONFIRMED') showOutcome({state:'unknown'},requestId);
      else dialog.querySelector('#state-status').textContent=usersErrorText(error);
    }
  };
}
