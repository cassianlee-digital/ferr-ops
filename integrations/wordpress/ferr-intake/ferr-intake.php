<?php
/**
 * Plugin Name: FERR 询盘来源回传
 * Description: 访客提交 Fluent Forms 询盘表单时，把询盘内容和「他是从哪来的」一起发到 FERR 运营后台。
 * Version: 1.0.0
 * Requires PHP: 7.2
 *
 * 需要在 wp-config.php 里加两行（写在「That's all, stop editing」那一行之前）：
 *
 *   define('FERR_INTAKE_URL', 'https://<后台域名>/api/inquiry-intake');
 *   define('FERR_INTAKE_TOKEN', '<密钥，和后台环境变量 INQUIRY_INTAKE_SECRET 是同一个值>');
 *
 * 可选：
 *   define('FERR_INTAKE_FORM_IDS', '3,7');   // 只回传这几个表单；不写 = 所有带 ferr_source 隐藏字段的表单
 *
 * 密钥只放在 wp-config.php 里，由服务器发出去，不会出现在网页源码里。
 * 表单里要加一个隐藏字段，Name Attribute 填 ferr_source（默认值留空）—— 没有这个字段的表单不会回传。
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 后台要的字段 => 你的表单里对应字段的 Name Attribute。
 * 表单里的名字不一样就改右边；表单里没有的那几项不用管，会自动跳过。
 */
function ferr_intake_field_map() {
    return apply_filters('ferr_intake_field_map', array(
        'name'    => 'names',
        'email'   => 'email',
        'company' => 'company',
        'country' => 'country',
        'product' => 'product',
        'message' => 'message',
    ));
}

/** 隐藏字段里允许带回来的来源信息（和后台接口认的字段一一对应，别的一律丢掉）。 */
function ferr_intake_source_keys() {
    return array(
        'page_url', 'landing_page', 'referrer', 'gclid',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'campaign_id', 'adgroup_id', 'keyword', 'match_type',
    );
}

/** 表单字段的值可能是数组（姓名字段是「名 + 姓」，多选是好几项）：拼成一句话。 */
function ferr_intake_text($value) {
    if (is_array($value)) {
        $parts = array();
        array_walk_recursive($value, function ($item) use (&$parts) {
            if (is_scalar($item) && trim((string) $item) !== '') {
                $parts[] = trim((string) $item);
            }
        });
        return implode(' ', $parts);
    }
    return is_scalar($value) ? trim((string) $value) : '';
}

/** 解开隐藏字段（ferr-source.js 填的，JSON 的 base64url）。解不开就当没有来源，不影响询盘本身。 */
function ferr_intake_decode_source($raw) {
    if (!is_string($raw) || $raw === '' || strlen($raw) > 12000) {
        return array();
    }
    $b64 = strtr($raw, '-_', '+/');
    $b64 .= str_repeat('=', (4 - strlen($b64) % 4) % 4);
    $json = base64_decode($b64, true);
    if ($json === false) {
        return array();
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return array();
    }
    $out = array();
    foreach (ferr_intake_source_keys() as $key) {
        if (isset($data[$key]) && is_string($data[$key]) && $data[$key] !== '') {
            $out[$key] = $data[$key];
        }
    }
    return $out;
}

function ferr_intake_configured() {
    if (!defined('FERR_INTAKE_URL') || !defined('FERR_INTAKE_TOKEN') || strlen((string) FERR_INTAKE_TOKEN) < 24) {
        return false;
    }
    // 密钥走请求头，不加密的地址不发。唯一的例外是发给本机（本地演练时后台就跑在同一台电脑上，请求不出这台机器）
    $url = (string) FERR_INTAKE_URL;
    return stripos($url, 'https://') === 0 || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?/#i', $url) === 1;
}

function ferr_intake_form_allowed($formId) {
    if (!defined('FERR_INTAKE_FORM_IDS') || trim((string) FERR_INTAKE_FORM_IDS) === '') {
        return true;
    }
    $ids = array_map('intval', explode(',', (string) FERR_INTAKE_FORM_IDS));
    return in_array((int) $formId, $ids, true);
}

/** Fluent Forms 把一次提交存进数据库之后会触发这个钩子。 */
function ferr_intake_on_submission($entryId, $formData, $form) {
    if (!ferr_intake_configured() || !is_array($formData) || !array_key_exists('ferr_source', $formData)) {
        return;
    }
    $formId = is_object($form) && isset($form->id) ? (int) $form->id : 0;
    if (!ferr_intake_form_allowed($formId)) {
        return;
    }

    $payload = array(
        // 同一次提交永远是同一个编号：发送失败重试时，后台靠它认出是同一条，不会建出两条线索
        'submission_id' => 'ff-' . $formId . '-' . (int) $entryId,
        'submitted_at'  => gmdate('c'),
    );
    foreach (ferr_intake_field_map() as $target => $fieldName) {
        if (isset($formData[$fieldName])) {
            $text = ferr_intake_text($formData[$fieldName]);
            if ($text !== '') {
                $payload[$target] = $text;
            }
        }
    }
    $payload = array_merge($payload, ferr_intake_decode_source($formData['ferr_source']));

    ferr_intake_deliver($payload, 0);
}
add_action('fluentform/submission_inserted', 'ferr_intake_on_submission', 20, 3);

/** 发一次。成功返回 true，失败返回一句原因。 */
function ferr_intake_post($payload) {
    $response = wp_remote_post(FERR_INTAKE_URL, array(
        'timeout' => 5,
        'headers' => array(
            'Content-Type'   => 'application/json',
            'X-Intake-Token' => FERR_INTAKE_TOKEN,
        ),
        'body'    => wp_json_encode($payload),
    ));
    if (is_wp_error($response)) {
        return '连不上后台：' . $response->get_error_message();
    }
    $code = (int) wp_remote_retrieve_response_code($response);
    if ($code === 200 || $code === 201) {
        return true;
    }
    if ($code === 401) {
        return '后台拒绝了（401）：密钥不对，或者后台还没启用这个入口（INQUIRY_INTAKE_SECRET）';
    }
    if ($code === 400) {
        return '后台不收这条（400）：表单里邮箱和留言至少要有一个，检查 ferr_intake_field_map 里的字段名';
    }
    return '后台返回 HTTP ' . $code;
}

/**
 * 发送，失败了过一会儿再试（5 分钟、30 分钟、2 小时后各一次）。
 * 400 / 401 是配置或内容的问题，重试多少次结果都一样，不重试。
 * 就算全部失败，询盘本身还在 Fluent Forms 的「Entries」里，不会丢，只是后台里没有。
 */
function ferr_intake_deliver($payload, $attempt) {
    $attempt = (int) $attempt;
    $result = ferr_intake_post($payload);
    if ($result === true) {
        delete_option('ferr_intake_last_error');
        return;
    }
    update_option('ferr_intake_last_error', array(
        'time'          => gmdate('Y-m-d H:i') . ' UTC',
        'error'         => $result,
        'submission_id' => isset($payload['submission_id']) ? $payload['submission_id'] : '',
    ), false);

    $delays = array(300, 1800, 7200);
    $permanent = strpos($result, '（400）') !== false || strpos($result, '（401）') !== false;
    if (!$permanent && isset($delays[$attempt])) {
        wp_schedule_single_event(time() + $delays[$attempt], 'ferr_intake_retry', array($payload, $attempt + 1));
    }
}
add_action('ferr_intake_retry', 'ferr_intake_deliver', 10, 2);

/** 前台每个页面加载「记来源」的脚本。 */
function ferr_intake_enqueue() {
    wp_enqueue_script('ferr-source', plugins_url('ferr-source.js', __FILE__), array(), '1.0.0', true);
}
add_action('wp_enqueue_scripts', 'ferr_intake_enqueue');

/** 没配好、或者最近一次发送失败：在 WordPress 后台顶部说清楚，不让它悄悄不工作。 */
function ferr_intake_admin_notice() {
    if (!current_user_can('manage_options')) {
        return;
    }
    if (!ferr_intake_configured()) {
        echo '<div class="notice notice-warning"><p>'
            . esc_html('FERR 询盘来源回传还没配好，询盘不会发到运营后台：请在 wp-config.php 里设置 FERR_INTAKE_URL（https 开头）和 FERR_INTAKE_TOKEN（至少 24 位）。')
            . '</p></div>';
        return;
    }
    $last = get_option('ferr_intake_last_error');
    if (is_array($last) && !empty($last['error'])) {
        echo '<div class="notice notice-error"><p>'
            . esc_html('FERR 询盘来源回传最近一次发送失败（' . $last['time'] . '，' . $last['submission_id'] . '）：' . $last['error']
                . '。询盘本身仍在 Fluent Forms 的 Entries 里。下一次发送成功后这条提示会自动消失。')
            . '</p></div>';
    }
}
add_action('admin_notices', 'ferr_intake_admin_notice');
