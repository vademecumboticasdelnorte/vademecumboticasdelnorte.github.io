import {localCatalogRequest,usersErrorText} from './usuarios-api.js';
import {canPermission,refreshPermissionContext,hydrateProtectedPhotos} from './permisos-local.js';
import {searchCatalog} from './catalogo.js';
export let catalogManagementReady=false;
let getProfile,root,dialog,owner=null,epoch=0,products=[],labs=[],tab='products',busy=false,previews=[];
const permissions=['product.create','product.update','product.deactivate','product.photo.upload','product.photo.replace'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const admin=()=>getProfile?.()?.rol==='administrador';
export const canManageProducts=()=>catalogManagementReady&&Boolean(getProfile?.())&&(admin()||permissions.some(code=>canPermission(code)));
const photoManager=()=>admin()||canPermission('product.photo.upload')||canPermission('product.photo.replace');
const status=text=>{const target=root?.querySelector('#catalog-management-status');if(target)target.textContent=text;};
const request=(action,body)=>localCatalogRequest('/api/catalogo/acciones/'+action,{method:'POST',body});
const changed=()=>window.dispatchEvent(new CustomEvent('vbn-catalog-changed'));
const stillAllowed=id=>id===owner&&id===getProfile?.()?.id&&canManageProducts();
function cleanup(){for(const draft of previews)if(draft.url)URL.revokeObjectURL(draft.url);previews=[];}
function close(){if(!busy){dialog.close();dialog.replaceChildren();cleanup();}}
function open(title,html){
 if(busy||!canManageProducts())return false;
 cleanup();dialog.innerHTML='<div class="users-modal-heading"><h2>'+esc(title)+'</h2><button type="button" class="users-secondary" data-product-close>Cerrar</button></div>'+html;
 dialog.querySelectorAll('[data-product-close]').forEach(button=>button.onclick=close);
 if(!dialog.open)dialog.showModal();return true;
}
export function initializeProductManagement(profileGetter){
 getProfile=profileGetter;root=document.querySelector('#administracion');
 dialog=document.createElement('dialog');dialog.className='users-dialog catalog-dialog';document.body.append(dialog);
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{if(!dialog.open&&!busy){dialog.replaceChildren();cleanup();}});
}
export async function refreshProductManagement(){
 const id=getProfile?.()?.id??null,current=++epoch;
 if(owner!==id){owner=id;products=[];labs=[];if(dialog.open){dialog.close();dialog.replaceChildren();cleanup();}}
 const nav=document.querySelector('[data-nav="administracion"]');
 if(!id){nav.hidden=true;return;}
 try{
  const mode=await localCatalogRequest('/api/catalogo/estado',{publicRequest:true});
  if(current!==epoch||getProfile?.()?.id!==id)return;
  catalogManagementReady=mode.enabled===true;
  nav.hidden=!canManageProducts();
  if(!catalogManagementReady)return;
  if(!canManageProducts()){if(location.hash==='#administracion')location.hash='catalogo';if(dialog.open){dialog.close();dialog.replaceChildren();cleanup();}return;}
  await refreshPermissionContext();
  if(current!==epoch||!stillAllowed(id)){nav.hidden=true;return;}
  const [data,branches]=await Promise.all([localCatalogRequest('/api/catalogo/gestion'),localCatalogRequest('/api/laboratorios')]);
  if(current!==epoch||!stillAllowed(id))return;
  if(!Array.isArray(data.products)||!Array.isArray(branches))throw Error('INVALID_CATALOG');
  products=data.products;labs=branches;
  ensureLayout();render();
  const editing=dialog.querySelector('#catalog-product-form');
  if(editing&&!canPermission(editing.dataset.permission)){dialog.close();dialog.replaceChildren();cleanup();}
  else if(previews.length&&!busy)renderPreviews();
 }catch(error){if(current===epoch){nav.hidden=!admin();status(usersErrorText(error));}}
}
function ensureLayout(){
 if(root.querySelector('#catalog-management-status'))return;
 root.innerHTML='<div class="heading-row"><div><p class="eyebrow">GESTIÓN DEL CATÁLOGO</p><h1 id="admin-title">Productos y fotografías</h1><p class="subtitle">Administra productos y fotografías según tus permisos.</p></div><button id="catalog-new">Agregar producto</button></div>'+
 '<div class="catalog-tabs" role="group" aria-label="Apartados de gestión"><button data-tab="products">Productos</button><button data-tab="photos">Fotografías</button></div>'+
 '<div class="catalog-stats" id="catalog-stats"></div><div class="panel"><div class="catalog-toolbar">'+
 '<label>Buscar<input id="catalog-manage-search" type="search" placeholder="Código, nombre o laboratorio"></label>'+
 '<label>Laboratorio<select id="catalog-manage-lab"><option value="">Todos</option></select></label>'+
 '<label>Estado<select id="catalog-manage-active"><option value="">Todos</option><option value="true">Activos</option><option value="false">Desactivados</option></select></label>'+
 '<label>Fotografía<select id="catalog-manage-photo"><option value="">Todas</option><option value="with">Con fotografía</option><option value="without">Sin fotografía</option></select></label></div>'+
 '<div class="catalog-toolbar"><button type="button" id="catalog-upload-batch">Cargar fotografías / lote</button><button type="button" id="catalog-add-lab">Agregar laboratorio</button><button type="button" id="catalog-manage-refresh" class="users-secondary">Actualizar</button></div>'+
 '<p id="catalog-management-status" role="status" aria-live="polite"></p><div class="table-scroll"><table><thead><tr><th>Fotografía</th><th>Código</th><th>Producto</th><th>Laboratorio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="admin-products"></tbody></table></div></div>';
 root.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;render();});
 for(const id of ['catalog-manage-search','catalog-manage-lab','catalog-manage-active','catalog-manage-photo'])root.querySelector('#'+id).addEventListener(id.endsWith('search')?'input':'change',render);
 root.querySelector('#catalog-new').onclick=()=>editor();
 root.querySelector('#catalog-upload-batch').onclick=()=>pickPhotos();
 root.querySelector('#catalog-add-lab').onclick=addLab;
 root.querySelector('#catalog-manage-refresh').onclick=()=>{void refreshProductManagement();};
 root.querySelector('#admin-products').onclick=event=>{
  const button=event.target.closest('button[data-catalog-action]'),product=products.find(p=>p.codigo===button?.dataset.code);
  if(!product||!canManageProducts())return;
  if(button.dataset.catalogAction==='edit')editor(product);
  else if(button.dataset.catalogAction==='photo')pickPhotos(product);
  else void state(product,button.dataset.catalogAction);
 };
}
function render(){
 if(!canManageProducts())return;
 const labFilter=root.querySelector('#catalog-manage-lab'),selected=labFilter.value;
 labFilter.innerHTML='<option value="">Todos</option>'+labs.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.nombre)+'</option>').join('');labFilter.value=selected;
 root.querySelector('#catalog-new').hidden=!canPermission('product.create');
 root.querySelector('#catalog-upload-batch').hidden=!photoManager();
 root.querySelector('#catalog-add-lab').hidden=!admin();
 root.querySelector('[data-tab="photos"]').hidden=!photoManager();
 if(tab==='photos'&&!photoManager())tab='products';
 root.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
 const withPhoto=products.filter(p=>p.foto).length;
 root.querySelector('#catalog-stats').textContent=products.length+' productos · '+withPhoto+' con fotografía · '+(products.length-withPhoto)+' fotografías pendientes';
 const query=root.querySelector('#catalog-manage-search').value,active=root.querySelector('#catalog-manage-active').value,photo=root.querySelector('#catalog-manage-photo').value;
 const list=searchCatalog(products,query).filter(p=>(!selected||p.laboratorio_id===selected)&&(!active||String(p.activo)===active)&&(!photo||(photo==='with')===Boolean(p.foto)));
 root.querySelector('#admin-products').innerHTML=list.map(p=>{
  const button=(action,label)=>'<button type="button" class="users-secondary" data-catalog-action="'+action+'" data-code="'+esc(p.codigo)+'">'+label+'</button>';
  const actions=[];
  if(tab==='products'){
   if(canPermission('product.update'))actions.push(button('edit','Editar'));
   if(p.activo&&canPermission('product.deactivate'))actions.push(button('deactivate','Desactivar'));
   if(!p.activo&&admin())actions.push(button('reactivate','Reactivar'));
  }
  if(p.activo&&(p.foto?canPermission('product.photo.replace'):canPermission('product.photo.upload')))actions.push(button('photo',p.foto?'Cambiar foto':'Cargar foto'));
  const preview=p.foto&&photoManager()?'<img class="product-photo catalog-thumb" data-protected-code="'+esc(p.codigo)+'" data-photo-scope="manage" src="img/producto-sin-fotografia.svg" alt="Fotografía '+esc(p.codigo)+'" loading="lazy"><div class="placeholder" hidden>Sin fotografía</div>':'<img class="catalog-thumb" src="img/producto-sin-fotografia.svg" alt="Sin fotografía">';
  return '<tr><td><div class="catalog-thumb-wrap">'+preview+'</div></td><td>'+esc(p.codigo)+'</td><td>'+esc(p.producto||'Sin nombre original')+(p.estado_cruce==='Revisar nombre'?'<br><span class="tag">REVISAR NOMBRE · ORIGINAL CONSERVADO</span>':'')+'</td><td>'+esc(p.laboratorio)+'</td><td>'+(p.activo?'Activo':'Desactivado')+'<br><small>'+(p.foto?'Con foto':'Sin foto')+'</small></td><td><div class="catalog-actions">'+actions.join('')+'</div></td></tr>';
 }).join('')||'<tr><td colspan="6">No hay productos con estos filtros.</td></tr>';
 hydrateProtectedPhotos();
}
function editor(product){
 if(!canManageProducts()||!canPermission(product?'product.update':'product.create'))return;
 const field=(key,label,max,required=false)=>'<label>'+label+'<input name="'+key+'" maxlength="'+max+'" value="'+esc(product?.[key])+'" '+(required?'required':'')+'></label>';
 if(!open(product?'Editar producto '+product.codigo:'Agregar producto','<form id="catalog-product-form" class="catalog-form">'+
 '<label>Código de ocho dígitos<input name="codigo" pattern="[0-9]{8}" inputmode="numeric" minlength="8" maxlength="8" value="'+esc(product?.codigo)+'" '+(product?'readonly':'required')+'></label>'+
 field('producto','Nombre del producto',500,true)+field('principio_activo','Principio activo',1000)+field('grupo','Grupo',160)+
 '<label>Laboratorio<select name="laboratorio_id" required><option value="">Selecciona</option>'+labs.map(l=>'<option value="'+esc(l.id)+'" '+(product?.laboratorio_id===l.id?'selected':'')+'>'+esc(l.nombre)+'</option>').join('')+'</select></label>'+
 '<p class="muted">El código no podrá cambiarse. Los datos originales y el estado de revisión se conservan.</p><p id="catalog-dialog-status" role="alert"></p><button type="submit">Guardar producto</button></form>'))return;
 const form=dialog.querySelector('form'),id=owner,requestId=crypto.randomUUID();
 form.dataset.permission=product?'product.update':'product.create';
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!stillAllowed(id))return;busy=true;
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  const fields=Object.fromEntries(new FormData(form));const body={...fields,request_id:requestId,...(product?{expected_revision:product.revision}:{})};
  try{const result=await request(product?'edit':'create',body);if(!stillAllowed(id))return;if(result.codigo!==fields.codigo)throw Error('INVALID_SAVE');busy=false;close();status('Producto guardado correctamente.');changed();}
  catch(error){if(stillAllowed(id))form.querySelector('#catalog-dialog-status').textContent=usersErrorText(error)+' Operación: '+requestId;if(error.code!=='RESULT_NOT_CONFIRMED'&&error.code!=='CATALOG_CONFLICT')button.disabled=false;}
  finally{busy=false;}
 };
}
async function state(product,action){
 if(!['deactivate','reactivate'].includes(action)||!canManageProducts()||(action==='reactivate'?!admin():!canPermission('product.deactivate')))return;
 if(!confirm((action==='deactivate'?'Desactivar ':'Reactivar ')+product.codigo+' — '+(product.producto||'Sin nombre')+'?'))return;
 try{await request(action,{request_id:crypto.randomUUID(),codigo:product.codigo,expected_revision:product.revision});status('Estado guardado correctamente.');changed();}
 catch(error){status(usersErrorText(error));}
}
function addLab(){
 if(!admin()||!canManageProducts())return;
 if(!open('Agregar laboratorio','<form><label>Nombre exacto<input name="nombre" maxlength="160" required></label><p role="alert"></p><button type="submit">Guardar laboratorio</button></form>'))return;
 const form=dialog.querySelector('form'),requestId=crypto.randomUUID(),id=owner;
 form.onsubmit=async event=>{event.preventDefault();if(busy||!stillAllowed(id))return;busy=true;const button=form.querySelector('button');button.disabled=true;
 try{await request('lab_create',{request_id:requestId,nombre:form.elements.nombre.value});busy=false;close();status('Laboratorio guardado.');changed();}
 catch(error){form.querySelector('[role="alert"]').textContent=usersErrorText(error);if(error.code!=='RESULT_NOT_CONFIRMED')button.disabled=false;}finally{busy=false;}};
}
function pickPhotos(product){
 if(!canManageProducts()||!photoManager())return;
 const input=document.createElement('input');input.type='file';input.accept='.jpg,.jpeg,.jfif,.png,.webp';input.multiple=!product;
 input.onchange=()=>{void previewFiles([...input.files],product);};input.click();
}
async function previewFiles(files,selected){
 if(!canManageProducts()||!photoManager()||!files.length)return;
 if(files.length>100||files.reduce((n,f)=>n+f.size,0)>100000000){status('El lote admite hasta 100 archivos y 100 MB en total.');return;}
 if(!open('Vista previa de fotografías','<p>Validando archivos…</p>'))return;
 const id=owner,duplicates=new Map();
 for(const file of files){const code=/^([0-9]{8})\.(jpg|jpeg|jfif|png|webp)$/i.exec(file.name)?.[1];if(code)duplicates.set(code,(duplicates.get(code)||0)+1);}
 for(const file of files){
  const draft={file,name:file.name,requestId:crypto.randomUUID(),status:'preview',confirmed:false};
  try{
   const code=/^([0-9]{8})\.(jpg|jpeg|jfif|png|webp)$/i.exec(file.name)?.[1];
   if(!code)throw Error('Nombre inválido: usa el código exacto de ocho dígitos.');
   if(duplicates.get(code)!==1)throw Error('Código duplicado dentro del lote.');
   const product=products.find(p=>p.codigo===code);
   if(!product||selected&&selected.codigo!==code)throw Error('Código inexistente o distinto del producto seleccionado.');
   if(!product.activo)throw Error('Producto desactivado.');
   if(!canPermission(product.foto?'product.photo.replace':'product.photo.upload'))throw Error('No tienes el permiso necesario.');
   if(!file.size||file.size>5000000)throw Error('Supera 5 MB o está vacío.');
   const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
   const mime=head[0]===255&&head[1]===216?'image/jpeg':head[0]===137&&head[1]===80?'image/png':String.fromCharCode(...head.slice(0,4))==='RIFF'?'image/webp':null;
   if(!mime)throw Error('Formato no admitido.');
   const extension=file.name.split('.').at(-1).toLowerCase();
   if(mime==='image/jpeg'?!['jpg','jpeg','jfif'].includes(extension):extension!==mime.split('/')[1])throw Error('El contenido no coincide con la extensión del archivo.');
   const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();
   if(pixels>20000000)throw Error('Supera 20 megapíxeles para nuevas fotografías.');
   draft.product=product;draft.blob=new Blob([file],{type:mime});draft.url=URL.createObjectURL(draft.blob);
   draft.confirmed=!product.foto;
  }catch(error){draft.status='invalid';draft.message=error.message;}
  if(!stillAllowed(id)||!dialog.open){if(draft.url)URL.revokeObjectURL(draft.url);return;}
  previews.push(draft);
 }
 renderPreviews();
}
function renderPreviews(){
 for(const draft of previews)if(draft.status==='preview'&&draft.product&&!canPermission(draft.product.foto?'product.photo.replace':'product.photo.upload')){draft.status='failed';draft.message='El permiso cambió; esta fotografía no se cargará.';}
 dialog.querySelectorAll(':scope > :not(.users-modal-heading)').forEach(el=>el.remove());
 const area=document.createElement('div');area.innerHTML='<p class="muted">Hasta 100 archivos / 100 MB por lote. Máximo 5 MB y 20 MP por nueva imagen. Cada archivo se guarda independientemente.</p>'+
 '<div class="table-scroll"><table class="catalog-preview"><thead><tr><th>Vista previa</th><th>Archivo / código</th><th>Confirmación</th><th>Resultado</th></tr></thead><tbody>'+
 previews.map((p,i)=>'<tr><td>'+(p.url?'<img class="catalog-thumb" src="'+p.url+'" alt="Vista previa" loading="lazy">':'—')+'</td><td>'+esc(p.name)+'<br>'+esc(p.product?.codigo)+'</td><td>'+(p.status==='preview'&&p.product?.foto?'<label><input type="checkbox" data-replace="'+i+'" '+(p.confirmed?'checked':'')+'> Confirmo reemplazar la foto existente</label>':'')+'</td><td>'+esc(p.message||(p.status==='preview'?'Lista para guardar':p.status==='saved'?'Guardada':'No válida'))+(p.status==='unknown'?'<br><code>'+esc(p.requestId)+'</code><button type="button" data-check="'+i+'">Comprobar resultado</button>':'')+'</td></tr>').join('')+'</tbody></table></div><p role="status" id="catalog-upload-summary"></p><button type="button" id="catalog-upload-save">Guardar fotografías</button>';
 dialog.append(area);
 area.querySelectorAll('[data-replace]').forEach(input=>input.onchange=()=>{previews[Number(input.dataset.replace)].confirmed=input.checked;updateSave();});
 area.querySelectorAll('[data-check]').forEach(button=>button.onclick=async()=>{button.disabled=true;const draft=previews[Number(button.dataset.check)];try{const result=await request('operation',{request_id:draft.requestId});draft.message=result.complete?'Guardado confirmado.':'Sigue pendiente. No repitas la carga.';if(result.complete){draft.status='saved';changed();}renderPreviews();}catch(error){draft.message=usersErrorText(error);renderPreviews();}});
 area.querySelector('#catalog-upload-save').onclick=()=>{void savePhotos();};updateSave();
}
function updateSave(){
 const ready=previews.filter(p=>p.status==='preview'),pending=ready.filter(p=>!p.confirmed).length;
 dialog.querySelector('#catalog-upload-summary').textContent=ready.length+' listas · '+pending+' reemplazos pendientes de confirmación · '+previews.filter(p=>p.status==='saved').length+' guardadas';
 dialog.querySelector('#catalog-upload-save').disabled=busy||!ready.length||pending>0;
}
async function savePhotos(){
 if(busy||!canManageProducts()||!photoManager())return;
 const list=previews.filter(p=>p.status==='preview');if(!list.length||list.some(p=>!p.confirmed))return;
 const replacements=list.filter(p=>p.product.foto).length;
 if(replacements&&!confirm('Se reemplazarán '+replacements+' fotografías. ¿Confirmas guardar el lote?'))return;
 busy=true;updateSave();const id=owner;let saved=0;
 for(const draft of list){
  if(!stillAllowed(id))break;
  if(!canPermission(draft.product.foto?'product.photo.replace':'product.photo.upload')){draft.status='failed';draft.message='No tienes el permiso necesario.';break;}
  dialog.querySelector('#catalog-upload-summary').textContent='Guardando '+draft.name+' · '+saved+' archivos confirmados. No cierres esta ventana.';
  try{
   const result=await localCatalogRequest('/api/fotos/'+draft.product.codigo,{method:'POST',body:draft.blob,timeout:60000,headers:{'Content-Type':draft.blob.type,'x-vbn-filename':draft.name,'x-vbn-request':draft.requestId,'x-vbn-revision':String(draft.product.revision),'x-vbn-replace':String(draft.confirmed)}});
   if(result.codigo!==draft.product.codigo||!result.foto)throw Error('INVALID_UPLOAD');
   draft.status='saved';draft.message='Guardada correctamente.';saved++;
  }catch(error){draft.status=error.code==='RESULT_NOT_CONFIRMED'?'unknown':'failed';draft.message=usersErrorText(error);if(['PERMISSION_DENIED','UNAUTHENTICATED','CATALOG_NOT_READY'].includes(error.code))break;}
 }
 busy=false;if(stillAllowed(id)&&dialog.open)renderPreviews();else cleanup();if(saved)changed();
}
