/* Offline browser receipt export: local font + canvas, with no remote service. */
(()=>{
 'use strict';
 window.createReceiptPNG=async values=>{
  await document.fonts.load('24px "Noto Nastaliq Urdu"');await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1600;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  const font="'Noto Nastaliq Urdu',Arial,sans-serif";
  const wrap=(value,width,size=24,numeric=false)=>{
   ctx.font=`${size}px ${numeric?'Arial':font}`;
   const lines=[];let line='';
   for(const word of String(value||'—').split(/\s+/)){
    if(ctx.measureText(line?line+' '+word:word).width<=width){line=line?line+' '+word:word;continue;}
    if(line){lines.push(line);line='';}
    for(const ch of word){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}
   }
   if(line)lines.push(line);return lines;
  };
  const title=wrap(values.title,800,32);
  const rows=[['پارٹی',values.branch],['ارسال کنندہ',values.sender],['موبائیل نمبر',values.mobile,true],['وصول کنندہ',values.receiver],['مقام',values.place]].map(([label,value,numeric])=>({label,numeric,lines:wrap(value,650,24,numeric)}));
  const titleHeight=title.length*62+70,metaHeight=80;
  const height=titleHeight+metaHeight+rows.reduce((n,r)=>n+Math.max(78,r.lines.length*52+26),0)+190;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,1600);
  const scale=Math.min(1.5,1520/height);ctx.translate((1600-1000*scale)/2,(1600-height*scale)/2);ctx.scale(scale,scale);
  const text=(value,x,y,size=24,align='right',numeric=false,color='#163f30')=>{ctx.fillStyle=color;ctx.font=`${numeric?'700 ':''}${size}px ${numeric?'Arial':font}`;ctx.direction=numeric?'ltr':'rtl';ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);};
  const box=(y,h,fill='#fff')=>{ctx.fillStyle=fill;ctx.fillRect(0,y,1000,h);ctx.strokeStyle='#b6cbbd';ctx.lineWidth=1;ctx.strokeRect(0,y,1000,h);};
  box(0,titleHeight,'#edf5ef');text('حساب · انٹری رسید',950,28,18);
  title.forEach((line,i)=>text(line,500,85+i*62,32,'center'));
  let y=titleHeight;box(y,metaHeight);text('نمبر شمار: '+values.serial,950,y+38,21);text(values.date,40,y+40,23,'left',true);y+=metaHeight;
  for(const row of rows){const h=Math.max(78,row.lines.length*52+26);box(y,h);text(row.label,965,y+h/2-5,20);row.lines.forEach((line,i)=>text(line,720,y+30+i*52,24,'right',row.numeric));y+=h;}
  const labels=['بقایا','درہم',values.currency],keys=['balance','aed','pkr'];
  for(let i=0;i<3;i++){const x=1000-(i+1)*1000/3;ctx.fillStyle=i===2?'#deeee3':'#f1f6f2';ctx.fillRect(x,y,1000/3,125);ctx.strokeRect(x,y,1000/3,125);text(labels[i],x+1000/6,y+30,20,'center');const val=String(values[keys[i]]);ctx.font='700 30px Arial';text(val,x+1000/6,y+87,Math.min(30,280/Math.max(1,ctx.measureText(val).width)*30),'center',true);}
  y+=125;text('تیار کنندہ',940,y+37,19);text('دستخط',60,y+37,19,'left');
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed')),'image/png'));
 };
})();
