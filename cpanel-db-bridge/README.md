# cPanel MySQL Persistence & Regulatory Audit Bridge

Because your cPanel host (`181.215.243.243`) blocks external connections on port `3306` and Vercel functions run on dynamic IPs, this bridge connects your Next.js app on Vercel to your cPanel MySQL database over **HTTPS (`443`)** with **Bearer + HMAC-SHA256 request signing** and **atomic SQL locking**.

---

## 1. Point a Subdomain to Your cPanel Server (`181.215.243.243`)

1. In your DNS provider (e.g., Cloudflare, Namecheap, Vercel DNS), add an **`A` record**:
   - **Name / Host:** `api` (or `db-api`)
   - **Value / IPv4:** `181.215.243.243`
   - *(If using Cloudflare, set Proxy status to **DNS Only / Grey Cloud** initially so cPanel AutoSSL can issue the certificate, or Full SSL).*
2. In **cPanel → Domains → Create A New Domain**:
   - Enter `api.yourdomain.com`
   - Uncheck *"Share document root"* and set the document root to e.g. `public_html/api` (or `api.yourdomain.com`).
3. In **cPanel → SSL/TLS Status**, run **AutoSSL** for `api.yourdomain.com` so `https://api.yourdomain.com` is secured with HTTPS.

---

## 2. Create the MySQL Database & Import Schema in cPanel

1. Open **cPanel → MySQL® Database Wizard**:
   - Create a database (e.g., `cpaneluser_libertad`).
   - Create a database user (e.g., `cpaneluser_app`) with a strong password.
   - Check **ALL PRIVILEGES** and click **Make Changes**.
2. Open **cPanel → phpMyAdmin**:
   - Select your new database in the left sidebar.
   - Click the **Import** tab (or **SQL** tab) and run [`schema.sql`](./schema.sql).
   - Verify that 3 tables are created:
     - `consultation_bookings`
     - `payment_audit_logs`
     - `contact_enquiries`

---

## 3. Generate Your Shared Secret & Upload `index.php`

1. Generate a 32-byte random secret in your terminal:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Open [`index.php`](./index.php) (or create a `config.local.php` next to it on cPanel) and fill in your credentials:
   ```php
   $config = [
       'db_host'      => '127.0.0.1',
       'db_port'      => '3306',
       'db_name'      => 'cpaneluser_libertad',
       'db_user'      => 'cpaneluser_app',
       'db_pass'      => 'YOUR_DB_PASSWORD',
       'api_secret'   => 'YOUR_GENERATED_64_CHAR_HEX_SECRET',
       'export_token' => '', // Optional separate token for CSV exports; defaults to api_secret
   ];
   ```
3. Upload `index.php` into the document root of `api.yourdomain.com` via **cPanel → File Manager**.
4. Test the health check in your browser:
   ```text
   https://api.yourdomain.com/index.php?health=1
   ```
   It should return:
   ```json
   {"ok":true,"status":"healthy"}
   ```

---

## 4. Add Environment Variables in Vercel & `.env.local`

Add these two variables in **Vercel → Project Settings → Environment Variables** (and in your local `.env.local`):

```env
CPANEL_DB_API_URL="https://api.yourdomain.com/index.php"
CPANEL_DB_API_SECRET="YOUR_GENERATED_64_CHAR_HEX_SECRET"
```

---

## 5. Downloading Regulatory / Compliance CSV Exports

You or your compliance/finance team can download UTF-8 CSV spreadsheets directly in the browser using your `api_secret` (or `export_token` if configured separately):

- **Paid Consultation Bookings:**
  `https://api.yourdomain.com/index.php?export=consultations&token=YOUR_SECRET`
- **Append-Only Payment & Webhook Audit Trail:**
  `https://api.yourdomain.com/index.php?export=audit_logs&token=YOUR_SECRET`
- **General Contact Enquiries:**
  `https://api.yourdomain.com/index.php?export=enquiries&token=YOUR_SECRET`
