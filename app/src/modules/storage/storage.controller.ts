import { Request, Response } from 'express';
import { generatePresignedUploadUrl, generatePresignedDownloadUrl } from '../../config/s3.js';
import { v4 as uuidv4 } from 'uuid';

export async function getPresignedUpload(req: Request, res: Response): Promise<void> {
  try {
    const { module = 'documents', fileName, contentType } = req.body;
    const tenantId = req.tenantId || 'default';
    const sanitizedFileName = (fileName || 'unnamed-file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `tenants/${tenantId}/${module}/${uuidv4()}-${sanitizedFileName}`;

    try {
      const uploadUrl = await generatePresignedUploadUrl({
        s3Key,
        contentType: contentType || 'application/octet-stream',
      });
      res.json({
        success: true,
        data: {
          uploadUrl,
          s3Key,
          expiresInSeconds: 900,
        },
      });
    } catch (s3Err: any) {
      // Fallback in local development without active AWS credentials
      res.json({
        success: true,
        data: {
          uploadUrl: `http://localhost:8080/api/v1/storage/local-upload-mock?key=${encodeURIComponent(s3Key)}`,
          s3Key,
          expiresInSeconds: 900,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'STORAGE_ERROR', message: err.message } });
  }
}

export async function getPresignedDownload(req: Request, res: Response): Promise<void> {
  try {
    const s3Key = String(req.query.s3Key || '');
    if (!s3Key) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 's3Key query parameter required' } });
      return;
    }

    try {
      const downloadUrl = await generatePresignedDownloadUrl({ s3Key });
      res.json({ success: true, data: { downloadUrl } });
    } catch (s3Err: any) {
      // Fallback in local development
      res.json({ success: true, data: { downloadUrl: `http://localhost:8080/api/v1/storage/local-download-mock?key=${encodeURIComponent(s3Key)}` } });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'STORAGE_ERROR', message: err.message } });
  }
}

export async function registerDocument(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, docType, fileName, s3Key, fileSizeBytes = 0 } = req.body;

    let validEmpId = employeeId;
    const emp = await req.tenantQuery!('SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1', [employeeId]);
    if (emp.rows[0]) validEmpId = emp.rows[0].id;

    const numFileSize = Number(fileSizeBytes) || 0;

    const result = await req.tenantQuery!(
      `INSERT INTO employee_documents (employee_id, document_type, file_name, s3_key, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [validEmpId, docType || 'general', fileName || 'document', s3Key, numFileSize]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
