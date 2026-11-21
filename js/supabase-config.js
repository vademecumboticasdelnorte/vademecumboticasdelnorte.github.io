// Solo valores públicos del proyecto. Nunca colocar secret keys ni service_role.
window.SUPABASE_CONFIG = Object.freeze({
  url: 'https://mizowntlopnslxvangbo.supabase.co',
  publishableKey: 'sb_publishable_YtvtROC6cKBrviM8vOKh8A_VIoZkMKp'
});
window.VBN_APP_CONFIG = Object.freeze({...window.SUPABASE_CONFIG,functionsUrl:window.SUPABASE_CONFIG.url+'/functions/v1'});
