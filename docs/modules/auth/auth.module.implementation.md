# Two-Factor Authentication Module

> **Farm Management Platform (FishFarm360)**  
> Complete authentication system with OTP-based two-factor authentication

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [Authentication Flows](#authentication-flows)
- [Database Schema](#database-schema)
- [Security Features](#security-features)
- [Performance](#performance)
- [Testing Strategy](#testing-strategy)
- [Deployment](#deployment)

---

## Overview

This module implements a production-ready two-factor authentication system using OTP (One-Time Password) codes delivered via email or SMS. Built with Domain-Driven Design and Clean Architecture principles, it emphasizes security, scalability, and maintainability.

### Key Features

- ✅ OTP-based two-factor authentication
- ✅ Multiple delivery methods (Email, SMS, Push)
- ✅ Device fingerprinting and trusted devices
- ✅ Account locking after failed attempts
- ✅ Rate limiting and abuse prevention
- ✅ Real-time WebSocket notifications
- ✅ Async job processing for external APIs
- ✅ Circuit breaker for fault tolerance
- ✅ Comprehensive audit logging

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js |
| **Framework** | NestJS |
| **Language** | TypeScript |
| **Database** | PostgreSQL |
| **ORM** | MikroORM |
| **Cache/Queue** | Redis, BullMQ |
| **Email** | SendGrid |
| **SMS** | Twilio |
| **Real-time** | WebSocket |

---

## Architecture

### Layered Architecture

```
┌──────────────────────────────────────┐
│   Presentation Layer                 │  ← Controllers, DTOs, Validation
├──────────────────────────────────────┤
│   Application Layer                  │  ← Orchestration, Workflows, Transactions
├──────────────────────────────────────┤
│   Domain Layer                       │  ← Business Logic, Entities, Rules
├──────────────────────────────────────┤
│   Infrastructure Layer               │  ← Repositories, External APIs, Database
└──────────────────────────────────────┘
```

**Key Principle:** Dependencies flow inward. Infrastructure depends on Domain, never the reverse.

### Design Patterns Applied

- **Domain-Driven Design** - Aggregates, Value Objects, Domain Events
- **Clean Architecture** - Layer separation, Dependency Inversion
- **Repository Pattern** - Data access abstraction
- **Unit of Work** - Transaction coordination
- **Observer Pattern** - Event bus for domain events
- **Strategy Pattern** - Multiple OTP delivery methods
- **Circuit Breaker** - External service fault tolerance

---

## Domain Layer

### Entities

#### UserAccount (Aggregate Root)

Business logic for user authentication and account management.

**Responsibilities:**
- Enforce authentication business rules
- Maintain account state consistency
- Publish domain events
- Zero infrastructure knowledge

**Key Methods:**
```typescript
validatePassword(password: string): boolean
isLocked(): boolean
recordFailedLogin(): void
recordSuccessfulLogin(): void
requestOTP(deliveryMethod: string): OTPCode
```

**Business Rules:**
- 3 failed login attempts → lock account for 15 minutes
- Password must match stored bcrypt hash
- Cannot request OTP if account locked
- Rate limit: Max 3 OTP requests per hour

**Domain Events:**
- `UserAuthenticatedEvent`
- `AccountLockedEvent`
- `OTPRequestedEvent`
- `LoginFailedEvent`

#### Device (Entity)

Tracks user devices and manages device trust.

**Key Methods:**
```typescript
markAsTrusted(days: number): void
untrust(): void
isTrustExpired(): boolean
updateLastUsed(ip: string, location: string): void
revoke(reason: string): void
```

**Properties:**
- Device fingerprint (unique identifier)
- Browser and OS information
- Trust status and expiration
- Last used timestamp and location
- FCM token for push notifications

### Value Objects

Immutable, self-validating objects that represent domain concepts.

#### Email
```typescript
Email.fromString(email: string): Email
email.value: string
```
Validates format (RFC 5322), immutable once created.

#### Password
```typescript
Password.fromString(plain: string): Password  // Hash new
Password.fromHash(hash: string): Password     // Load existing
password.matches(submitted: string): boolean
```
Stores bcrypt hash (cost factor 12-14, ~100ms), never plain text.

#### OTPCode
```typescript
OTPCode.generate(): OTPCode
code.hash(): string
code.matches(submitted: string): boolean
code.isExpired(): boolean
```
6-digit cryptographically secure code, expires in 5 minutes.

#### Role
```typescript
enum Role { Admin, FarmManager, Technician, Accountant }
```
Type-safe role validation with permission checks.

### Domain Events

Immutable facts representing business occurrences.

```typescript
class UserAuthenticatedEvent {
  userId: string;
  timestamp: Date;
  ipAddress: string;
  role: Role;
}

class AccountLockedEvent {
  userId: string;
  lockedUntil: Date;
  reason: string;
}

class OTPRequestedEvent {
  userId: string;
  otpCode: OTPCode;
  deliveryMethod: string;
  recipient: string;
}
```

---

## Application Layer

### AuthenticationApplicationService

Orchestrates the entire authentication workflow without containing business logic.

**Dependencies:**
- `IUserRepository` - User data access
- `IOTPRepository` - OTP data access
- `IDeviceRepository` - Device data access
- `IUnitOfWork` - Transaction management
- `IEventBus` - Event publishing
- `Queue` - Async job queue

**Key Methods:**
- `login(request: LoginRequest): Promise<LoginResponse>`
- `verifyOTP(request: VerifyOTPRequest): Promise<VerifyOTPResponse>`
- `resendOTP(request: ResendOTPRequest): Promise<void>`

---

## Infrastructure Layer

### Repositories

Abstract database operations from domain logic.

**Interface (Domain Layer):**
```typescript
interface IUserRepository {
  findById(id: string): Promise<UserAccount | null>;
  findByEmail(email: Email): Promise<UserAccount | null>;
  save(user: UserAccount): Promise<void>;
  delete(userId: string): Promise<void>;
}
```

**Implementation (Infrastructure Layer):**
```typescript
class MikroORMUserRepository implements IUserRepository {
  // Uses MikroORM EntityManager
  // Converts DB entities ↔ domain entities
  // Zero business logic
}
```

### Unit of Work

Manages database transactions using MikroORM's built-in Unit of Work pattern.

```typescript
interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
  getEntityManager(): EntityManager;
}
```

### Event Bus

Dispatches domain events to registered handlers.

```typescript
interface IEventBus {
  publish(event: DomainEvent): void;
  subscribe(eventType: string, handler: EventHandler): void;
}
```

**Event Handlers:**
- `SendOTPEventHandler` - Queues email/SMS jobs
- `LogActivityEventHandler` - Logs to database
- `NotifyAccountLockedEventHandler` - Sends security emails

### Message Queue (BullMQ)

Handles async processing with Redis-backed queues.

**Configuration:**
- Max attempts: 4 (1 initial + 3 retries)
- Backoff: Exponential (2s, 4s, 8s)
- Concurrency: 10 parallel workers
- Rate limit: 100 jobs/second

**Retry Logic:**

**Transient Errors (Retry):**
- 500 Internal Server Error
- 503 Service Unavailable
- 429 Rate Limited
- Network timeouts

**Permanent Errors (Don't Retry):**
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 422 Unprocessable Entity

### Circuit Breaker

Prevents cascade failures when external services are down.

**States:**
- **CLOSED** - Normal operation
- **OPEN** - After 5 consecutive failures, stop calling service
- **HALF-OPEN** - After 60 seconds, test one request

---

## Authentication Flows

### Login Flow

**Synchronous Operations (User waits ~160ms):**

1. Start transaction
2. Load user from database (10ms)
3. Check user exists
4. Check account not locked
5. Validate password (100ms bcrypt)
6. If invalid:
   - Record failed login attempt
   - Save user (20ms)
   - Commit transaction (10ms)
   - Publish events if locked
   - Throw `InvalidCredentialsException`
7. If valid:
   - Generate OTP (business logic)
   - Check rate limit (10ms)
   - Save OTP to database (20ms)
   - Save user (20ms)
   - Commit transaction (10ms)
   - Publish domain events
   - Return response

**Asynchronous Operations (Fire-and-forget):**

- Queue email/SMS job (2ms)
- WebSocket notification "OTP_PROCESSING" (1ms)
- Queue activity log job (2ms)

**Worker Process (2-5 seconds later):**

- Worker consumes job from queue
- Calls SendGrid/Twilio API (2-3 seconds)
- Sends WebSocket success/failure notification
- Handles retries with exponential backoff

### Verify OTP Flow

**Synchronous Operations (User waits ~100ms):**

1. Start transaction
2. Load user from database (10ms)
3. Check user exists
4. Load stored OTP from database (10ms)
5. Check OTP exists
6. Validate OTP matches
7. If invalid:
   - Record failed attempt
   - Check if 3 failures reached
   - Save or delete OTP
   - Commit transaction
   - Throw `InvalidOTPException`
8. Check OTP not expired
9. If valid:
   - Call `recordSuccessfulLogin()`
   - Delete OTP from database (10ms)
   - Generate JWT token (20ms)
   - Save session if tracking (20ms)
   - Save user (20ms)
   - Commit transaction (10ms)
   - Publish domain events
   - Return JWT

**Asynchronous Operations:**

- Queue activity log (successful login)
- Queue security email ("New login detected")
- Queue last_login timestamp update
- WebSocket notification to other devices

---

## Database Schema

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  phone VARCHAR UNIQUE,
  password_hash VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  failed_login_attempts INT DEFAULT 0,
  account_locked BOOLEAN DEFAULT false,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
```

### otp_codes
```sql
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  code_hash VARCHAR NOT NULL,
  delivery_method VARCHAR NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  failed_attempts INT DEFAULT 0,
  invalidated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_codes_user_created ON otp_codes(user_id, created_at);
```

### otp_requests (Rate Limiting)
```sql
CREATE TABLE otp_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_requests_user_time ON otp_requests(user_id, requested_at);
```

### user_devices
```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  device_fingerprint VARCHAR NOT NULL,
  device_name VARCHAR,
  device_type VARCHAR,
  browser_name VARCHAR,
  browser_version VARCHAR,
  os_name VARCHAR,
  os_version VARCHAR,
  fcm_token TEXT,
  push_enabled BOOLEAN DEFAULT false,
  is_trusted BOOLEAN DEFAULT false,
  trusted_at TIMESTAMP,
  trust_expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  last_ip_address INET,
  last_location VARCHAR,
  user_agent TEXT,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_devices_user ON user_devices(user_id);
CREATE INDEX idx_devices_fingerprint ON user_devices(device_fingerprint);
```

### sessions
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token_id UUID UNIQUE NOT NULL,
  device_id UUID REFERENCES user_devices(id),
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX idx_sessions_token ON sessions(token_id);
```

### activity_log
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user_time ON activity_log(user_id, timestamp);
CREATE INDEX idx_activity_action_time ON activity_log(action, timestamp);
```

### notifications
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR NOT NULL,
  read BOOLEAN DEFAULT false,
  actions JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read, created_at);
```

---

## Security Features

### OTP Security
- ✅ Always hash OTP codes before storage (bcrypt)
- ✅ Cryptographically secure random generation
- ✅ Single-use OTPs (delete after verification)
- ✅ 5-minute expiration
- ✅ Limited verification attempts (3 per OTP)
- ✅ Rate limiting (3 requests per hour)

### Password Security
- ✅ bcrypt with cost factor 12-14 (~100ms)
- ✅ Never store plain text
- ✅ Password history (prevent reusing last 5)
- ✅ Complexity requirements enforced

### Account Protection
- ✅ 3 failed attempts = 15-minute lock
- ✅ Automatic unlock after timeout
- ✅ IP-based rate limiting
- ✅ Timing attack prevention (constant-time comparison)

### Device Security
- ✅ Device fingerprinting
- ✅ Trusted device management (30-day trust)
- ✅ Automatic revocation after 90 days inactivity
- ✅ Location-based suspicious activity detection
- ✅ Push notifications for new devices

---

## Performance

### Synchronous vs Asynchronous Operations

**MUST Be Synchronous (User Waits):**
- Database queries for authentication logic
- Password validation (bcrypt ~100ms)
- Account lock checks
- OTP generation and storage
- Rate limit enforcement
- Failed attempt counter increment
- OTP validation and deletion
- JWT generation
- Session storage
- Transaction commits

**CAN Be Asynchronous (Fire-and-Forget):**
- Send OTP via email/SMS (2-3 seconds)
- Activity logging
- Security notification emails
- Last login timestamp update
- Cache invalidation
- Analytics tracking
- WebSocket notifications

### Target Performance
- OTP request: **< 200ms** (achieved: **160ms**)
- OTP verification: **< 150ms** (achieved: **100ms**)
- Permission check: **< 100ms** (via caching)
- OTP delivery: **< 5 seconds** (async via worker)

### Optimization Strategies
- Proper database indexes on frequently queried columns
- Connection pooling (MikroORM built-in)
- Redis caching for rate limits and sessions
- Async processing for external APIs
- Query plan analysis (EXPLAIN ANALYZE)
- Avoid N+1 queries

---

## Testing Strategy

### Unit Tests (70%)
Test entity methods and business logic in isolation.

```typescript
describe('UserAccount', () => {
  it('should lock account after 3 failed login attempts', () => {
    const user = new UserAccount(/*...*/);
    user.recordFailedLogin();
    user.recordFailedLogin();
    user.recordFailedLogin();
    expect(user.isLocked()).toBe(true);
  });
});
```

### Integration Tests (20%)
Test repositories and application services with real test database.

```typescript
describe('AuthenticationApplicationService', () => {
  it('should complete full login flow', async () => {
    const response = await authService.login({
      email: 'test@example.com',
      password: 'password123'
    });
    expect(response.otpSent).toBe(true);
  });
});
```

### E2E Tests (10%)
Test full user journeys with mocked external APIs.

```typescript
describe('Authentication E2E', () => {
  it('should authenticate user with OTP', async () => {
    // Request OTP
    await request(app).post('/auth/login').send({/*...*/});
    
    // Verify OTP
    const response = await request(app).post('/auth/verify-otp').send({/*...*/});
    
    expect(response.body.accessToken).toBeDefined();
  });
});
```

---

## Deployment

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/fishfarm360

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key-rotate-quarterly
JWT_EXPIRATION=15m

# External Services
SENDGRID_API_KEY=your-sendgrid-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

# WebSocket
WEBSOCKET_PORT=3001

# Rate Limiting
OTP_RATE_LIMIT_REQUESTS=3
OTP_RATE_LIMIT_WINDOW=3600
```

### Health Checks

```bash
# Basic liveness
GET /health

# Database + Redis connected
GET /health/ready

# External APIs reachable
GET /health/deep
```

### Deployment Strategy

1. **Blue-Green Deployment** - Zero downtime
2. **Gradual Traffic Shift** - 10% → 50% → 100%
3. **Quick Rollback** - Automated rollback on errors

### Cron Jobs

```cron
# Delete expired OTPs (daily)
0 0 * * * node dist/cron/delete-expired-otps.js

# Expire device trust (daily)
0 1 * * * node dist/cron/expire-device-trust.js

# Revoke inactive devices (daily)
0 2 * * * node dist/cron/revoke-inactive-devices.js

# Archive old activity logs (monthly)
0 3 1 * * node dist/cron/archive-activity-logs.js

# Vacuum PostgreSQL (weekly)
0 4 * * 0 node dist/cron/vacuum-database.js
```

---

## Monitoring & Observability

### Structured Logging

Every operation logs structured data with correlation IDs:

```json
{
  "correlationId": "req-123-456",
  "timestamp": "2025-11-16T10:30:00Z",
  "level": "info",
  "service": "auth",
  "action": "login",
  "userId": "user-789",
  "duration": 156,
  "success": true
}
```

### Metrics to Track

- Request latency (p50, p95, p99)
- Queue depth and processing rate
- Failure rate by error type
- Circuit breaker state changes
- Active WebSocket connections
- Database query performance
- External API call success rates

### Alerts

- Queue depth > 1000 (backlog building)
- Failure rate > 10% (system degrading)
- Circuit breaker opens (external service down)
- Auth failures from SendGrid/Twilio (config issue)
- Database queries > 500ms (need optimization)

---

## Common Pitfalls Avoided

### ❌ DON'T

- Return OTP in response body
- Allow unlimited OTP verification attempts
- Use predictable OTP codes
- Reuse OTP codes
- Publish events before transaction commits
- Store plain text OTPs or passwords
- Make DB writes async
- Use `Math.random()` for OTP generation
- Skip input validation
- Log sensitive data

### ✅ DO

- Hash OTPs before storage
- Limit OTP verification to 3 attempts
- Use cryptographically secure random
- Delete OTP immediately after use
- Publish events AFTER commit
- Validate all inputs
- Use structured logging with correlation IDs
- Implement proper error handling
- Add rate limiting to all endpoints
- Monitor and alert on failures

---

## What Makes This Senior-Level

### Architecture
- Clean separation of concerns
- Domain-driven design principles
- Proper dependency inversion
- Strategic use of design patterns

### Code Quality
- Sequential, readable operations
- Explicit error handling
- Comprehensive logging
- Proper abstractions and interfaces

### Production Readiness
- Async processing for scalability
- Retry logic with circuit breaker
- Real-time user notifications
- Comprehensive monitoring
- Security best practices

### Business Focus
- Enforces business rules in domain layer
- Protects invariants
- Clear audit trail
- User experience optimizations

### Trade-Off Awareness
- Can explain sync vs async decisions
- Justifies sequential over chaining
- Understands performance implications
- Knows when to cache and when not to

---

## Interview Talking Points

**"Why synchronous DB writes for OTP storage?"**

> "The user will submit this OTP in seconds. If we save it asynchronously and they submit before it's saved, they get 'invalid OTP' error. Data must be consistent before returning response. This is a critical path operation where correctness trumps the 20ms latency cost."

**"Why not use method chaining?"**

> "Method chaining like `user.assertNotLocked().assertPasswordValid()` is harder to debug, log, and understand. Sequential operations make the business flow explicit and allow inspection between steps. The slight verbosity is worth the maintainability gain."

**"How do you handle external service failures?"**

> "We use a circuit breaker pattern. After 5 consecutive failures to SendGrid, we open the circuit and stop calling them for 60 seconds. This prevents wasting resources and allows us to suggest alternatives like SMS. The system fails fast and recovers automatically."
