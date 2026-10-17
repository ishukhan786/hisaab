// Seed through the supported restore flow when desktop SQLite owns persistence.
// Browser-only tests continue to seed localStorage before startup migration.
module.exports=async function seedState(page,data){
  if(await page.evaluate(()=>!!window.electronAPI?.storage)){
    if(!page.listenerCount('dialog'))page.once('dialog',d=>d.accept());
    await page.locator('#file').setInputFiles({name:'test-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(()=>!document.body.inert&&document.getElementById('file').value==='');
  }else await page.evaluate(data=>localStorage.setItem('hisaab-register-v1',JSON.stringify(data)),data);
  await page.reload();
};
