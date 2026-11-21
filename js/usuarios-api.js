// Transporte público LOCAL. Ninguna clave administrativa ni reintento de escrituras.
let sessionProvider = async () => null;
export const setUsersSessionProvider = (provider) => { sessionProvider = provider; };
export class UsersApiError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
export function localConfig() {
  const config = globalThis.window?.VBN_APP_CONFIG;
  if (!config || config.url !== 'https://mizowntlopnslxvangbo.supabase.co' || !config.publishableKey
      || config.functionsUrl !== config.url + '/functions/v1') throw new UsersApiError('LOCAL_CONFIGURATION_REQUIRED');
  return config;
}
async function send(path, body, { authenticated = false, token, method = 'POST' } = {}) {
  const config = localConfig();
  if (authenticated && !token) token = await sessionProvider();
  if (authenticated && !token) throw new UsersApiError('UNAUTHENTICATED', 401);
  let response;
  try {
    response = await fetch(config.url + path, { method, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(30000), headers: { apikey: config.publishableKey,
        Authorization: 'Bearer ' + (token || config.publishableKey), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new UsersApiError('RESULT_NOT_CONFIRMED'); }
  let data;
  try { data = await response.json(); } catch { throw new UsersApiError('RESULT_NOT_CONFIRMED'); }
  if (!response.ok) throw new UsersApiError(typeof data?.error === 'string' ? data.error : 'BACKEND_UNAVAILABLE', response.status);
  return data;
}
const actions = { admin: ['create','list','edit','block','reactivate','reset','reconcile','permissions_get','permissions_save'],
  access: ['start','exchange','activate','login','renew','logout'] };
export function usersRequest(group, action, body, options = {}) {
  if (!actions[group]?.includes(action)) throw new UsersApiError('INVALID_ACTION');
  return send('/functions/v1/usuarios-' + (group === 'admin' ? 'admin' : 'acceso') + '/' + action,
    body, { ...options, authenticated: group === 'admin' || ['renew','logout'].includes(action) });
}
export async function activeBranches() {
  const data = await send('/rest/v1/sucursales?select=id,nombre,activa&activa=eq.true&order=nombre', undefined,
    { authenticated: true, method: 'GET' });
  if (!Array.isArray(data) || data.some(row => typeof row.id !== 'string' || typeof row.nombre !== 'string' || row.activa !== true)) {
    throw new UsersApiError('INVALID_DATABASE_RESPONSE');
  }
  return data;
}
export async function localCatalogRequest(path,{image=false,publicRequest=false,method='GET',body,headers:extra={},timeout=30000}={}) {
  if(!/^\/api\/(permisos(?:\/estado)?|catalogo(?:\/(?:estado|gestion|acciones\/(?:create|edit|deactivate|reactivate|lab_create|operation)))?|laboratorios|productos\/\d{8}|fotos\/\d{8})(?:\?scope=manage)?$/.test(path)||!['GET','POST'].includes(method))throw new UsersApiError('INVALID_ACTION');
  if(Object.keys(extra).some(key=>!['Content-Type','x-vbn-filename','x-vbn-request','x-vbn-revision','x-vbn-replace'].includes(key)))throw new UsersApiError('INVALID_ACTION');
  const token=publicRequest?null:await sessionProvider();
  if(!publicRequest&&!token)throw new UsersApiError('UNAUTHENTICATED',401);
  let response;
  const binary=typeof Blob!=='undefined'&&body instanceof Blob;
  const headers={...(body!==undefined&&!binary?{'Content-Type':'application/json'}:{}),...extra,...(token?{Authorization:'Bearer '+token}:{})};
  try{
    const config=localConfig();
    if(path==='/api/permisos/estado'||path==='/api/catalogo/estado')return {enabled:true,version:1};
    headers.apikey=config.publishableKey;
    let target,actualMethod=method,actualBody=body;
    if(path==='/api/permisos'){target=config.url+'/rest/v1/rpc/vbn_permissions';actualMethod='POST';actualBody={p_action:'self',p_body:{}};headers['Content-Type']='application/json';}
    else{
      const u=new URL(path,'https://vademecumboticasdelnorte.github.io');let route;
      if(u.pathname==='/api/catalogo')route='catalog';
      else if(u.pathname==='/api/catalogo/gestion')route='manage';
      else if(u.pathname==='/api/laboratorios')route='labs';
      else if(u.pathname.startsWith('/api/productos/'))route='product/'+u.pathname.split('/').at(-1);
      else if(u.pathname.startsWith('/api/fotos/'))route='photo/'+u.pathname.split('/').at(-1);
      else route=u.pathname.split('/').at(-1);
      target=config.functionsUrl+'/productos-catalogo/'+route+u.search;
    }
    response=await fetch(target,{method:actualMethod,headers,body:actualBody===undefined?undefined:binary?actualBody:JSON.stringify(actualBody),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout)});
  }
  catch{throw new UsersApiError(method==='POST'?'RESULT_NOT_CONFIRMED':'PERMISSIONS_UNAVAILABLE');}
  if(publicRequest&&response.status===404)throw new UsersApiError('PERMISSIONS_UNAVAILABLE',503); // Servidor anterior mientras el paquete espera autorizacion.
  if(!response.ok){let data;try{data=await response.json();}catch{}throw new UsersApiError(data?.error||'PERMISSIONS_UNAVAILABLE',response.status);}
  return image?response.blob():response.json();
}
export function usersErrorText(error) {
  const messages = {
    UNAUTHENTICATED: 'Inicia sesión para continuar.', ADMIN_REQUIRED: 'Esta operación requiere al administrador local.',
    CREDENTIALS_INVALID: 'Usuario o contraseña incorrectos, o cuenta pendiente de activación.',
    LOCAL_CONFIGURATION_REQUIRED: 'Falta la configuración pública del entorno local.',
    PERMISSIONS_NOT_READY: 'Los permisos están pendientes de aplicar la migración local autorizada.',
    PERMISSIONS_UNAVAILABLE: 'No se pudieron verificar los permisos con el servidor.',
    PERMISSION_DENIED: 'No tienes permiso para realizar esta operación.',
    PERMISSION_CONFLICT: 'Los permisos cambiaron. Vuelve a abrir el panel antes de guardarlos.',
    CATALOG_NOT_READY: 'La gestión del catálogo está pendiente de aplicar y activar la migración local.',
    CATALOG_CONFLICT: 'El producto cambió mientras lo editabas. Actualiza la lista antes de continuar.',
    CATALOG_DUPLICATE: 'Ya existe ese código de producto o nombre de laboratorio.',
    CATALOG_FIELDS: 'Revisa los campos y la versión del producto.',
    LABORATORY_UNKNOWN: 'Selecciona un laboratorio existente.',
    NOT_FOUND: 'El producto o la fotografía no están disponibles.',
    IMAGE_FILENAME: 'El nombre del archivo debe ser el código exacto de ocho dígitos.',
    IMAGE_SIZE: 'La fotografía debe pesar como máximo 5 MB.',
    IMAGE_DIMENSIONS: 'Las nuevas fotografías deben tener como máximo 20 megapíxeles.',
    IMAGE_FORMAT: 'Utiliza JPEG/JPG/JFIF, PNG o WebP.',
    IMAGE_FORMAT_MISMATCH: 'El contenido de la fotografía no coincide con su extensión.',
    IMAGE_INVALID: 'La fotografía no es válida o tiene un formato no admitido.',
    PHOTO_UNAVAILABLE: 'No se pudo obtener la fotografía privada.',
    BODY_TOO_LARGE: 'El archivo supera el tamaño permitido.',
    RESULT_NOT_CONFIRMED: 'No se confirmó el resultado. No repitas la operación; comprueba su estado.',
    BRANCHES_NOT_CONFIRMED: 'Las sucursales todavía no están habilitadas.', BRANCH_UNAVAILABLE: 'La sucursal no está disponible.',
    APPROVED_DOMAIN_REQUIRED: 'Falta aprobar el dominio interno local.', BACKEND_DISABLED: 'El backend local está deshabilitado.',
    PASSWORD_POLICY_PENDING: 'La política de contraseñas está pendiente.', AUTH_METADATA_CONTRACT_PENDING: 'La configuración de Auth está pendiente.',
    PASSWORD_POLICY: 'Usa al menos 10 caracteres y como máximo 72 bytes UTF-8.', PASSWORD_MISMATCH: 'Las contraseñas no coinciden.',
    PASSWORD_REUSED: 'Elige una contraseña diferente de la anterior.', RATE_LIMITED: 'Demasiados intentos. Espera antes de continuar.',
    INVALID_DNI: 'El DNI debe contener exactamente 8 dígitos.', INVALID_USERNAME: 'Usa de 3 a 30 letras minúsculas, números o guion bajo.',
    PROFILE_IDENTIFIER_UNAVAILABLE: 'El usuario o DNI ya está registrado o reservado.', PROFILE_CONFLICT: 'El registro cambió; actualiza antes de editar.',
    ADMIN_ACCOUNT_PROTECTED: 'La cuenta del administrador está protegida.',
    CREDENTIALS_INVALID_OR_OPERATION_PENDING: 'La clave no es válida, ha vencido o la operación sigue pendiente.',
    SQL_REVISION_3_REQUIRED: 'El backend no confirmó la versión SQL requerida.', SESSION_NOT_AUTHORIZED: 'La sesión ya no está autorizada.'
  };
  return messages[error?.code] || 'No se pudo completar la operación. Revisa el servicio local y el estado antes de repetirla.';
}
