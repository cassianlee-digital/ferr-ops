// 外链记录数据访问层：付费与免费登记按类型过滤。
import { db } from '../connection.js';
import { encrypt, decrypt } from '../../services/crypto.js';

export function list({ kind, start_date, end_date } = {}) {
  return db.prepare(`SELECT id,kind,added_date,site_name,category,link_form,link_url,anchor_text,owner_site,registrant,fee_record,credential_record IS NOT NULL AND credential_record <> '' AS has_credentials,created_by,created_at,updated_at FROM link_records WHERE deleted_at IS NULL AND kind=@kind AND (@start_date IS NULL OR added_date BETWEEN @start_date AND @end_date) ORDER BY added_date DESC, id DESC`)
    .all({ kind, start_date: start_date || null, end_date: end_date || null });
}
export function create(row, userId) {
  const info = db.prepare(`INSERT INTO link_records(kind,added_date,site_name,category,link_form,link_url,anchor_text,owner_site,registrant,fee_record,credential_record,created_by)
    VALUES(@kind,@added_date,@site_name,@category,@link_form,@link_url,@anchor_text,@owner_site,@registrant,@fee_record,@credential_record,@created_by)`)
    .run({ ...row, credential_record: encrypt(row.credential_record), created_by: userId ?? null });
  return db.prepare(`SELECT id,kind,added_date,site_name,category,link_form,link_url,anchor_text,owner_site,registrant,fee_record,credential_record IS NOT NULL AND credential_record <> '' AS has_credentials,created_by,created_at,updated_at FROM link_records WHERE id=?`).get(info.lastInsertRowid);
}
export function update(id, row) {
  db.prepare(`UPDATE link_records SET added_date=@added_date,site_name=@site_name,category=@category,link_form=@link_form,link_url=@link_url,anchor_text=@anchor_text,owner_site=@owner_site,registrant=@registrant,fee_record=@fee_record,credential_record=@credential_record,updated_at=datetime('now') WHERE id=@id`).run({ ...row, credential_record: encrypt(row.credential_record), id });
  return db.prepare(`SELECT id,kind,added_date,site_name,category,link_form,link_url,anchor_text,owner_site,registrant,fee_record,credential_record IS NOT NULL AND credential_record <> '' AS has_credentials,created_by,created_at,updated_at FROM link_records WHERE id=?`).get(id);
}
export function get(id) { const row=db.prepare('SELECT * FROM link_records WHERE id=? AND deleted_at IS NULL').get(id); return row ? { ...row, credential_record: decrypt(row.credential_record) } : null; }
export function remove(id, userId) { return db.prepare("UPDATE link_records SET deleted_at=datetime('now'), deleted_by=? WHERE id=? AND deleted_at IS NULL").run(userId ?? null, id).changes; }
