import {localCatalogRequest} from './usuarios-api.js';
export let permissionsEnabled=false;
let context=null,epoch=0;
const photos=new Map();
let observer;
export async function refreshPermissionContext(){
  const mode=await localCatalogRequest('/api/permisos/estado',{publicRequest:true});
  permissionsEnabled=mode.enabled===true;context=null;
  if(permissionsEnabled)context=await localCatalogRequest('/api/permisos');
  return context;
}
export const canPermission=code=>!permissionsEnabled || context?.permissions?.some(item=>item.code===code&&item.effective===true&&item.implemented===true)===true;
export async function refreshChangedPermissions(){
  if(!permissionsEnabled||!context)return false;
  const previous=context,latest=await localCatalogRequest('/api/permisos');
  if(context!==previous||latest.user_id!==previous.user_id||!Array.isArray(latest.permissions))return false;
  const changed=JSON.stringify(previous.permissions)!==JSON.stringify(latest.permissions);
  context=latest;return changed;
}
export function clearPermissionMedia(){
  epoch++;observer?.disconnect();for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();context=null;
}
export function hydrateProtectedPhotos(){
  if(!permissionsEnabled)return;
  const current=epoch;
  const load=async image=>{
    const code=image.dataset.protectedCode;
    try{
      let url=photos.get(code);
      if(!url){const blob=await localCatalogRequest('/api/fotos/'+code+(image.dataset.photoScope==='manage'?'?scope=manage':''),{image:true});if(current!==epoch)return;url=URL.createObjectURL(blob);photos.set(code,url);}
      if(current===epoch&&image.isConnected)image.src=url;
    }catch{if(image.isConnected){image.hidden=true;image.parentElement.querySelector('.placeholder').hidden=false;}}
  };
  observer?.disconnect();
  if(typeof IntersectionObserver==='undefined'){document.querySelectorAll('img[data-protected-code]').forEach(image=>{void load(image);});return;}
  observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);void load(entry.target);}},{rootMargin:'150px'});
  document.querySelectorAll('img[data-protected-code]').forEach(image=>observer.observe(image));
}
