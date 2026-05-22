-- ============================================================
-- Chat History Table - Stores RAG Chat conversations
-- Run AFTER 01_schema.sql and 02_seed_data.sql
-- ============================================================

USE claims_automation_db;

-- ============================================================
-- TABLE: chat_sessions  (Group conversations by session)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    session_name        VARCHAR(255),
    started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_started_at (started_at),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB;

-- ============================================================
-- TABLE: chat_messages  (Individual messages in a session)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id          INT UNSIGNED NOT NULL,
    role                ENUM('user', 'assistant') NOT NULL,
    content             LONGTEXT NOT NULL,
    sources             JSON,
    confidence          DECIMAL(5, 4),
    retrieved_chunks    INT DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_role (role),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- Verification queries
-- ============================================================
-- DESCRIBE chat_sessions;
-- DESCRIBE chat_messages;
-- SELECT * FROM chat_sessions;
-- SELECT * FROM chat_messages WHERE session_id = 1;
