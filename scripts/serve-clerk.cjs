'use strict';
if(process.env.NODE_ENV==='production'||process.env.VERCEL)throw Error('This command is for local Clerk development only.');
process.env.HISAAB_AUTH_PROVIDER='clerk';
process.env.CLERK_ALLOW_DEVELOPMENT_SIGNUP='false';
const app=require('../server');
const port=Number(process.env.PORT||3000);
app.listen(port,'127.0.0.1',()=>console.log(`Hisaab Clerk development: http://localhost:${port}`));
