import crypto from 'node:crypto';
import { methodGuard, safeErrorResponse, sendJson } from '../server/http.mjs';
import { rpc } from '../server/supabase.mjs';

function authorized(req){const expected=process.env.CRON_SECRET||'',header=String(req.headers.authorization||''),actual=header.startsWith('Bearer ')?header.slice(7):'';if(!expected||actual.length!==expected.length)return false;return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
export default async function handler(req,res){
  if(!methodGuard(req,res,['GET','POST']))return;
  try{if(!authorized(req))throw Object.assign(new Error('unauthorized'),{code:'unauthorized',status:401});const deleted=await rpc('readytoconsult_retention_cleanup',{});sendJson(res,200,{cleaned:true,deleted});}
  catch(error){safeErrorResponse(res,error);}
}
