(function(){
  document.addEventListener('click', function(e){
    if (e.target && e.target.nodeName === 'DIALOG' && typeof e.target.close === 'function') {
      var rect = e.target.getBoundingClientRect();
      var isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        e.target.close();
      }
    }
  });
})();
