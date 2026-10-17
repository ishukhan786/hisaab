const {chromium}=require('playwright');
const path=require('path'),fs=require('fs');const {pathToFileURL}=require('url');
fs.mkdirSync('scratch',{recursive:true});
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});const results=[];try{
for(const n of [100,1000,5000]){
const context=await b.newContext();const p=await context.newPage();p.setDefaultTimeout(120000);
await p.goto(pathToFileURL(path.resolve('index.html')).href);
await p.evaluate(n=>{const rows=Array.from({length:n},(_,i)=>({id:'r'+i,entryDate:'2026-10-'+String(i%28+1).padStart(2,'0'),sender:'Customer '+i,mobile:'0300'+String(i).padStart(7,'0'),receiver:'Receiver '+i,place:'Dubai',branch:'Party '+i%10,balance:'100',aed:'500',pkr:'30000',history:[]}));localStorage.setItem('hisaab-register-v1',JSON.stringify({version:4,title:'Benchmark',date:'2026-10-17',branches:Array.from({length:10},(_,i)=>'Party '+i),rows,trash:[]}));},n);
const start=Date.now();await p.reload({timeout:120000});await p.locator('#rows tr').first().waitFor({state:'attached'});const loadMs=Date.now()-start;
const metrics=await p.evaluate(async()=>{
const measure=async fn=>{const t=performance.now();fn();const handlerMs=performance.now()-t;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {handlerMs:Math.round(handlerMs),settleMs:Math.round(performance.now()-t)};};
const input=document.querySelector('#rows tr:not([hidden]) [data-field="sender"]');input.focus();const typing=[];
for(let i=0;i<3;i++)typing.push(await measure(()=>{input.value+='x';input.dispatchEvent(new Event('input',{bubbles:true}));}));input.blur();
const date=await measure(()=>{const d=document.getElementById('date');d.value='2026-10-18';d.dispatchEvent(new Event('input',{bubbles:true}));});
const all=await measure(()=>{const a=document.getElementById('all-dates');a.checked=true;a.dispatchEvent(new Event('change'));});
return {typing,date,all,domRows:document.querySelectorAll('#rows tr').length,storageBytes:localStorage.getItem('hisaab-register-v1').length};});
results.push({rows:n,loadMs,...metrics});console.log(JSON.stringify(results.at(-1)));await context.close();
}fs.writeFileSync('scratch/performance-review.json',JSON.stringify(results,null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});

