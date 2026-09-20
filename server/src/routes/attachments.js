/* 通用图片附件 API。业务发回来的关键词截图 / 聊天记录截图等原始材料。
 *
 * 为什么不用 multipart：后端没装 @fastify/multipart，而这里要传的就是几张截图。
 * 前端在 canvas 里先把长边压到 1600px 再转 base64 JSON 发上来（bodyLimit 已是 16MB），
 * 少一个依赖、少一条解析路径，也少一处上传中断留下半个文件的可能。
 *
 * 安全：只收白名单 MIME，且**不信任前端报的 MIME** —— 用文件头魔数复验，
 * 免得有人把 .html 改名 .png 传上来、再靠 /raw 当同源页面打开（存储型 XSS）。
 * 读取一律带 Content-Disposition: inline + nosniff，原图路径绝不回可执行内容类型。
 */
import * as repo from '../db/repositories/attachments.js';
import * as salesNoteRepo from '../db/repositories/inquirySalesNotes.js';
import * as keywordRepo from '../db/repositories/keywords.js';
import { requireAuth, editor } from '../auth/middleware.js';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // 单张 4MB（前端已压过，正常远小于此）
export const MAX_PER_OWNER = 12;                  // 单条记录最多挂 12 张
export const MAX_BYTES_PER_OWNER = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// 宿主类型 → 存在性校验。加新宿主时必须在这里登记，否则 owner_id 可以指向任何东西。
const OWNERS = {
  inquiry_sales_note: (id) => !!salesNoteRepo.get(id),
  keyword: (id) => {
    const row = keywordRepo.get(id);
    return !!row && row.type === 'customer'; // 目前只有「客户信息词库」这一栏要传图
  },
};

/* 文件头魔数 → 真实类型。前端可以随便写 type，这里以字节为准。 */
export function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// data:URL 或裸 base64 → Buffer。解析不出来返回 null，由调用方回 400。
export function decodeImagePayload(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const body = raw.replace(/^data:[^;,]*;base64,/, '').replace(/\s/g, '');
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  try {
    const buf = Buffer.from(body, 'base64');
    return buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

export async function attachmentsRoutes(app) {
  app.get('/api/attachments', { preHandler: requireAuth }, async (request, reply) => {
    const ownerType = String(request.query?.owner_type || '');
    const ownerId = Number(request.query?.owner_id);
    if (!OWNERS[ownerType] || !ownerId) return reply.code(400).send({ error: 'bad_owner' });
    return { items: repo.listByOwner(ownerType, ownerId) };
  });

  app.post('/api/attachments', editor, async (request, reply) => {
    const b = request.body || {};
    const ownerType = String(b.owner_type || '');
    const ownerId = Number(b.owner_id);
    const check = OWNERS[ownerType];
    if (!check || !ownerId) return reply.code(400).send({ error: 'bad_owner' });
    if (!check(ownerId)) return reply.code(404).send({ error: 'owner_not_found' });

    const buffer = decodeImagePayload(b.dataBase64 ?? b.data);
    if (!buffer) return reply.code(400).send({ error: 'bad_image_data' });
    if (buffer.length > MAX_IMAGE_BYTES) {
      return reply.code(413).send({ error: 'image_too_large', limit: MAX_IMAGE_BYTES, size: buffer.length });
    }
    // 以字节为准，不信前端报的 type
    const mime = sniffImageMime(buffer);
    if (!mime || !ALLOWED_MIME.has(mime)) return reply.code(415).send({ error: 'unsupported_image_type' });

    const used = repo.bytesForOwner(ownerType, ownerId);
    if (used.count >= MAX_PER_OWNER) return reply.code(409).send({ error: 'too_many_attachments', limit: MAX_PER_OWNER });
    if (used.bytes + buffer.length > MAX_BYTES_PER_OWNER) {
      return reply.code(413).send({ error: 'owner_quota_exceeded', limit: MAX_BYTES_PER_OWNER });
    }

    reply.code(201);
    return {
      item: repo.create({
        owner_type: ownerType, owner_id: ownerId,
        name: b.name == null ? null : String(b.name).slice(0, 160),
        mime, buffer, created_by: request.user.id,
      }),
    };
  });

  // 原图。加 immutable 缓存：附件一旦入库就不会被改（要换图只能删了重传，id 也会变）。
  app.get('/api/attachments/:id/raw', { preHandler: requireAuth }, async (request, reply) => {
    const row = repo.raw(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('Content-Type', row.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(row.data);
  });

  app.delete('/api/attachments/:id', editor, async (request, reply) => {
    const meta = repo.getMeta(Number(request.params.id));
    if (!meta) return reply.code(404).send({ error: 'not_found' });
    repo.remove(meta.id);
    return { ok: true };
  });
}
