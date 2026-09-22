# S3 document upload setup plan

Saved for later — context from Sep 2026 discussion.

## Current state

- **Avatars** do not use S3. They compress to a data URL and store in `employees.avatar` via identity API.
- **Employee detail / onboarding document uploads** only save metadata (name, size, type, date). File bytes are never uploaded.
- **Documents module** calls `api.storage.registerDocument` with a fake `s3Key`; never PUTs to a presigned URL; download fabricates a local text blob.
- Backend already has S3 presign + register (`app/src/config/s3.ts`, `app/src/modules/storage/`). On S3 failure it falls back to `local-upload-mock` URLs.

## Intended flow (already in `apiClient`)

1. `api.storage.getPresignedUploadUrl({ module, fileName, contentType })`
2. `api.storage.uploadFileToS3(uploadUrl, file)` — browser PUT
3. `api.storage.registerDocument({ employeeId, docType, fileName, s3Key, fileSizeBytes })`
4. Later: `api.storage.getPresignedDownloadUrl(s3Key)`

Object key shape: `tenants/{tenantId}/{module}/{uuid}-{filename}`

Uploads are signed with `ServerSideEncryption: 'aws:kms'`.

## Alternatives considered

| Option | Notes |
|---|---|
| AWS S3 (presigned + KMS) | Best fit; already designed this way |
| MinIO / R2 (S3-compatible) | Good for local; needs endpoint override in `s3Client` (not present today) |
| Google Drive | Partial; Documents module has a Drive tab |
| Postgres bytea / base64 | Avoid for PDFs |
| Local disk on API | Dev-only |

**Recommendation:** Finish S3 wiring in UIs; use real AWS bucket or MinIO for local.

---

## Setup checklist (AWS)

### 1. Create bucket

- Name: e.g. `enterprise-bos-documents-ap-south-1` (globally unique)
- Region: match `AWS_REGION` (repo examples use `ap-south-1`)
- Block all public access
- Default encryption: **SSE-KMS** (`aws/s3` managed key or your CMK)
- Versioning: optional but useful for HR docs

### 2. CORS (required for browser PUT)

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR_FRONTEND_DOMAIN"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 3. IAM policy (scoped)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Sid": "KmsForS3",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:ap-south-1:ACCOUNT_ID:key/KEY_ID"
    }
  ]
}
```

- Local/dev: IAM user + access keys
- Prod: prefer EC2/ECS task role (no long-lived keys)

### 4. Backend env (`app/.env`)

```env
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=your-real-bucket-name
S3_PRESIGNED_EXPIRATION_SECONDS=900
```

Restart API after changes. If creds/S3 fail, controller silently returns mock URLs — check logs.

### 5. Smoke test

1. `POST /api/v1/storage/presigned-upload` → real `amazonaws.com` URL (not `local-upload-mock`)
2. `curl -X PUT` file bytes to `uploadUrl`
3. `POST /api/v1/storage/documents` with returned `s3Key`
4. `GET /api/v1/storage/presigned-download?s3Key=...` → open download URL

### 6. UI work still needed

Wire employee detail, onboarding, and Documents module to: **presign → PUT → register** (and download via presigned GET). Metadata-only handlers in `EmployeeDetailView` / `EmployeeOnboardingView` must be replaced.

### 7. Optional MinIO

Same flow if `S3Client` gains `endpoint` + `forcePathStyle: true`. Not in code today; real AWS S3 works without code changes.

---

## Done when

- [ ] Bucket + SSE-KMS + CORS configured
- [ ] IAM can Put/Get (+ KMS if CMK)
- [ ] `app/.env` points at real bucket
- [ ] Presign returns real S3 URL
- [ ] Manual PUT works
- [ ] Employee / Documents UIs upload real bytes and can download them
