import { useState, useEffect, useCallback } from 'react';

/* Roteador de 20 linhas. São duas rotas — react-router seriam 20 KB para
   reimplementar o History API. Se um dia virarem dez rotas com parâmetros,
   troque por react-router sem dó. */
export const useRoute = () => {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to);
    if (!replace) window.scrollTo({ top: 0 });
  }, []);

  return [path, navigate];
};
