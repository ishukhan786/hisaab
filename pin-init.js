(function(){
  if (!window.electronAPI && window.location.protocol.startsWith('http')) {
    var ov = document.getElementById('pin-lock-overlay');
    if (ov) {
      ov.hidden = false;
      document.querySelectorAll('body > :not(#pin-lock-overlay)').forEach(function(el){ el.inert = true; });
      var input = document.getElementById('pin-unlock-input');
      if (input) input.focus();
    }
  }
})();
