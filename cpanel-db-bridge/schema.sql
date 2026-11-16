-- ============================================================================
-- Libertad Chey — Regulatory & Operational Persistence Schema (cPanel MySQL)
-- Run this script in cPanel -> phpMyAdmin after selecting your database.
-- Compatible with MySQL 5.7+ / 8.0+ and MariaDB 10.3+
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Paid Consultation Bookings (Lifecycle + Financial & Fulfilment State)
CREATE TABLE IF NOT EXISTS `consultation_bookings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(100) NOT NULL,

  -- Client & Session Details
  `client_name` VARCHAR(255) NOT NULL,
  `client_email` VARCHAR(255) NOT NULL,
  `organisation` VARCHAR(255) NOT NULL,
  `agenda_notes` TEXT NOT NULL,
  `slot_start_iso` VARCHAR(64) NOT NULL,
  `slot_start_utc` DATETIME NOT NULL,
  `time_zone` VARCHAR(100) NOT NULL DEFAULT 'Africa/Lagos',
  `duration_minutes` INT UNSIGNED NOT NULL DEFAULT 45,

  -- Financial & Regulatory Fields
  `amount_kobo` BIGINT UNSIGNED NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'NGN',
  `formatted_amount` VARCHAR(64) NOT NULL,
  `payment_status` ENUM('PENDING', 'PAID', 'FAILED', 'ABANDONED') NOT NULL DEFAULT 'PENDING',
  `paystack_transaction_id` VARCHAR(100) DEFAULT NULL,
  `paystack_customer_code` VARCHAR(100) DEFAULT NULL,
  `payment_channel` VARCHAR(64) DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `paystack_raw_response` LONGTEXT DEFAULT NULL,

  -- Calendar Fulfilment & Notification State
  `booking_status` ENUM('PENDING', 'PROCESSING', 'CONFIRMED', 'MANUAL_FOLLOWUP') NOT NULL DEFAULT 'PENDING',
  `calcom_booking_uid` VARCHAR(120) DEFAULT NULL,
  `meeting_url` VARCHAR(500) DEFAULT NULL,
  `email_sent_at` DATETIME DEFAULT NULL,
  `is_preview` TINYINT(1) NOT NULL DEFAULT 0,

  -- Timestamps
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_consultation_reference` (`reference`),
  KEY `idx_consultation_email` (`client_email`),
  KEY `idx_consultation_payment_status` (`payment_status`),
  KEY `idx_consultation_booking_status` (`booking_status`),
  KEY `idx_consultation_slot_start` (`slot_start_utc`),
  KEY `idx_consultation_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. Append-Only Payment & Booking Audit Log (Regulatory Trail)
CREATE TABLE IF NOT EXISTS `payment_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `source` VARCHAR(50) NOT NULL DEFAULT 'server_action',
  `amount_kobo` BIGINT UNSIGNED DEFAULT NULL,
  `currency` VARCHAR(10) DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL,
  `message` VARCHAR(500) DEFAULT NULL,
  `payload_json` LONGTEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_audit_reference` (`reference`),
  KEY `idx_audit_event_type` (`event_type`),
  KEY `idx_audit_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. General Contact Enquiries (/contact Direct Enquiry Form)
CREATE TABLE IF NOT EXISTS `contact_enquiries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `client_name` VARCHAR(255) NOT NULL,
  `client_email` VARCHAR(255) NOT NULL,
  `organisation` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `email_delivery_status` ENUM('SENT', 'SKIPPED_DEV', 'FAILED') NOT NULL DEFAULT 'SENT',
  `email_error_detail` VARCHAR(500) DEFAULT NULL,
  `received_at_iso` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_enquiry_email` (`client_email`),
  KEY `idx_enquiry_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
