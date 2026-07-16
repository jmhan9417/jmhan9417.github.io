import { methodGuard, safeErrorResponse, sendJson } from '../server/http.mjs';
import { deleteLearningData, verifyUser } from '../server/supabase.mjs';

export default async function handler(req,res){
  if(!methodGuard(req,res,['POST']))return;
  try{const {user}=await verifyUser(req);await deleteLearningData(user.id);sendJson(res,200,{deleted:true,scope:'learning_data'});}
  catch(error){safeErrorResponse(res,error);}
}
