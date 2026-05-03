// api.js
(function(){
  const LOCAL_DEFAULT_BASE = 'http://127.0.0.1:8000';
  const HOSTED_DEFAULT_BASE = 'https://grade9-ai-aevra-api-production.up.railway.app';

  function isLoopbackHost(hostname){
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function isHostedFrontendHost(hostname){
    return typeof hostname === 'string' && (
      hostname.endsWith('.netlify.app') ||
      hostname.endsWith('.netlify.live')
    );
  }

  function normalizeConfiguredBase(value){
    if(!value) return '';
    try {
      return new URL(value, window.location.origin).origin;
    } catch (e) {
      return '';
    }
  }

  function inferBaseUrl(){
    // Allow explicit override
    if(window.__API_BASE_URL__) return window.__API_BASE_URL__;

    // Allow runtime configuration without code changes
    try {
      const stored = localStorage.getItem('g9_api_base');
      const normalizedStored = normalizeConfiguredBase(stored);
      if(normalizedStored){
        const pageHost = window.location.hostname;
        const storedHost = new URL(normalizedStored).hostname;
        const pageIsLocal = isLoopbackHost(pageHost);
        const storedIsLocal = isLoopbackHost(storedHost);
        const mixedHttpsToHttp = window.location.protocol === 'https:' && normalizedStored.startsWith('http://');
        if((!pageIsLocal && storedIsLocal) || mixedHttpsToHttp){
          localStorage.removeItem('g9_api_base');
        } else {
          return normalizedStored;
        }
      }
    } catch (e) {}

    const host = window.location.hostname;

    const meta = document.querySelector('meta[name="api-base-url"]');
    if(meta && meta.content){
      // If the meta is still pointing at the old local default, ignore it and prefer same-origin.
      if(meta.content !== LOCAL_DEFAULT_BASE) return meta.content;
    }

    // If opened from file://, we must use a concrete server URL
    if(window.location.protocol === 'file:') return LOCAL_DEFAULT_BASE;

    // Hosted frontend should talk to the deployed Railway backend by default.
    if(window.location.protocol === 'https:' && isHostedFrontendHost(host)){
      return HOSTED_DEFAULT_BASE;
    }

    // If served over HTTPS from the backend itself or another custom host, use same-origin.
    if(window.location.protocol === 'https:') return window.location.origin;

    // If served from a localhost dev server (or the API itself), use same-origin
    if(isLoopbackHost(host)){
      // Prefer same-origin so it works regardless of which port the backend is using (e.g. 5000)
      return window.location.origin;
    }

    // Default: same origin
    return window.location.origin;
  }

  function getBaseUrl(){
    return inferBaseUrl();
  }

  async function apiFetch(path, options){
    const url = getBaseUrl() + path;
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      const err = new Error('NETWORK_ERROR');
      err.cause = e;
      throw err;
    }
  }

  window.Api = {
    getBaseUrl,
    apiFetch
  };
})();
