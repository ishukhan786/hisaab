/* Render the PDF receipt markup locally; no upload or remote image service. */
(()=>{
 'use strict';
 window.createReceiptPNG=async values=>{
  await document.fonts.ready;
  const host=document.createElement('div');host.className='receipt-export-page';host.style.position='absolute';host.style.left='-10000px';host.style.top='0';host.setAttribute('aria-hidden','true');
  const sheet=document.getElementById('receipt-paper').cloneNode(true);sheet.removeAttribute('id');sheet.classList.add('receipt-export');
  sheet.querySelectorAll('[data-receipt]').forEach(el=>{el.textContent=values[el.dataset.receipt]||'';});host.append(sheet);document.body.append(host);
  try{
   const canvas=await window.html2canvas(host,{backgroundColor:'#fff',scale:1600/host.getBoundingClientRect().width,logging:false,windowWidth:1200,onclone:doc=>{doc.querySelectorAll('dialog[open]').forEach(d=>d.remove());}});
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'));
  }finally{host.remove();}
 };
})();
