/**
 * Banner colapsable de las páginas interiores.
 *
 * - Al desplazarse más allá del banner, este se oculta y queda solo el toolbar.
 * - El botón del toolbar permite mostrarlo/ocultarlo manualmente.
 * - La elección manual se recuerda durante la sesión, así que al navegar a
 *   otra página se mantiene el mismo estado.
 */
(function () {
  'use strict';

  const header = document.getElementById('page-banner');
  if (!header) return;

  const toggle = document.getElementById('banner-toggle');
  const label = toggle && toggle.querySelector('.topbar-pill-label');
  const STORAGE_KEY = 'sd-banner-collapsed';

  let manual = null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved === '1' || saved === '0') manual = saved === '1';
  } catch {
    /* almacenamiento no disponible: solo se usa el desplazamiento */
  }

  function apply(collapsed) {
    header.classList.toggle('is-collapsed', collapsed);
    if (!toggle) return;

    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Mostrar banner' : 'Ocultar banner');
    if (label) label.textContent = collapsed ? 'Mostrar banner' : 'Ocultar banner';
  }

  let autoCollapsed = false;
  function onScroll() {
    if (manual !== null) return;

    const shouldCollapse = window.scrollY > 120;
    if (shouldCollapse !== autoCollapsed) {
      autoCollapsed = shouldCollapse;
      apply(shouldCollapse);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  if (toggle) {
    toggle.addEventListener('click', function () {
      manual = !header.classList.contains('is-collapsed');
      try {
        sessionStorage.setItem(STORAGE_KEY, manual ? '1' : '0');
      } catch {
        /* se ignora si no se puede persistir */
      }
      apply(manual);
    });
  }

  apply(manual !== null ? manual : window.scrollY > 120);
})();
