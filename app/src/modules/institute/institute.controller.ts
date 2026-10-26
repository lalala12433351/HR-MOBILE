import { Request, Response } from 'express';
import { sendEmail } from '../../config/ses.js';
import { hashPassword } from '../../utils/crypto.js';
import {
  calculateDistanceMeters,
  isGeofenceRequired,
  loadAttendancePolicy,
  selfieLooksPresent,
} from '../attendance/attendancePolicy.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

// =========================================================================
// ACADEMIC BATCHES CONTROLLERS
// =========================================================================

export async function getBatches(req: Request, res: Response): Promise<void> {
  try {
    const result = await req.tenantQuery!(
      `SELECT * FROM academic_batches ORDER BY grade ASC, section ASC, created_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createBatch(req: Request, res: Response): Promise<void> {
  try {
    const { id, grade, section, startTime = '08:30', endTime = '15:30', workingDays, maxCapacity = 40 } = req.body;

    if (!grade) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Grade is required.' } });
      return;
    }

    const secVal = (section || '').trim();
    const secSuffix = secVal ? `_${secVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
    const batchId = id || `batch_${String(grade).toLowerCase().replace(/[^a-z0-9]/g, '_')}${secSuffix}`;
    const daysJson = workingDays ? JSON.stringify(workingDays) : JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

    const result = await req.tenantQuery!(
      `INSERT INTO academic_batches (id, grade, section, start_time, end_time, working_days, max_capacity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true)
       ON CONFLICT (id) DO UPDATE SET
         grade = EXCLUDED.grade,
         section = EXCLUDED.section,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         working_days = EXCLUDED.working_days,
         max_capacity = EXCLUDED.max_capacity,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [batchId, grade.trim(), secVal, startTime, endTime, daysJson, Number(maxCapacity) || 40]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateBatch(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { grade, section, startTime, endTime, workingDays, maxCapacity, isActive } = req.body;

    const updates: string[] = [];
    const params: any[] = [id];

    if (grade !== undefined) {
      params.push(String(grade).trim());
      updates.push(`grade = $${params.length}`);
    }
    if (section !== undefined) {
      params.push(String(section).trim());
      updates.push(`section = $${params.length}`);
    }
    if (startTime !== undefined) {
      params.push(String(startTime).trim());
      updates.push(`start_time = $${params.length}`);
    }
    if (endTime !== undefined) {
      params.push(String(endTime).trim());
      updates.push(`end_time = $${params.length}`);
    }
    if (workingDays !== undefined) {
      params.push(JSON.stringify(workingDays));
      updates.push(`working_days = $${params.length}::jsonb`);
    }
    if (maxCapacity !== undefined) {
      params.push(Number(maxCapacity) || 40);
      updates.push(`max_capacity = $${params.length}`);
    }
    if (isActive !== undefined) {
      params.push(Boolean(isActive));
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      res.json({ success: true, message: 'No updates provided' });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const sql = `UPDATE academic_batches SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await req.tenantQuery!(sql, params);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Batch not found.' } });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteBatch(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await req.tenantQuery!('DELETE FROM academic_batches WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Batch not found.' } });
      return;
    }

    res.json({ success: true, message: 'Batch deleted successfully', data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function bulkSyncBatches(req: Request, res: Response): Promise<void> {
  try {
    const { batches } = req.body;
    if (!Array.isArray(batches)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'batches array required' } });
      return;
    }

    const saved: any[] = [];
    for (const b of batches) {
      const secVal = (b.section || '').trim();
      const secSuffix = secVal ? `_${secVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
      const batchId = b.id || `batch_${String(b.grade || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}${secSuffix}`;
      const daysJson = b.workingDays ? JSON.stringify(b.workingDays) : JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

      const resInsert = await req.tenantQuery!(
        `INSERT INTO academic_batches (id, grade, section, start_time, end_time, working_days, max_capacity, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, true)
         ON CONFLICT (id) DO UPDATE SET
           grade = EXCLUDED.grade,
           section = EXCLUDED.section,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           working_days = EXCLUDED.working_days,
           max_capacity = EXCLUDED.max_capacity,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [batchId, (b.grade || '').trim(), secVal, b.startTime || '08:30', b.endTime || '15:30', daysJson, Number(b.maxCapacity) || 40]
      );
      saved.push(resInsert.rows[0]);
    }

    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

// =========================================================================
// STUDENTS CONTROLLERS
// =========================================================================

export async function getStudents(req: Request, res: Response): Promise<void> {
  try {
    const { grade, section, batchId, status } = req.query;
    let sql = `SELECT * FROM students WHERE 1=1`;
    const params: any[] = [];

    if (grade) {
      params.push(grade);
      sql += ` AND LOWER(grade) = LOWER($${params.length})`;
    }
    if (section) {
      params.push(section);
      sql += ` AND LOWER(section) = LOWER($${params.length})`;
    }
    if (batchId) {
      params.push(batchId);
      sql += ` AND batch_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND LOWER(status) = LOWER($${params.length})`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createStudent(req: Request, res: Response): Promise<void> {
  try {
    const {
      studentId,
      name,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      bloodGroup,
      grade,
      section,
      batchId,
      rollNumber,
      guardianName,
      guardianPhone,
      guardianEmail,
      address,
      city,
      stateProvince,
      postalCode,
      country,
      status = 'Active',
      accountStatus = 'Activated',
      feesStatus = 'Paid',
      onboardingProgress = 100,
      customFieldValues = {},
      emergencyContact = {},
      uploadedDocuments = [],
    } = req.body;

    let fName = firstName;
    let lName = lastName;
    if (!fName && name) {
      const parts = String(name).trim().split(/\s+/);
      fName = parts[0] || 'Student';
      lName = parts.slice(1).join(' ') || '';
    }
    fName = fName || 'Student';
    lName = lName || '';

    const stdId = studentId || `STU-${Math.floor(1000 + Math.random() * 9000)}`;
    const stdEmail = (email || `${stdId.toLowerCase()}@institute.edu`).trim().toLowerCase();

    // Default initial password is the roll number (or student id) when omitted
    const defaultRoll = String(rollNumber || stdId || '').trim();
    const initialPassword = req.body?.password || req.body?.passwordHash || defaultRoll;
    const initialPassHash = hashPassword(String(initialPassword));
    const hasResetPwd = req.body?.hasResetPassword !== undefined ? Boolean(req.body.hasResetPassword) : false;

    const result = await req.tenantQuery!(
      `INSERT INTO students (
        student_id, first_name, last_name, email, phone, date_of_birth, gender, blood_group,
        grade, section, batch_id, roll_number, guardian_name, guardian_phone, guardian_email,
        address, city, state_province, postal_code, country, status, account_status, fees_status,
        onboarding_progress, custom_field_values, emergency_contact, uploaded_documents,
        password_hash, has_reset_password
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $25::jsonb, $26::jsonb, $27::jsonb,
        $28, $29
      )
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        grade = EXCLUDED.grade,
        section = EXCLUDED.section,
        batch_id = EXCLUDED.batch_id,
        roll_number = EXCLUDED.roll_number,
        guardian_name = EXCLUDED.guardian_name,
        guardian_phone = EXCLUDED.guardian_phone,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        stdId,
        fName,
        lName,
        stdEmail,
        phone || null,
        dateOfBirth || null,
        gender || 'Other',
        bloodGroup || null,
        grade || null,
        section || null,
        batchId || null,
        rollNumber || stdId,
        guardianName || null,
        guardianPhone || null,
        guardianEmail || null,
        address || null,
        city || null,
        stateProvince || null,
        postalCode || null,
        country || 'India',
        status,
        accountStatus,
        feesStatus,
        Number(onboardingProgress) || 100,
        JSON.stringify(customFieldValues),
        JSON.stringify(emergencyContact),
        JSON.stringify(uploadedDocuments),
        initialPassHash,
        hasResetPwd,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateStudent(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body;

    const updates: string[] = [];
    const params: any[] = [id];

    if (body.firstName !== undefined || body.name !== undefined) {
      let fName = body.firstName;
      let lName = body.lastName;
      if (!fName && body.name) {
        const parts = String(body.name).trim().split(/\s+/);
        fName = parts[0];
        lName = parts.slice(1).join(' ');
      }
      if (fName !== undefined) {
        params.push(fName);
        updates.push(`first_name = $${params.length}`);
      }
      if (lName !== undefined) {
        params.push(lName);
        updates.push(`last_name = $${params.length}`);
      }
    }

    if (body.email !== undefined) {
      params.push(String(body.email).trim().toLowerCase());
      updates.push(`email = $${params.length}`);
    }
    if (body.phone !== undefined) {
      params.push(body.phone || null);
      updates.push(`phone = $${params.length}`);
    }
    if (body.grade !== undefined) {
      params.push(body.grade || null);
      updates.push(`grade = $${params.length}`);
    }
    if (body.section !== undefined) {
      params.push(body.section || null);
      updates.push(`section = $${params.length}`);
    }
    if (body.batchId !== undefined) {
      params.push(body.batchId || null);
      updates.push(`batch_id = $${params.length}`);
    }
    if (body.rollNumber !== undefined) {
      params.push(body.rollNumber || null);
      updates.push(`roll_number = $${params.length}`);
    }
    if (body.guardianName !== undefined) {
      params.push(body.guardianName || null);
      updates.push(`guardian_name = $${params.length}`);
    }
    if (body.guardianPhone !== undefined) {
      params.push(body.guardianPhone || null);
      updates.push(`guardian_phone = $${params.length}`);
    }
    if (body.status !== undefined) {
      params.push(body.status);
      updates.push(`status = $${params.length}`);
    }
    if (body.accountStatus !== undefined) {
      params.push(body.accountStatus);
      updates.push(`account_status = $${params.length}`);
    }
    if (body.password !== undefined || body.passwordHash !== undefined) {
      const rawPwd = body.password || body.passwordHash;
      const hashed = hashPassword(String(rawPwd));
      params.push(hashed);
      updates.push(`password_hash = $${params.length}`);
    }
    if (body.hasResetPassword !== undefined) {
      params.push(Boolean(body.hasResetPassword));
      updates.push(`has_reset_password = $${params.length}`);
    }
    if (body.feesStatus !== undefined) {
      params.push(body.feesStatus);
      updates.push(`fees_status = $${params.length}`);
    }
    if (body.onboardingProgress !== undefined) {
      params.push(Number(body.onboardingProgress) || 100);
      updates.push(`onboarding_progress = $${params.length}`);
    }
    if (body.customFieldValues !== undefined) {
      params.push(JSON.stringify(body.customFieldValues));
      updates.push(`custom_field_values = $${params.length}::jsonb`);
    }
    if (body.emergencyContact !== undefined) {
      params.push(JSON.stringify(body.emergencyContact));
      updates.push(`emergency_contact = $${params.length}::jsonb`);
    }

    if (updates.length === 0) {
      res.json({ success: true, message: 'No updates provided' });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const whereClause = isUuid(id) ? 'id = $1' : '(student_id = $1 OR id::text = $1)';
    const sql = `UPDATE students SET ${updates.join(', ')} WHERE ${whereClause} RETURNING *`;
    const result = await req.tenantQuery!(sql, params);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found.' } });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteStudent(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const whereClause = isUuid(id) ? 'id = $1' : '(student_id = $1 OR id::text = $1)';
    const result = await req.tenantQuery!(`DELETE FROM students WHERE ${whereClause} RETURNING id`, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found.' } });
      return;
    }

    res.json({ success: true, message: 'Student deleted successfully', data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function bulkSyncStudents(req: Request, res: Response): Promise<void> {
  try {
    const { students } = req.body;
    if (!Array.isArray(students)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'students array required' } });
      return;
    }

    const saved: any[] = [];
    for (const s of students) {
      let fName = s.firstName;
      let lName = s.lastName;
      if (!fName && s.name) {
        const parts = String(s.name).trim().split(/\s+/);
        fName = parts[0] || 'Student';
        lName = parts.slice(1).join(' ') || '';
      }
      fName = fName || 'Student';
      lName = lName || '';

      const stdId = s.studentId || s.id || `STU-${Math.floor(1000 + Math.random() * 9000)}`;
      const stdEmail = (s.email || `${stdId.toLowerCase()}@institute.edu`).trim().toLowerCase();

      const resInsert = await req.tenantQuery!(
        `INSERT INTO students (
          student_id, first_name, last_name, email, phone,
          grade, section, batch_id, roll_number, guardian_name, guardian_phone,
          status, account_status, fees_status, onboarding_progress
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15
        )
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          phone = EXCLUDED.phone,
          grade = EXCLUDED.grade,
          section = EXCLUDED.section,
          batch_id = EXCLUDED.batch_id,
          roll_number = EXCLUDED.roll_number,
          guardian_name = EXCLUDED.guardian_name,
          guardian_phone = EXCLUDED.guardian_phone,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          stdId,
          fName,
          lName,
          stdEmail,
          s.phone || null,
          s.grade || null,
          s.section || null,
          s.batchId || null,
          s.rollNumber || stdId,
          s.guardianName || null,
          s.guardianPhone || null,
          s.status || 'Active',
          s.accountStatus || 'Activated',
          s.feesStatus || 'Paid',
          Number(s.onboardingProgress) || 100,
        ]
      );
      saved.push(resInsert.rows[0]);
    }

    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

// =========================================================================
// TIMETABLE SLOTS CONTROLLERS
// =========================================================================

export async function getTimetableSlots(req: Request, res: Response): Promise<void> {
  try {
    const { batchId, dayOfWeek, facultyName } = req.query;
    let sql = `SELECT * FROM timetable_slots WHERE 1=1`;
    const params: any[] = [];

    if (batchId) {
      params.push(batchId);
      sql += ` AND batch_id = $${params.length}`;
    }
    if (dayOfWeek) {
      params.push(dayOfWeek);
      sql += ` AND LOWER(day_of_week) = LOWER($${params.length})`;
    }
    if (facultyName) {
      params.push(facultyName);
      sql += ` AND LOWER(faculty_name) = LOWER($${params.length})`;
    }

    sql += ` ORDER BY day_of_week ASC, start_time ASC`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createTimetableSlot(req: Request, res: Response): Promise<void> {
  try {
    const {
      id,
      batchId,
      dayOfWeek,
      slotType = 'class',
      type,
      title,
      subjectCode,
      facultyName,
      room,
      startTime,
      endTime,
      color = 'blue',
      syncGroupId,
      isRecurringDaily = false,
    } = req.body;

    if (!batchId || !dayOfWeek || !title || !startTime || !endTime) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'batchId, dayOfWeek, title, startTime, and endTime are required.' },
      });
      return;
    }

    const slotId = id || `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const resolvedType = (type || slotType) === 'break' ? 'break' : 'class';

    const result = await req.tenantQuery!(
      `INSERT INTO timetable_slots (
        id, batch_id, day_of_week, slot_type, title, subject_code, faculty_name,
        room, start_time, end_time, color, sync_group_id, is_recurring_daily
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (id) DO UPDATE SET
        batch_id = EXCLUDED.batch_id,
        day_of_week = EXCLUDED.day_of_week,
        slot_type = EXCLUDED.slot_type,
        title = EXCLUDED.title,
        subject_code = EXCLUDED.subject_code,
        faculty_name = EXCLUDED.faculty_name,
        room = EXCLUDED.room,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        color = EXCLUDED.color,
        sync_group_id = EXCLUDED.sync_group_id,
        is_recurring_daily = EXCLUDED.is_recurring_daily,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        slotId,
        batchId,
        dayOfWeek,
        resolvedType,
        title.trim(),
        subjectCode || null,
        facultyName || null,
        room || null,
        startTime,
        endTime,
        color,
        syncGroupId || null,
        Boolean(isRecurringDaily),
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTimetableSlot(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body;

    const updates: string[] = [];
    const params: any[] = [id];

    if (body.title !== undefined) {
      params.push(String(body.title).trim());
      updates.push(`title = $${params.length}`);
    }
    if (body.subjectCode !== undefined) {
      params.push(body.subjectCode || null);
      updates.push(`subject_code = $${params.length}`);
    }
    if (body.facultyName !== undefined) {
      params.push(body.facultyName || null);
      updates.push(`faculty_name = $${params.length}`);
    }
    if (body.room !== undefined) {
      params.push(body.room || null);
      updates.push(`room = $${params.length}`);
    }
    if (body.startTime !== undefined) {
      params.push(body.startTime);
      updates.push(`start_time = $${params.length}`);
    }
    if (body.endTime !== undefined) {
      params.push(body.endTime);
      updates.push(`end_time = $${params.length}`);
    }
    if (body.color !== undefined) {
      params.push(body.color);
      updates.push(`color = $${params.length}`);
    }
    if (body.slotType !== undefined || body.type !== undefined) {
      const t = (body.type || body.slotType) === 'break' ? 'break' : 'class';
      params.push(t);
      updates.push(`slot_type = $${params.length}`);
    }
    if (body.dayOfWeek !== undefined) {
      params.push(body.dayOfWeek);
      updates.push(`day_of_week = $${params.length}`);
    }
    if (body.batchId !== undefined) {
      params.push(body.batchId);
      updates.push(`batch_id = $${params.length}`);
    }

    if (updates.length === 0) {
      res.json({ success: true, message: 'No updates provided' });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const sql = `UPDATE timetable_slots SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await req.tenantQuery!(sql, params);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Slot not found.' } });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteTimetableSlot(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { deleteSyncGroup } = req.query;

    if (deleteSyncGroup === 'true') {
      const slotRes = await req.tenantQuery!('SELECT sync_group_id FROM timetable_slots WHERE id = $1', [id]);
      const syncGroup = slotRes.rows[0]?.sync_group_id;
      if (syncGroup) {
        await req.tenantQuery!('DELETE FROM timetable_slots WHERE sync_group_id = $1', [syncGroup]);
        res.json({ success: true, message: 'Synced slots deleted successfully', data: { syncGroupId: syncGroup } });
        return;
      }
    }

    const result = await req.tenantQuery!('DELETE FROM timetable_slots WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Slot not found.' } });
      return;
    }

    res.json({ success: true, message: 'Slot deleted successfully', data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function bulkSyncTimetableSlots(req: Request, res: Response): Promise<void> {
  try {
    const { slots, batchId } = req.body;
    if (!Array.isArray(slots)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'slots array required' } });
      return;
    }

    if (batchId) {
      await req.tenantQuery!('DELETE FROM timetable_slots WHERE batch_id = $1', [batchId]);
    }

    const saved: any[] = [];
    for (const s of slots) {
      const slotId = s.id || `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const resolvedType = (s.type || s.slotType) === 'break' ? 'break' : 'class';

      const resInsert = await req.tenantQuery!(
        `INSERT INTO timetable_slots (
          id, batch_id, day_of_week, slot_type, title, subject_code, faculty_name,
          room, start_time, end_time, color, sync_group_id, is_recurring_daily
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (id) DO UPDATE SET
          batch_id = EXCLUDED.batch_id,
          day_of_week = EXCLUDED.day_of_week,
          slot_type = EXCLUDED.slot_type,
          title = EXCLUDED.title,
          subject_code = EXCLUDED.subject_code,
          faculty_name = EXCLUDED.faculty_name,
          room = EXCLUDED.room,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          color = EXCLUDED.color,
          sync_group_id = EXCLUDED.sync_group_id,
          is_recurring_daily = EXCLUDED.is_recurring_daily,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          slotId,
          s.batchId || batchId,
          s.dayOfWeek,
          resolvedType,
          (s.title || 'Period').trim(),
          s.subjectCode || null,
          s.facultyName || null,
          s.room || null,
          s.startTime,
          s.endTime,
          s.color || 'blue',
          s.syncGroupId || null,
          Boolean(s.isRecurringDaily),
        ]
      );
      saved.push(resInsert.rows[0]);
    }

    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

// =========================================================================
// STUDENT ATTENDANCE CONTROLLERS
// =========================================================================

export async function getStudentAttendance(req: Request, res: Response): Promise<void> {
  try {
    let { batchId, date, studentId } = req.query;

    // Self-scoping check: If caller has role 'student', force filter to own student identity
    if (req.user && req.user.role === 'student') {
      const studentLookup = await req.tenantQuery!(
        `SELECT id, student_id FROM students WHERE LOWER(email) = $1 OR student_id = $2 OR id::text = $2 LIMIT 1`,
        [req.user.email?.toLowerCase(), req.user.sub]
      );
      if (studentLookup.rows.length > 0) {
        studentId = studentLookup.rows[0].id;
      }
    }

    let sql = `
      SELECT 
        sa.*,
        s.student_id as student_code,
        s.first_name,
        s.last_name,
        s.grade,
        s.section,
        s.roll_number
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (studentId) {
      params.push(studentId);
      if (isUuid(studentId)) {
        sql += ` AND sa.student_id = $${params.length}`;
      } else {
        sql += ` AND s.student_id = $${params.length}`;
      }
    }
    if (batchId) {
      params.push(batchId);
      sql += ` AND (sa.batch_id = $${params.length} OR s.batch_id = $${params.length})`;
    }
    if (date) {
      params.push(date);
      sql += ` AND sa.attendance_date = $${params.length}`;
    }

    sql += ` ORDER BY sa.attendance_date DESC, s.roll_number ASC`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function recordStudentAttendance(req: Request, res: Response): Promise<void> {
  try {
    let {
      studentId,
      batchId,
      attendanceDate,
      status = 'Present',
      checkInTime,
      checkOutTime,
      remarks,
      latitude,
      longitude,
      selfiePhoto,
    } = req.body;

    // Students may only mark their own attendance
    if (req.user && req.user.role === 'student') {
      const studentLookup = await req.tenantQuery!(
        `SELECT id FROM students WHERE LOWER(email) = $1 OR student_id = $2 OR id::text = $2 LIMIT 1`,
        [req.user.email?.toLowerCase(), req.user.sub]
      );
      if (studentLookup.rows.length === 0) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your student record' },
        });
        return;
      }
      studentId = studentLookup.rows[0].id;
    }

    if (!studentId || !attendanceDate) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'studentId and attendanceDate are required.' } });
      return;
    }

    // Resolve student UUID
    let studentUuid = studentId;
    if (!isUuid(studentId)) {
      const sRes = await req.tenantQuery!('SELECT id FROM students WHERE student_id = $1 OR id::text = $1 LIMIT 1', [studentId]);
      if (sRes.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found.' } });
        return;
      }
      studentUuid = sRes.rows[0].id;
    }

    const policy = await loadAttendancePolicy(req);
    const isCheckOut = Boolean(checkOutTime) && !checkInTime;
    const selfieRequired = isCheckOut ? policy.requireSelfieCheckOut : policy.requireSelfieCheckIn;
    if (selfieRequired && !selfieLooksPresent(selfiePhoto) && req.user?.role === 'student') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SELFIE_REQUIRED',
          message: isCheckOut
            ? 'A check-out selfie is required by attendance policy.'
            : 'A check-in selfie is required by attendance policy.',
        },
      });
      return;
    }

    const officeRes = await req.tenantQuery!(
      `SELECT * FROM offices WHERE is_active = true ORDER BY created_at ASC NULLS LAST LIMIT 1`
    );
    const office = officeRes.rows[0] || null;
    if (isGeofenceRequired(policy, office, false) && req.user?.role === 'student') {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      const officeLat = Number(office?.latitude);
      const officeLng = Number(office?.longitude);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        res.status(400).json({
          success: false,
          error: { code: 'LOCATION_REQUIRED', message: 'Campus GPS coordinates are required to mark attendance.' },
        });
        return;
      }
      if (Number.isFinite(officeLat) && Number.isFinite(officeLng)) {
        const radius = Number(office.geofence_radius_meters) || policy.geofenceRadiusMeters || 150;
        const distance = calculateDistanceMeters(latNum, lngNum, officeLat, officeLng);
        if (distance > radius && policy.outOfRadiusAction === 'Block') {
          res.status(403).json({
            success: false,
            error: {
              code: 'GEOFENCE_VIOLATION',
              message: `Attendance blocked: you are ${distance}m from campus (limit ${radius}m).`,
            },
          });
          return;
        }
      }
    }

    const remarksValue = selfieLooksPresent(selfiePhoto)
      ? `${remarks || ''} [selfie]`.trim()
      : remarks || null;

    const result = await req.tenantQuery!(
      `INSERT INTO student_attendance (
        student_id, batch_id, attendance_date, status, check_in_time, check_out_time, remarks
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      ON CONFLICT (student_id, attendance_date) DO UPDATE SET
        status = EXCLUDED.status,
        check_in_time = COALESCE(EXCLUDED.check_in_time, student_attendance.check_in_time),
        check_out_time = COALESCE(EXCLUDED.check_out_time, student_attendance.check_out_time),
        remarks = COALESCE(EXCLUDED.remarks, student_attendance.remarks),
        batch_id = COALESCE(EXCLUDED.batch_id, student_attendance.batch_id)
      RETURNING *`,
      [studentUuid, batchId || null, attendanceDate, status, checkInTime || null, checkOutTime || null, remarksValue]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function alertGuardians(req: Request, res: Response): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map((id: unknown) => String(id)) : [];
    const message = String(req.body?.message || 'Please review this attendance notice.').slice(0, 2000);
    const subject = String(req.body?.subject || 'Attendance notice').slice(0, 180);
    if (ids.length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Choose at least one student.' } });
      return;
    }
    const result = await req.tenantQuery!(
      `SELECT id, student_id, first_name, last_name, guardian_name, guardian_email
       FROM students
       WHERE id::text = ANY($1::text[]) OR student_id = ANY($1::text[])`,
      [ids]
    );
    const emailed: { id: string; name: string }[] = [];
    const hrNotices: { id: string; name: string; guardianName: string }[] = [];
    for (const row of result.rows) {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Student';
      const email = String(row.guardian_email || '').trim();
      if (email) {
        const safe = message.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
        await sendEmail({ to: email, subject, html: `<p>${safe}</p>`, text: message });
        emailed.push({ id: String(row.id), name });
      } else {
        hrNotices.push({
          id: String(row.id),
          name,
          guardianName: String(row.guardian_name || 'Guardian'),
        });
      }
    }
    res.json({ success: true, data: { emailed, hrNotices } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
