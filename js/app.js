'use strict';
import { profile, initializeAuth, authCallbackPending, authInitializing } from './auth.js';

import { combineCatalog, searchCatalog, needsReview } from './catalogo.js';
import { initializeUsers, syncUsersAccess } from './usuarios.js';

initializeUsers(() => !authInitializing && !authCallbackPending && profile?.rol === 'administrador' ? profile.id : null);

const grid = document.querySelector('#product-grid');
let products = [];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const displayValue = (value) => escapeHtml(value ?? 'No consignado en el archivo');
const productName = (product) => product.nombre || 'Sin nombre en el archivo';
const statusLabel = (product) => needsReview(product) ? 'REVISAR NOMBRE' : 'CATÁLOGO REAL';
const art = (product) => {
  const image = typeof product.imagen === 'string' && /^img\/[a-zA-Z0-9_-]+\.(?:jpg|jfif|png)$/.test(product.imagen) ? product.imagen : null;
  return `<div class="product-art"><span class="demo-tag">${statusLabel(product)}</span>${image ? `<img class="product-photo" src="${escapeHtml(image)}" alt="Fotografía del producto ${escapeHtml(product.codigo)}${product.nombre ? ` · ${escapeHtml(productName(product))}` : ''}" loading="lazy" decoding="async">` : ''}<div class="placeholder" role="img" aria-label="Imagen del producto pendiente" ${image ? 'hidden' : ''}><span aria-hidden="true">▧</span><small>IMAGEN PENDIENTE</small></div></div>`;
};

// Captura también errores de las imágenes insertadas al buscar o abrir fichas.
document.addEventListener('error', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.classList.contains('product-photo')) return;
  const product = products.find((item) => item.imagen === target.getAttribute('src'));
  if (product) product.fotoDisponible = false;
  target.hidden = true;
  target.parentElement.querySelector('.placeholder').hidden = false;
}, true);

document.addEventListener('load', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !target.classList.contains('product-photo')) return;
  const product = products.find((item) => item.imagen === target.getAttribute('src'));
  if (product) product.fotoDisponible = true;
}, true);

function renderCatalog() {
  if (!profile) return;
  const query = document.querySelector('#search').value;
  const filtered = searchCatalog(products, query);
  grid.innerHTML = filtered.map((product) => `<article class="product-card"><a class="product-card-link" href="#ficha/${encodeURIComponent(product.codigo)}" aria-label="Ver ficha de ${escapeHtml(productName(product))}, código ${escapeHtml(product.codigo)}">${art(product)}<div class="card-body"><span class="product-code">${escapeHtml(product.codigo)}</span><h3>${escapeHtml(productName(product))}</h3><div class="product-meta"><p><span>Principio activo</span><strong>${displayValue(product.principioActivo)}</strong></p><p><span>Grupo</span><strong>${displayValue(product.grupo)}</strong></p><p><span>Laboratorio</span><strong>${displayValue(product.laboratorio)}</strong></p></div><div class="card-bottom"><span class="tag">${statusLabel(product)}</span><span class="text-link">Ver ficha <span aria-hidden="true">→</span></span></div></div></a></article>`).join('');
  document.querySelector('.count-badge').textContent = `${products.length} productos · ${products.filter(needsReview).length} por revisar`;
  document.querySelector('#result-count').textContent = String(filtered.length).padStart(2, '0');
  document.querySelector('#empty-state').hidden = filtered.length !== 0;
}

function renderDetail(code) {
  if (!profile) return;
  const product = products.find((item) => item.codigo === code);
  const detail = document.querySelector('#ficha');
  if (!product) {
    detail.innerHTML = '<a class="back-link" href="#catalogo">← Volver al catálogo</a><h1 id="detail-title">Producto no encontrado</h1><p class="muted">Selecciona uno de los productos del catálogo.</p>';
    return;
  }
  const fields = [['Código', product.codigo], ['Nombre', product.nombre], ['Principio activo', product.principioActivo], ['Grupo', product.grupo], ['Laboratorio', product.laboratorio], ['Estado del cruce', product.estado_cruce]];
  detail.innerHTML = `<a class="back-link" href="#catalogo">← Volver al catálogo</a><div class="detail-layout">${art(product)}<div><p class="eyebrow">FICHA DE PRODUCTO · ${statusLabel(product)}</p><h1 id="detail-title">${escapeHtml(productName(product))}</h1><p class="subtitle">${needsReview(product) ? 'Nombre marcado para revisión en el archivo original. Se conserva sin cambios.' : 'Datos originales del catálogo de Boticas del Norte.'}</p><dl class="detail-fields">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${displayValue(value)}</dd></div>`).join('')}</dl></div></div><div class="section-grid"><section class="panel"><h2>Información farmacológica</h2><p class="muted">El archivo de origen no incluye indicaciones, dosis, contraindicaciones ni advertencias clínicas.</p><span class="tag">SIN CONTENIDO VALIDADO</span></section><section class="panel"><h2>Apoyo a la venta</h2><p class="muted">Pendiente de incorporar contenido revisado y aprobado. No se proporcionan recomendaciones ni argumentos de venta para esta vista previa.</p><span class="tag">PENDIENTE DE REVISIÓN</span></section></div>`;
}

// Guardas de interfaz. Los datos reales requieren además autorización del servidor.
const routes = Object.freeze({
  acceso: {label: 'Inicio de sesión'},
  catalogo: {label: 'Catálogo'},
  ficha: {label: 'Ficha de producto'},
  administracion: {label: 'Administración'},
  usuarios: {label: 'Usuarios'}
});

function navigate() {
  syncUsersAccess();
  // El SDK debe consumir los parámetros de autenticación antes de normalizar la ruta.
  if (authInitializing || authCallbackPending) return;
  document.querySelector('#auth-loading').hidden = true;
  const [requested, code] = location.hash.slice(1).split('/');
  let view = Object.hasOwn(routes, requested) ? requested : 'acceso';
  if (!profile && view !== 'acceso') view = 'acceso';
  if (['administracion', 'usuarios'].includes(view) && profile?.rol !== 'administrador') view = 'catalogo';
  if (profile && view === 'acceso') view = 'catalogo';
  if (view !== requested) history.replaceState(null, '', `#${view}`);
  document.body.classList.toggle('login-page', view === 'acceso');
  document.querySelectorAll('.view').forEach((section) => { section.hidden = section.id !== view; });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === (view === 'ficha' ? 'catalogo' : view);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  const label = routes[view].label;
  document.querySelector('#page-label').textContent = label;
  document.title = `${label} · VADEMECUM DIGITAL`;
  if (view === 'administracion') renderAdminProducts();
  if (view === 'ficha') {
    let decoded = code;
    try { decoded = decodeURIComponent(code || ''); } catch { decoded = ''; }
    renderDetail(decoded);
  }
}

let catalogRevision = 0;
let catalogUserId = null;
let catalogRole = null;
async function accessChanged() {
  if (authInitializing) return;
  const userId = profile?.id ?? null;
  const role = profile?.rol ?? null;
  if (userId === catalogUserId) {
    if (role !== catalogRole) {
      catalogRole = role;
      renderCatalog();
      renderAdminProducts();
    }
    navigate();
    return;
  }
  catalogUserId = userId;
  catalogRole = role;
  const current = ++catalogRevision;
  products = [];
  grid.replaceChildren();
  document.querySelector('#ficha').replaceChildren();
  document.querySelector('#admin-products').replaceChildren();
  document.querySelector('#search').value = '';
  navigate();
  if (!profile) return;
  try {
    const responses = await Promise.all([fetch('data/productos_vademecum_reales.json'), fetch('data/imagenes.json')]);
    if (responses.some((response) => !response.ok)) throw new Error('No se pudo cargar el catálogo.');
    const [loaded, photos] = await Promise.all(responses.map((response) => response.json()));
    if (current !== catalogRevision || !profile) return;
    products = combineCatalog(loaded, photos);
    renderCatalog();
    renderAdminProducts();
    navigate();
  } catch {
    if (current !== catalogRevision || !profile) return;
    grid.innerHTML = '<p class="empty-state">No se pudo cargar el catálogo. Abre el proyecto mediante un servidor local (consulta README.md) y vuelve a intentarlo.</p>';
  }
}

function renderAdminProducts() {
  document.querySelector('#admin-products').innerHTML = profile?.rol === 'administrador'
    ? products.map((product) => `<tr><td>${escapeHtml(product.codigo)}</td><td>${escapeHtml(productName(product))}<br><small class="muted">${statusLabel(product)}</small></td><td><span class="tag">${product.fotoDisponible === true ? 'FOTO LOCAL' : product.fotoDisponible === false ? 'PENDIENTE' : 'POR COMPROBAR'}</span></td><td><button disabled>Editar</button> <button disabled>Cargar imagen</button></td></tr>`).join('')
    : '';
}

// Un solo enlace por tarjeta: fotografía, texto y espacios comparten destino.
grid.addEventListener('click', (event) => {
  const link = event.target.closest('.product-card-link');
  if (!link || event.defaultPrevented || event.button !== 0
      || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  location.hash = link.getAttribute('href');
});
grid.addEventListener('keydown', (event) => {
  // Enter conserva el comportamiento nativo del enlace; Espacio también lo activa.
  const link = event.target.closest('.product-card-link');
  if (!link || event.key !== ' ') return;
  event.preventDefault();
  if (!event.repeat) link.click();
});
document.querySelector('#search').addEventListener('input', renderCatalog);
window.addEventListener('hashchange', navigate);
navigate();
void initializeAuth(() => { void accessChanged(); });
