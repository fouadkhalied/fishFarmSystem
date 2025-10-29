# Authentication & Authorization Module
## Technical Specification Document v2.0

---

## Table of Contents
1. [Overview](#overview)
2. [Functional Requirements](#functional-requirements)
3. [Architecture](#architecture)
4. [API Standards Compliance](#api-standards-compliance)
5. [Security Specifications](#security-specifications)
6. [API Endpoints](#api-endpoints)
7. [Data Storage](#data-storage)
8. [Background Jobs & Notifications](#background-jobs--notifications)
9. [Error Handling](#error-handling)
10. [Testing Requirements](#testing-requirements)
11. [Monitoring & Observability](#monitoring--observability)

---

## Overview

### Purpose
This module provides secure user authentication and authorization services with Two-Factor Authentication (2FA), background job processing, and real-time notification capabilities for role-based access control.

### Scope
- User login with email/phone and password
- Two-Factor Authentication (2FA) via SMS/Email
- JWT token-based session management
- Role-based access control (RBAC)
- Security event logging and monitoring
- Asynchronous notification delivery (Push, Email, SMS)
- Background security analysis and reporting
- Health monitoring and metrics

### Dependencies
- **Database**: PostgreSQL 14+ (Users DB, Activity Log DB)
- **Cache**: Redis 7+ (OTP sessions, rate limiting, job queues)
- **Job Queue**: BullMQ (Background task processing)
- **External Services**: 
  - Twilio (SMS OTP delivery)
  - SendGrid (Email notifications)
  - Firebase FCM (Push notifications)
  - MaxMind GeoIP (Geolocation)
- **Libraries**: 
  - bcrypt (password hashing)
  - JWT (jsonwebtoken)
  - ioredis (Redis client)
  - @nestjs/bull (Job queue)
  - helmet (Security headers)
  - compression (Response compression)

---

## Functional Requirements

### FR-001: User Authentication with Two-Factor Authentication

#### Description
The system authenticates users using email/phone and password credentials, with mandatory Two-Factor Authentication (2FA) for Admin and Farm Manager roles. Heavy operations are processed asynchronously with real-time notifications.

#### Preconditions
- User has a registered account in the system
- User has access to their registered email or phone for 2FA
- System authentication service is operational
- External services (Twilio/SendGrid/FCM) are available
- Redis cache and job queue are operational

#### Input Parameters

| Parameter | Type | Format | Required | Constraints |
|-----------|------|--------|----------|-------------|
| Email/Phone | String | `email@domain.com` or `+20XXXXXXXXX` | Yes | Valid email format or E.164 phone format |
| Password | String | Alphanumeric + Special chars | Yes | Min 12 characters, bcrypt encrypted |
| OTP Code | String | 6-digit numeric | Yes (for 2FA roles) | Exactly 6 digits |
| X-Request-ID | String | UUID v4 | No (auto-generated) | Request correlation tracking |

#### Authentication Flow

```
┌─────────────┐
│ User Login  │
│   Screen    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ 1. Generate X-Request-ID            │
│    - UUID v4 for request tracking   │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 2. Validate Credentials             │
│    - Check Users DB                  │
│    - Verify bcrypt hash              │
│    - Response: < 1s                  │
└──────────┬──────────────────────────┘
           │
           ├─── Invalid ────► Error: Display message
           │                  Queue: Log failed attempt
           │                  Redis: Increment counter
           │
           ▼ Valid
┌─────────────────────────────────────┐
│ 3. Check 2FA Requirement            │
│    (Admin/Farm Manager)              │
└──────────┬──────────────────────────┘
           │
           ▼ Required
┌─────────────────────────────────────┐
│ 4. Generate OTP + Queue Jobs        │
│    - Generate 6-digit OTP            │
│    - Store in Redis (TTL: 300s)      │
│    - Queue: Send OTP (SMS/Email)     │
│    - Queue: Log generation event     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 5. Return Response (< 200ms)        │
│    - session_id                      │
│    - requires_2fa: true              │
│    - expires_in: 300                 │
│    - X-Request-ID header             │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 6. Background: Send OTP             │
│    Worker processes queued job       │
│    - SMS via Twilio                  │
│    - Email via SendGrid              │
│    - Retry on failure                │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 7. User Enters OTP                  │
│    (5 minute window)                 │
└──────────┬──────────────────────────┘
           │
           ├─── Invalid/Expired ────► Allow resend
           │                           (max 3/hour via Redis)
           │
           ▼ Valid
┌─────────────────────────────────────┐
│ 8. Generate JWT + Queue Jobs        │
│    - Generate JWT (7d expiry)        │
│    - Delete OTP from Redis           │
│    - Queue: Geolocation enrichment   │
│    - Queue: Anomaly detection        │
│    - Queue: Device fingerprinting    │
│    - Queue: Security notification    │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 9. Return Success (< 500ms)         │
│    - JWT token                       │
│    - User profile                    │
│    - X-Request-ID header             │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 10. Background Processing           │
│     - Enrich login with geo data     │
│     - Analyze for anomalies          │
│     - Send push notification         │
│     - Update analytics               │
└─────────────────────────────────────┘
```

#### Output

| Output | Type | Description | Validity |
|--------|------|-------------|----------|
| Access Token | String | JWT authentication token | 7 days |
| User Profile | Object | User basic info (name, role, email) | Session duration |
| Redirect URL | String | Role-specific dashboard URL | Immediate |
| X-Request-ID | String | Request correlation ID | Per request |

#### Performance Requirements

| Metric | Requirement | Measurement Point |
|--------|-------------|-------------------|
| Password Validation | < 1 second | From credential submission to validation complete |
| OTP Generation Response | < 200ms | API response time (job queued) |
| OTP Delivery | < 3 seconds | Background job completion |
| Token Generation Response | < 500ms | API response time (jobs queued) |
| Total Login Flow | < 2 seconds | Synchronous operations only |
| Background Jobs | < 10 seconds | Geolocation + anomaly + notifications |
| Redis Operations | < 5ms | All cache read/write operations |

#### Business Rules

##### BR-001: Failed Login Attempts
- After **3 consecutive failed login attempts**, account is automatically locked
- Lock duration: **15 minutes**
- Counter managed in Redis: `login:attempts:{user_id}`
- Counter resets upon successful login
- Lock applies to the account, not the IP address
- **Background**: Failed attempt logged asynchronously

##### BR-002: OTP Management
- OTP validity: **5 minutes** from generation (Redis TTL)
- OTP resend limit: **3 times per hour** per account (Redis counter)
- Each resend generates a new OTP (previous ones invalidated via Redis overwrite)
- OTP must be 6 digits, cryptographically random
- OTP sessions stored in Redis with auto-expiration
- **Background**: OTP delivery via queue with retry logic

##### BR-003: 2FA Requirements by Role

| Role | 2FA Required | Optional 2FA | Notification Channel |
|------|--------------|--------------|---------------------|
| Admin | ✓ Mandatory | - | Push + Email + SMS |
| Farm Manager | ✓ Mandatory | - | Push + Email + SMS |
| Technician | - | ✓ Available | Push + Email |
| Accountant | - | ✓ Available | Push + Email |

##### BR-004: Password Policy
- Password expiration: **90 days**
- Password history: Cannot reuse last **5 passwords**
- Minimum complexity:
  - 12 characters minimum
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character
- Stored using bcrypt with salt rounds ≥ 12
- **Background**: Password expiry warnings sent 7 days before expiration

##### BR-005: Session Management
- Access token lifetime: **7 days**
- No refresh token mechanism (user must re-authenticate after 7 days)
- 2FA required on every login for Admin and Farm Manager roles
- Token includes: user_id, role, permissions, issued_at, expires_at, jti
- Tokens are stateless (validated via signature)
- Sessions automatically expire after 7 days
- **Background**: Session expiry notifications sent 1 hour before expiration

##### BR-006: Notification Delivery
- **Critical notifications** (account locked, suspicious activity): Push + Email + SMS
- **High-priority** (new login, password changed): Push + Email
- **Medium-priority** (password expiring soon): Email
- **Low-priority** (session expiring): Push (in-app only)
- All notifications queued for async delivery with retry logic
- Delivery failures logged for monitoring

---

## Architecture

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      Client Application                       │
│                    (Web/Mobile/Desktop)                       │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTPS/TLS 1.3
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                       API Gateway                             │
│  - Request ID Generation                                      │
│  - Rate Limiting                                              │
│  - CORS                                                       │
│  - Compression                                                │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   Auth Service (NestJS)                       │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Auth      │  │  Validation  │  │    Guard     │       │
│  │ Controller  │─→│    Layer     │─→│   (RBAC)     │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────────────────────────────────────────┐        │
│  │            Auth Service Layer                    │        │
│  │  - Credential validation                         │        │
│  │  - OTP generation                                │        │
│  │  - JWT signing                                   │        │
│  │  - Job queueing                                  │        │
│  └─────────────────────────────────────────────────┘        │
└──────┬────────────────────┬────────────────────┬────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ PostgreSQL  │    │    Redis     │    │   BullMQ     │
│             │    │              │    │  Job Queue   │
│ - users     │    │ - OTP cache  │    │              │
│ - activity  │    │ - Rate limit │    │ - Notify     │
│ - otp_audit │    │ - Counters   │    │ - Security   │
└─────────────┘    │ - Blacklist  │    │ - Cleanup    │
                   └──────────────┘    │ - Analytics  │
                                       └──────┬───────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Background Workers                         │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Notification │  │   Security   │  │   Cleanup    │      │
│  │   Worker     │  │   Worker     │  │   Worker     │      │
│  │              │  │              │  │              │      │
│  │ - Email      │  │ - Geolocation│  │ - Expired    │      │
│  │ - Push       │  │ - Anomaly    │  │   OTPs       │      │
│  │ - SMS        │  │ - Fingerprint│  │ - Old logs   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                  │                                 │
└─────────┼──────────────────┼─────────────────────────────────┘
          │                  │
          ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│ External Services│  │   Analytics DB   │
│                  │  │  (ClickHouse)    │
│ - Twilio (SMS)   │  │                  │
│ - SendGrid       │  │ - Login metrics  │
│ - Firebase FCM   │  │ - User profiles  │
│ - MaxMind GeoIP  │  │ - Reports        │
└──────────────────┘  └──────────────────┘
```

---

## API Standards Compliance

### ✅ Implemented Standards

#### 1. API Versioning
```
Base URL: https://api.yourdomain.com/v1
All endpoints prefixed: /v1/auth/*
```

#### 2. Request ID Tracking
```typescript
// Auto-generated for every request
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

// Included in all responses
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z",
  ...
}
```

#### 3. Response Format
```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "requestId": "uuid",
  "timestamp": "ISO 8601"
}

// Error Response
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [ ... ]
  },
  "requestId": "uuid",
  "timestamp": "ISO 8601"
}
```

#### 4. HTTP Status Codes
```
200 - OK (GET, verification success)
201 - Created (User registration)
204 - No Content (Logout success)
400 - Bad Request (validation errors)
401 - Unauthorized (invalid credentials)
403 - Forbidden (no permission)
404 - Not Found (user not found)
409 - Conflict (duplicate email)
422 - Unprocessable Entity (business logic errors)
423 - Locked (account locked)
429 - Too Many Requests (rate limit)
500 - Internal Server Error
503 - Service Unavailable (Redis/external service down)
```

#### 5. Security Headers (Helmet)
```typescript
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Referrer-Policy: no-referrer
```

#### 6. CORS Configuration
```typescript
// Production
origin: ['https://yourdomain.com', 'https://app.yourdomain.com']
methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
credentials: true
maxAge: 86400 // 24 hours

// Development
origin: true // Allow all
```

#### 7. Rate Limiting
```typescript
// Global rate limit
100 requests per minute per IP

// Auth-specific limits
POST /v1/auth/login: 10 requests per 15 minutes per IP
POST /v1/auth/verify-otp: 10 requests per 5 minutes per session
POST /v1/auth/resend-otp: 3 requests per hour per user
```

#### 8. Compression (gzip)
```typescript
// All responses compressed
Content-Encoding: gzip
Compression ratio: ~70%
```

#### 9. Content Type
```typescript
Content-Type: application/json; charset=utf-8
Accept: application/json
```

#### 10. DateTime Standards
```typescript
// Always ISO 8601 UTC
"createdAt": "2025-10-28T10:30:00.000Z"
"expiresAt": "2025-11-04T10:30:00.000Z"
```

#### 11. Field Naming
```typescript
// Always camelCase
{
  "userId": "123",
  "sessionId": "abc",
  "createdAt": "...",
  "twoFaEnabled": true
}
```

#### 12. Health Check Endpoint
```typescript
GET /v1/health

Response:
{
  "status": "ok",
  "timestamp": "2025-10-28T10:30:00.000Z",
  "version": "2.0.0",
  "services": {
    "database": {
      "status": "ok",
      "responseTime": 45
    },
    "redis": {
      "status": "ok",
      "responseTime": 3
    },
    "jobQueue": {
      "status": "ok",
      "activeJobs": 12,
      "completedJobs": 1523
    },
    "twilio": {
      "status": "ok",
      "responseTime": 150
    },
    "sendgrid": {
      "status": "ok",
      "responseTime": 120
    }
  }
}
```

#### 13. Idempotency Keys
```typescript
// For critical operations
POST /v1/auth/login
Headers:
  X-Idempotency-Key: uuid-v4

// Prevents duplicate logins within 5 minutes
```

#### 14. Structured Logging
```typescript
{
  "level": "info",
  "message": "User login successful",
  "timestamp": "2025-10-28T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_123",
  "method": "POST",
  "url": "/v1/auth/login",
  "statusCode": 200,
  "responseTime": 156,
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "requires2fa": true,
    "role": "admin"
  }
}
```

---

## Security Specifications

### Password Security
- **Algorithm**: bcrypt
- **Salt Rounds**: 12 (minimum)
- **Storage**: Never store plaintext passwords
- **Transmission**: Always use HTTPS/TLS 1.3+

### JWT Token Structure
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "jti": "token_unique_id",
    "sub": "user_id_uuid",
    "email": "user@example.com",
    "role": "admin",
    "permissions": ["read", "write", "delete"],
    "iat": 1698504000,
    "exp": 1699108800,
    "iss": "yourdomain.com",
    "aud": "api.yourdomain.com"
  },
  "signature": "..."
}
```

### Rate Limiting (Redis-based)
- Login attempts: 3 per 15 minutes per account
- OTP requests: 3 per hour per account
- API endpoints: 100 requests per minute per IP
- All counters managed via Redis with TTL

### Security Headers
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
X-XSS-Protection: 1; mode=block
```

---

## API Endpoints

### Base URL
```
Production: https://api.yourdomain.com/v1
Development: http://localhost:3000/v1
```

### POST /v1/auth/login
Initiates authentication process with credentials.

**Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional, auto-generated if missing)
X-Idempotency-Key: uuid-v4 (optional, recommended)
```

**Request**:
```json
{
  "identifier": "user@example.com",
  "password": "SecurePassword123!",
  "rememberMe": false
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "data": {
    "requires2fa": true,
    "sessionId": "temp-session-uuid",
    "message": "Verification code sent to +20********89",
    "expiresIn": 300
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Error Response (401)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email/phone or password",
    "details": {
      "attemptsRemaining": 2,
      "lockoutDuration": null
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Implementation Notes**:
- Store temporary session in Redis: `otp:session:{session_id}`
- Set TTL to 300 seconds (5 minutes)
- Queue background job for OTP delivery
- Queue background job for failed attempt logging

---

### POST /v1/auth/verify-otp
Validates OTP and completes authentication.

**Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional)
```

**Request**:
```json
{
  "sessionId": "temp-session-uuid",
  "otp": "123456"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "role": "admin",
      "email": "user@example.com",
      "twoFaEnabled": true
    },
    "expiresAt": "2025-11-04T10:30:00.000Z",
    "redirectTo": "/dashboard/admin"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Error Response (400)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_OTP",
    "message": "Invalid verification code",
    "details": {
      "attemptsRemaining": 2,
      "expiresIn": 180
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Implementation Notes**:
- Retrieve session from Redis: `otp:session:{session_id}`
- Delete session from Redis after successful verification
- Queue background jobs:
  - Geolocation enrichment
  - Anomaly detection
  - Device fingerprinting
  - Security notification (new login)
  - Analytics update

---

### POST /v1/auth/resend-otp
Requests new OTP code.

**Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional)
```

**Request**:
```json
{
  "sessionId": "temp-session-uuid",
  "deliveryMethod": "sms"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "data": {
    "message": "Verification code resent",
    "expiresIn": 300,
    "resendsRemaining": 2
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Error Response (429)**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many OTP requests. Please try again later",
    "details": {
      "retryAfter": 3600,
      "retryAfterFormatted": "2025-10-28T11:30:00.000Z"
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**Implementation Notes**:
- Check Redis counter: `otp:resend:{user_id}` (max 3 per hour)
- Increment counter with 3600s TTL
- Generate new OTP and update Redis session
- Queue background job for OTP delivery with retry

---

### POST /v1/auth/logout
Invalidates current session.

**Headers**:
```
Authorization: Bearer {token}
X-Request-ID: uuid-v4 (optional)
```

**Request**:
```json
{
  "allDevices": false
}
```

**Success Response (204)**:
```
No Content
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

**Implementation Notes**:
- Add token JTI to Redis blacklist: `token:blacklist:{jti}` with TTL = token remaining lifetime
- Queue background job for logout logging

---

### GET /v1/health
Health check endpoint for monitoring.

**Success Response (200)**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-28T10:30:00.000Z",
  "version": "2.0.0",
  "uptime": 86400,
  "services": {
    "database": {
      "status": "ok",
      "responseTime": 45,
      "connections": {
        "active": 5,
        "idle": 10,
        "total": 15
      }
    },
    "redis": {
      "status": "ok",
      "responseTime": 3,
      "memory": {
        "used": "124.5 MB",
        "peak": "156.2 MB"
      }
    },
    "jobQueue": {
      "status": "ok",
      "activeJobs": 12,
      "completedJobs": 1523,
      "failedJobs": 3,
      "queues": {
        "notifications": 5,
        "security": 3,
        "cleanup": 0
      }
    },
    "externalServices": {
      "twilio": {
        "status": "ok",
        "responseTime": 150
      },
      "sendgrid": {
        "status": "ok",
        "responseTime": 120
      },
      "fcm": {
        "status": "ok",
        "responseTime": 95
      }
    }
  }
}
```

**Degraded Response (200)**:
```json
{
  "status": "degraded",
  "timestamp": "2025-10-28T10:30:00.000Z",
  "services": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" },
    "jobQueue": { "status": "ok" },
    "externalServices": {
      "twilio": {
        "status": "error",
        "error": "Connection timeout",
        "lastSuccess": "2025-10-28T10:25:00.000Z"
      }
    }
  }
}
```

---

### GET /v1/metrics
Prometheus metrics endpoint (protected, admin only).

**Response** (text/plain):
```
# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/v1/auth/login",status="200",le="0.1"} 1523
http_request_duration_seconds_bucket{method="POST",route="/v1/auth/login",status="200",le="0.5"} 1845
...

# HELP auth_login_total Total number of login attempts
# TYPE auth_login_total counter
auth_login_total{status="success"} 1523
auth_login_total{status="failed"} 45
auth_login_total{status="locked"} 3

# HELP auth_otp_delivery_total Total OTP deliveries
# TYPE auth_otp_delivery_total counter
auth_otp_delivery_total{method="sms",status="success"} 1400
auth_otp_delivery_total{method="sms",status="failed"} 23
auth_otp_delivery_total{method="email",status="success"} 98

# HELP background_job_duration_seconds Background job processing time
# TYPE background_job_duration_seconds histogram
background_job_duration_seconds{job="geolocation",status="completed"} 1234
background_job_duration_seconds{job="anomaly_detection",status="completed"} 987
background_job_duration_seconds{job="notification_email",status="completed"} 2341

# HELP redis_operations_total Total Redis operations
# TYPE redis_operations_total counter
redis_operations_total{operation="get",status="hit"} 45678
redis_operations_total{operation="get",status="miss"} 234
redis_operations_total{operation="set",status="success"} 12345
```

---

## Data Storage

### Database Schema (PostgreSQL)

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    two_fa_enabled BOOLEAN DEFAULT false,
    two_fa_method VARCHAR(10), -- 'sms' or 'email'
    account_locked_until TIMESTAMP, -- Persistent lock if needed
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_history JSONB[], -- stores last 5 password hashes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_role (role)
);
```

#### Activity Log Table
```sql
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'otp_verified', 'otp_failed', etc.
    request_id UUID NOT NULL, -- Correlation with API request
    ip_address INET NOT NULL,
    user_agent TEXT,
    country VARCHAR(2), -- Enriched by background job
    city VARCHAR(100), -- Enriched by background job
    latitude DECIMAL(10, 8), -- Enriched by background job
    longitude DECIMAL(11, 8), -- Enriched by background job
    device_fingerprint VARCHAR(64), -- Enriched by background job
    device_type VARCHAR(20), -- mobile, desktop, tablet
    browser VARCHAR(50),
    os VARCHAR(50),
    is_new_device BOOLEAN DEFAULT false, -- Flagged by background job
    risk_score INTEGER, -- 0-100, calculated by anomaly detection
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_event_type (event_type),
    INDEX idx_request_id (request_id),
    INDEX idx_created_at (created_at),
    INDEX idx_risk_score (risk_score)
);
```

#### OTP Audit Log Table
```sql
CREATE TABLE otp_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'generated', 'verified', 'expired', 'failed', 'resent'
    delivery_method VARCHAR(10), -- 'sms' or 'email'
    delivery_status VARCHAR(20), -- 'pending', 'delivered', 'failed', 'retrying'
    ip_address INET,
    request_id UUID, -- Correlation with API request
    attempts INTEGER DEFAULT 0,
    metadata JSONB, -- additional context (attempts, delivery status, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);
```

#### Notifications Table
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'security_alert', 'password_expiry', etc.
    channel VARCHAR(20) NOT NULL, -- 'push', 'email', 'sms'
    priority VARCHAR(10) NOT NULL, -- 'critical', 'high', 'medium', 'low'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    metadata JSONB, -- device tokens, email delivery info, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
);
```

#### User Devices Table
```sql
CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    device_name VARCHAR(100), -- "iPhone 15 Pro", "Chrome on MacBook"
    device_type VARCHAR(20), -- 'mobile', 'desktop', 'tablet'
    browser VARCHAR(50),
    os VARCHAR(50),
    fcm_token VARCHAR(255), -- For push notifications
    is_trusted BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_fingerprint (device_fingerprint),
    INDEX idx_last_used_at (last_used_at)
);
```

---

### Redis Cache Structure

#### OTP Session
```
Key: otp:session:{session_id}
TTL: 300 seconds (5 minutes)
Value: JSON {
  "user_id": "uuid",
  "otp_code": "123456",
  "created_at": "timestamp",
  "delivery_method": "sms",
  "phone_or_email": "+20XXXXXXXXX"
}
```

#### OTP Attempts Counter
```
Key: otp:attempts:{session_id}
TTL: 300 seconds (expires with OTP)
Value: Integer (0-3)
```

#### OTP Resend Counter
```
Key: otp:resend:{user_id}
TTL: 3600 seconds (1 hour)
Value: Integer (0-3)
```

#### Failed Login Attempts
```
Key: login:attempts:{user_id}
TTL: 900 seconds (15 minutes)
Value: Integer (0-3)
```

#### Account Lock
```
Key: account:locked:{user_id}
TTL: 900 seconds (15 minutes)
Value: Boolean (true)
```

#### Token Blacklist
```
Key: token:blacklist:{token_jti}
TTL: Remaining token lifetime
Value: Boolean (true)
```

#### API Rate Limiting
```
Key: ratelimit:api:{ip_address}
TTL: 60 seconds (1 minute)
Value: Integer (request count)
```

#### Idempotency Keys
```
Key: idempotency:{key}
TTL: 300 seconds (5 minutes)
Value: JSON {
  "response": { ... },
  "status": 200
}
```

#### User Session Cache
```
Key: session:user:{user_id}
TTL: 300 seconds (5 minutes)
Value: JSON {
  "id": "uuid",
  "email": "user@example.com",
  "role": "admin",
  "permissions": [...],
  "last_activity": "timestamp"
}
```

---

## Background Jobs & Notifications

### Job Queue Architecture

#### Queue Configuration
```typescript
// BullMQ Queue Definitions
const queues = {
  'auth:notifications:email': {
    priority: 'high',
    concurrency: 5,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  },
  'auth:notifications:push': {
    priority: 'high',
    concurrency: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  },
  'auth:notifications:sms': {
    priority: 'medium',
    concurrency: 5,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  },
  'auth:security:analysis': {
    priority: 'medium',
    concurrency: 3,
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 }
  },
  'auth:security:geolocation': {
    priority: 'medium',
    concurrency: 10,
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 }
  },
  'auth:cleanup:expired': {
    priority: 'low',
    concurrency: 1,
    attempts: 1
  },
  'auth:analytics:aggregation': {
    priority: 'low',
    concurrency: 2,
    attempts: 1
  }
};
```

---

### Phase 1: Critical Background Jobs (Launch Blockers)

#### Job 1: Email Notification Delivery
**Queue**: `auth:notifications:email`  
**Priority**: High  
**Estimated Time**: 1-3 seconds  
**Concurrency**: 5 workers  

**Trigger Events**:
- Account locked
- New login detected
- Password changed
- Password expiring (7 days warning)
- Security alert
- OTP delivery fallback

**Job Payload**:
```typescript
{
  jobId: "email_notification_uuid",
  userId: "user_uuid",
  type: "security_alert",
  recipient: "user@example.com",
  template: "new_login_detected",
  data: {
    deviceName: "iPhone 15 Pro",
    location: "Cairo, Egypt",
    timestamp: "2025-10-28T10:30:00.000Z",
    ipAddress: "196.xxx.xxx.xxx"
  },
  priority: "high",
  retries: 3
}
```

**Processing Logic**:
```typescript
async processEmailNotification(job) {
  try {
    // 1. Fetch user notification preferences
    const user = await getUserPreferences(job.data.userId);
    
    // 2. Check if email notifications enabled
    if (!user.emailNotificationsEnabled) {
      return { skipped: true, reason: 'User preference' };
    }
    
    // 3. Render email template
    const html = await renderTemplate(job.data.template, job.data.data);
    
    // 4. Send via SendGrid
    const result = await sendgrid.send({
      to: job.data.recipient,
      from: 'security@yourdomain.com',
      subject: getSubject(job.data.type),
      html: html
    });
    
    // 5. Update notification status in DB
    await updateNotificationStatus(job.jobId, 'delivered', {
      messageId: result.messageId,
      deliveredAt: new Date()
    });
    
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    // Log error
    logger.error('Email notification failed', { 
      jobId: job.id, 
      error: error.message 
    });
    
    // Update notification status
    await updateNotificationStatus(job.jobId, 'failed', {
      error: error.message,
      retryCount: job.attemptsMade
    });
    
    throw error; // Retry via BullMQ
  }
}
```

**Success Metrics**:
- Delivery rate: > 99%
- Average processing time: < 2s
- Retry success rate: > 95%

---

#### Job 2: Push Notification Delivery
**Queue**: `auth:notifications:push`  
**Priority**: High  
**Estimated Time**: 500ms-2 seconds  
**Concurrency**: 10 workers  

**Trigger Events**:
- New login detected
- Account locked
- Suspicious activity
- Session expiring (1 hour warning)
- OTP delivery failure fallback

**Job Payload**:
```typescript
{
  jobId: "push_notification_uuid",
  userId: "user_uuid",
  type: "new_login",
  title: "New Login Detected",
  body: "Your account was accessed from iPhone in Cairo",
  data: {
    type: "security_alert",
    action: "view_activity",
    timestamp: "2025-10-28T10:30:00.000Z"
  },
  priority: "high",
  badge: 1,
  sound: "default"
}
```

**Processing Logic**:
```typescript
async processPushNotification(job) {
  try {
    // 1. Get user's FCM tokens (all devices)
    const devices = await getUserDevices(job.data.userId);
    
    if (devices.length === 0) {
      return { skipped: true, reason: 'No registered devices' };
    }
    
    // 2. Prepare FCM message
    const message = {
      notification: {
        title: job.data.title,
        body: job.data.body
      },
      data: job.data.data,
      tokens: devices.map(d => d.fcmToken)
    };
    
    // 3. Send via Firebase FCM (batch)
    const result = await fcm.sendMulticast(message);
    
    // 4. Handle invalid tokens
    const failedTokens = result.responses
      .map((resp, idx) => resp.success ? null : devices[idx].fcmToken)
      .filter(token => token !== null);
    
    if (failedTokens.length > 0) {
      await removeInvalidTokens(failedTokens);
    }
    
    // 5. Update notification status
    await updateNotificationStatus(job.jobId, 'delivered', {
      successCount: result.successCount,
      failureCount: result.failureCount,
      deliveredAt: new Date()
    });
    
    return { 
      success: true, 
      sent: result.successCount,
      failed: result.failureCount 
    };
    
  } catch (error) {
    logger.error('Push notification failed', { 
      jobId: job.id, 
      error: error.message 
    });
    
    await updateNotificationStatus(job.jobId, 'failed', {
      error: error.message
    });
    
    throw error; // Retry
  }
}
```

**Success Metrics**:
- Delivery rate: > 97%
- Average processing time: < 1s
- Invalid token cleanup: Automatic

---

#### Job 3: Geolocation Enrichment
**Queue**: `auth:security:geolocation`  
**Priority**: Medium  
**Estimated Time**: 500ms-2 seconds  
**Concurrency**: 10 workers  

**Trigger Events**:
- Successful login (after JWT generation)
- Failed login (for analysis)

**Job Payload**:
```typescript
{
  jobId: "geolocation_uuid",
  activityLogId: "activity_log_uuid",
  ipAddress: "196.xxx.xxx.xxx",
  requestId: "550e8400-e29b-41d4-a716-446655440000"
}
```

**Processing Logic**:
```typescript
async processGeolocation(job) {
  try {
    // 1. Check cache first
    const cached = await redis.get(`geo:${job.data.ipAddress}`);
    if (cached) {
      await updateActivityLog(job.data.activityLogId, JSON.parse(cached));
      return { success: true, source: 'cache' };
    }
    
    // 2. Call MaxMind GeoIP API
    const geoData = await maxmind.lookup(job.data.ipAddress);
    
    // 3. Extract relevant data
    const enrichment = {
      country: geoData.country.iso_code,
      city: geoData.city.names.en,
      latitude: geoData.location.latitude,
      longitude: geoData.location.longitude,
      timezone: geoData.location.time_zone
    };
    
    // 4. Cache for 24 hours
    await redis.setex(
      `geo:${job.data.ipAddress}`, 
      86400, 
      JSON.stringify(enrichment)
    );
    
    // 5. Update activity log
    await updateActivityLog(job.data.activityLogId, enrichment);
    
    return { success: true, source: 'api', data: enrichment };
    
  } catch (error) {
    logger.warn('Geolocation enrichment failed', { 
      jobId: job.id, 
      error: error.message 
    });
    
    // Non-critical: Don't retry aggressively
    return { success: false, error: error.message };
  }
}
```

**Success Metrics**:
- Cache hit rate: > 80%
- API response time: < 500ms
- Enrichment rate: > 95%

---

#### Job 4: Anomaly Detection Analysis
**Queue**: `auth:security:analysis`  
**Priority**: Medium  
**Estimated Time**: 1-3 seconds  
**Concurrency**: 3 workers  

**Trigger Events**:
- Successful login (after geolocation enrichment)

**Job Payload**:
```typescript
{
  jobId: "anomaly_detection_uuid",
  userId: "user_uuid",
  activityLogId: "activity_log_uuid",
  loginData: {
    ipAddress: "196.xxx.xxx.xxx",
    country: "EG",
    city: "Cairo",
    deviceFingerprint: "abc123...",
    timestamp: "2025-10-28T10:30:00.000Z"
  }
}
```

**Processing Logic**:
```typescript
async processAnomalyDetection(job) {
  try {
    const { userId, loginData } = job.data;
    
    // 1. Fetch user's historical login data (last 30 days)
    const history = await getLoginHistory(userId, 30);
    
    // 2. Calculate risk factors
    const riskFactors = {
      newLocation: !history.countries.includes(loginData.country),
      newDevice: !history.deviceFingerprints.includes(loginData.deviceFingerprint),
      unusualTime: isUnusualLoginTime(loginData.timestamp, history.loginTimes),
      rapidGeoChange: checkRapidGeoChange(loginData, history.lastLogin),
      suspiciousIP: await checkIPReputation(loginData.ipAddress)
    };
    
    // 3. Calculate risk score (0-100)
    const riskScore = calculateRiskScore(riskFactors);
    
    // 4. Update activity log with risk score
    await updateActivityLog(job.data.activityLogId, {
      risk_score: riskScore,
      is_new_device: riskFactors.newDevice
    });
    
    // 5. Trigger security notification if high risk
    if (riskScore > 70) {
      await queueJob('auth:notifications:email', {
        userId: userId,
        type: 'suspicious_activity',
        template: 'security_alert',
        data: {
          riskScore: riskScore,
          factors: riskFactors,
          loginData: loginData
        },
        priority: 'critical'
      });
      
      await queueJob('auth:notifications:push', {
        userId: userId,
        type: 'security_alert',
        title: 'Suspicious Activity Detected',
        body: `Unusual login from ${loginData.city}. Was this you?`,
        priority: 'high'
      });
    }
    
    // 6. If new device, send notification
    if (riskFactors.newDevice && riskScore < 70) {
      await queueJob('auth:notifications:email', {
        userId: userId,
        type: 'new_device',
        template: 'new_login_detected',
        data: loginData,
        priority: 'high'
      });
    }
    
    return { 
      success: true, 
      riskScore: riskScore,
      triggered: riskScore > 70 ? 'alert' : riskFactors.newDevice ? 'notification' : 'none'
    };
    
  } catch (error) {
    logger.error('Anomaly detection failed', { 
      jobId: job.id, 
      error: error.message 
    });
    
    // Non-critical: Log and continue
    return { success: false, error: error.message };
  }
}

// Helper function
function calculateRiskScore(factors) {
  let score = 0;
  if (factors.newLocation) score += 20;
  if (factors.newDevice) score += 15;
  if (factors.unusualTime) score += 25;
  if (factors.rapidGeoChange) score += 30;
  if (factors.suspiciousIP) score += 40;
  return Math.min(score, 100);
}
```

**Success Metrics**:
- Processing time: < 3s
- False positive rate: < 5%
- Detection accuracy: > 95%

---

### Phase 2: Important Background Jobs (Post-Launch)

#### Job 5: Device Fingerprinting
**Queue**: `auth:security:analysis`  
**Priority**: Medium  
**Estimated Time**: 300ms-1 second  

**Trigger**: After successful login

**Processing**:
```typescript
async processDeviceFingerprint(job) {
  const { userId, userAgent, ipAddress } = job.data;
  
  // Parse user agent
  const parsed = parseUserAgent(userAgent);
  
  // Generate fingerprint
  const fingerprint = generateFingerprint({
    browser: parsed.browser,
    os: parsed.os,
    ipAddress: ipAddress
  });
  
  // Check if device exists
  const existingDevice = await findDevice(userId, fingerprint);
  
  if (!existingDevice) {
    // New device - store it
    await createDevice({
      userId: userId,
      deviceFingerprint: fingerprint,
      deviceName: `${parsed.browser} on ${parsed.os}`,
      deviceType: parsed.deviceType,
      browser: parsed.browser,
      os: parsed.os
    });
    
    return { newDevice: true, fingerprint };
  } else {
    // Update last used
    await updateDeviceLastUsed(existingDevice.id);
    return { newDevice: false, fingerprint };
  }
}
```

---

#### Job 6: SMS Notification Retry
**Queue**: `auth:notifications:sms`  
**Priority**: Medium  
**Estimated Time**: 1-3 seconds  

**Trigger**: Twilio delivery failure

**Processing**:
```typescript
async processSMSRetry(job) {
  try {
    const { phoneNumber, message, otpCode } = job.data;
    
    // Attempt SMS delivery
    const result = await twilio.messages.create({
      body: message,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    
    if (result.status === 'queued' || result.status === 'sent') {
      await updateOTPAuditLog(job.data.otpSessionId, {
        delivery_status: 'delivered',
        sent_at: new Date()
      });
      return { success: true, messageId: result.sid };
    }
    
    throw new Error(`SMS delivery failed: ${result.errorMessage}`);
    
  } catch (error) {
    // After 3 attempts, fallback to email
    if (job.attemptsMade >= 3) {
      await queueJob('auth:notifications:email', {
        userId: job.data.userId,
        type: 'otp_fallback',
        template: 'otp_email',
        data: { otpCode: job.data.otpCode },
        priority: 'high'
      });
      
      return { success: false, fallback: 'email' };
    }
    
    throw error; // Retry
  }
}
```

---

### Phase 3: Cleanup & Maintenance Jobs

#### Job 7: Expired OTP Cleanup
**Queue**: `auth:cleanup:expired`  
**Priority**: Low  
**Schedule**: Hourly cron  

**Processing**:
```typescript
async cleanupExpiredOTPs() {
  // Delete OTP audit logs older than 90 days
  const deleted = await db.otp_audit_log.delete({
    where: {
      created_at: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
    }
  });
  
  logger.info(`Cleaned up ${deleted.count} expired OTP records`);
  return { deleted: deleted.count };
}
```

---

#### Job 8: Security Report Generation
**Queue**: `auth:analytics:aggregation`  
**Priority**: Low  
**Schedule**: Weekly (Sunday at 2 AM)  

**Processing**:
```typescript
async generateSecurityReport(job) {
  const { userId, startDate, endDate } = job.data;
  
  // Aggregate login activity
  const stats = await db.activity_log.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: startDate, lte: endDate }
    },
    _count: { event_type: true },
    _max: { risk_score: true },
    _avg: { risk_score: true }
  });
  
  // Generate PDF report
  const pdf = await generatePDF({
    template: 'security_report',
    data: {
      user: await getUser(userId),
      stats: stats,
      loginLocations: await getUniqueLoginLocations(userId, startDate, endDate),
      newDevices: await getNewDevices(userId, startDate, endDate),
      failedAttempts: stats._count.failed_login || 0
    }
  });
  
  // Send via email
  await queueJob('auth:notifications:email', {
    userId: userId,
    type: 'security_report',
    template: 'report_delivery',
    data: { reportUrl: pdf.url },
    priority: 'low'
  });
  
  return { success: true, reportUrl: pdf.url };
}
```

---

### Notification Types Configuration

```typescript
const NOTIFICATION_TYPES = {
  // Critical Security Notifications
  ACCOUNT_LOCKED: {
    channels: ['push', 'email', 'sms'],
    priority: 'critical',
    template: {
      push: {
        title: 'Account Locked',
        body: 'Your account was locked due to multiple failed login attempts'
      },
      email: 'account_locked',
      sms: 'Your account was locked. Contact support if this wasn't you.'
    }
  },
  
  SUSPICIOUS_ACTIVITY: {
    channels: ['push', 'email'],
    priority: 'high',
    template: {
      push: {
        title: 'Suspicious Activity Detected',
        body: 'Unusual login activity detected. Review now.'
      },
      email: 'security_alert'
    }
  },
  
  NEW_LOGIN: {
    channels: ['push', 'email'],
    priority: 'high',
    template: {
      push: {
        title: 'New Login Detected',
        body: 'Your account was accessed from {{device}} in {{location}}'
      },
      email: 'new_login_detected'
    }
  },
  
  PASSWORD_CHANGED: {
    channels: ['push', 'email'],
    priority: 'high',
    template: {
      push: {
        title: 'Password Changed',
        body: 'Your password was successfully changed'
      },
      email: 'password_changed'
    }
  },
  
  TWO_FA_DISABLED: {
    channels: ['push', 'email', 'sms'],
    priority: 'high',
    template: {
      push: {
        title: 'Two-Factor Authentication Disabled',
        body: 'Two-factor authentication was disabled on your account'
      },
      email: '2fa_disabled',
      sms: '2FA was disabled on your account. Contact support if this wasn't you.'
    }
  },
  
  // Operational Notifications
  PASSWORD_EXPIRY_WARNING: {
    channels: ['email', 'push'],
    priority: 'medium',
    schedule: '7_days_before',
    template: {
      push: {
        title: 'Password Expiring Soon',
        body: 'Your password will expire in 7 days'
      },
      email: 'password_expiry_warning'
    }
  },
  
  SESSION_EXPIRING: {
    channels: ['push'],
    priority: 'low',
    schedule: '1_hour_before',
    template: {
      push: {
        title: 'Session Expiring',
        body: 'Your session will expire in 1 hour. Please login again.'
      }
    }
  },
  
  OTP_DELIVERY_FAILED: {
    channels: ['push'],
    priority: 'medium',
    template: {
      push: {
        title: 'Verification Code Sent',
        body: 'Unable to send SMS. Verification code sent via email.'
      }
    }
  }
};
```

---

## Error Handling

### Standard Error Response Format

```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      // Additional context
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

### Error Codes Reference

| Code | HTTP Status | Description | Retry |
|------|-------------|-------------|-------|
| INVALID_CREDENTIALS | 401 | Wrong username/password | No |
| ACCOUNT_LOCKED | 423 | Too many failed attempts | Wait 15min |
| OTP_EXPIRED | 400 | Verification code expired | Request new OTP |
| INVALID_OTP | 400 | Wrong verification code | Yes (3 attempts) |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | Wait (see retry-after) |
| SERVICE_UNAVAILABLE | 503 | External service down | Yes (exponential backoff) |
| PASSWORD_EXPIRED | 403 | Password needs reset | No |
| INVALID_SESSION | 400 | Session ID not found | Restart login |
| REDIS_CONNECTION_FAILED | 503 | Redis cache unavailable | Yes (retry) |
| VALIDATION_ERROR | 400 | Input validation failed | No |
| TOKEN_EXPIRED | 401 | JWT token expired | Restart login |
| TOKEN_INVALID | 401 | JWT token invalid/tampered | Restart login |
| INSUFFICIENT_PERMISSIONS | 403 | User lacks required permissions | No |

### Exception Handling Details

#### EX-001: Invalid Credentials
**Scenario**: Username/password combination not found or incorrect

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email/phone or password",
    "details": {
      "attemptsRemaining": 2,
      "lockoutDuration": null
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 401 Unauthorized

**Actions**:
- Increment Redis counter: `login:attempts:{user_id}`
- Do not reveal whether email or password was incorrect (security)
- Queue background job for failed attempt logging
- If attempts >= 3, lock account and send notifications

---

#### EX-002: Account Locked
**Scenario**: User exceeds maximum failed login attempts

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked due to multiple failed login attempts",
    "details": {
      "lockedUntil": "2025-10-28T14:30:00.000Z",
      "contactSupport": "support@yourdomain.com"
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 423 Locked

**Actions**:
- Set Redis key: `account:locked:{user_id}` with 900s TTL
- Queue background jobs:
  - Send push notification (critical)
  - Send email notification (critical)
  - Send SMS notification (critical)
  - Log security event

---

#### EX-003: Expired OTP
**Scenario**: User enters OTP after 5-minute window (Redis TTL expired)

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "OTP_EXPIRED",
    "message": "Verification code has expired",
    "details": {
      "canResend": true,
      "resendsRemaining": 2
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 400 Bad Request

**Actions**:
- Offer "Resend Code" button in UI
- Check Redis counter: `otp:resend:{user_id}` (max 3/hour)
- Queue background job for OTP audit logging

---

#### EX-004: Invalid OTP
**Scenario**: User enters incorrect OTP code

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_OTP",
    "message": "Invalid verification code",
    "details": {
      "attemptsRemaining": 2,
      "expiresIn": 180
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 400 Bad Request

**Actions**:
- Increment Redis counter: `otp:attempts:{session_id}`
- Allow up to 3 attempts per OTP
- After 3 failed attempts, delete OTP from Redis
- Queue background job for audit logging

---

#### EX-005: Rate Limit Exceeded
**Scenario**: User requests more than allowed within time window

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later",
    "details": {
      "retryAfter": 3600,
      "retryAfterFormatted": "2025-10-28T11:30:00.000Z",
      "limit": 3,
      "window": "1 hour"
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 429 Too Many Requests

**Headers**:
```
Retry-After: 3600
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1730113800
```

**Actions**:
- Block further requests until Redis rate limit key expires
- Queue background job for suspicious activity logging
- Consider security alert if repeated violations

---

#### EX-006: Service Unavailable
**Scenario**: External service (Twilio/SendGrid/Redis) is down

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable. Please try again",
    "details": {
      "service": "sms_delivery",
      "fallbackAvailable": true,
      "fallbackMethod": "email",
      "retryAfter": 60
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 503 Service Unavailable

**Actions**:
- Attempt fallback delivery method (SMS → Email or vice versa)
- Keep OTP in Redis for retry
- Queue background job with exponential backoff
- Alert system administrators via monitoring
- Allow admin to manually verify user if critical

---

#### EX-007: Token Expired
**Scenario**: User's JWT token has expired (after 7 days)

**Response**:
```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Your session has expired. Please login again",
    "details": {
      "expiredAt": "2025-11-04T10:30:00.000Z",
      "redirectTo": "/auth/login"
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-10-28T10:30:00.000Z"
}
```

**HTTP Status**: 401 Unauthorized

**Actions**:
- Redirect to login page
- Clear client-side token storage
- Show friendly message about session expiry

---

### Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract request ID
    const requestId = request.headers['x-request-id'] as string;

    let statusCode = 500;
    let errorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details: {}
      },
      requestId: requestId,
      timestamp: new Date().toISOString()
    };

    // Handle known exceptions
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        errorResponse.error = {
          code: exceptionResponse['code'] || 'HTTP_EXCEPTION',
          message: exceptionResponse['message'] || exception.message,
          details: exceptionResponse['details'] || {}
        };
      }
    }

    // Log error with structured logging
    logger.error('Request failed', {
      requestId: requestId,
      method: request.method,
      url: request.url,
      statusCode: statusCode,
      error: errorResponse.error,
      stack: exception instanceof Error ? exception.stack : undefined
    });

    response.status(statusCode).json(errorResponse);
  }
}
```

---

## Testing Requirements

### Unit Tests

#### Authentication Service Tests
```typescript
describe('AuthService', () => {
  describe('validateCredentials', () => {
    it('should validate correct credentials', async () => {
      const result = await authService.validateCredentials(
        'user@example.com',
        'ValidPassword123!'
      );
      expect(result.success).toBe(true);
    });

    it('should reject invalid password', async () => {
      const result = await authService.validateCredentials(
        'user@example.com',
        'WrongPassword'
      );
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should increment failed attempt counter', async () => {
      await authService.validateCredentials('user@example.com', 'wrong');
      const attempts = await redis.get('login:attempts:user_id');
      expect(attempts).toBe('1');
    });
  });

  describe('generateOTP', () => {
    it('should generate 6-digit OTP', () => {
      const otp = authService.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should store OTP in Redis with TTL', async () => {
      const sessionId = 'test_session';
      await authService.storeOTP(sessionId, '123456', 'user_id');
      
      const ttl = await redis.ttl(`otp:session:${sessionId}`);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('verifyOTP', () => {
    it('should verify correct OTP', async () => {
      const result = await authService.verifyOTP('session_id', '123456');
      expect(result.success).toBe(true);
    });

    it('should reject expired OTP', async () => {
      const result = await authService.verifyOTP('expired_session', '123456');
      expect(result.error.code).toBe('OTP_EXPIRED');
    });

    it('should track OTP attempts', async () => {
      await authService.verifyOTP('session_id', 'wrong1');
      await authService.verifyOTP('session_id', 'wrong2');
      
      const attempts = await redis.get('otp:attempts:session_id');
      expect(attempts).toBe('2');
    });
  });

  describe('generateJWT', () => {
    it('should generate valid JWT token', () => {
      const token = authService.generateJWT({
        userId: 'user_id',
        email: 'user@example.com',
        role: 'admin'
      });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.sub).toBe('user_id');
      expect(decoded.role).toBe('admin');
    });

    it('should include expiry 7 days from now', () => {
      const token = authService.generateJWT({ userId: 'user_id' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const expiryDate = new Date(decoded.exp * 1000);
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      expect(expiryDate.getTime()).toBeCloseTo(expectedExpiry.getTime(), -4);
    });
  });
});
```

---

### Integration Tests

#### Complete Authentication Flow
```typescript
describe('Authentication Flow (E2E)', () => {
  it('should complete full 2FA login flow', async () => {
    // Step 1: Login with credentials
    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({
        identifier: 'admin@example.com',
        password: 'ValidPassword123!'
      })
      .expect(200);

    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.requires2fa).toBe(true);
    
    const sessionId = loginResponse.body.data.sessionId;
    const requestId = loginResponse.body.requestId;

    // Step 2: Wait for OTP delivery (background job)
    await sleep(3000);

    // Step 3: Retrieve OTP from Redis (simulate SMS)
    const otpData = await redis.get(`otp:session:${sessionId}`);
    const otp = JSON.parse(otpData).otp_code;

    // Step 4: Verify OTP
    const verifyResponse = await request(app)
      .post('/v1/auth/verify-otp')
      .send({
        sessionId: sessionId,
        otp: otp
      })
      .expect(200);

    expect(verifyResponse.body.success).toBe(true);
    expect(verifyResponse.body.data.token).toBeDefined();
    expect(verifyResponse.body.data.user.role).toBe('admin');

    // Step 5: Verify background jobs were queued
    const jobs = await queue.getJobs(['waiting', 'active']);
    const jobTypes = jobs.map(j => j.name);
    
    expect(jobTypes).toContain('geolocation');
    expect(jobTypes).toContain('anomaly_detection');
    expect(jobTypes).toContain('notification_push');
  });

  it('should handle account lockout after 3 failed attempts', async () => {
    // Attempt 1
    await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'user@example.com', password: 'wrong1' })
      .expect(401);

    // Attempt 2
    await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'user@example.com', password: 'wrong2' })
      .expect(401);

    // Attempt 3 - Should lock account
    const response = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'user@example.com', password: 'wrong3' })
      .expect(423);

    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(response.body.error.details.lockedUntil).toBeDefined();

    // Verify Redis lock
    const locked = await redis.get('account:locked:user_id');
    expect(locked).toBe('true');

    // Verify notification jobs queued
    await sleep(1000);
    const jobs = await queue.getJobs(['waiting', 'active']);
    const emailJobs = jobs.filter(j => j.name === 'notification_email');
    expect(emailJobs.length).toBeGreaterThan(0);
  });

  it('should rate limit OTP resend requests', async () => {
    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'user@example.com', password: 'ValidPassword123!' });

    const sessionId = loginResponse.body.data.sessionId;

    // Resend 1
    await request(app)
      .post('/v1/auth/resend-otp')
      .send({ sessionId })
      .expect(200);

    // Resend 2
    await request(app)
      .post('/v1/auth/resend-otp')
      .send({ sessionId })
      .expect(200);

    // Resend 3
    await request(app)
      .post('/v1/auth/resend-otp')
      .send({ sessionId })
      .expect(200);

    // Resend 4 - Should be rate limited
    const response = await request(app)
      .post('/v1/auth/resend-otp')
      .send({ sessionId })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
```

---

### Background Job Tests

```typescript
describe('Background Jobs', () => {
  describe('Email Notification Worker', () => {
    it('should send email notification successfully', async () => {
      const job = await queue.add('auth:notifications:email', {
        userId: 'user_id',
        type: 'new_login',
        recipient: 'user@example.com',
        template: 'new_login_detected',
        data: { deviceName: 'iPhone', location: 'Cairo' }
      });

      await job.finished();

      const result = job.returnvalue;
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should retry on failure', async () => {
      // Mock SendGrid failure
      sendgrid.send = jest.fn().mockRejectedValue(new Error('API Error'));

      const job = await queue.add('auth:notifications:email', {
        userId: 'user_id',
        recipient: 'user@example.com'
      });

      await expect(job.finished()).rejects.toThrow();
      expect(job.attemptsMade).toBeGreaterThan(1);
    });
  });

  describe('Geolocation Enrichment Worker', () => {
    it('should enrich activity log with geolocation', async () => {
      const activityLogId = 'activity_id';
      
      const job = await queue.add('auth:security:geolocation', {
        activityLogId: activityLogId,
        ipAddress: '196.219.30.1'
      });

      await job.finished();

      const activityLog = await db.activity_log.findUnique({
        where: { id: activityLogId }
      });

      expect(activityLog.country).toBe('EG');
      expect(activityLog.city).toBeDefined();
      expect(activityLog.latitude).toBeDefined();
    });

    it('should use cache for repeated IPs', async () => {
      const ipAddress = '196.219.30.1';

      // First call - should hit API
      await queue.add('auth:security:geolocation', {
        activityLogId: 'activity_1',
        ipAddress: ipAddress
      });

      // Second call - should use cache
      const job = await queue.add('auth:security:geolocation', {
        activityLogId: 'activity_2',
        ipAddress: ipAddress
      });

      await job.finished();
      const result = job.returnvalue;

      expect(result.source).toBe('cache');
    });
  });

  describe('Anomaly Detection Worker', () => {
    it('should calculate risk score correctly', async () => {
      const job = await queue.add('auth:security:analysis', {
        userId: 'user_id',
        activityLogId: 'activity_id',
        loginData: {
          ipAddress: '1.1.1.1',
          country: 'US',
          deviceFingerprint: 'new_device',
          timestamp: new Date().toISOString()
        }
      });

      await job.finished();
      const result = job.returnvalue;

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should trigger security alert for high risk', async () => {
      // Simulate high-risk login
      const job = await queue.add('auth:security:analysis', {
        userId: 'user_id',
        activityLogId: 'activity_id',
        loginData: {
          ipAddress: '1.1.1.1',
          country: 'CN', // New location
          deviceFingerprint: 'brand_new_device',
          timestamp: new Date().toISOString()
        }
      });

      await job.finished();

      // Check if security notification was queued
      const notificationJobs = await queue.getJobs(['waiting', 'active']);
      const securityAlerts = notificationJobs.filter(
        j => j.data.type === 'suspicious_activity'
      );

      expect(securityAlerts.length).toBeGreaterThan(0);
    });
  });
});
```

---

### Security Tests

```typescript
describe('Security Tests', () => {
  it('should prevent SQL injection in login', async () => {
    const response = await request(app)
      .post('/v1/auth/login')
      .send({
        identifier: "admin' OR '1'='1",
        password: "password"
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should reject tampered JWT tokens', async () => {
    const validToken = authService.generateJWT({ userId: 'user_id' });
    const tamperedToken = validToken.slice(0, -10) + 'tampered123';

    const response = await request(app)
      .get('/v1/protected-endpoint')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);

    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('should rate limit login attempts per IP', async () => {
    const requests = [];
    
    // Make 101 requests (rate limit is 100/minute)
    for (let i = 0; i < 101; i++) {
      requests.push(
        request(app)
          .post('/v1/auth/login')
          .send({ identifier: `user${i}@example.com`, password: 'test' })
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should enforce HTTPS in production', () => {
    if (process.env.NODE_ENV === 'production') {
      const hstsHeader = app._router.stack
        .find(layer => layer.name === 'helmet')
        .handle.toString();

      expect(hstsHeader).toContain('Strict-Transport-Security');
    }
  });

  it('should blacklist tokens after logout', async () => {
    // Login
    const loginResponse = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'user@example.com', password: 'ValidPassword123!' });

    // ... complete 2FA ...
    const token = verifyResponse.body.data.token;

    // Logout
    await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Try to use token after logout
    const response = await request(app)
      .get('/v1/protected-endpoint')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });
});
```

---

### Performance Tests

```typescript
describe('Performance Tests', () => {
  it('should handle 100 concurrent login requests', async () => {
    const startTime = Date.now();
    const requests = [];

    for (let i = 0; i < 100; i++) {
      requests.push(
        request(app)
          .post('/v1/auth/login')
          .send({
            identifier: `user${i}@example.com`,
            password: 'ValidPassword123!'
          })
      );
    }

    await Promise.all(requests);
    const duration = Date.now() - startTime;

    // Should complete within 5 seconds
    expect(duration).toBeLessThan(5000);
  });

  it('should respond to login within 200ms', async () => {
    const startTime = Date.now();

    await request(app)
      .post('/v1/auth/login')
      .send({
        identifier: 'user@example.com',
        password: 'ValidPassword123!'
      });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(200);
  });

  it('should process background jobs within SLA', async () => {
    const job = await queue.add('auth:security:geolocation', {
      activityLogId: 'activity_id',
      ipAddress: '196.219.30.1'
    });

    const startTime = Date.now();
    await job.finished();
    const duration = Date.now() - startTime;

    // Geolocation should complete within 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  it('should maintain Redis response time under 5ms', async () => {
    const iterations = 100;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await redis.get(`test:key:${i}`);
      times.push(Date.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avgTime).toBeLessThan(5);
  });
});
```

---

## Monitoring & Observability

### Metrics Collection (Prometheus)

```typescript
// Initialize Prometheus metrics
import { register, Counter, Histogram, Gauge } from 'prom-client';

// HTTP Request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// Authentication metrics
export const authLoginTotal = new Counter({
  name: 'auth_login_total',
  help: 'Total number of login attempts',
  labelNames: ['status', 'role', '2fa_enabled']
});

export const authOtpDeliveryTotal = new Counter({
  name: 'auth_otp_delivery_total',
  help: 'Total OTP deliveries',
  labelNames: ['method', 'status']
});

export const authAccountLockTotal = new Counter({
  name: 'auth_account_lock_total',
  help: 'Total number of account lockouts',
  labelNames: ['reason']
});

// Background job metrics
export const backgroundJobDuration = new Histogram({
  name: 'background_job_duration_seconds',
  help: 'Duration of background job processing',
  labelNames: ['job_name', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

export const backgroundJobTotal = new Counter({
  name: 'background_job_total',
  help: 'Total background jobs processed',
  labelNames: ['job_name', 'status']
});

// Redis metrics
export const redisOperationsTotal = new Counter({
  name: 'redis_operations_total',
  help: 'Total Redis operations',
  labelNames: ['operation', 'status']
});

export const redisOperationDuration = new Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Duration of Redis operations',
  labelNames: ['operation'],
  buckets: [0.001, 0.003, 0.005, 0.01, 0.03, 0.05, 0.1]
});

// Notification metrics
export const notificationDeliveryTotal = new Counter({
  name: 'notification_delivery_total',
  help: 'Total notifications sent',
  labelNames: ['type', 'channel', 'status']
});

// Active sessions gauge
export const activeSessions = new Gauge({
  name: 'auth_active_sessions',
  help: 'Number of active user sessions'
});
```

---

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Usage examples
logger.info('User login successful', {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user_123',
  email: 'user@example.com',
  role: 'admin',
  requires2fa: true,
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  duration: 156
});

logger.error('OTP delivery failed', {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user_123',
  deliveryMethod: 'sms',
  phoneNumber: '+20********89',
  error: 'Twilio API timeout',
  stack: error.stack
});
```

---

### Alert Rules (Prometheus AlertManager)

```yaml
groups:
  - name: auth_service_alerts
    interval: 30s
    rules:
      # Critical Alerts
      - alert: HighFailedLoginRate
        expr: rate(auth_login_total{status="failed"}[5m]) > 0.3
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High failed login rate detected"
          description: "Failed login rate is {{ $value }} per second"

      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis is down"
          description: "Redis has been down for more than 1 minute"

      - alert: HighAccountLockoutRate
        expr: rate(auth_account_lock_total[10m]) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High account lockout rate"
          description: "More than 5 accounts locked in 10 minutes"

      # Warning Alerts
      - alert: SlowResponseTime
        expr: histogram_quantile(0.99, http_request_duration_seconds_bucket{route="/v1/auth/login"}) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow login response time"
          description: "P99 login response time is {{ $value }}s"

      - alert: HighOTPFailureRate
        expr: rate(auth_otp_delivery_total{status="failed"}[10m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High OTP delivery failure rate"
          description: "OTP delivery failure rate is {{ $value }} per second"

      - alert: BackgroundJobBacklog
        expr: sum(background_job_total{status="waiting"}) > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Background job backlog building up"
          description: "{{ $value }} jobs waiting in queue"

      - alert: ExternalServiceDown
        expr: up{job=~"twilio|sendgrid|fcm"} == 0
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "External service {{ $labels.job }} is down"
          description: "Service has been down for more than 3 minutes"

      # Info Alerts
      - alert: PasswordExpiryWaveApproaching
        expr: count(password_expiry_days < 7) > 100
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "Many passwords expiring soon"
          description: "{{ $value }} users have passwords expiring in < 7 days"
```

---

### Dashboard Metrics (Grafana)

#### Authentication Overview Dashboard

**Panel 1: Login Success Rate**
```promql
rate(auth_login_total{status="success"}[5m]) 
/ 
rate(auth_login_total[5m])
```

**Panel 2: Average Login Duration**
```promql
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket{route="/v1/auth/login"}[5m])
)
```

**Panel 3: OTP Delivery Success Rate**
```promql
rate(auth_otp_delivery_total{status="success"}[5m])
/
rate(auth_otp_delivery_total[5m])
```

**Panel 4: Active Sessions**
```promql
auth_active_sessions
```

**Panel 5: Account Lockouts per Hour**
```promql
increase(auth_account_lock_total[1h])
```

**Panel 6: Background Job Throughput**
```promql
rate(background_job_total{status="completed"}[5m])
```

**Panel 7: Redis Cache Hit Rate**
```promql
rate(redis_operations_total{operation="get",status="hit"}[5m])
/
rate(redis_operations_total{operation="get"}[5m])
```

**Panel 8: Notification Delivery by Channel**
```promql
sum by (channel) (
  rate(notification_delivery_total{status="delivered"}[5m])
)
```

---

### Health Check Implementation

```typescript
@Controller('v1')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService
  ) {}

  @Get('health')
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkJobQueue(),
      this.checkExternalServices()
    ]);

    const [dbCheck, redisCheck, queueCheck, externalCheck] = checks;

    const allHealthy = checks.every(
      check => check.status === 'fulfilled' && check.value.status === 'ok'
    );

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '2.0.0',
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      services: {
        database: dbCheck.status === 'fulfilled' ? dbCheck.value : { status: 'error', error: dbCheck.reason },
        redis: redisCheck.status === 'fulfilled' ? redisCheck.value : { status: 'error', error: redisCheck.reason },
        jobQueue: queueCheck.status === 'fulfilled' ? queueCheck.value : { status: 'error', error: queueCheck.reason },
        externalServices: externalCheck.status === 'fulfilled' ? externalCheck.value : { status: 'error', error: externalCheck.reason }
      }
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      
      const connections = await this.prisma.$queryRaw`
        SELECT 
          count(*) as total,
          sum(case when state = 'active' then 1 else 0 end) as active,
          sum(case when state = 'idle' then 1 else 0 end) as idle
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;

      return {
        status: 'ok',
        responseTime: Date.now() - start,
        connections: connections[0]
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.redis.ping();
      
      const info = await this.redis.info('memory');
      const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1];
      const peakMemory = info.match(/used_memory_peak_human:(\S+)/)?.[1];

      return {
        status: 'ok',
        responseTime: Date.now() - start,
        memory: {
          used: usedMemory,
          peak: peakMemory
        }
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkJobQueue(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const queues = ['auth:notifications:email', 'auth:security:analysis', 'auth:cleanup:expired'];
      const stats = {};

      for (const queueName of queues) {
        const queue = this.queue.getQueue(queueName);
        const counts = await queue.getJobCounts();
        stats[queueName] = counts;
      }

      const totalActive = Object.values(stats).reduce((sum: number, q: any) => sum + q.active, 0);
      const totalWaiting = Object.values(stats).reduce((sum: number, q: any) => sum + q.waiting, 0);
      const totalFailed = Object.values(stats).reduce((sum: number, q: any) => sum + q.failed, 0);

      return {
        status: 'ok',
        responseTime: Date.now() - start,
        activeJobs: totalActive,
        waitingJobs: totalWaiting,
        failedJobs: totalFailed,
        queues: stats
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkExternalServices(): Promise<ExternalServicesHealth> {
    const checks = await Promise.allSettled([
      this.pingTwilio(),
      this.pingSendGrid(),
      this.pingFCM()
    ]);

    return {
      twilio: checks[0].status === 'fulfilled' ? checks[0].value : { status: 'error', error: checks[0].reason },
      sendgrid: checks[1].status === 'fulfilled' ? checks[1].value : { status: 'error', error: checks[1].reason },
      fcm: checks[2].status === 'fulfilled' ? checks[2].value : { status: 'error', error: checks[2].reason }
    };
  }

  private async pingTwilio(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Simple API call to verify connectivity
      await twilio.api.accounts.list({ limit: 1 });
      return {
        status: 'ok',
        responseTime: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  private async pingSendGrid(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Verify API key
      await sendgrid.request({
        url: '/v3/scopes',
        method: 'GET'
      });
      return {
        status: 'ok',
        responseTime: Date.now() - start
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }

  private async pingFCM(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // Verify Firebase app is initialized
      await admin.messaging().send({
        token: 'test_token',
        notification: { title: 'test' }
      }, true); // dryRun mode
      
      return {
        status: 'ok',
        responseTime: Date.now() - start
      };
    } catch (error) {
      // Dry run will fail with invalid token, but that means FCM is working
      if (error.code === 'messaging/invalid-registration-token') {
        return {
          status: 'ok',
          responseTime: Date.now() - start
        };
      }
      return {
        status: 'error',
        responseTime: Date.now() - start,
        error: error.message
      };
    }
  }
}
```

---

## Deployment & Operations

### Environment Variables

```bash
# Application
NODE_ENV=production
APP_VERSION=2.0.0
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/auth_db
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secure_password_here
REDIS_TLS_ENABLED=true
REDIS_DB=0

# JWT
JWT_SECRET=your_super_secure_secret_key_here_minimum_32_chars
JWT_EXPIRY=7d

# OTP Configuration
OTP_EXPIRY_SECONDS=300
OTP_MAX_ATTEMPTS=3
OTP_RESEND_LIMIT=3
OTP_RESEND_WINDOW_SECONDS=3600

# Rate Limiting
LOGIN_ATTEMPT_LIMIT=3
LOGIN_LOCKOUT_SECONDS=900
API_RATE_LIMIT_PER_MINUTE=100

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# SendGrid (Email)
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=security@yourdomain.com

# Firebase (Push Notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# MaxMind (Geolocation)
MAXMIND_LICENSE_KEY=your_license_key
MAXMIND_ACCOUNT_ID=your_account_id

# CORS
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Monitoring
SENTRY_DSN=your_sentry_dsn
PROMETHEUS_PORT=9090
```

---

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  # Auth Service
  auth-service:
    build: .
    container_name: auth-service
    ports:
      - "3000:3000"
      - "9090:9090"  # Prometheus metrics
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/auth_db
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Background Workers
  auth-worker:
    build: .
    container_name: auth-worker
    command: npm run worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/auth_db
      - REDIS_HOST=redis
      - WORKER_CONCURRENCY=10
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    deploy:
      replicas: 3  # Multiple workers for parallel processing

  # PostgreSQL
  postgres:
    image: postgres:14-alpine
    container_name: postgres
    environment:
      - POSTGRES_DB=auth_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: redis
    command: redis-server --requirepass password --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # Redis Commander (UI for Redis)
  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: redis-commander
    environment:
      - REDIS_HOSTS=local:redis:6379:0:password
    ports:
      - "8081:8081"
    depends_on:
      - redis
    restart: unless-stopped

  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9091:9090"
    restart: unless-stopped

  # Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

---

### Kubernetes Deployment (Optional)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: your-registry/auth-service:2.0.0
        ports:
        - containerPort: 3000
          name: http
        - containerPort: 9090
          name: metrics
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        - name: REDIS_HOST
          value: "redis-service"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /v1/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /v1/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics
    port: 9090
    targetPort: 9090
  type: LoadBalancer
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-worker
spec:
  replicas: 5
  selector:
    matchLabels:
      app: auth-worker
  template:
    metadata:
      labels:
        app: auth-worker
    spec:
      containers:
      - name: auth-worker
        image: your-registry/auth-service:2.0.0
        command: ["npm", "run", "worker"]
        env:
        - name: NODE_ENV
          value: "production"
        - name: WORKER_CONCURRENCY
          value: "10"
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

---

## Appendices

### Appendix A: Complete Error Code Reference

| Code | HTTP | Description | User Action | Retry | Details |
|------|------|-------------|-------------|-------|---------|
| INVALID_CREDENTIALS | 401 | Wrong username/password | Verify credentials | No | Generic message for security |
| ACCOUNT_LOCKED | 423 | Too many failed attempts | Wait or contact support | Wait 15min | Includes unlock time |
| OTP_EXPIRED | 400 | Verification code expired | Request new code | Yes | Can resend |
| INVALID_OTP | 400 | Wrong verification code | Try again | Yes (3x) | Tracks attempts |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | Wait | Wait | Includes retry-after |
| SERVICE_UNAVAILABLE | 503 | External service down | Try again later | Yes | Exponential backoff |
| PASSWORD_EXPIRED | 403 | Password needs reset | Reset password | No | Force password change |
| INVALID_SESSION | 400 | Session ID not found | Restart login | No | OTP session expired |
| REDIS_CONNECTION_FAILED | 503 | Redis unavailable | Try again | Yes | Critical dependency |
| VALIDATION_ERROR | 400 | Input validation failed | Fix input | No | Field-level errors |
| TOKEN_EXPIRED | 401 | JWT token expired | Login again | No | Natural expiry |
| TOKEN_INVALID | 401 | JWT tampered/invalid | Login again | No | Security issue |
| INSUFFICIENT_PERMISSIONS | 403 | Lacks permissions | Contact admin | No | RBAC denial |
| USER_NOT_FOUND | 404 | User doesn't exist | Check email | No | Registration needed |
| DUPLICATE_EMAIL | 409 | Email already exists | Use different email | No | Unique constraint |
| WEAK_PASSWORD | 400 | Password too weak | Use stronger password | No | Policy violation |
| PASSWORD_REUSE | 400 | Password used before | Use new password | No | History check |

---

### Appendix B: Notification Templates

#### Email Template: New Login Detected
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>New Login Detected</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
    <h2 style="color: #333;">🔐 New Login to Your Account</h2>
    <p>We detected a new login to your account:</p>
    
    <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p><strong>Device:</strong> {{deviceName}}</p>
      <p><strong>Location:</strong> {{city}}, {{country}}</p>
      <p><strong>IP Address:</strong> {{ipAddress}}</p>
      <p><strong>Time:</strong> {{timestamp}}</p>
    </div>
    
    <p>If this was you, you can safely ignore this email.</p>
    
    <p>If you don't recognize this activity, please:</p>
    <ul>
      <li>Change your password immediately</li>
      <li>Review your recent account activity</li>
      <li>Contact our support team</li>
    </ul>
    
    <a href="{{securitySettingsUrl}}" 
       style="display: inline-block; background: #007bff; color: white; 
              padding: 10px 20px; text-decoration: none; border-radius: 5px; 
              margin: 20px 0;">
      Review Security Settings
    </a>
    
    <p style="color: #666; font-size: 12px; margin-top: 30px;">
      This is an automated security notification from Your App Name
    </p>
  </div>
</body>
</html>
```

#### Email Template: Account Locked
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Account Locked</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px;">
    <h2 style="color: #856404;">⚠️ Your Account Has Been Locked</h2>
    <p>Your account was temporarily locked due to multiple failed login attempts.</p>
    
    <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p><strong>Locked At:</strong> {{lockedAt}}</p>
      <p><strong>Will Unlock:</strong> {{unlocksAt}}</p>
      <p><strong>Failed Attempts:</strong> {{attemptCount}}</p>
      <p><strong>Last Attempt From:</strong> {{ipAddress}}</p>
    </div>
    
    <p><strong>If this wasn't you:</strong></p>
    <ol>
      <li>Your account is now secure and locked</li>
      <li>It will automatically unlock in 15 minutes</li>
      <li>Consider changing your password</li>
      <li>Enable two-factor authentication</li>
    </ol>
    
    <a href="{{supportUrl}}" 
       style="display: inline-block; background: #dc3545; color: white; 
              padding: 10px 20px; text-decoration: none; border-radius: 5px;">
      Contact Support Immediately
    </a>
  </div>
</body>
</html>
```

---

### Appendix C: Database Migration Scripts

```sql
-- Migration: Add notification and device tables
-- Version: 2.0.0
-- Date: 2025-10-28

BEGIN;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Create user_devices table
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    device_type VARCHAR(20),
    browser VARCHAR(50),
    os VARCHAR(50),
    fcm_token VARCHAR(255),
    is_trusted BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_fingerprint ON user_devices(device_fingerprint);
CREATE INDEX idx_user_devices_last_used ON user_devices(last_used_at);

-- Add new columns to activity_log
ALTER TABLE activity_log
ADD COLUMN IF NOT EXISTS request_id UUID,
ADD COLUMN IF NOT EXISTS country VARCHAR(2),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(64),
ADD COLUMN IF NOT EXISTS device_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS browser VARCHAR(50),
ADD COLUMN IF NOT EXISTS os VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_new_device BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS risk_score INTEGER;

CREATE INDEX idx_activity_log_request_id ON activity_log(request_id);
CREATE INDEX idx_activity_log_risk_score ON activity_log(risk_score);

-- Add FCM token cleanup function
CREATE OR REPLACE FUNCTION cleanup_invalid_fcm_tokens()
RETURNS void AS $
BEGIN
    DELETE FROM user_devices
    WHERE fcm_token IS NOT NULL
    AND last_used_at < NOW() - INTERVAL '90 days';
END;
$ LANGUAGE plpgsql;

COMMIT;
```

---

### Appendix D: Glossary

- **2FA**: Two-Factor Authentication - Security process requiring two forms of identification
- **bcrypt**: Password hashing algorithm resistant to brute-force attacks
- **BullMQ**: Redis-based job queue for Node.js
- **E.164**: International phone number format standard
- **FCM**: Firebase Cloud Messaging - Push notification service
- **Idempotency**: Property ensuring duplicate requests produce same result
- **JWT**: JSON Web Token - Stateless authentication token standard
- **MaxMind**: Geolocation database and API provider
- **OTP**: One-Time Password - Temporary code for authentication
- **Prometheus**: Open-source monitoring and alerting toolkit
- **RBAC**: Role-Based Access Control - Permission system based on roles
- **Redis**: In-memory data store used for caching and queues
- **SendGrid**: Cloud-based email delivery service
- **SLA**: Service Level Agreement - Performance guarantees
- **Twilio**: Cloud communications platform for SMS/voice
- **TTL**: Time To Live - Expiration time for cached data
- **UUID**: Universally Unique Identifier - 128-bit unique identifier

---

### Appendix E: API Standards Compliance Checklist

✅ **Required Standards Implemented:**
- [x] API Versioning (/v1/auth/*)
- [x] Request ID Tracking (X-Request-ID header)
- [x] Standardized Response Format (success/error structure)
- [x] HTTP Status Codes (proper usage)
- [x] Security Headers (Helmet middleware)
- [x] CORS Configuration (environment-based)
- [x] Rate Limiting (Redis-based, tiered)
- [x] Compression (gzip)
- [x] Content Type (application/json)
- [x] DateTime Standards (ISO 8601 UTC)
- [x] Field Naming (camelCase)
- [x] Health Check Endpoint (/v1/health)
- [x] Idempotency Keys (critical operations)
- [x] Structured Logging (Winston with JSON)
- [x] Metrics Endpoint (/v1/metrics - Prometheus)
- [x] Error Handling (Global exception filter)
- [x] Validation Standards (class-validator DTOs)

---

## Change Log

### Version 2.0.0 (2025-10-28)
- ✨ Added Redis caching for OTP sessions
- ✨ Implemented background job processing with BullMQ
- ✨ Added multi-channel notifications (Push, Email, SMS)
- ✨ Integrated geolocation enrichment
- ✨ Added anomaly detection and risk scoring
- ✨ Implemented device fingerprinting
- ✨ Added comprehensive API standards compliance
- ✨ Implemented structured logging
- ✨ Added Prometheus metrics
- ✨ Added health check endpoint
- ✨ Implemented request ID tracking
- 🔒 Enhanced security with rate limiting
- 📊 Added monitoring dashboards
- 📝 Updated documentation with deployment guides

### Version 1.0.0 (Initial Release)
- Basic authentication with email/password
- Two-factor authentication via SMS
- JWT token generation
- Role-based access control
- Basic activity logging

---

## Support & Maintenance

### Support Channels
- **Documentation**: https://docs.yourdomain.com/auth
- **API Status**: https://status.yourdomain.com
- **Technical Support**: support@yourdomain.com
- **Security Issues**: security@yourdomain.com

### Maintenance Windows
- **Scheduled Maintenance**: Sundays 2:00-4:00 AM UTC
- **Emergency Maintenance**: As needed with advance notice
- **Backup Schedule**: Daily at 3:00 AM UTC

---

**Document Version**: 2.0.0  
**Last Updated**: October 28, 2025  
**Next Review**: January 28, 2026