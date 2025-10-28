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
background_job_duration_seconds{job="geolocation",status="completed