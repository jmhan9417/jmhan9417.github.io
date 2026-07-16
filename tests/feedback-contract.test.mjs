import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.SUPABASE_URL='https://feedback.supabase.co';
process.env.SUPABASE_ANON_KEY='anon-feedback';
process.env.SUPABASE_SERVICE_ROLE_KEY='service-feedback';
const userId='11111111-1111-4111-8111-111111111111';
const evaluationId='22222222-2222-4222-8222-222222222222';
let ownsEvaluation=false,inserted=null;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{const u=String(url);if(u.endsWith('/auth/v1/user'))return Response.json({id:userId,email:'a@example.com'});if(u.includes('/rest/v1/readytoconsult_evaluator_requests'))return Response.json(ownsEvaluation?[{request_id:evaluationId}]:[]);if(u.endsWith('/rest/v1/readytoconsult_feedback')){inserted=JSON.parse(options.body);return new Response('',{status:201});}throw new Error(`Unhandled ${u}`);};
const handler=(await import('../veeva-master-class/api/feedback.mjs')).default;
async function invoke(){const body=JSON.stringify({evaluation_id:evaluationId,context:'semantic_evaluation',rating:5,message:'Useful',consent_to_contact:false});const req=Readable.from([body]);req.method='POST';req.headers={authorization:'Bearer qa'};let output='';const res={statusCode:200,setHeader(){},end(chunk=''){output+=chunk;}};await handler(req,res);return{status:res.statusCode,body:JSON.parse(output)};}
const denied=await invoke();assert.equal(denied.status,403);assert.equal(denied.body.error,'invalid_feedback');assert.equal(inserted,null);
ownsEvaluation=true;const allowed=await invoke();assert.equal(allowed.status,201);assert.equal(allowed.body.saved,true);assert.equal(inserted.user_id,userId);assert.equal(inserted.evaluation_id,evaluationId);assert.equal(inserted.moderation_status,'private');
globalThis.fetch=originalFetch;
console.log('Feedback ownership tests passed:',{crossAccount:denied.status,ownEvaluation:allowed.status});
