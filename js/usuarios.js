// Prototipo aislado: sin cliente remoto, almacenamiento persistente ni cuentas reales.
const categories = [
  { title: 'Consulta', description: 'Acceso a la información del vademécum.', modules: [['catalogo', 'Consultar catálogo'], ['fichas', 'Ver fichas de productos']] },
  { title: 'Productos', description: 'Herramientas de gestión del catálogo.', modules: [['agregar', 'Agregar productos'], ['editar', 'Editar productos']] },
  { title: 'Administración', description: 'Gestión de usuarios y sus accesos.', modules: [['usuarios', 'Administrar usuarios'], ['permisos', 'Gestionar permisos']] }
];
const seeds = [
  ['ana.demo', 'Ana', 'Torres', 'Vega', '00000001', 'Central', 'administrador', 'activo'],
  ['luis.demo', 'Luis', 'Ramos', 'Díaz', '00000002', 'Los Olivos', 'tecnico', 'activo'],
  ['maria.demo', 'María', 'López', 'Ruiz', '00000003', 'Central', 'tecnico', 'bloqueado'],
  ['carlos.demo', 'Carlos', 'Pérez', 'Soto', '00000004', 'Castilla', 'tecnico', 'activo'],
  ['rosa.demo', 'Rosa', 'García', 'León', '00000005', 'Los Olivos', 'tecnico', 'activo'],
  ['jose.demo', 'José', 'Flores', 'Paz', '00000006', 'Castilla', 'tecnico', 'bloqueado'],
  ['elena.demo', 'Elena', 'Vargas', 'Reyes', '00000007', 'Central', 'administrador', 'activo']
];
const defaults = (role) => Object.fromEntries(categories.flatMap(c => c.modules.map(([key]) => [key, role === 'administrador' || ['catalogo', 'fichas'].includes(key)])));
const initialUsers = () => seeds.map((r, i) => ({ id: i + 1, ...Object.fromEntries(['usuario', 'nombres', 'paterno', 'materno', 'dni', 'sucursal', 'rol', 'estado'].map((key, j) => [key, r[j]])), telefono: '', visita: i % 3 ? 'Sin visitas' : '12 nov 2026 · 09:30', permissions: defaults(r[6]) }));
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = v => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const icons = {
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
let access, owner = null, users = [], page = 1, nextId = 8, root, dialog, returnFocus;
const size = 5;
function allowed() { return Boolean(access?.()) && owner === access(); }
function status(message) { root.querySelector('#users-status').textContent = message; }

export function syncUsersAccess() {
  const id = access?.() || null;
  document.querySelector('[data-nav="usuarios"]').hidden = !id;
  if (owner !== id) {
    closeDialog(); owner = id; users = id ? initialUsers() : []; page = 1; nextId = 8;
    root.querySelector('#users-search').value = '';
    status(''); render();
  }
  if (location.hash !== '#usuarios') closeDialog();
}

export function initializeUsers(checkAccess) {
  access = checkAccess; root = document.querySelector('#usuarios');
  root.innerHTML = `<div class="heading-row"><div><p class="eyebrow">ADMINISTRACIÓN · BOTICAS DEL NORTE</p><h1 id="users-title">Usuarios</h1><p class="subtitle">Organiza tu equipo y revisa sus accesos al vademécum.</p></div><button type="button" id="users-add">＋ Agregar usuario</button></div>
    <div class="users-demo"><strong>Vista de demostración</strong><p>Todos los usuarios, DNI, sucursales y visitas de esta vista son ficticios. Los cambios solo se aplican en memoria y se pierden al recargar. No se crean cuentas ni se guarda información en Supabase.</p></div>
    <div class="users-stats" id="users-stats"></div>
    <div class="panel users-panel"><div class="users-toolbar"><div><h2>Directorio de usuarios <span class="tag">DEMO</span></h2><p class="muted">Consulta y administra registros de ejemplo.</p></div><button type="button" class="users-secondary" id="users-refresh">↻ Actualizar</button></div>
    <label for="users-search">Buscar usuario</label><input id="users-search" type="search" placeholder="Usuario, nombres, apellidos o DNI" autocomplete="off">
    <p id="users-status" class="users-status" role="status" aria-live="polite"></p>
    <div class="table-scroll"><table class="users-table"><caption class="users-sr">Directorio ficticio de usuarios. Todas las acciones son de demostración.</caption><thead><tr><th scope="col">Usuario</th><th scope="col">Nombres y apellidos</th><th scope="col">DNI</th><th scope="col">Última visita</th><th scope="col">Sucursal</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody id="users-rows"></tbody></table></div>
    <div class="users-pagination"><span id="users-range" aria-live="polite"></span><div><button type="button" class="users-secondary" id="users-prev" aria-label="Página anterior">←</button><span id="users-page"></span><button type="button" class="users-secondary" id="users-next" aria-label="Página siguiente">→</button></div></div></div>`;
  dialog = document.createElement('dialog'); dialog.className = 'users-dialog'; document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.replaceChildren(); returnFocus?.focus(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  root.querySelector('#users-add').onclick = () => openUser();
  root.querySelector('#users-search').oninput = () => { page = 1; render(); };
  root.querySelector('#users-refresh').onclick = () => { if (!allowed()) return; render(); status('Vista local actualizada. No se consultó Supabase; se conservan los cambios de esta demostración.'); };
  root.querySelector('#users-prev').onclick = () => { page--; render(); };
  root.querySelector('#users-next').onclick = () => { page++; render(); };
  root.querySelector('#users-rows').onclick = e => {
    if (!allowed()) return;
    const button = e.target.closest('button[data-action]'); if (!button) return;
    const user = users.find(u => u.id === Number(button.dataset.id)); if (!user) return;
    if (button.dataset.action === 'edit') openUser(user);
    if (button.dataset.action === 'shield') openPermissions(user);
    if (button.dataset.action === 'block') openBlock(user);
  };
  render();
}

function render() {
  const query = normalize(root.querySelector('#users-search').value.trim());
  const filtered = users.filter(u => normalize(`${u.usuario} ${u.nombres} ${u.paterno} ${u.materno} ${u.dni}`).includes(query));
  const pages = Math.max(1, Math.ceil(filtered.length / size)); page = Math.max(1, Math.min(page, pages));
  root.querySelector('#users-stats').innerHTML = [['Usuarios demo', users.length], ['Activos', users.filter(u => u.estado === 'activo').length], ['Bloqueados', users.filter(u => u.estado === 'bloqueado').length]].map(([label, n]) => `<div><span>${label}</span><strong>${n.toString().padStart(2, '0')}</strong></div>`).join('');
  root.querySelector('#users-rows').innerHTML = filtered.slice((page - 1) * size, page * size).map(u => `<tr><td><strong>${esc(u.usuario)}</strong><small>DEMO</small></td><td>${esc(`${u.nombres} ${u.paterno} ${u.materno}`)}</td><td>${esc(u.dni)}</td><td>${esc(u.visita)}</td><td>${esc(u.sucursal)}</td><td><span class="users-role">${u.rol === 'administrador' ? 'Administrador' : 'Técnico'}</span></td><td><span class="users-state ${u.estado}">${u.estado === 'activo' ? 'Activo' : 'Bloqueado'}</span></td><td><div class="users-actions">${[['edit', 'Editar'], ['block', u.estado === 'activo' ? 'Desactivar' : 'Activar'], ['shield', 'Permisos']].map(([action, label]) => `<button type="button" class="users-icon" data-action="${action}" data-id="${u.id}" title="${label} (demo)" aria-label="${label} a ${esc(u.usuario)} (demostración)">${icon(action)}</button>`).join('')}</div></td></tr>`).join('') || '<tr><td colspan="8" class="users-empty">No encontramos usuarios. Prueba con otro nombre, usuario o DNI.</td></tr>';
  root.querySelector('#users-range').textContent = filtered.length ? `Mostrando ${(page - 1) * size + 1}–${Math.min(page * size, filtered.length)} de ${filtered.length} usuarios demo` : '0 usuarios encontrados';
  root.querySelector('#users-page').textContent = `${page} / ${pages}`;
  root.querySelector('#users-prev').disabled = page === 1; root.querySelector('#users-next').disabled = page === pages;
}
function closeDialog() { if (dialog?.open) dialog.close(); }
function openDialog(title, description, content) {
  if (!allowed()) return false;
  returnFocus = document.activeElement;
  dialog.innerHTML = `<div class="users-modal-heading"><div><p class="eyebrow">VISTA DE DEMOSTRACIÓN</p><h2 id="users-modal-title">${esc(title)}</h2></div><button type="button" class="users-secondary" data-close aria-label="Cerrar ventana">✕</button></div><p id="users-modal-description" class="muted">${esc(description)}</p>${content}`;
  dialog.setAttribute('aria-labelledby', 'users-modal-title'); dialog.setAttribute('aria-describedby', 'users-modal-description');
  dialog.querySelectorAll('[data-close]').forEach(b => b.onclick = closeDialog);
  dialog.showModal(); return true;
}
function openUser(user) {
  const fields = [['usuario', 'Nombre de usuario', 'text'], ['nombres', 'Nombres', 'text'], ['paterno', 'Apellido paterno', 'text'], ['materno', 'Apellido materno', 'text'], ['dni', 'DNI', 'text'], ['telefono', 'Teléfono (opcional)', 'tel']];
  if (!openDialog(user ? 'Editar usuario' : 'Agregar usuario', 'Completa los campos obligatorios (*). Solo se modificará un registro ficticio en esta página. No se solicitan contraseñas.', `<form id="users-form"><div class="users-form-grid">${fields.map(([key, label, type]) => `<label>${label}${key !== 'telefono' ? ' *' : ''}<input name="${key}" type="${type}" value="${esc(user?.[key] || '')}" ${key !== 'telefono' ? 'required' : ''} maxlength="${key === 'dni' ? 8 : key === 'telefono' ? 20 : 60}" ${key === 'dni' ? 'inputmode="numeric" pattern="[0-9]{8}" title="Introduce exactamente 8 dígitos"' : ''}></label>`).join('')}
    <label>Sucursal *<select name="sucursal" required><option value="">Seleccionar sucursal demo</option>${['Central', 'Los Olivos', 'Castilla'].map(s => `<option ${user?.sucursal === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>Rol *<select name="rol" required><option value="tecnico">Técnico</option><option value="administrador" ${user?.rol === 'administrador' ? 'selected' : ''}>Administrador</option></select></label>
    <label>Estado *<select name="estado" required><option value="activo">Activo</option><option value="bloqueado" ${user?.estado === 'bloqueado' ? 'selected' : ''}>Bloqueado</option></select></label></div><p class="users-form-error" id="users-form-error" role="alert"></p><p class="muted">El rol y los permisos son ejemplos visuales independientes; no cambian el acceso real de ninguna cuenta.</p><div class="users-modal-footer"><button type="button" class="users-secondary" data-close>Cancelar</button><button type="submit">Aplicar en demostración</button></div></form>`)) return;
  const form = dialog.querySelector('form');
  form.onsubmit = e => {
    e.preventDefault(); if (!allowed()) { closeDialog(); return; }
    const data = Object.fromEntries(new FormData(form)); Object.keys(data).forEach(k => data[k] = data[k].trim());
    const error = dialog.querySelector('#users-form-error');
    if (fields.some(([key]) => key !== 'telefono' && !data[key])) { error.textContent = 'Completa los campos obligatorios sin usar solo espacios.'; return; }
    if (!/^[0-9]{8}$/.test(data.dni)) { error.textContent = 'El DNI debe contener exactamente 8 dígitos.'; return; }
    if (data.telefono && !/^\+?[0-9 ()-]{6,20}$/.test(data.telefono)) { error.textContent = 'Revisa el teléfono: usa entre 6 y 20 caracteres (números, espacios, +, paréntesis o guiones).'; return; }
    if (users.some(u => u.id !== user?.id && (normalize(u.usuario) === normalize(data.usuario) || u.dni === data.dni))) { error.textContent = 'Ya existe ese usuario o DNI en la demostración.'; return; }
    if (user) Object.assign(user, data); else users.unshift({ ...data, id: nextId++, visita: 'Sin visitas', permissions: defaults(data.rol) });
    closeDialog(); render(); status('Cambios aplicados solo en esta demostración. No se guardó información en Supabase.');
  };
}
function openPermissions(user) {
  if (!openDialog(`Permisos de ${user.usuario}`, 'Interruptores de demostración. Estos cambios no conceden ni revocan accesos reales.', `<form>${categories.map(c => `<fieldset class="users-permission-group"><legend>${esc(c.title)}</legend><p class="muted">${esc(c.description)}</p>${c.modules.map(([key, label]) => `<label class="users-permission"><span>${esc(label)}</span><span class="users-switch"><input type="checkbox" role="switch" name="${key}" ${user.permissions[key] ? 'checked' : ''}><span aria-hidden="true" class="users-switch-track"></span><span class="users-switch-text" aria-hidden="true"></span></span></label>`).join('')}</fieldset>`).join('')}<div class="users-modal-footer"><button type="button" class="users-secondary" data-close>Cancelar</button><button type="submit">Aplicar permisos demo</button></div></form>`)) return;
  dialog.querySelector('form').onsubmit = e => { e.preventDefault(); if (!allowed()) { closeDialog(); return; } const data = new FormData(e.target); user.permissions = Object.fromEntries(categories.flatMap(c => c.modules.map(([key]) => [key, data.has(key)]))); closeDialog(); status(`Permisos de ${user.usuario} aplicados solo en la demostración. Los accesos reales siguen iguales.`); };
}
function openBlock(user) {
  const activating = user.estado === 'bloqueado';
  if (!openDialog(`${activating ? 'Activar' : 'Desactivar'} usuario demo`, `${user.usuario} cambiará a estado ${activating ? 'activo' : 'bloqueado'} únicamente en esta vista. No se modificará ninguna cuenta real.`, '<div class="users-modal-footer"><button type="button" class="users-secondary" data-close>Cancelar</button><button type="button" id="users-confirm">Confirmar en demostración</button></div>')) return;
  dialog.querySelector('#users-confirm').onclick = () => { if (!allowed()) { closeDialog(); return; } user.estado = activating ? 'activo' : 'bloqueado'; closeDialog(); render(); status('Estado actualizado solo en la demostración. Ninguna cuenta real fue modificada.'); };
}
