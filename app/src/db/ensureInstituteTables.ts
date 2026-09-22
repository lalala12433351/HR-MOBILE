import { pool } from '../config/database.js';
import { sanitizeSchemaName } from './queryRunner.js';

/**
 * Ensures that Institute & Academic domain tables exist in the specified tenant schema.
 * Strictly creates empty schema structures with ZERO preloaded/mock data.
 */
export async function ensureInstituteTables(schemaName: string = 'tenant_demo'): Promise<void> {
  const sanitized = sanitizeSchemaName(schemaName);
  const client = await pool.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${sanitized}"`);
    await client.query(`SET search_path TO "${sanitized}", public`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS academic_batches (
          id VARCHAR(64) PRIMARY KEY,
          grade VARCHAR(64) NOT NULL,
          section VARCHAR(64) NOT NULL,
          start_time VARCHAR(16) DEFAULT '08:30',
          end_time VARCHAR(16) DEFAULT '15:30',
          working_days JSONB DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
          max_capacity INTEGER DEFAULT 40,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_grade_section ON academic_batches(grade, section);

      CREATE TABLE IF NOT EXISTS students (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id VARCHAR(64) UNIQUE NOT NULL,
          first_name VARCHAR(64) NOT NULL,
          last_name VARCHAR(64),
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(32),
          date_of_birth DATE,
          gender VARCHAR(32),
          blood_group VARCHAR(16),
          grade VARCHAR(64),
          section VARCHAR(64),
          batch_id VARCHAR(64),
          roll_number VARCHAR(32),
          guardian_name VARCHAR(128),
          guardian_phone VARCHAR(32),
          guardian_email VARCHAR(255),
          address TEXT,
          city VARCHAR(64),
          state_province VARCHAR(64),
          postal_code VARCHAR(32),
          country VARCHAR(64),
          status VARCHAR(32) NOT NULL DEFAULT 'Active',
          account_status VARCHAR(32) NOT NULL DEFAULT 'Activated',
          fees_status VARCHAR(32) NOT NULL DEFAULT 'Paid',
          onboarding_progress INTEGER NOT NULL DEFAULT 100,
          custom_field_values JSONB DEFAULT '{}'::jsonb,
          emergency_contact JSONB DEFAULT '{}'::jsonb,
          uploaded_documents JSONB DEFAULT '[]'::jsonb,
          attendance_stats JSONB DEFAULT '{"totalDays":0,"present":0,"absent":0,"late":0,"percentage":100}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_students_grade_section ON students(grade, section);
      CREATE INDEX IF NOT EXISTS idx_students_batch_id ON students(batch_id);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS has_reset_password BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS timetable_slots (
          id VARCHAR(64) PRIMARY KEY,
          batch_id VARCHAR(64) NOT NULL,
          day_of_week VARCHAR(32) NOT NULL,
          slot_type VARCHAR(16) NOT NULL DEFAULT 'class' CHECK (slot_type IN ('class', 'break')),
          title VARCHAR(128) NOT NULL,
          subject_code VARCHAR(32),
          faculty_name VARCHAR(128),
          room VARCHAR(64),
          start_time VARCHAR(16) NOT NULL,
          end_time VARCHAR(16) NOT NULL,
          color VARCHAR(32) DEFAULT 'blue',
          sync_group_id VARCHAR(128),
          is_recurring_daily BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_timetable_batch_day ON timetable_slots(batch_id, day_of_week);
      CREATE INDEX IF NOT EXISTS idx_timetable_faculty ON timetable_slots(faculty_name);

      CREATE TABLE IF NOT EXISTS student_attendance (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          batch_id VARCHAR(64),
          attendance_date DATE NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'Present' CHECK (status IN ('Present', 'Absent', 'Late', 'Half Day', 'Excused')),
          check_in_time VARCHAR(16),
          check_out_time VARCHAR(16),
          remarks TEXT,
          marked_by_employee_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_student_attendance_day UNIQUE (student_id, attendance_date)
      );

      CREATE INDEX IF NOT EXISTS idx_student_att_date ON student_attendance(attendance_date);
    `);

    await client.query('RESET search_path');
  } finally {
    client.release();
  }
}
