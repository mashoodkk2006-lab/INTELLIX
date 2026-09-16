const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbClient = null;
let dbType = 'unknown';

// Standardized query wrapper returning [rows, meta]
async function query(sql, params = []) {
  if (!dbClient) {
    await initDb();
  }
  return dbClient.query(sql, params);
}

async function initDb() {
  if (dbClient) return dbClient;

  // 1. Try MySQL Connection if configured
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
  const database = process.env.DB_NAME || 'association_portal';
  const port = parseInt(process.env.DB_PORT || '3306');
  const useSsl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('ssl'));
  const sslOptions = useSsl ? { rejectUnauthorized: false } : undefined;

  try {
    const mysql = require('mysql2/promise');
    
    let pool;
    if (process.env.DATABASE_URL) {
      pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: sslOptions,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true
      });
    } else {
      // First try to ensure database exists if permissions allow
      try {
        const adminConn = await mysql.createConnection({
          host,
          port,
          user,
          password,
          ssl: sslOptions,
          connectTimeout: 4000
        });
        await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await adminConn.end();
      } catch (adminErr) {
        // Table or database might already exist or cloud provider restricts CREATE DATABASE
      }

      pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        ssl: sslOptions,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });
    }

    // Test connection
    const [test] = await pool.query('SELECT 1 as connected');
    if (test && test[0].connected === 1) {
      console.log(`[Database] Connected successfully to MySQL (${host}:${port}/${database})`);
      dbType = 'mysql';
      dbClient = {
        type: 'mysql',
        pool,
        query: async (sql, params = []) => {
          const [rows, fields] = await pool.query(sql, params);
          return [rows, fields];
        }
      };

      // Ensure schema tables exist in MySQL
      await initMySQLSchema(pool);
      return dbClient;
    }
  } catch (mysqlErr) {
    console.warn(`[Database] MySQL not reachable (${mysqlErr.message}).`);
  }

  // 2. Fallback to embedded SQLite for instant out-of-the-box local running
  console.log('[Database] Initializing local database fallback (SQLite) for seamless execution...');
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const sqliteFile = path.join(dataDir, 'association_portal.db');
  
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(sqliteFile);

  dbType = 'sqlite';
  dbClient = {
    type: 'sqlite',
    rawDb: db,
    query: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        const trimmed = sql.trim();
        const upper = trimmed.toUpperCase();

        if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('SHOW') || upper.startsWith('DESCRIBE')) {
          db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve([rows || [], []]);
          });
        } else {
          db.run(sql, params, function (err) {
            if (err) return reject(err);
            const result = {
              insertId: this.lastID,
              affectedRows: this.changes
            };
            resolve([result, []]);
          });
        }
      });
    }
  };

  await initSQLiteSchema(dbClient);
  console.log('[Database] Local fallback database ready at ' + sqliteFile);
  return dbClient;
}

async function initMySQLSchema(pool) {
  // Split on semicolons that appear after a line ending (handles multi-line statements)
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[Database] schema.sql not found, skipping MySQL schema init.');
    return;
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  // Remove comment lines, then split on ; followed by optional whitespace/newlines
  const cleaned = schemaSql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleaned
    .split(/;(\s*\n|\s*$)/)
    .map(s => s.trim())
    .filter(s => s.length > 5); // skip empty/whitespace-only chunks

  console.log(`[Database] Running ${statements.length} schema statements on MySQL...`);
  let created = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      created++;
    } catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('Duplicate')) {
        console.warn('[Database] Schema stmt warning:', err.message.substring(0, 120));
      }
    }
  }
  console.log(`[Database] Schema init complete (${created}/${statements.length} statements succeeded).`);

  // Auto-expand image URL columns to LONGTEXT for Base64 image storage
  const alters = [
    'ALTER TABLE events MODIFY COLUMN poster_url LONGTEXT',
    'ALTER TABLE achievements MODIFY COLUMN image_url LONGTEXT',
    'ALTER TABLE event_gallery MODIFY COLUMN image_url LONGTEXT',
    'ALTER TABLE association_members MODIFY COLUMN photo_url LONGTEXT',
    'ALTER TABLE association_members MODIFY COLUMN short_bio TEXT'
  ];
  for (const altSql of alters) {
    try { await pool.query(altSql); } catch (e) {}
  }
}

async function initSQLiteSchema(client) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'registration_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS admin_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL UNIQUE,
      can_view_registrations INTEGER NOT NULL DEFAULT 1,
      can_manage_registrations INTEGER NOT NULL DEFAULT 0,
      can_mark_attendance INTEGER NOT NULL DEFAULT 0,
      can_create_events INTEGER NOT NULL DEFAULT 0,
      can_delete_events INTEGER NOT NULL DEFAULT 0,
      can_generate_certificates INTEGER NOT NULL DEFAULT 0,
      can_manage_admins INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL DEFAULT 'Technical',
      start_datetime DATETIME NOT NULL,
      end_datetime DATETIME NOT NULL,
      venue TEXT NOT NULL,
      description TEXT NOT NULL,
      rules TEXT,
      poster_url TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      registration_open INTEGER NOT NULL DEFAULT 1,
      registration_start DATETIME,
      registration_deadline DATETIME NOT NULL,
      max_participants INTEGER NOT NULL DEFAULT 100,
      participation_type TEXT NOT NULL DEFAULT 'individual',
      max_team_members INTEGER DEFAULT NULL,
      confirmation_message TEXT,
      cert_enabled INTEGER NOT NULL DEFAULT 1,
      cert_title TEXT DEFAULT 'Certificate of Participation',
      cert_description TEXT,
      cert_signatory_name TEXT DEFAULT 'Head of Department',
      cert_signatory_designation TEXT DEFAULT 'HOD & Professor, INTELLIX',
      cert_winner_enabled INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS admin_assigned_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(admin_id, event_id),
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS event_form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      field_label TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      is_required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS event_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_code TEXT NOT NULL UNIQUE,
      event_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      register_number TEXT NOT NULL,
      department TEXT NOT NULL,
      semester TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      team_name TEXT DEFAULT NULL,
      team_members TEXT DEFAULT NULL,
      qr_code_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, register_number),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS registration_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      field_value TEXT,
      FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES event_form_fields(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL UNIQUE,
      event_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unmarked',
      marked_by INTEGER,
      marked_at DATETIME,
      FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_code TEXT NOT NULL UNIQUE,
      registration_id INTEGER NOT NULL UNIQUE,
      event_id INTEGER NOT NULL,
      certificate_type TEXT NOT NULL DEFAULT 'participation',
      title TEXT NOT NULL,
      issue_date DATE NOT NULL,
      pdf_path TEXT,
      qr_code_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (registration_id) REFERENCES event_registrations(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      student_team_name TEXT NOT NULL,
      event_id INTEGER,
      position TEXT NOT NULL,
      event_date DATE NOT NULL,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS event_gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      caption TEXT,
      image_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS association_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      short_bio TEXT,
      photo_url TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS about_us (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'INTELLIX Association',
      subtitle TEXT NOT NULL DEFAULT 'Department of Artificial Intelligence & Machine Learning',
      badge_text TEXT NOT NULL DEFAULT 'ABOUT OUR ASSOCIATION',
      description TEXT NOT NULL,
      purpose TEXT NOT NULL,
      vision TEXT NOT NULL,
      activities TEXT NOT NULL,
      student_engagement TEXT NOT NULL,
      quote_text TEXT DEFAULT 'Igniting Ideas, Inspiring Innovation, Building Intelligence',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT DEFAULT 'Student Coordinator'
    )`
  ];

  for (const tableSql of tables) {
    try {
      await client.query(tableSql);
    } catch (e) {
      console.error('[Database] SQLite Table Init Error:', e.message);
    }
  }

  // Run migrations for existing databases (adds new columns if not present)
  const migrations = [
    `ALTER TABLE events ADD COLUMN participation_type TEXT NOT NULL DEFAULT 'individual'`,
    `ALTER TABLE events ADD COLUMN max_team_members INTEGER DEFAULT NULL`,
    `ALTER TABLE event_registrations ADD COLUMN team_name TEXT DEFAULT NULL`,
    `ALTER TABLE event_registrations ADD COLUMN team_members TEXT DEFAULT NULL`
  ];
  for (const migration of migrations) {
    try {
      await client.query(migration);
    } catch (e) {
      // Column already exists — safe to ignore
    }
  }
}

module.exports = {
  query,
  initDb,
  getDbType: () => dbType
};
