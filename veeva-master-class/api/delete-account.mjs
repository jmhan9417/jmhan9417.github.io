import { methodGuard, readJson, safeErrorResponse, sendJson } from '../server/http.mjs';
import { deleteAuthUser, verifyUser } from '../server/supabase.mjs';
import { finishAccountDeletion, prepareAccountDeletion } from '../server/commerce.mjs';

export default async function handler(req,res){
  if(!methodGuard(req,res,['POST']))return;
  try{
    const {user}=await verifyUser(req);const input=await readJson(req,2048);
    if(input.confirm!=='DELETE MY ACCOUNT')throw Object.assign(new Error('account_delete_confirmation_required'),{code:'account_delete_confirmation_required',status:400});
    await prepareAccountDeletion(user.id);
    await deleteAuthUser(user.id);
    await finishAccountDeletion(user.id).catch(()=>false);
    sendJson(res,200,{deleted:true,scope:'account',access_revoked:true});
  }catch(error){safeErrorResponse(res,error);}
}
