// 外链记录路由：覆盖权限、枚举校验、日期筛选与付费/免费字段隔离。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const tmpDir=mkdtempSync(join(tmpdir(),'ferr-link-records-'));
process.env.DB_FILE=join(tmpDir,'test.sqlite');
const {buildApp}=await import('../src/index.js');
const {db}=await import('../src/db/connection.js');
const app=await buildApp();
db.prepare("INSERT OR IGNORE INTO users(id,username,password_hash,name,role) VALUES(1,'links-test','x','测试','boss')").run();
const auth={cookie:`ferr_token=${app.jwt.sign({id:1,username:'t',name:'t',role:'boss'})}`};
test.after(async()=>{await app.close();db.close();rmSync(tmpDir,{recursive:true,force:true});});

test('外链记录要求登录，拒绝无效人员/站点，并按类型和日期隔离读取',async()=>{
  assert.equal((await app.inject({method:'GET',url:'/api/link-records?kind=paid'})).statusCode,401);
  const base={added_date:'2026-10-20',site_name:'Example',category:'客座投稿',link_form:'文字链接',link_url:'https://example.com/post',anchor_text:'阀门',owner_site:'贝孚特-阀门',registrant:'李'};
  const invalid=await app.inject({method:'POST',url:'/api/link-records',headers:auth,payload:{...base,kind:'paid',registrant:'王'}});assert.equal(invalid.statusCode,400);
  const paid=await app.inject({method:'POST',url:'/api/link-records',headers:auth,payload:{...base,kind:'paid',fee_record:'USD 50'}});assert.equal(paid.statusCode,201);
  const free=await app.inject({method:'POST',url:'/api/link-records',headers:auth,payload:{...base,kind:'free',added_date:'2026-10-10',credential_record:'login: user / password'}});assert.equal(free.statusCode,201);
  assert.equal(Object.hasOwn(paid.json().item,'credential_record'),false);assert.equal(Object.hasOwn(free.json().item,'credential_record'),false);
  const secret=await app.inject({method:'GET',url:`/api/link-records/${free.json().item.id}/credentials`,headers:auth});assert.equal(secret.json().credential_record,'login: user / password');
  assert.doesNotMatch(db.prepare('SELECT credential_record FROM link_records WHERE id=?').get(free.json().item.id).credential_record,/login: user/,'账密字段必须密文落库');
  assert.equal((await app.inject({method:'GET',url:'/api/link-records?kind=free&start_date=2026-10-01&end_date=2026-10-15',headers:auth})).json().items.length,1);
  assert.equal((await app.inject({method:'GET',url:'/api/link-records?kind=paid&start_date=2026-10-01&end_date=2026-10-15',headers:auth})).json().items.length,0);
  const removed=await app.inject({method:'DELETE',url:`/api/link-records/${paid.json().item.id}`,headers:auth});assert.equal(removed.statusCode,200);
  assert.equal((await app.inject({method:'GET',url:'/api/link-records?kind=paid',headers:auth})).json().items.length,0);
  assert.ok(db.prepare('SELECT deleted_at FROM link_records WHERE id=?').get(paid.json().item.id).deleted_at,'删除后保留审计记录');
});
