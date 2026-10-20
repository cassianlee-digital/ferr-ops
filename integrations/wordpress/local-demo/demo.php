<?php
// 本地演练：不装 WordPress，在自己电脑上把「访客从广告进站 → 点到联系页 → 提交表单 → 插件发给后台」真走一遍。
//
// 真的部分：浏览器、记来源的脚本（ferr-source.js）、插件本身（ferr-intake.php，一行没改）、发给后台的那次请求、本机跑着的后台。
// 假的部分：WordPress 和 Fluent Forms —— 这里用十几个同名函数顶替，并照 Fluent Forms 的样子把表单内容交给插件。
// 所以它验得了「来源记不记得住、带不带得过去、后台收不收得下」，验不了「Fluent Forms 的字段在你的表单里到底叫什么」。
//
// 用法（仓库根目录；后台要先在本机跑起来，根目录的 .env 里要有 PORT 和 INQUIRY_INTAKE_SECRET）：
//   php -S localhost:8787 -t integrations/wordpress integrations/wordpress/local-demo/demo.php
// 然后打开  http://localhost:8787/valves/?campaign_id=test1&keyword=test+word&utm_source=google&utm_medium=cpc
//
// 只在本机用：不要放到任何能被外面访问到的地方。

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// 静态文件（记来源的脚本）交给 PHP 自带的服务器直接发
if ($path !== '/' && is_file(dirname(__DIR__) . $path) && substr($path, -4) !== '.php') {
    return false;
}

/* ---------- 从仓库根目录的 .env 读后台地址和密钥（密钥只用来发请求，不会显示在页面上） ---------- */
$env = array();
$envFile = dirname(__DIR__, 3) . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/', $line, $m)) {
            $env[$m[1]] = trim($m[2], "\"'");
        }
    }
}
$backend = 'http://localhost:' . (isset($env['PORT']) ? $env['PORT'] : '3000');
$problem = '';
if (empty($env['INQUIRY_INTAKE_SECRET'])) {
    $problem = '仓库根目录的 .env 里没有 INQUIRY_INTAKE_SECRET。加一行（至少 24 位随机字符），重启本机后台，再刷新这个页面。';
} else {
    define('FERR_INTAKE_URL', $backend . '/api/inquiry-intake');
    define('FERR_INTAKE_TOKEN', $env['INQUIRY_INTAKE_SECRET']);
}

/* ---------- 顶替 WordPress 的那十几个函数 ---------- */
define('ABSPATH', __DIR__ . '/');
$GLOBALS['demo'] = array('actions' => array(), 'options' => array(), 'scheduled' => array(), 'sent' => array());

class WP_Error {
    private $message;
    public function __construct($message) { $this->message = $message; }
    public function get_error_message() { return $this->message; }
}
function add_action($hook, $callback, $priority = 10, $args = 1) { $GLOBALS['demo']['actions'][$hook][] = array($callback, $args); }
function do_action($hook, ...$args) {
    foreach ((isset($GLOBALS['demo']['actions'][$hook]) ? $GLOBALS['demo']['actions'][$hook] : array()) as $entry) {
        call_user_func_array($entry[0], array_slice($args, 0, $entry[1]));
    }
}
function apply_filters($hook, $value) { return $value; }
function wp_json_encode($data) { return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
// 这一个是真的：真发一次请求给本机的后台
function wp_remote_post($url, $args) {
    $headers = '';
    foreach ($args['headers'] as $name => $value) { $headers .= $name . ': ' . $value . "\r\n"; }
    $context = stream_context_create(array('http' => array(
        'method' => 'POST', 'header' => $headers, 'content' => $args['body'], 'timeout' => $args['timeout'], 'ignore_errors' => true,
    )));
    $body = @file_get_contents($url, false, $context);
    $sent = array('url' => $url, 'payload' => json_decode($args['body'], true), 'code' => null, 'reply' => null);
    if ($body === false) {
        $GLOBALS['demo']['sent'][] = $sent;
        return new WP_Error('本机后台没有响应（' . $url . '）—— 后台跑起来了吗？');
    }
    $code = isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0] . ' ', $m) ? (int) $m[1] : 0;
    $sent['code'] = $code;
    $sent['reply'] = $body;
    $GLOBALS['demo']['sent'][] = $sent;
    return array('response' => array('code' => $code));
}
function is_wp_error($thing) { return $thing instanceof WP_Error; }
function wp_remote_retrieve_response_code($response) { return $response['response']['code']; }
function wp_schedule_single_event($time, $hook, $args) { $GLOBALS['demo']['scheduled'][] = (int) round(($time - time()) / 60); }
function update_option($name, $value, $autoload = null) { $GLOBALS['demo']['options'][$name] = $value; }
function delete_option($name) { unset($GLOBALS['demo']['options'][$name]); }
function get_option($name) { return isset($GLOBALS['demo']['options'][$name]) ? $GLOBALS['demo']['options'][$name] : false; }
function plugins_url($file, $plugin) { return '/ferr-intake/' . $file; }
function wp_enqueue_script($handle, $src, $deps, $ver, $footer) { $GLOBALS['demo']['script'] = $src; }
function current_user_can($cap) { return true; }
function esc_html($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); }

require dirname(__DIR__) . '/ferr-intake/ferr-intake.php';   // 插件本身，原样加载
do_action('wp_enqueue_scripts');

/* ---------- 收到表单：照 Fluent Forms 的样子交给插件 ---------- */
$submitted = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($submitted && !$problem) {
    $form = new stdClass();
    $form->id = 1;
    // 提交编号用时间戳：每次演练都是一条新线索（真实环境里是 Fluent Forms 的记录编号）
    do_action('fluentform/submission_inserted', time(), $_POST, $form);
}
ob_start();
do_action('admin_notices');
$notice = ob_get_clean();

$h = function ($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); };
$isContact = strpos($path, '/contact') === 0;
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>本地演练 · <?php echo $isContact ? '联系页' : '产品页'; ?></title>
<style>
  body { font: 15px/1.7 system-ui, sans-serif; max-width: 760px; margin: 32px auto; padding: 0 16px; color: #1f2937; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 28px; }
  code, pre { background: #f3f4f6; padding: 2px 6px; font-size: 13px; } pre { padding: 10px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  label { display: block; margin: 10px 0 2px; } input[type=text], input[type=email], textarea { width: 100%; padding: 6px 8px; box-sizing: border-box; font: inherit; }
  button { margin-top: 14px; padding: 8px 18px; font: inherit; cursor: pointer; }
  .ok { border-left: 3px solid #16a34a; padding: 8px 12px; background: #f0fdf4; }
  .bad { border-left: 3px solid #dc2626; padding: 8px 12px; background: #fef2f2; }
  .note { color: #6b7280; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; } td { border-top: 1px solid #e5e7eb; padding: 4px 8px; vertical-align: top; font-size: 13px; word-break: break-all; } td:first-child { white-space: nowrap; color: #6b7280; }
</style>
</head>
<body>
<p class="note">本地演练（不是真的独立站）· 后台：<?php echo $h($backend); ?></p>
<?php if ($problem) { ?><p class="bad"><?php echo $h($problem); ?></p><?php } ?>
<?php if ($notice) { ?><h2>WordPress 后台顶部此刻会显示的提示</h2><?php echo $notice; ?><?php } ?>

<?php if ($submitted && !$problem) { ?>
  <h1>提交完了：插件做了什么</h1>
  <?php if (!$GLOBALS['demo']['sent']) { ?>
    <p class="bad">插件没有往后台发。最常见的原因：表单里没有 <code>ferr_source</code> 这个隐藏字段。</p>
  <?php } ?>
  <?php foreach ($GLOBALS['demo']['sent'] as $sent) { ?>
    <?php if ($sent['code'] === 200 || $sent['code'] === 201) { ?>
      <p class="ok" id="result">后台收下了（HTTP <?php echo (int) $sent['code']; ?>）：<code><?php echo $h($sent['reply']); ?></code><br>
      现在去 <a href="<?php echo $h($backend); ?>/" target="_blank" rel="noopener">本机后台</a> →「询盘评级 → 表单线索」，应该能看到这一条。</p>
    <?php } else { ?>
      <p class="bad" id="result">后台没收下：<?php echo $sent['code'] ? 'HTTP ' . (int) $sent['code'] . ' ' . $h($sent['reply']) : '连不上'; ?></p>
    <?php } ?>
    <h2>插件发给后台的内容</h2>
    <table id="payload">
      <?php foreach ((array) $sent['payload'] as $key => $value) { ?>
        <tr><td><?php echo $h($key); ?></td><td><?php echo $h($value); ?></td></tr>
      <?php } ?>
    </table>
    <p class="note">密钥放在请求头里发出，不在这张表里，也不会出现在任何页面上。</p>
  <?php } ?>
  <?php if ($GLOBALS['demo']['scheduled']) { ?>
    <p class="note">发送失败，插件排了一次重试：<?php echo (int) $GLOBALS['demo']['scheduled'][0]; ?> 分钟后（演练里不会真的去重试）。</p>
  <?php } ?>
  <p><a href="/contact/">再提交一条</a> · <a href="/valves/?campaign_id=test2&amp;keyword=another+word&amp;utm_source=google&amp;utm_medium=cpc">换一组广告参数重新进站</a></p>

<?php } elseif ($isContact) { ?>
  <h1>联系页（询盘表单）</h1>
  <p>注意看地址栏：这一页的网址里<strong>没有</strong>任何广告参数。来源是进站那一页记下的。</p>
  <form method="post" action="/contact/">
    <label>名 <input type="text" name="names[first_name]" value="Hans"></label>
    <label>姓 <input type="text" name="names[last_name]" value="Meyer"></label>
    <label>邮箱 <input type="email" name="email" value="hans@buyer.example"></label>
    <label>公司 <input type="text" name="company" value="Meyer Armaturen GmbH"></label>
    <label>国家 <input type="text" name="country" value="Germany"></label>
    <label>留言 <textarea name="message" rows="3">本地演练：We need 500 pcs DN50 gate valves.</textarea></label>
    <input type="hidden" name="ferr_source" value="">
    <button type="submit">提交询盘</button>
  </form>
  <h2>隐藏字段 ferr_source 里现在是什么</h2>
  <pre id="hidden-raw">（脚本还没填）</pre>
  <h2>解开之后</h2>
  <pre id="hidden-decoded">—</pre>

<?php } else { ?>
  <h1>产品页（访客进站的第一页）</h1>
  <p>当前网址：<code id="here"></code></p>
  <p>访客从广告点进来时，网址里带着系列、关键词这些参数。记来源的脚本此刻已经把它们存进了这个浏览器。</p>
  <h2>浏览器里记下的来源（localStorage 里的 ferr_src）</h2>
  <pre id="stored">—</pre>
  <p><a id="to-contact" href="/contact/">→ 去联系页填表单</a>（像真实访客那样点过去，不带任何参数）</p>
  <p class="note">想模拟另一种来源：<a href="/valves/?campaign_id=test1&amp;keyword=test+word&amp;utm_source=google&amp;utm_medium=cpc&amp;gclid=demo123">广告点击</a> ·
    <a href="/valves/">直接访问（不带参数）</a></p>
<?php } ?>

<script src="<?php echo $h($GLOBALS['demo']['script']); ?>"></script>
<script>
  // 只是把脚本做的事显示出来，方便看；真实站点上没有这一段。
  // 等页面完全加载好再看：记来源的脚本是在页面结构就绪的那一刻才去填隐藏字段的，早一步看到的是空的
  window.addEventListener('load', function () {
    var here = document.getElementById('here'); if (here) here.textContent = location.href;
    var stored = document.getElementById('stored');
    if (stored) { try { stored.textContent = JSON.stringify(JSON.parse(localStorage.getItem('ferr_src')), null, 2); } catch (e) { stored.textContent = '读不到'; } }
    var input = document.querySelector('input[name="ferr_source"]');
    if (input) {
      document.getElementById('hidden-raw').textContent = input.value || '（空的：脚本没有填进去）';
      try {
        var b64 = input.value.replace(/-/g, '+').replace(/_/g, '/');
        document.getElementById('hidden-decoded').textContent = JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(b64)))), null, 2);
      } catch (e) { document.getElementById('hidden-decoded').textContent = '解不开'; }
    }
  });
</script>
</body>
</html>
