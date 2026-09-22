# AWS Amazon ECR Deployment Guide for HR-Solutions Backend

This guide details how to set up, configure, and operate the GitHub Actions CI/CD pipeline for building and publishing Docker images to **Amazon Elastic Container Registry (ECR)** (and optionally deploying to **Amazon ECS Fargate**).

---

## 🏗️ Pipeline Overview

The workflow is located at [`.github/workflows/backend-deploy.yml`](file:///.github/workflows/backend-deploy.yml).

```mermaid
flowchart LR
    A[Push to main / Dispatch] --> B[Job 1: Quality Gate]
    B -->|npm ci, build, test| C{Tests Passed?}
    C -->|Yes| D[Job 2: Amazon ECR Build & Push]
    D --> E[Configure AWS Auth (OIDC or IAM Keys)]
    E --> F[Amazon ECR Login]
    F --> G[Docker Buildx with GHA Cache]
    G --> H[Push Image Tags: sha, short_sha, latest, timestamp]
    H --> I[Publish Step Summary]
    I --> J{ECS Variables Configured?}
    J -->|Yes| K[Render Task Definition & Deploy to ECS Fargate]
    J -->|No| L[Complete with ECR Pull Command]
```

---

## 1. AWS Prerequisites

### Step A: Create Amazon ECR Repository

Run the following AWS CLI command to create the ECR repository with image scanning enabled:

```bash
aws ecr create-repository \
  --repository-name hr-solutions-backend \
  --image-tag-mutability MUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --region ap-south-1
```

*(Replace `ap-south-1` with your preferred AWS region if different).*

---

### Step B: Configure GitHub Actions OIDC Authentication (Recommended)

Using **OpenID Connect (OIDC)** eliminates the need to store static, long-lived AWS IAM access keys in GitHub.

#### 1. Create OIDC Identity Provider in AWS IAM (Once per AWS account)
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f8d264fcd9
```

#### 2. Create IAM Role for GitHub Actions
Save the following trust policy as `trust-policy.json` (replace `YOUR_GITHUB_ORG_OR_USER/YOUR_REPO` with your repository path, e.g. `iPrq/HR-Solutions`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG_OR_USER/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

Create the role:
```bash
aws iam create-role \
  --role-name GitHubActions-HR-Solutions-ECR-Role \
  --assume-role-policy-document file://trust-policy.json
```

#### 3. Attach ECR Permissions Policy
Save the following as `ecr-permissions.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:DescribeImages"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

Attach the policy:
```bash
aws iam put-role-policy \
  --role-name GitHubActions-HR-Solutions-ECR-Role \
  --policy-name GitHubActions-ECR-Policy \
  --policy-document file://ecr-permissions.json
```

---

## 2. GitHub Repository Configuration

Go to your GitHub Repository **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.

### Repository Secrets (`secrets.*`)

| Secret Name | Required | Default / Fallback | Description | Example |
|---|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | **Yes** | — | AWS IAM Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | — | AWS IAM Secret Access Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | Optional | `ap-south-1` | AWS Region where ECR repository is hosted | `ap-south-1` |
| `ECR_REPOSITORY` | Optional | `hr-solutions-backend` | Name of the Amazon ECR repository | `hr-solutions-backend` |
| `ECS_CLUSTER` | Optional | *(none)* | Amazon ECS Cluster name (if deploying to ECS) | `hr-solutions-prod-cluster` |
| `ECS_SERVICE` | Optional | *(none)* | Amazon ECS Service name (if deploying to ECS) | `hr-solutions-backend-service` |
| `CONTAINER_NAME` | Optional | *(ECS_SERVICE)* | Container name defined in ECS task definition | `hr-solutions-backend` |

---

## 3. How to Trigger the Workflow

### Automatic Trigger
Pushing any backend changes to the `main` or `master` branch automatically triggers the workflow:
- Paths watched: `app/**`

### Manual Trigger (Workflow Dispatch)
1. Go to **GitHub Actions** tab in your repository.
2. Select **Backend CI/CD Pipeline - Amazon ECR Deployment**.
3. Click **Run workflow**:
   - Optionally enter a custom tag (e.g. `v1.0.0` or `staging-test`).
   - Choose target environment (`production` or `staging`).
   - Toggle **Deploy to AWS ECS Fargate** on/off.

---

## 4. Pulling and Running the Image Locally or on Servers

Once pushed, you can pull and run the backend image from anywhere with AWS authorization:

```bash
# 1. Authenticate Docker with Amazon ECR
aws ecr get-login-password --region <AWS_REGION> | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com

# 2. Pull the latest image
docker pull <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/hr-solutions-backend:latest

# 3. Run the container
docker run -d \
  -p 8080:8080 \
  --name hr-backend \
  --env-file app/.env \
  <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/hr-solutions-backend:latest
```
