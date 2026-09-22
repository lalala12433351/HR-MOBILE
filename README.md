# Enterprise BOS / HR Solutions Platform

A complete multi-tenant Business Operating System & HRMS platform consisting of:

```text
solutions/
├── hrsolutions/     # Frontend Web Application (React / Next.js / TailwindCSS)
├── app/             # Multi-Tenant Node.js Backend (PostgreSQL, Prisma, Cognito, S3)
└── .github/         # CI/CD Workflows (Amazon ECR & ECS Automated Deployment)
```

---

## 📁 Projects

### 1. Frontend (`hrsolutions/`)
The React/TypeScript frontend application containing the full suite of HRMS dashboards, geofenced attendance tracking, employee directory, leave management, payroll review, and admin controls.

To run the frontend locally:
```bash
cd hrsolutions
npm install
npm run dev
```

### 2. Backend (`app/`)
Enterprise-grade Node.js 20 (TypeScript) backend with schema-per-tenant PostgreSQL isolation, AWS Cognito JWT authentication, AWS S3 KMS presigned storage, and full REST API services.

To run the backend locally:
```bash
cd app
npm install
cp .env.example .env
npm run dev
```

---

## 🚀 CI/CD & Deployment

- **Amazon ECR & ECS Pipeline**: See the full setup guide in [DEPLOYMENT_ECR.md](DEPLOYMENT_ECR.md) for configuring GitHub Actions OIDC and deploying container images to Amazon ECR.
- **Workflow File**: [`.github/workflows/backend-deploy.yml`](.github/workflows/backend-deploy.yml)
