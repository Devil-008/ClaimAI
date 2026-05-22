-- ============================================================
-- Claims Automation Agent - Seed Data
-- Run AFTER 01_schema.sql
-- ============================================================

USE claims_automation_db;

-- ============================================================
-- SEED: users  (one demo user per persona, password = 'password123')
-- In production use bcrypt; here hash is a placeholder marker
-- ============================================================
INSERT INTO users (full_name, email, password_hash, role, phone) VALUES
-- Policyholder
('Arjun Sharma',       'mail.1.dummy.091@gmail.com',     '$2b$12$PLACEHOLDER_HASH_POLICYHOLDER',  'policyholder',     '+91-9800000001'),
('Priya Verma',        'priya@demo.com',      '$2b$12$PLACEHOLDER_HASH_POLICYHOLDER2', 'policyholder',     '+91-9800000002'),
-- Claims Adjuster
('Rahul Mehta',        'rsar7714@gmail.com',      '$2b$12$PLACEHOLDER_HASH_ADJUSTER',      'adjuster',         '+91-9800000003'),
-- SIU Investigator
('Kavita Singh',       'hm859219@gmail.com',     '$2b$12$PLACEHOLDER_HASH_SIU',           'siu_investigator', '+91-9800000004'),
-- Supervisor
('Deepak Nair',        'deepak@demo.com',     '$2b$12$PLACEHOLDER_HASH_SUPERVISOR',    'supervisor',       '+91-9800000005'),
-- IT/Ops
('Anil Gupta',         'anil@demo.com',       '$2b$12$PLACEHOLDER_HASH_ITOPS',         'it_ops',           '+91-9800000006');

-- ============================================================
-- SEED: policies
-- ============================================================
INSERT INTO policies (policy_number, policyholder_id, policy_type, coverage_type, coverage_limit, deductible, premium, effective_date, expiry_date, status, exclusions) VALUES
('POL-2024-AUTO-0001',  1, 'auto',     'Comprehensive Auto Cover',   500000.00, 5000.00, 12000.00, '2024-01-01', '2025-12-31', 'active', 'Intentional damage, racing events'),
('POL-2024-PROP-0001',  1, 'property', 'Home Structure & Contents',  1500000.00, 10000.00, 18000.00, '2024-03-15', '2025-03-14', 'active', 'Flood, earthquake without rider'),
('POL-2024-AUTO-0002',  2, 'auto',     'Third Party Liability',      200000.00, 2000.00,  6000.00,  '2024-06-01', '2025-05-31', 'active', 'Commercial use');

-- ============================================================
-- SEED: claims  (sample pipeline at different stages)
-- ============================================================
INSERT INTO claims (claim_number, policy_id, claimant_id, incident_date, incident_description, claim_type, status, priority, channel, auto_settle_eligible) VALUES
('CLM-2024-0001', 1, 1, '2024-11-10', 'Minor rear-end collision at traffic signal, damage to bumper.', 'auto_accident',    'settled',               'low',      'web',    1),
('CLM-2024-0002', 2, 1, '2024-11-15', 'Roof damage due to heavy storm, tiles displaced.', 'weather',              'damage_assessment',     'medium',   'web',    0),
('CLM-2024-0003', 3, 2, '2024-11-20', 'Vehicle stolen from parking lot overnight.', 'theft',                 'escalated_siu',         'critical', 'mobile', 0),
('CLM-2024-0004', 1, 1, '2024-11-22', 'Windshield crack from road debris.', 'auto_accident',             'settlement_pending',     'low',      'web',    1),
('CLM-2024-0005', 2, 1, '2024-11-25', 'Water pipe burst, flooding the basement.', 'property_damage',          'escalated_adjuster',    'high',     'email',  0);

-- ============================================================
-- SEED: email_configs
-- ============================================================
INSERT INTO email_configs (config_name, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, smtp_use_tls, maintenance_minutes, check_interval_seconds, is_active) VALUES
('default', 'smtp.gmail.com', 587, 'himanshumahata355@gmail.com', '', 'Intelligent Underwriting Assistant <himanshumahata355@gmail.com>', 1, 1, 15, 1);

-- ============================================================
-- SEED: fnol_submissions
-- ============================================================
INSERT INTO fnol_submissions (claim_id, raw_input_type, extracted_entities, intake_status, processed_at) VALUES
(1, 'form',  '{"location":"MG Road, Bengaluru","date":"2024-11-10","parties":["Arjun Sharma","Unknown driver"],"vehicle":"KA-01-AB-1234"}', 'processed', '2024-11-10 10:15:00'),
(2, 'image', '{"location":"Koramangala, Bengaluru","date":"2024-11-15","damage_area":"roof","weather_event":"storm"}',                      'processed', '2024-11-15 09:30:00'),
(3, 'email', '{"location":"Whitefield Parking, Bengaluru","date":"2024-11-20","vehicle":"KA-04-CD-5678","stolen_at":"night"}',              'processed', '2024-11-20 08:00:00'),
(4, 'form',  '{"location":"Outer Ring Road","date":"2024-11-22","damage_type":"windshield","cause":"road debris"}',                         'processed', '2024-11-22 14:20:00'),
(5, 'email', '{"location":"Indiranagar, Bengaluru","date":"2024-11-25","damage_type":"water","cause":"pipe burst"}',                        'processed', '2024-11-25 11:45:00');

-- ============================================================
-- SEED: coverage_verifications
-- ============================================================
INSERT INTO coverage_verifications (claim_id, policy_in_force, coverage_applicable, coverage_limit_applied, deductible_applied, exclusion_triggered, verification_status, verified_at) VALUES
(1, 1, 1, 500000.00, 5000.00, 0, 'verified',  '2024-11-10 10:20:00'),
(2, 1, 1, 1500000.00,10000.00, 0, 'verified',  '2024-11-15 09:35:00'),
(3, 1, 1, 200000.00,  2000.00, 0, 'verified',  '2024-11-20 08:05:00'),
(4, 1, 1, 500000.00,  5000.00, 0, 'verified',  '2024-11-22 14:25:00'),
(5, 1, 0, 1500000.00,10000.00, 1, 'edge_case', '2024-11-25 11:50:00');

-- ============================================================
-- SEED: damage_assessments
-- ============================================================
INSERT INTO damage_assessments (claim_id, assessment_type, severity, estimated_cost, cost_breakdown, assessment_status, assessed_at) VALUES
(1, 'image_cv', 'minor',    12000.00, '{"parts":5000,"labor":5000,"misc":2000}',    'completed', '2024-11-10 10:30:00'),
(2, 'image_cv', 'moderate', 85000.00, '{"materials":60000,"labor":20000,"misc":5000}','completed','2024-11-15 10:00:00'),
(4, 'image_cv', 'minor',     8500.00, '{"parts":6000,"labor":2000,"misc":500}',     'completed', '2024-11-22 14:35:00');

-- ============================================================
-- SEED: fraud_risk_scores
-- ============================================================
INSERT INTO fraud_risk_scores (claim_id, fraud_score, risk_level, red_flags, siu_watchlist_hit, siu_referred, scored_at) VALUES
(1, 0.0520, 'low',      '[]',                                     0, 0, '2024-11-10 10:35:00'),
(2, 0.1200, 'low',      '[]',                                     0, 0, '2024-11-15 10:05:00'),
(3, 0.8700, 'critical', '["repeated_theft","high_value","night"]', 1, 1, '2024-11-20 08:10:00'),
(4, 0.0310, 'low',      '[]',                                     0, 0, '2024-11-22 14:40:00'),
(5, 0.4400, 'medium',   '["policy_exclusion_near_miss"]',         0, 0, '2024-11-25 11:55:00');

-- ============================================================
-- SEED: settlements
-- ============================================================
INSERT INTO settlements (claim_id, gross_amount, deductible_deducted, net_payout, payment_method, payment_reference, payment_status, settled_at) VALUES
(1, 12000.00, 5000.00, 7000.00, 'bank_transfer', 'PAY-2024-001', 'completed', '2024-11-10 11:00:00'),
(4,  8500.00, 5000.00, 3500.00, 'bank_transfer', 'PAY-2024-002', 'pending',   NULL);

-- ============================================================
-- SEED: adjuster_handoffs
-- ============================================================
INSERT INTO adjuster_handoffs (claim_id, adjuster_id, handoff_reason, reasoning_trace, priority, adjuster_status) VALUES
(5, 3, 'edge_case', 'Coverage verification flagged pipe burst may trigger flood exclusion rider. Manual review required.', 'urgent', 'in_review');

-- ============================================================
-- SEED: siu_investigations
-- ============================================================
INSERT INTO siu_investigations (claim_id, investigator_id, investigation_type, findings, status, opened_at) VALUES
(3, 4, 'theft', 'Vehicle theft pattern matches organized ring. CCTV analysis pending. Cross-referencing with SIU watchlist.', 'in_progress', '2024-11-20 09:00:00');

-- ============================================================
-- SEED: kpi_snapshots
-- ============================================================
INSERT INTO kpi_snapshots (snapshot_date, total_claims, auto_settled, escalated_adjuster, escalated_siu, rejected, stp_rate, avg_tat_minutes, avg_fraud_score, csat_score, tool_call_success_rate, p95_latency_ms) VALUES
('2024-11-10', 1, 1, 0, 0, 0, 1.0000, 45.00,  0.0520, 4.50, 0.9980, 1200),
('2024-11-15', 2, 1, 0, 0, 0, 0.5000, 60.00,  0.0860, 4.30, 0.9960, 1350),
('2024-11-20', 3, 1, 0, 1, 0, 0.3333, 75.00,  0.3573, 4.20, 0.9970, 1500),
('2024-11-22', 4, 2, 0, 1, 0, 0.5000, 70.00,  0.2890, 4.25, 0.9975, 1450),
('2024-11-25', 5, 2, 1, 1, 0, 0.4000, 80.00,  0.3126, 4.20, 0.9965, 1550);

-- ============================================================
-- SEED: system_health
-- ============================================================
INSERT INTO system_health (service_name, status, response_time_ms, error_rate, cpu_usage, memory_usage) VALUES
('API Gateway',          'healthy',  45,  0.0010, 22.5, 41.0),
('FNOL Intake Agent',    'healthy',  120, 0.0020, 18.0, 35.5),
('Coverage Verif. Agent','healthy',  85,  0.0000, 12.0, 28.0),
('Damage Assessment',    'degraded', 850, 0.0150, 55.0, 72.0),
('Fraud Scoring Agent',  'healthy',  200, 0.0050, 30.0, 48.0),
('Settlement Agent',     'healthy',  150, 0.0010, 15.0, 32.0),
('Claimant Chatbot',     'healthy',  90,  0.0030, 20.0, 40.0),
('MySQL Database',       'healthy',  10,  0.0000, 8.0,  55.0),
('Payment Gateway',      'healthy',  300, 0.0020, 10.0, 20.0);
