import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database permissions and public search isolate pharmacy accounts', async () => {
 const db = new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', admin='00000000-0000-4000-8000-000000000003';
 await db.exec(`insert into auth.users values ('${owner}'),('${other}'),('${admin}');update profiles set role='admin' where id='${admin}';`);
 async function asUser(id,role='authenticated'){await db.exec(`reset role;set request.jwt.claim.sub='${id}';set role ${role};`);}
 await asUser(owner);
 const p=(await db.query(`insert into pharmacies(owner_id,name,country,city,address,phone,license_number) values('${owner}','Pharmacie Test','TG','Lomé','Rue 123','+22890123456','TEST-1') returning id`)).rows[0].id;
 await assert.rejects(db.exec(`update profiles set role='admin' where id='${owner}'`));
 await assert.rejects(db.exec(`update pharmacies set approved=true where id='${p}'`));
 await db.exec(`insert into inventory(pharmacy_id,medicine,dosage,quantity,price) values('${p}','Paracétamol','500 mg',12,500)`);
 await asUser('', 'anon');
 assert.equal((await db.query(`select * from search_medicines('para','TG','')`)).rows.length,0);
 await assert.rejects(db.query('select * from pharmacies'));
 await assert.rejects(db.query('select * from inventory'));
 await asUser(other);
 assert.equal((await db.query('select * from inventory')).rows.length,0);
 await assert.rejects(db.exec(`insert into inventory(pharmacy_id,medicine,dosage,quantity) values('${p}','Other','1 mg',1)`));
 await assert.rejects(db.exec(`select review_pharmacy('${p}',true)`));
 await asUser(admin); await db.exec(`select review_pharmacy('${p}',true)`);
 await asUser('','anon');
 const results=(await db.query(`select * from search_medicines('PARA','TG','lom')`)).rows;
 assert.equal(results.length,1);assert.equal(results[0].pharmacy,'Pharmacie Test');
 assert.equal('license_number' in results[0],false);assert.equal('quantity' in results[0],false);
 assert.equal((await db.query(`select * from search_medicines('para','BJ','')`)).rows.length,0);
 assert.equal((await db.query(`select * from search_medicines('p','TG','')`)).rows.length,0);
 await asUser(other);await db.exec(`update inventory set quantity=999 where pharmacy_id='${p}'`);
 await asUser(owner);assert.equal((await db.query('select quantity from inventory')).rows[0].quantity,12);
 await db.exec(`update inventory set quantity=0 where pharmacy_id='${p}'`);
 await asUser('','anon');assert.equal((await db.query(`select * from search_medicines('para','TG','')`)).rows.length,0);
 await asUser(owner);await db.exec(`update inventory set quantity=12 where pharmacy_id='${p}';update pharmacies set name='New Name' where id='${p}'`);
 assert.equal((await db.query('select approved from pharmacies')).rows[0].approved,false);
 await asUser('','anon');assert.equal((await db.query(`select * from search_medicines('para','TG','')`)).rows.length,0);
 } finally {await db.close();}
});
