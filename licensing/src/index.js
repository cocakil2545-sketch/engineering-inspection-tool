const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "content-type": "application/json; charset=utf-8"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:cors});
const now = () => Date.now();
const id = () => crypto.randomUUID();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const fromB64 = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
const randomToken = (n=24) => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
};
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:fromB64(salt),iterations:210000,hash:"SHA-256"},key,256);
  return b64(bits);
}
async function makePassword(password) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return {salt, hash:await hashPassword(password,salt)};
}
async function verifyUser(db, username, password) {
  const user = await db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").bind(username).first();
  if (!user) return null;
  const candidate = await hashPassword(password,user.password_salt);
  return candidate === user.password_hash ? user : null;
}
async function signCertificate(env, payload) {
  if (!env.SIGNING_PRIVATE_KEY) throw new Error("Server signing key is not configured.");
  const pem = env.SIGNING_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const der = Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8",der,{name:"Ed25519"},false,["sign"]);
  const payloadPart = b64(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("Ed25519",key,new TextEncoder().encode(payloadPart));
  return payloadPart + "." + b64(signature);
}
async function issue(env, license, user, deviceId) {
  const payload = {
    licenseId: license.id, username: user.username, plan: license.plan,
    deviceId, issuedAt: now(), expiresAt: license.expires_at,
    app: "InspectIQ", version: 1
  };
  return {certificate:await signCertificate(env,payload), plan:license.plan, expiresAt:license.expires_at};
}
async function admin(request, env) {
  const token = request.headers.get("authorization") || "";
  return !!env.ADMIN_TOKEN && token === "Bearer " + env.ADMIN_TOKEN;
}
async function createLicense(db,user,plan,durationDays) {
  const created = now(), expires = created + durationDays*86400000;
  const license = {id:id(),user_id:user.id,license_key:"IQ-"+randomToken(4)+"-"+randomToken(4)+"-"+randomToken(4),plan,duration_days:durationDays,expires_at:expires,status:"ACTIVE",created_at:created};
  await db.prepare("INSERT INTO licenses (id,user_id,license_key,plan,duration_days,expires_at,status,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(license.id,license.user_id,license.license_key,license.plan,license.duration_days,license.expires_at,license.status,license.created_at).run();
  return license;
}
export default {
 async fetch(request,env) {
  if (request.method==="OPTIONS") return new Response(null,{headers:cors});
  const url = new URL(request.url), route=url.pathname;
  if (request.method==="GET" && route==="/health") return json({ok:true,service:"InspectIQ Licensing API",time:now()});
  try {
   if (request.method==="POST" && route==="/api/activate") {
    const body=await request.json();
    const username=String(body.username||"").trim(), password=String(body.password||"");
    const deviceId=String(body.deviceId||""), key=String(body.licenseKey||"").trim();
    if (!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username) || password.length<8 || deviceId.length<32) return json({error:"Enter a valid username, password (8+ characters) and device identity."},400);
    let user=await verifyUser(env.DB,username,password);
    if (!user && !key) {
      const existing=await env.DB.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
      if (existing) return json({error:"Incorrect password."},401);
      const pw=await makePassword(password), userId=id();
      await env.DB.prepare("INSERT INTO users (id,username,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)")
        .bind(userId,username,username.includes("@")?username:null,pw.hash,pw.salt,now()).run();
      user=await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
    }
    if (!user) return json({error:"Account not found or password is incorrect. For a free trial, register without a license key."},401);
    let license;
    if (key) {
      license=await env.DB.prepare("SELECT * FROM licenses WHERE license_key=? AND user_id=?").bind(key,user.id).first();
      if (!license) return json({error:"This license key does not belong to this account."},404);
    } else {
      license=await env.DB.prepare("SELECT * FROM licenses WHERE user_id=? AND status='ACTIVE' AND expires_at>? ORDER BY expires_at DESC LIMIT 1").bind(user.id,now()).first();
      if (!license) {
        const any=await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE user_id=?").bind(user.id).first();
        if (any.n>0) return json({error:"Your license has expired. Enter a renewed license key."},403);
        license=await createLicense(env.DB,user,"TRIAL",7);
      }
    }
    if (license.status!=="ACTIVE" || license.expires_at<=now()) return json({error:"This license has expired or been revoked."},403);
    const activation=await env.DB.prepare("SELECT * FROM activations WHERE license_id=?").bind(license.id).first();
    if (activation && activation.device_id!==deviceId) return json({error:"This license is already activated on another computer. Contact the InspectIQ administrator for a device transfer."},409);
    if (!activation) {
      await env.DB.prepare("INSERT INTO activations (license_id,device_id,activated_at,last_seen_at) VALUES (?,?,?,?)").bind(license.id,deviceId,now(),now()).run();
    } else {
      await env.DB.prepare("UPDATE activations SET last_seen_at=? WHERE license_id=?").bind(now(),license.id).run();
    }
    const issued=await issue(env,license,user,deviceId);
    return json({...issued,account:{username:user.username},message:"InspectIQ activated successfully."});
   }
   if (request.method==="POST" && route==="/api/renew") {
    const body=await request.json(), licenseId=String(body.licenseId||""), deviceId=String(body.deviceId||"");
    const license=await env.DB.prepare("SELECT l.*,u.username FROM licenses l JOIN users u ON u.id=l.user_id WHERE l.id=?").bind(licenseId).first();
    if (!license || license.status!=="ACTIVE") return json({error:"License not found or revoked."},404);
    const activation=await env.DB.prepare("SELECT * FROM activations WHERE license_id=?").bind(license.id).first();
    if (!activation || activation.device_id!==deviceId) return json({error:"Device does not match this license."},403);
    if (license.expires_at<=now()) return json({error:"License expired. Ask the administrator to issue a renewal license."},403);
    const issued=await issue(env,license,{username:license.username},deviceId);
    await env.DB.prepare("UPDATE activations SET last_seen_at=? WHERE license_id=?").bind(now(),license.id).run();
    return json(issued);
   }
   if (route.startsWith("/api/admin/")) {
    if (!await admin(request,env)) return json({error:"Administrator authorization required."},401);
    if (request.method==="POST" && route==="/api/admin/customers") {
      const body=await request.json(), username=String(body.username||"").trim(), password=String(body.password||"");
      if (!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username)||password.length<8) return json({error:"Username invalid or password shorter than 8 characters."},400);
      const exists=await env.DB.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
      if (exists) return json({error:"Username already exists."},409);
      const pw=await makePassword(password), userId=id();
      await env.DB.prepare("INSERT INTO users (id,username,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)")
       .bind(userId,username,body.email||null,pw.hash,pw.salt,now()).run();
      return json({id:userId,username},201);
    }
    if (request.method==="POST" && route==="/api/admin/licenses") {
      const body=await request.json(), username=String(body.username||"").trim();
      const plans={TRIAL:7,"1_YEAR":365,"2_YEAR":730,"3_YEAR":1095,"5_YEAR":1825};
      const plan=String(body.plan||"1_YEAR"), days=plans[plan];
      const user=await env.DB.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
      if (!user) return json({error:"Customer account not found."},404);
      if (!days) return json({error:"Unsupported license term."},400);
      const license=await createLicense(env.DB,user,plan,days);
      return json({licenseKey:license.license_key,plan:license.plan,expiresAt:license.expires_at},201);
    }
    if (request.method==="GET" && route==="/api/admin/licenses") {
      const result=await env.DB.prepare("SELECT u.username,l.license_key,l.plan,l.status,l.created_at,l.expires_at,a.device_id,a.activated_at FROM licenses l JOIN users u ON u.id=l.user_id LEFT JOIN activations a ON a.license_id=l.id ORDER BY l.created_at DESC LIMIT 500").all();
      return json({licenses:result.results||[]});
    }
   }
   return json({error:"Not found."},404);
  } catch(error) {
   return json({error:error?.message||"Unexpected licensing error."},500);
  }
 }
};