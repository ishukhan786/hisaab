(function(){
  try {
    var t = localStorage.getItem('hisaab-theme');
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      t = 'dark';
    }
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      var m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.content = 'dark';
      var mtc = document.getElementById('meta-theme-color');
      if (mtc) mtc.content = '#0c1511';
    } else if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      var m = document.querySelector('meta[name="color-scheme"]');
      if (m) m.content = 'light';
      var mtc = document.getElementById('meta-theme-color');
      if (mtc) mtc.content = '#105442';
    }
  } catch (_) {}
})();
