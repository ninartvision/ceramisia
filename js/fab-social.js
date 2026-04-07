/* ================================================
   Floating Social Menu — behaviour
   ================================================ */
(function () {
  'use strict';

  var SELECTOR = '.fab-social';
  var OPEN_CLS = 'open';
  var BACKDROP_CLS = 'fab-social__backdrop';

  function init() {
    var root = document.querySelector(SELECTOR);
    if (!root) return;

    var toggle = root.querySelector('.fab-social__toggle');
    if (!toggle) return;

    /* Ensure backdrop exists */
    var backdrop = document.querySelector('.' + BACKDROP_CLS);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = BACKDROP_CLS;
      root.parentNode.insertBefore(backdrop, root.nextSibling);
    }

    function open()  { root.classList.add(OPEN_CLS); toggle.setAttribute('aria-expanded', 'true'); }
    function close() { root.classList.remove(OPEN_CLS); toggle.setAttribute('aria-expanded', 'false'); }
    function isOpen() { return root.classList.contains(OPEN_CLS); }

    /* Toggle */
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    /* Click outside → close */
    backdrop.addEventListener('click', close);

    /* Escape key → close */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  /* Run on DOMContentLoaded (or immediately if DOM already ready) */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
