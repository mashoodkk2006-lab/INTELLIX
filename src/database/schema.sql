-- Association Event & Achievement Management Portal Database Schema
-- Compatible with MySQL 8.0+ and cloud MySQL (Render, TiDB, Aiven)

CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    role ENUM('coordinator', 'hod', 'registration_admin') NOT NULL DEFAULT 'registration_admin',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL UNIQUE,
    can_view_registrations TINYINT(1) NOT NULL DEFAULT 1,
    can_manage_registrations TINYINT(1) NOT NULL DEFAULT 0,
    can_mark_attendance TINYINT(1) NOT NULL DEFAULT 0,
    can_create_events TINYINT(1) NOT NULL DEFAULT 0,
    can_delete_events TINYINT(1) NOT NULL DEFAULT 0,
    can_generate_certificates TINYINT(1) NOT NULL DEFAULT 0,
    can_manage_admins TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    event_type VARCHAR(60) NOT NULL DEFAULT 'Technical',
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    venue VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    rules TEXT,
    poster_url LONGTEXT,
    status ENUM('draft', 'published', 'completed', 'cancelled') NOT NULL DEFAULT 'published',
    registration_open TINYINT(1) NOT NULL DEFAULT 1,
    registration_start DATETIME,
    registration_deadline DATETIME NOT NULL,
    max_participants INT NOT NULL DEFAULT 100,
    participation_type ENUM('individual', 'team') NOT NULL DEFAULT 'individual',
    min_team_members INT DEFAULT 2,
    max_team_members INT DEFAULT NULL,
    confirmation_message TEXT,
    cert_enabled TINYINT(1) NOT NULL DEFAULT 1,
    cert_title VARCHAR(180) DEFAULT 'Certificate of Participation',
    cert_description TEXT,
    cert_signatory_name VARCHAR(120) DEFAULT 'Head of Department',
    cert_signatory_designation VARCHAR(120) DEFAULT 'HOD & Professor, INTELLIX',
    cert_winner_enabled TINYINT(1) NOT NULL DEFAULT 1,
    payment_required TINYINT(1) NOT NULL DEFAULT 0,
    registration_fee DECIMAL(10,2) DEFAULT 0,
    payment_qr_url LONGTEXT DEFAULT NULL,
    payment_instructions TEXT DEFAULT NULL,
    upi_id VARCHAR(120) DEFAULT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_assigned_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    event_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_admin_event (admin_id, event_id),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_form_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    field_label VARCHAR(120) NOT NULL,
    field_name VARCHAR(60) NOT NULL,
    field_type ENUM('text', 'number', 'email', 'phone', 'dropdown', 'radio', 'checkbox', 'textarea', 'file') NOT NULL DEFAULT 'text',
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    options_json TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_code VARCHAR(40) NOT NULL UNIQUE,
    event_id INT NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    register_number VARCHAR(40) NOT NULL,
    department VARCHAR(80) NOT NULL,
    semester VARCHAR(20) NOT NULL,
    email VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    team_name VARCHAR(120) DEFAULT NULL,
    team_members TEXT DEFAULT NULL,
    transaction_id VARCHAR(120) DEFAULT NULL,
    payment_screenshot_url LONGTEXT DEFAULT NULL,
    payment_status VARCHAR(30) DEFAULT 'pending',
    qr_code_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_event_participant (event_id, register_number),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registration_field_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_id INT NOT NULL,
    field_id INT NOT NULL,
    field_value TEXT,
    FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES event_form_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_id INT NOT NULL UNIQUE,
    event_id INT NOT NULL,
    status ENUM('present', 'absent', 'unmarked') NOT NULL DEFAULT 'unmarked',
    marked_by INT,
    marked_at TIMESTAMP NULL,
    FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (marked_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certificates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    certificate_code VARCHAR(50) NOT NULL UNIQUE,
    registration_id INT NOT NULL UNIQUE,
    event_id INT NOT NULL,
    certificate_type ENUM('participation', 'winner', 'runner_up', 'merit') NOT NULL DEFAULT 'participation',
    title VARCHAR(180) NOT NULL,
    issue_date DATE NOT NULL,
    pdf_path VARCHAR(255),
    qr_code_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    student_team_name VARCHAR(180) NOT NULL,
    event_id INT,
    position VARCHAR(60) NOT NULL,
    event_date DATE NOT NULL,
    description TEXT,
    image_url LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_gallery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    caption VARCHAR(255),
    image_url LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS association_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    role VARCHAR(80) NOT NULL,
    department VARCHAR(80) NOT NULL,
    short_bio TEXT,
    photo_url LONGTEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS about_us (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL DEFAULT 'INTELLIX Association',
    subtitle VARCHAR(255) NOT NULL DEFAULT 'Department of Artificial Intelligence & Machine Learning',
    badge_text VARCHAR(100) NOT NULL DEFAULT 'ABOUT OUR ASSOCIATION',
    description TEXT NOT NULL,
    purpose TEXT NOT NULL,
    vision TEXT NOT NULL,
    activities TEXT NOT NULL,
    student_engagement TEXT NOT NULL,
    quote_text VARCHAR(255) DEFAULT 'Igniting Ideas, Inspiring Innovation, Building Intelligence',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(120) DEFAULT 'Student Coordinator'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
