/* 图片附件：选图 → 前端压缩 → 上传 → 缩略图 / 大图预览 / 删除。
 * 询盘表的「业务反馈」和关键词库「客户信息词库」的「业务反馈」共用这一套。
 *
 * 为什么前端先压：业务随手甩过来的截图动辄 3~8MB，原样进库会让 SQLite 迅速膨胀，
 * 而这些图只是给人看清文字的证据，长边 1600px 足够。压完通常只剩几十到几百 KB。
 * 压不动（浏览器不支持 / 图片解码失败）就原样上传，让服务端的大小闸门去拦，不静默丢文件。
 *
 * 原图不进 JSON：列表接口只回 {id,name,mime,bytes}，<img src> 指向 /api/attachments/:id/raw。
 */
import { esc, toast } from './ui-kit.js';

export const MAX_EDGE = 1600;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function rawUrl(id) { return '/api/attachments/' + encodeURIComponent(id) + '/raw'; }

export function humanBytes(n) {
  if (!Number.isFinite(Number(n))) return '';
  const v = Number(n);
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(0) + ' KB';
  return (v / 1024 / 1024).toFixed(1) + ' MB';
}

/* 打开系统选图框。不往页面里塞常驻 <input>：用完即弃，避免第二次选同一个文件时
   input.value 没变导致 change 不触发的经典坑。 */
export function pickImages({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = !!multiple;
    input.className = 'att-file-input';   // 视觉隐藏交给 CSS，不用内联 style
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    });
    // 用户直接关掉选图框时不会触发 change；节点留在 DOM 里也无害（下次调用会新建一个），
    // 但还是在 body 上挂一次以保证 Safari 能弹出选择器。
    document.body.appendChild(input);
    input.click();
  });
}

// File → dataURL（压缩后）。任何一步失败都回退成「原图的 dataURL」，绝不返回空。
export function compressImage(file, maxEdge = MAX_EDGE) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const original = String(reader.result || '');
      // GIF 可能是动图，重绘会只剩第一帧 —— 动图本身就是证据，原样传
      if (file.type === 'image/gif') return resolve(original);
      const img = new Image();
      img.onerror = () => resolve(original);
      img.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          if (scale >= 1) return resolve(original); // 本来就不大，别重编码白掉一次画质
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(original);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // 统一转 JPEG：截图里大片纯色用 PNG 反而更大，且这里只要看得清字
          const out = canvas.toDataURL('image/jpeg', 0.82);
          resolve(out && out.length < original.length ? out : original);
        } catch (e) {
          resolve(original);
        }
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

/* 上传一张图。返回服务端回的元数据。
   失败时抛出带可读原因的 Error —— 调用方直接 toast 出来，不留「静默没反应」。 */
export async function uploadImage(ownerType, ownerId, file) {
  const dataBase64 = await compressImage(file);
  const approxBytes = Math.floor((dataBase64.length - (dataBase64.indexOf(',') + 1)) * 0.75);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    throw new Error('图片压缩后仍有 ' + humanBytes(approxBytes) + '，超过 ' + humanBytes(MAX_UPLOAD_BYTES) + ' 上限');
  }
  try {
    const { item } = await API.post('/api/attachments', {
      owner_type: ownerType, owner_id: ownerId, name: file.name, dataBase64,
    });
    return item;
  } catch (e) {
    throw new Error(uploadErrorText(e));
  }
}

function uploadErrorText(e) {
  const code = e && (e.body?.error || e.error);
  if (e && e.status === 403) return '无权上传';
  if (code === 'unsupported_image_type') return '只支持 PNG / JPG / WEBP / GIF 图片';
  if (code === 'image_too_large') return '图片太大，请先压缩';
  if (code === 'too_many_attachments') return '这条记录的图片数量已达上限';
  if (code === 'owner_quota_exceeded') return '这条记录的图片总量已达上限';
  if (code === 'bad_image_data') return '这个文件不是有效图片';
  return '上传失败：' + ((e && e.message) || '请求失败');
}

// 逐张上传，边传边回报进度。一张失败不影响其余（业务一次甩 5 张截图是常态）。
export async function uploadAll(ownerType, ownerId, files, onProgress) {
  const done = [];
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    try { done.push(await uploadImage(ownerType, ownerId, files[i])); }
    catch (e) { failed.push({ name: files[i].name, reason: e.message }); }
  }
  return { done, failed };
}

export async function deleteImage(id) {
  await API.del('/api/attachments/' + encodeURIComponent(id));
}

/* 缩略图组的 HTML。data-att-view 让整组走事件委托打开大图；
   deletable 时再给每张配一个删除角标。 */
export function thumbsHtml(images, { deletable = false } = {}) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return '';
  return '<span class="att-thumbs">' + list.map((im) => {
    const label = esc((im.name || '图片') + (im.bytes ? ' · ' + humanBytes(im.bytes) : ''));
    return '<span class="att-thumb-wrap">'
      + `<img class="att-thumb" src="${esc(rawUrl(im.id))}" alt="${label}" title="${label}"`
        + ` data-att-view="${esc(im.id)}" data-att-name="${esc(im.name || '图片')}"`
        + ` data-att-bytes="${esc(im.bytes || 0)}" loading="lazy">`
      + (deletable ? `<button type="button" class="att-thumb-del" data-att-del="${esc(im.id)}" title="删除这张图"><i class="ti ti-x"></i></button>` : '')
      + '</span>';
  }).join('') + '</span>';
}

/* ===== 大图预览（懒建，模块求值期不碰 DOM）=====
   做成一张有边框的卡片而不是「一张图浮在全屏黑底上」：
   业务发来的截图尺寸参差不齐，小图在空旷的黑底里会显得像是坏了（老板就是这么反馈的）。
   卡片自适应内容大小，下面一条说明栏给文件名、真实像素尺寸和「在新标签打开原图」。
   **刻意不把小图硬放大** —— 100×50 的图拉到 2000px 只会变成马赛克，
   那是在假装它有更多细节。要看更清楚就点「打开原图」交给浏览器自己缩放。 */
let lightbox = null;
let lightboxSeq = 0; // 「这次打开的是第几张」——用它判断 load 回调是否已经过期
function ensureLightbox() {
  if (lightbox) return lightbox;
  lightbox = document.createElement('div');
  lightbox.className = 'att-lightbox';
  lightbox.innerHTML = '<div class="att-lightbox-card">'
    + '<div class="att-lightbox-stage"><img class="att-lightbox-img" alt="原图预览"></div>'
    + '<div class="att-lightbox-bar">'
      + '<span class="att-lightbox-name"></span>'
      + '<span class="att-lightbox-dim"></span>'
      + '<a class="att-lightbox-open" target="_blank" rel="noopener">在新标签打开原图</a>'
    + '</div>'
    + '</div>'
    + '<button type="button" class="att-lightbox-close" title="关闭（Esc）"><i class="ti ti-x"></i></button>';
  // 只有点背景/关闭钮才关；点卡片本身（想选文字、点链接）不该把窗关掉
  lightbox.addEventListener('click', (e) => {
    if (e.target.closest('.att-lightbox-card') && !e.target.closest('.att-lightbox-close')) return;
    closeLightbox();
  });
  document.body.appendChild(lightbox);
  return lightbox;
}
export function closeLightbox() {
  if (lightbox) lightbox.classList.remove('on');
}
export function openLightbox(id, meta = {}) {
  const box = ensureLightbox();
  const img = box.querySelector('.att-lightbox-img');
  const url = rawUrl(id);
  const seq = ++lightboxSeq;
  img.src = url;
  box.querySelector('.att-lightbox-name').textContent = meta.name || '图片';
  box.querySelector('.att-lightbox-open').href = url;
  const dim = box.querySelector('.att-lightbox-dim');
  const sizeText = meta.bytes ? humanBytes(meta.bytes) : '';
  dim.textContent = sizeText;
  // 真实像素尺寸要等图解码完才知道；小图看着不大不是渲染出错，是它本来就这么大
  const showDim = () => {
    // 用序号判过期，**不能拿 img.src 和相对路径比**：读 img.src 回来的是绝对地址，永远不相等
    if (seq !== lightboxSeq || !img.naturalWidth) return;
    const px = img.naturalWidth + ' × ' + img.naturalHeight;
    dim.textContent = sizeText ? px + ' · ' + sizeText : px;
  };
  // 图片走的是 immutable 缓存，第二次打开时 load 早就触发完了，只挂监听会永远等不到
  if (img.complete) showDim();
  else img.addEventListener('load', showDim, { once: true });
  box.classList.add('on');
}

// 全局委托：任何地方渲染的缩略图都能点开大图。删除按钮由各自模块处理（它们要同步自己的缓存）。
document.addEventListener('click', (e) => {
  const thumb = e.target.closest('[data-att-view]');
  if (!thumb || e.target.closest('[data-att-del]')) return;
  openLightbox(thumb.dataset.attView, { name: thumb.dataset.attName, bytes: Number(thumb.dataset.attBytes) || 0 });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

/* 选图 + 上传 + 提示的一站式封装。调用方只管拿回新增的图片元数据去更新自己的缓存。 */
export async function pickAndUpload(ownerType, ownerId, { multiple = true } = {}) {
  const files = await pickImages({ multiple });
  if (!files.length) return [];
  toast('正在上传 ' + files.length + ' 张图片…');
  const { done, failed } = await uploadAll(ownerType, ownerId, files);
  if (failed.length) toast('已上传 ' + done.length + ' 张，' + failed.length + ' 张失败：' + failed[0].reason);
  else toast('已上传 ' + done.length + ' 张图片 · 已入库');
  return done;
}
