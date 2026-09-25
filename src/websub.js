export async function subscribeWebSubSources(sources=[]){
  const publicUrl=String(process.env.PUBLIC_URL||"").replace(/\/$/,"");
  if(!publicUrl)return {configured:0,subscribed:0};
  const targets=sources.filter(x=>x.websubHub&&(x.websubTopic||x.url));
  let subscribed=0;
  for(const src of targets){
    try{
      const body=new URLSearchParams({
        "hub.mode":"subscribe",
        "hub.topic":String(src.websubTopic||src.url),
        "hub.callback":publicUrl+"/websub/callback",
        "hub.verify":"async",
        "hub.lease_seconds":String(src.websubLeaseSeconds||864000)
      });
      const r=await fetch(src.websubHub,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(6000)});
      if(r.ok||r.status===202||r.status===204)subscribed++;
    }catch(err){console.warn("[websub]",src.name,String(err).slice(0,100))}
  }
  return {configured:targets.length,subscribed};
}
export function webSubChallenge(req,res){
  const mode=String(req.query["hub.mode"]||"");
  const challenge=String(req.query["hub.challenge"]||"");
  if((mode==="subscribe"||mode==="unsubscribe")&&challenge)return res.status(200).type("text/plain").send(challenge);
  return res.status(400).send("bad challenge");
}
