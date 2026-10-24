/* Render the receipt markup locally; no upload or remote image service. */
(()=>{
 'use strict';
 window.createReceiptPNG=async (values, options={})=>{
  await document.fonts.ready;
  const isThermal = Boolean(options?.isThermal || document.getElementById('tab-receipt-thermal')?.classList.contains('active'));
  const host=document.createElement('div');host.className='receipt-export-page';host.style.position='absolute';host.style.left='-10000px';host.style.top='0';host.setAttribute('aria-hidden','true');

  let sheet;
  if (isThermal && document.getElementById('thermal-slip-paper')) {
    sheet = document.getElementById('thermal-slip-paper').cloneNode(true);
    sheet.removeAttribute('id');
    sheet.removeAttribute('hidden');
    sheet.classList.add('thermal-slip-export');
    host.style.width = '320px';
  } else {
    sheet = document.getElementById('receipt-paper').cloneNode(true);
    sheet.removeAttribute('id');
    sheet.removeAttribute('hidden');
    sheet.classList.add('receipt-export');
    sheet.querySelectorAll('[data-receipt]').forEach(el=>{el.textContent=values[el.dataset.receipt]||'';});
  }

  host.append(sheet);document.body.append(host);
  try{
   const targetWidth = isThermal ? 800 : 1600;
   const canvas=await window.html2canvas(host,{backgroundColor:'#fff',scale:targetWidth/host.getBoundingClientRect().width,logging:false,windowWidth:isThermal?400:1200,onclone:doc=>{doc.querySelectorAll('dialog[open]').forEach(d=>d.remove());}});
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'));
  }finally{host.remove();}
 };
})();
