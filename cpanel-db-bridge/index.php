<?php
/**
 * Libertad Chey — cPanel MySQL Persistence & Regulatory Audit Bridge
 *
 * Upload this file as `index.php` into the document root of your dedicated
 * cPanel subdomain (e.g. `https://api.libertadchey.com/index.php`).
 *
 * Configure your database credentials and shared secret below, or inside a
 * sibling `config.local.php` file outside git.
 */

declare(strict_types=1);

// ============================================================================
// 1. CONFIGURATION (Edit here or override via config.local.php)
// ============================================================================
$config = [
    'db_host'      => '127.0.0.1',
    'db_port'      => '3306',
    'db_name'      => 'CHANGE_ME_CPANEL_DB_NAME',
    'db_user'      => 'CHANGE_ME_CPANEL_DB_USER',
    'db_pass'      => 'CHANGE_ME_CPANEL_DB_PASSWORD',
    // Must match CPANEL_DB_API_SECRET in Vercel & .env.local (min 32 chars)
    'api_secret'   => 'CHANGE_ME_GENERATE_A_LONG_RANDOM_SECRET',
    // Optional separate token for browser CSV downloads; defaults to api_secret
    'export_token' => '',
];

$localConfigFile = __DIR__ . '/config.local.php';
if (is_file($localConfigFile)) {
    $overrides = require $localConfigFile;
    if (is_array($overrides)) {
        $config = array_merge($config, $overrides);
    }
}

// ============================================================================
// 2. HELPERS
// ============================================================================
function sendJson(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getBearerToken(): string
{
    $headers = [];
    if (function_exists('getallheaders')) {
        $raw = getallheaders();
        if (is_array($raw)) {
            foreach ($raw as $k => $v) {
                $headers[strtolower((string) $k)] = (string) $v;
            }
        }
    }
    $auth = $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';

    if (preg_match('/^Bearer\s+(.+)$/i', trim($auth), $matches)) {
        return trim($matches[1]);
    }
    return '';
}

function getHeaderValue(string $name): string
{
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (!empty($_SERVER[$serverKey])) {
        return trim((string) $_SERVER[$serverKey]);
    }
    if (function_exists('getallheaders')) {
        $raw = getallheaders();
        if (is_array($raw)) {
            foreach ($raw as $k => $v) {
                if (strtolower((string) $k) === strtolower($name)) {
                    return trim((string) $v);
                }
            }
        }
    }
    return '';
}

function isoToMysqlUtc(?string $iso): string
{
    if (!$iso) {
        return gmdate('Y-m-d H:i:s');
    }
    $ts = strtotime($iso);
    if ($ts === false) {
        return gmdate('Y-m-d H:i:s');
    }
    return gmdate('Y-m-d H:i:s', $ts);
}

function connectPdo(array $config): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name']
    );

    return new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

function insertAuditLog(PDO $pdo, array $entry): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO payment_audit_logs
          (reference, event_type, source, amount_kobo, currency, status, message, payload_json)
         VALUES
          (:reference, :event_type, :source, :amount_kobo, :currency, :status, :message, :payload_json)'
    );

    $payloadJson = null;
    if (isset($entry['payload']) && $entry['payload'] !== null) {
        $payloadJson = is_string($entry['payload'])
            ? $entry['payload']
            : json_encode($entry['payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    $stmt->execute([
        ':reference'    => substr((string) ($entry['reference'] ?? 'unknown'), 0, 100),
        ':event_type'   => substr((string) ($entry['eventType'] ?? 'UNKNOWN'), 0, 80),
        ':source'       => substr((string) ($entry['source'] ?? 'server_action'), 0, 50),
        ':amount_kobo'  => isset($entry['amountKobo']) ? (int) $entry['amountKobo'] : null,
        ':currency'     => isset($entry['currency']) ? substr((string) $entry['currency'], 0, 10) : null,
        ':status'       => substr((string) ($entry['status'] ?? 'INFO'), 0, 50),
        ':message'      => isset($entry['message']) ? substr((string) $entry['message'], 0, 500) : null,
        ':payload_json' => $payloadJson,
    ]);
}

function formatBookingRow(array $row): array
{
    return [
        'reference'       => (string) $row['reference'],
        'bookingUid'      => (string) ($row['calcom_booking_uid'] ?? ''),
        'slotStart'       => (string) $row['slot_start_iso'],
        'durationMinutes' => (int) $row['duration_minutes'],
        'timeZone'        => (string) $row['time_zone'],
        'name'            => (string) $row['client_name'],
        'email'           => (string) $row['client_email'],
        'organisation'    => (string) $row['organisation'],
        'notes'           => (string) $row['agenda_notes'],
        'formattedAmount' => (string) $row['formatted_amount'],
        'meetingUrl'      => !empty($row['meeting_url']) ? (string) $row['meeting_url'] : null,
        'isPreview'       => ((int) $row['is_preview']) === 1,
        'paymentStatus'   => (string) $row['payment_status'],
        'bookingStatus'   => (string) $row['booking_status'],
        'emailSentAt'     => $row['email_sent_at'] ?? null,
    ];
}

// ============================================================================
// 3. GUARD AGAINST UNCONFIGURED SECRET
// ============================================================================
$apiSecret = trim((string) ($config['api_secret'] ?? ''));
if ($apiSecret === '' || strpos($apiSecret, 'CHANGE_ME') === 0) {
    sendJson(500, [
        'ok'    => false,
        'error' => 'Bridge API secret has not been configured on cPanel yet.',
    ]);
}

// ============================================================================
// 4. GET REQUESTS: HEALTH CHECK & TOKEN-PROTECTED CSV COMPLIANCE EXPORT
// ============================================================================
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    if (isset($_GET['health'])) {
        try {
            $pdo = connectPdo($config);
            $pdo->query('SELECT 1');
            sendJson(200, ['ok' => true, 'status' => 'healthy']);
        } catch (Throwable $e) {
            sendJson(500, ['ok' => false, 'error' => 'Database connection failed.']);
        }
    }

    if (isset($_GET['export'])) {
        $exportToken = trim((string) ($config['export_token'] ?: $apiSecret));
        $providedToken = trim((string) ($_GET['token'] ?? getBearerToken()));

        if ($providedToken === '' || !hash_equals($exportToken, $providedToken)) {
            sendJson(401, ['ok' => false, 'error' => 'Unauthorized export token.']);
        }

        $exportType = strtolower(trim((string) $_GET['export']));
        try {
            $pdo = connectPdo($config);
        } catch (Throwable $e) {
            sendJson(500, ['ok' => false, 'error' => 'Database connection failed.']);
        }

        if ($exportType === 'consultations') {
            $stmt = $pdo->query(
                'SELECT
                    id, reference, client_name, client_email, organisation, agenda_notes,
                    slot_start_iso, time_zone, duration_minutes,
                    amount_kobo, currency, formatted_amount,
                    payment_status, paystack_transaction_id, paystack_customer_code, payment_channel, paid_at,
                    booking_status, calcom_booking_uid, meeting_url, email_sent_at, is_preview,
                    created_at, updated_at
                 FROM consultation_bookings
                 ORDER BY created_at DESC'
            );
            $filename = 'libertadchey-consultations-' . gmdate('Y-m-d') . '.csv';
        } elseif ($exportType === 'audit_logs') {
            $stmt = $pdo->query(
                'SELECT
                    id, reference, event_type, source, amount_kobo, currency,
                    status, message, payload_json, created_at
                 FROM payment_audit_logs
                 ORDER BY created_at DESC'
            );
            $filename = 'libertadchey-payment-audit-logs-' . gmdate('Y-m-d') . '.csv';
        } elseif ($exportType === 'enquiries') {
            $stmt = $pdo->query(
                'SELECT
                    id, client_name, client_email, organisation, message,
                    email_delivery_status, email_error_detail, received_at_iso, created_at
                 FROM contact_enquiries
                 ORDER BY created_at DESC'
            );
            $filename = 'libertadchey-contact-enquiries-' . gmdate('Y-m-d') . '.csv';
        } else {
            sendJson(400, [
                'ok'    => false,
                'error' => 'Invalid export type. Use ?export=consultations, ?export=audit_logs, or ?export=enquiries',
            ]);
        }

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');

        $out = fopen('php://output', 'w');
        // Write UTF-8 BOM so Microsoft Excel renders Naira (₦) and accents properly
        fwrite($out, "\xEF\xBB\xBF");

        $rows = $stmt->fetchAll();
        if (!empty($rows)) {
            fputcsv($out, array_keys($rows[0]));
            foreach ($rows as $row) {
                fputcsv($out, array_values($row));
            }
        } else {
            fputcsv($out, ['No records found']);
        }

        fclose($out);
        exit;
    }

    sendJson(200, [
        'ok'      => true,
        'service' => 'Libertad Chey cPanel Persistence Bridge',
    ]);
}

if ($method !== 'POST') {
    sendJson(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

// ============================================================================
// 5. AUTHENTICATE POST REQUESTS FROM VERCEL (Bearer + HMAC-SHA256)
// ============================================================================
$rawBody = (string) file_get_contents('php://input');
$bearer = getBearerToken();
$signature = getHeaderValue('x-bridge-signature');

$bearerValid = $bearer !== '' && hash_equals($apiSecret, $bearer);
$expectedHmac = hash_hmac('sha256', $rawBody, $apiSecret);
$hmacValid = $signature !== '' && hash_equals($expectedHmac, $signature);

if (!$bearerValid && !$hmacValid) {
    sendJson(401, ['ok' => false, 'error' => 'Unauthorized bridge request.']);
}

$input = json_decode($rawBody, true);
if (!is_array($input) || empty($input['action'])) {
    sendJson(400, ['ok' => false, 'error' => 'Invalid JSON payload or missing action.']);
}

$action = (string) $input['action'];

try {
    $pdo = connectPdo($config);
} catch (Throwable $e) {
    sendJson(500, [
        'ok'    => false,
        'error' => 'Database connection error on cPanel.',
    ]);
}

// ============================================================================
// 6. HANDLE PERSISTENCE ACTIONS
// ============================================================================
try {
    switch ($action) {
        // --------------------------------------------------------------------
        // A. Record payment initiation (PENDING booking + PAYMENT_INITIATED log)
        // --------------------------------------------------------------------
        case 'record_consultation_initiated': {
            $b = $input['booking'] ?? [];
            $reference = trim((string) ($input['reference'] ?? ''));
            if ($reference === '' || empty($b['email']) || empty($b['slotStart'])) {
                sendJson(400, ['ok' => false, 'error' => 'Missing required booking fields.']);
            }

            $slotStartIso = (string) $b['slotStart'];
            $slotStartUtc = isoToMysqlUtc($slotStartIso);
            $amountKobo = (int) ($b['feeKobo'] ?? 0);
            $currency = strtoupper(trim((string) ($b['currency'] ?? 'NGN')));
            $formattedAmount = (string) ($input['formattedAmount'] ?? ($currency . ' ' . ($amountKobo / 100)));
            $isPreview = !empty($input['isPreview']) ? 1 : 0;

            $stmt = $pdo->prepare(
                'INSERT INTO consultation_bookings (
                    reference, client_name, client_email, organisation, agenda_notes,
                    slot_start_iso, slot_start_utc, time_zone, duration_minutes,
                    amount_kobo, currency, formatted_amount,
                    payment_status, booking_status, is_preview
                ) VALUES (
                    :reference, :client_name, :client_email, :organisation, :agenda_notes,
                    :slot_start_iso, :slot_start_utc, :time_zone, :duration_minutes,
                    :amount_kobo, :currency, :formatted_amount,
                    \'PENDING\', \'PENDING\', :is_preview
                )
                ON DUPLICATE KEY UPDATE
                    updated_at = CURRENT_TIMESTAMP'
            );

            $stmt->execute([
                ':reference'        => $reference,
                ':client_name'      => (string) ($b['name'] ?? ''),
                ':client_email'     => (string) ($b['email'] ?? ''),
                ':organisation'     => (string) ($b['organisation'] ?? ''),
                ':agenda_notes'     => (string) ($b['notes'] ?? ''),
                ':slot_start_iso'   => $slotStartIso,
                ':slot_start_utc'   => $slotStartUtc,
                ':time_zone'        => (string) ($b['timeZone'] ?? 'Africa/Lagos'),
                ':duration_minutes' => (int) ($b['durationMinutes'] ?? 45),
                ':amount_kobo'      => $amountKobo,
                ':currency'         => $currency,
                ':formatted_amount' => $formattedAmount,
                ':is_preview'       => $isPreview,
            ]);

            insertAuditLog($pdo, [
                'reference'  => $reference,
                'eventType'  => 'PAYMENT_INITIATED',
                'source'     => (string) ($input['source'] ?? 'server_action'),
                'amountKobo' => $amountKobo,
                'currency'   => $currency,
                'status'     => 'PENDING',
                'message'    => 'Consultation payment initialized with Paystack.',
                'payload'    => [
                    'booking'   => $b,
                    'isPreview' => (bool) $isPreview,
                ],
            ]);

            sendJson(200, ['ok' => true]);
        }

        // --------------------------------------------------------------------
        // B. Fetch an existing booking by reference
        // --------------------------------------------------------------------
        case 'get_consultation_booking': {
            $reference = trim((string) ($input['reference'] ?? ''));
            if ($reference === '') {
                sendJson(400, ['ok' => false, 'error' => 'Missing reference.']);
            }

            $stmt = $pdo->prepare('SELECT * FROM consultation_bookings WHERE reference = :reference LIMIT 1');
            $stmt->execute([':reference' => $reference]);
            $row = $stmt->fetch();

            if (!$row) {
                sendJson(200, ['ok' => true, 'booking' => null]);
            }

            sendJson(200, [
                'ok'      => true,
                'booking' => formatBookingRow($row),
            ]);
        }

        // --------------------------------------------------------------------
        // C. Atomically record verified payment & claim fulfilment lock
        //    Prevents race conditions between browser redirect & Paystack webhook
        // --------------------------------------------------------------------
        case 'claim_consultation_for_fulfilment': {
            $reference = trim((string) ($input['reference'] ?? ''));
            $b = $input['booking'] ?? [];
            if ($reference === '' || empty($b['email']) || empty($b['slotStart'])) {
                sendJson(400, ['ok' => false, 'error' => 'Missing reference or booking payload.']);
            }

            $slotStartIso = (string) $b['slotStart'];
            $slotStartUtc = isoToMysqlUtc($slotStartIso);
            $amountKobo = (int) ($b['feeKobo'] ?? 0);
            $currency = strtoupper(trim((string) ($b['currency'] ?? 'NGN')));
            $formattedAmount = (string) ($input['formattedAmount'] ?? ($currency . ' ' . ($amountKobo / 100)));
            $isPreview = !empty($input['isPreview']) ? 1 : 0;

            $paystackTxId = isset($input['paystackTransactionId']) ? (string) $input['paystackTransactionId'] : null;
            $paystackCustCode = isset($input['paystackCustomerCode']) ? (string) $input['paystackCustomerCode'] : null;
            $paymentChannel = isset($input['paymentChannel']) ? (string) $input['paymentChannel'] : null;
            $paidAtUtc = isoToMysqlUtc(isset($input['paidAt']) ? (string) $input['paidAt'] : null);
            $rawVerifyJson = isset($input['paystackRawResponse'])
                ? (is_string($input['paystackRawResponse'])
                    ? $input['paystackRawResponse']
                    : json_encode($input['paystackRawResponse'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
                : null;

            $pdo->beginTransaction();

            // Ensure the row exists (even if PENDING insert was skipped earlier)
            $upsertStmt = $pdo->prepare(
                'INSERT INTO consultation_bookings (
                    reference, client_name, client_email, organisation, agenda_notes,
                    slot_start_iso, slot_start_utc, time_zone, duration_minutes,
                    amount_kobo, currency, formatted_amount,
                    payment_status, paystack_transaction_id, paystack_customer_code,
                    payment_channel, paid_at, paystack_raw_response,
                    booking_status, is_preview
                ) VALUES (
                    :reference, :client_name, :client_email, :organisation, :agenda_notes,
                    :slot_start_iso, :slot_start_utc, :time_zone, :duration_minutes,
                    :amount_kobo, :currency, :formatted_amount,
                    \'PAID\', :paystack_tx_id, :paystack_cust_code,
                    :payment_channel, :paid_at, :raw_response,
                    \'PENDING\', :is_preview
                )
                ON DUPLICATE KEY UPDATE
                    payment_status = \'PAID\',
                    paystack_transaction_id = COALESCE(:paystack_tx_id_u, paystack_transaction_id),
                    paystack_customer_code = COALESCE(:paystack_cust_code_u, paystack_customer_code),
                    payment_channel = COALESCE(:payment_channel_u, payment_channel),
                    paid_at = COALESCE(paid_at, :paid_at_u),
                    paystack_raw_response = COALESCE(:raw_response_u, paystack_raw_response),
                    updated_at = CURRENT_TIMESTAMP'
            );

            $upsertStmt->execute([
                ':reference'            => $reference,
                ':client_name'          => (string) ($b['name'] ?? ''),
                ':client_email'         => (string) ($b['email'] ?? ''),
                ':organisation'         => (string) ($b['organisation'] ?? ''),
                ':agenda_notes'         => (string) ($b['notes'] ?? ''),
                ':slot_start_iso'       => $slotStartIso,
                ':slot_start_utc'       => $slotStartUtc,
                ':time_zone'            => (string) ($b['timeZone'] ?? 'Africa/Lagos'),
                ':duration_minutes'     => (int) ($b['durationMinutes'] ?? 45),
                ':amount_kobo'          => $amountKobo,
                ':currency'             => $currency,
                ':formatted_amount'     => $formattedAmount,
                ':paystack_tx_id'       => $paystackTxId,
                ':paystack_cust_code'   => $paystackCustCode,
                ':payment_channel'      => $paymentChannel,
                ':paid_at'              => $paidAtUtc,
                ':raw_response'         => $rawVerifyJson,
                ':is_preview'           => $isPreview,
                ':paystack_tx_id_u'     => $paystackTxId,
                ':paystack_cust_code_u' => $paystackCustCode,
                ':payment_channel_u'    => $paymentChannel,
                ':paid_at_u'            => $paidAtUtc,
                ':raw_response_u'       => $rawVerifyJson,
            ]);

            // Lock the row inside the transaction to check fulfilment status
            $lockStmt = $pdo->prepare(
                'SELECT * FROM consultation_bookings WHERE reference = :reference FOR UPDATE'
            );
            $lockStmt->execute([':reference' => $reference]);
            $row = $lockStmt->fetch();

            $bookingStatus = (string) ($row['booking_status'] ?? 'PENDING');
            $alreadyFulfilled = in_array($bookingStatus, ['CONFIRMED', 'MANUAL_FOLLOWUP', 'PROCESSING'], true)
                && !empty($row['calcom_booking_uid']);

            if ($alreadyFulfilled) {
                $pdo->commit();
                sendJson(200, [
                    'ok'               => true,
                    'alreadyFulfilled' => true,
                    'booking'          => formatBookingRow($row),
                ]);
            }

            // Mark as PROCESSING while the caller creates the Cal.com booking
            $claimStmt = $pdo->prepare(
                'UPDATE consultation_bookings
                 SET booking_status = \'PROCESSING\', updated_at = CURRENT_TIMESTAMP
                 WHERE reference = :reference'
            );
            $claimStmt->execute([':reference' => $reference]);

            insertAuditLog($pdo, [
                'reference'  => $reference,
                'eventType'  => 'PAYSTACK_VERIFIED',
                'source'     => (string) ($input['source'] ?? 'server_action'),
                'amountKobo' => $amountKobo,
                'currency'   => $currency,
                'status'     => 'PAID',
                'message'    => 'Payment verified with Paystack; claimed for calendar fulfilment.',
                'payload'    => [
                    'paystackTransactionId' => $paystackTxId,
                    'paymentChannel'        => $paymentChannel,
                    'paidAt'                => $paidAtUtc,
                ],
            ]);

            $pdo->commit();

            sendJson(200, [
                'ok'               => true,
                'alreadyFulfilled' => false,
                'booking'          => formatBookingRow($row),
            ]);
        }

        // --------------------------------------------------------------------
        // D. Finalize consultation fulfilment (Cal.com UID, meeting URL, email)
        // --------------------------------------------------------------------
        case 'record_consultation_completed': {
            $reference = trim((string) ($input['reference'] ?? ''));
            if ($reference === '') {
                sendJson(400, ['ok' => false, 'error' => 'Missing reference.']);
            }

            $bookingUid = trim((string) ($input['bookingUid'] ?? ''));
            $meetingUrl = !empty($input['meetingUrl']) ? trim((string) $input['meetingUrl']) : null;
            $bookingStatus = in_array($input['bookingStatus'] ?? '', ['CONFIRMED', 'MANUAL_FOLLOWUP'], true)
                ? (string) $input['bookingStatus']
                : 'CONFIRMED';
            $emailSent = !empty($input['emailSent']);
            $emailSentAt = $emailSent ? gmdate('Y-m-d H:i:s') : null;

            $stmt = $pdo->prepare(
                'UPDATE consultation_bookings
                 SET booking_status = :booking_status,
                     calcom_booking_uid = :booking_uid,
                     meeting_url = COALESCE(:meeting_url, meeting_url),
                     email_sent_at = COALESCE(email_sent_at, :email_sent_at),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE reference = :reference'
            );
            $stmt->execute([
                ':booking_status' => $bookingStatus,
                ':booking_uid'    => $bookingUid,
                ':meeting_url'    => $meetingUrl,
                ':email_sent_at'  => $emailSentAt,
                ':reference'      => $reference,
            ]);

            insertAuditLog($pdo, [
                'reference'  => $reference,
                'eventType'  => $bookingStatus === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : 'BOOKING_MANUAL_FOLLOWUP',
                'source'     => (string) ($input['source'] ?? 'server_action'),
                'amountKobo' => isset($input['amountKobo']) ? (int) $input['amountKobo'] : null,
                'currency'   => isset($input['currency']) ? (string) $input['currency'] : null,
                'status'     => $bookingStatus,
                'message'    => (string) ($input['message'] ?? 'Consultation booking fulfilment recorded.'),
                'payload'    => [
                    'bookingUid' => $bookingUid,
                    'meetingUrl' => $meetingUrl,
                    'emailSent'  => $emailSent,
                ],
            ]);

            sendJson(200, ['ok' => true]);
        }

        // --------------------------------------------------------------------
        // E. Append standalone regulatory audit log event (e.g. raw webhook)
        // --------------------------------------------------------------------
        case 'record_audit_log': {
            insertAuditLog($pdo, $input);
            sendJson(200, ['ok' => true]);
        }

        // --------------------------------------------------------------------
        // F. Record general contact enquiry (/contact form)
        // --------------------------------------------------------------------
        case 'record_contact_enquiry': {
            $stmt = $pdo->prepare(
                'INSERT INTO contact_enquiries (
                    client_name, client_email, organisation, message,
                    email_delivery_status, email_error_detail, received_at_iso
                ) VALUES (
                    :client_name, :client_email, :organisation, :message,
                    :email_delivery_status, :email_error_detail, :received_at_iso
                )'
            );

            $deliveryStatus = in_array($input['emailDeliveryStatus'] ?? '', ['SENT', 'SKIPPED_DEV', 'FAILED'], true)
                ? (string) $input['emailDeliveryStatus']
                : 'SENT';

            $stmt->execute([
                ':client_name'           => substr(trim((string) ($input['name'] ?? '')), 0, 255),
                ':client_email'          => substr(trim((string) ($input['email'] ?? '')), 0, 255),
                ':organisation'          => substr(trim((string) ($input['organisation'] ?? '')), 0, 255),
                ':message'               => (string) ($input['message'] ?? ''),
                ':email_delivery_status' => $deliveryStatus,
                ':email_error_detail'    => isset($input['emailErrorDetail'])
                    ? substr((string) $input['emailErrorDetail'], 0, 500)
                    : null,
                ':received_at_iso'       => substr((string) ($input['receivedAt'] ?? gmdate('c')), 0, 64),
            ]);

            sendJson(200, ['ok' => true]);
        }

        default:
            sendJson(400, ['ok' => false, 'error' => 'Unsupported action: ' . $action]);
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[cpanel-db-bridge] Error handling action ' . $action . ': ' . $e->getMessage());
    sendJson(500, [
        'ok'    => false,
        'error' => 'Database operation failed on cPanel.',
    ]);
}
