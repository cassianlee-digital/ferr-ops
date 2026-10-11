<?php
// 给 WordPress 插件（integrations/wordpress/ferr-intake）做测试用的假 WordPress：只实现插件用到的那几个函数，
// 把它「想发的请求、想排的重试、想存的选项」记下来，最后以 JSON 打印出来，由 server/test/sitePlugin.test.js 检查。
//
// 用法：php wpStub.php <插件文件>   场景从标准输入读（JSON）：
//   { defines: {常量名: 值}, formData: {...}, formId: 3, entryId: 15,
//     responses: [201 | 500 | "连接超时" ...]   // 按顺序回给每一次 wp_remote_post；字符串 = 网络错误
//     runRetries: true                          // 把排上的重试当场跑掉（模拟时间过去了）
//     adminNotice: true }                       // 触发一次后台提示

$scenario = json_decode(stream_get_contents(STDIN), true);
if (!is_array($scenario)) { fwrite(STDERR, "场景不是合法的 JSON\n"); exit(2); }

define('ABSPATH', __DIR__ . '/');
foreach ((isset($scenario['defines']) ? $scenario['defines'] : array()) as $name => $value) { define($name, $value); }

$GLOBALS['ferr_test'] = array(
    'actions' => array(), 'requests' => array(), 'scheduled' => array(), 'options' => array(), 'scripts' => array(),
    'responses' => isset($scenario['responses']) ? $scenario['responses'] : array(),
);

class WP_Error {
    private $message;
    public function __construct($message) { $this->message = $message; }
    public function get_error_message() { return $this->message; }
}

function add_action($hook, $callback, $priority = 10, $args = 1) { $GLOBALS['ferr_test']['actions'][$hook][] = array($callback, $args); }
function do_action($hook, ...$args) {
    foreach ((isset($GLOBALS['ferr_test']['actions'][$hook]) ? $GLOBALS['ferr_test']['actions'][$hook] : array()) as $entry) {
        call_user_func_array($entry[0], array_slice($args, 0, $entry[1]));
    }
}
function apply_filters($hook, $value) { return $value; }
function wp_json_encode($data) { return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function wp_remote_post($url, $args) {
    $GLOBALS['ferr_test']['requests'][] = array('url' => $url, 'headers' => $args['headers'], 'timeout' => $args['timeout'], 'body' => $args['body']);
    $next = array_shift($GLOBALS['ferr_test']['responses']);
    if ($next === null) { $next = 201; }
    return is_string($next) ? new WP_Error($next) : array('response' => array('code' => $next));
}
function is_wp_error($thing) { return $thing instanceof WP_Error; }
function wp_remote_retrieve_response_code($response) { return $response['response']['code']; }
function wp_schedule_single_event($time, $hook, $args) {
    $GLOBALS['ferr_test']['scheduled'][] = array('in_seconds' => $time - time(), 'hook' => $hook, 'args' => $args);
}
function update_option($name, $value, $autoload = null) { $GLOBALS['ferr_test']['options'][$name] = $value; }
function delete_option($name) { unset($GLOBALS['ferr_test']['options'][$name]); }
function get_option($name) { return isset($GLOBALS['ferr_test']['options'][$name]) ? $GLOBALS['ferr_test']['options'][$name] : false; }
function plugins_url($path, $file) { return 'https://site.example/wp-content/plugins/ferr-intake/' . $path; }
function wp_enqueue_script($handle, $src, $deps, $ver, $footer) { $GLOBALS['ferr_test']['scripts'][] = array('src' => $src, 'footer' => $footer); }
function current_user_can($cap) { return true; }
function esc_html($text) { return htmlspecialchars($text, ENT_QUOTES, 'UTF-8'); }

require $argv[1];

do_action('wp_enqueue_scripts');
if (isset($scenario['formData'])) {
    $form = new stdClass();
    $form->id = isset($scenario['formId']) ? $scenario['formId'] : 3;
    do_action('fluentform/submission_inserted', isset($scenario['entryId']) ? $scenario['entryId'] : 15, $scenario['formData'], $form);
}
if (!empty($scenario['runRetries'])) {
    // 重试里还会再排重试，所以一直跑到排空为止（插件自己有次数上限，不会停不下来）
    $ran = 0;
    while ($ran < count($GLOBALS['ferr_test']['scheduled']) && $ran < 20) {
        $job = $GLOBALS['ferr_test']['scheduled'][$ran++];
        do_action($job['hook'], ...$job['args']);
    }
}
$notice = '';
if (!empty($scenario['adminNotice'])) { ob_start(); do_action('admin_notices'); $notice = ob_get_clean(); }

echo json_encode(array(
    'requests' => $GLOBALS['ferr_test']['requests'],
    'scheduled' => array_map(function ($j) { return array('in_seconds' => $j['in_seconds'], 'hook' => $j['hook'], 'attempt' => $j['args'][1]); }, $GLOBALS['ferr_test']['scheduled']),
    'options' => $GLOBALS['ferr_test']['options'],
    'scripts' => $GLOBALS['ferr_test']['scripts'],
    'notice' => $notice,
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
