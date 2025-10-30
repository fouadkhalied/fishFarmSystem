# Authentication & Authorization Module - Technical Summary

## Overview
A secure authentication system with Two-Factor Authentication (2FA), background job processing, and real-time notifications for role-based access control.

---

## Core Dependencies

- **Database**: PostgreSQL 14+ (Users, Activity Logs, OTP Audit, Notifications, User Devices)
- **Cache**: Redis 7+ (OTP sessions, rate limiting, job queues)
- **Job Queue**: BullMQ (Background task processing)
- **External Services**: Twilio (SMS), SendGrid (Email), Firebase FCM (Push), MaxMind GeoIP
- **Security**: bcrypt (password hashing), JWT (authentication tokens)

---

## Authentication Flow

```typescript
// 1. LOGIN REQUEST - User submits credentials
POST /v1/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

// 2. RESPONSE - If 2FA required (Admin/Farm Manager)
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123xyz",
    "requires2FA": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_uuid_here"
}

// 3. VERIFY OTP - User submits 6-digit code
POST /v1/auth/verify-otp
{
  "sessionId": "sess_abc123xyz",
  "otp": "123456"
}

// 4. SUCCESS - JWT Token returned
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "Admin",
      "permissions": ["users:read", "users:write"]
    }
  },
  "timestamp": "2024-01-15T10:31:00.000Z",
  "requestId": "req_uuid_here"
}
```

---

## Business Rules

### BR-001: Failed Login Attempts
```typescript
// After 3 failed attempts, account locks for 15 minutes
// Redis key: login:attempts:{user_id}

// Error response when locked:
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is locked due to too many failed attempts",
    "unlockTime": "2024-01-15T10:45:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_uuid_here"
}

// Critical notifications sent: Push + Email + SMS
```

### BR-002: OTP Management
```typescript
// OTP stored in Redis with 5-minute TTL
// Redis key: otp:session:{session_id}
{
  "userId": "user_123",
  "otp": "hashed_otp_value",
  "email": "user@example.com",
  "phone": "+201234567890",
  "role": "Admin",
  "createdAt": "2024-01-15T10:30:00.000Z"
}

// Resend limit: 3 times per hour
// Redis key: otp:resend:{user_id}

// Resend endpoint:
POST /v1/auth/resend-otp
{
  "sessionId": "sess_abc123xyz"
}

// Response:
{
  "success": true,
  "data": {
    "message": "OTP has been resent",
    "attemptsRemaining": 2
  },
  "timestamp": "2024-01-15T10:32:00.000Z",
  "requestId": "req_uuid_here"
}
```

### BR-003: 2FA Requirements by Role
```typescript
// Mandatory 2FA roles (Push + Email + SMS):
const MANDATORY_2FA_ROLES = ['Admin', 'FarmManager'];

// Optional 2FA roles (Push + Email):
const OPTIONAL_2FA_ROLES = ['Technician', 'Accountant'];

// Implementation:
if (MANDATORY_2FA_ROLES.includes(user.role)) {
  return await this.initiate2FA(user, ['push', 'email', 'sms']);
} else if (OPTIONAL_2FA_ROLES.includes(user.role)) {
  return await this.initiate2FA(user, ['push', 'email']);
} else {
  return await this.generateToken(user);
}
```

### BR-004: Password Policy
```typescript
// Password validation DTO
export class PasswordDto {
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  password: string;
}

// Password expiration check (90 days)
const isExpired = dayjs().diff(user.passwordChangedAt, 'days') > 90;

// Password history check (last 5 passwords)
const isReused = await this.checkPasswordHistory(user.id, newPassword, 5);

// Warning notification sent 7 days before expiration
```

### BR-005: Session Management
```typescript
// JWT Token structure
{
  "jti": "uuid_v4_here",           // Unique token ID
  "sub": "user_123",                // User ID
  "email": "user@example.com",
  "role": "Admin",
  "permissions": ["users:read", "users:write"],
  "iat": 1642239000,                // Issued at
  "exp": 1642843800,                // Expires at (7 days)
  "iss": "auth-service",            // Issuer
  "aud": "api-gateway"              // Audience
}

// Logout - Blacklist token JTI
POST /v1/auth/logout
Headers: Authorization: Bearer {token}

// Redis blacklist: token:blacklist:{jti}
// TTL: Remaining token lifetime (up to 7 days)
```

### BR-006: Notification Delivery
```typescript
// Notification priority levels
const NOTIFICATION_CHANNELS = {
  CRITICAL: ['push', 'email', 'sms'],      // Account locked, suspicious activity
  HIGH: ['push', 'email'],                 // New login, password changed
  MEDIUM: ['email'],                       // Password expiring soon
  LOW: ['push']                            // Session expiring
};

// Background job example:
await notificationQueue.add('critical-alert', {
  userId: 'user_123',
  type: 'ACCOUNT_LOCKED',
  channels: NOTIFICATION_CHANNELS.CRITICAL,
  data: { ip: '192.168.1.1', attempts: 3 }
}, { priority: 1 });
```

---

## API Endpoints

### POST /v1/auth/login
```typescript
@Post('login')
@Throttle({ default: { ttl: 900000, limit: 10 } }) // 10 req/15min
@ApiOperation({ summary: 'Login with credentials' })
@ApiResponse({ status: 200, description: 'Login successful or 2FA required' })
@ApiResponse({ status: 401, description: 'Invalid credentials' })
@ApiResponse({ status: 423, description: 'Account locked' })
async login(
  @Body() loginDto: LoginDto,
  @Ip() ip: string,
  @Headers('user-agent') userAgent: string,
  @Headers('x-request-id') requestId: string,
) {
  const result = await this.authService.login(loginDto, ip, userAgent, requestId);
  return {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId,
  };
}
```

### POST /v1/auth/verify-otp
```typescript
@Post('verify-otp')
@Throttle({ default: { ttl: 300000, limit: 3 } }) // 3 attempts/5min
@ApiOperation({ summary: 'Verify OTP code' })
async verifyOtp(
  @Body() verifyOtpDto: VerifyOtpDto,
  @Ip() ip: string,
  @Headers('user-agent') userAgent: string,
  @Headers('x-request-id') requestId: string,
) {
  const result = await this.authService.verifyOtp(verifyOtpDto, ip, userAgent, requestId);
  return {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId,
  };
}
```

### POST /v1/auth/resend-otp
```typescript
@Post('resend-otp')
@Throttle({ default: { ttl: 3600000, limit: 3 } }) // 3 req/hour
async resendOtp(
  @Body() resendOtpDto: ResendOtpDto,
  @Headers('x-request-id') requestId: string,
) {
  const result = await this.authService.resendOtp(resendOtpDto, requestId);
  return {
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId,
  };
}
```

### POST /v1/auth/logout
```typescript
@Post('logout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
async logout(@Req() req: any, @Headers('x-request-id') requestId: string) {
  await this.authService.logout(req.user.id, req.user.jti);
  return {
    success: true,
    data: { message: 'Logout successful' },
    timestamp: new Date().toISOString(),
    requestId,
  };
}
```

### GET /v1/health
```typescript
@Get('health')
@ApiOperation({ summary: 'Health check' })
async healthCheck() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'ok', responseTime: 45 },
      redis: { status: 'ok', responseTime: 12 },
      jobQueue: { status: 'ok', pending: 5 },
      externalServices: {
        twilio: { status: 'ok' },
        sendgrid: { status: 'ok' },
        fcm: { status: 'ok' }
      }
    }
  };
}
```

---

## Background Jobs Implementation

### Notification Worker
```typescript
@Processor('notifications')
export class NotificationWorker {
  @Process('send-otp')
  async handleOtpDelivery(job: Job) {
    const { email, phone, otp, channels } = job.data;
    
    const promises = [];
    if (channels.includes('email')) {
      promises.push(this.sendgridService.sendOtp(email, otp));
    }
    if (channels.includes('sms')) {
      promises.push(this.twilioService.sendOtp(phone, otp));
    }
    if (channels.includes('push')) {
      promises.push(this.fcmService.sendOtp(email, otp));
    }
    
    const results = await Promise.allSettled(promises);
    return { delivered: results.filter(r => r.status === 'fulfilled').length };
  }

  @Process('critical-alert')
  async handleCriticalAlert(job: Job) {
    const { userId, type, channels, data } = job.data;
    
    await Promise.all([
      this.sendgridService.sendAlert(userId, type, data),
      this.twilioService.sendAlert(userId, type, data),
      this.fcmService.sendAlert(userId, type, data),
    ]);
  }
}
```

### Security Worker
```typescript
@Processor('security')
export class SecurityWorker {
  @Process('geo-enrich')
  async handleGeoEnrichment(job: Job) {
    const { userId, ip } = job.data;
    
    // Check cache first (80% hit rate target)
    let geoData = await this.redis.get(`geo:${ip}`);
    
    if (!geoData) {
      geoData = await this.maxmindService.lookup(ip);
      await this.redis.setex(`geo:${ip}`, 86400, JSON.stringify(geoData));
    }
    
    await this.activityLogRepo.update(
      { userId, ip },
      { country: geoData.country, city: geoData.city }
    );
  }

  @Process('anomaly-detect')
  async handleAnomalyDetection(job: Job) {
    const { userId, ip, userAgent } = job.data;
    
    const riskScore = await this.calculateRiskScore(userId, ip, userAgent);
    
    if (riskScore > 70) {
      await this.notificationQueue.add('critical-alert', {
        userId,
        type: 'SUSPICIOUS_ACTIVITY',
        channels: ['push', 'email', 'sms'],
        data: { riskScore, ip }
      });
    }
  }
  
  private async calculateRiskScore(userId: string, ip: string, userAgent: string): Promise<number> {
    let score = 0;
    
    // New location (+30)
    const knownLocations = await this.getKnownLocations(userId);
    if (!knownLocations.includes(ip)) score += 30;
    
    // New device (+25)
    const knownDevices = await this.getKnownDevices(userId);
    if (!knownDevices.includes(userAgent)) score += 25;
    
    // Unusual time (+20)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) score += 20;
    
    // Rapid geo change (+25)
    const lastLogin = await this.getLastLogin(userId);
    if (lastLogin && this.isRapidGeoChange(lastLogin.ip, ip)) score += 25;
    
    return score;
  }
}
```

---

## Redis Cache Structure

```typescript
// OTP Session
await redis.setex('otp:session:sess_abc123', 300, JSON.stringify({
  userId: 'user_123',
  otp: 'hashed_value',
  email: 'user@example.com',
  phone: '+201234567890',
  role: 'Admin'
}));

// OTP Verification Attempts
await redis.setex('otp:attempts:sess_abc123', 300, '0');

// OTP Resend Counter
await redis.setex('otp:resend:user_123', 3600, '1');

// Failed Login Attempts
await redis.incr('login:attempts:user_123');
await redis.expire('login:attempts:user_123', 900);

// Account Lock
await redis.setex('account:locked:user_123', 900, 'true');

// Token Blacklist
await redis.setex('token:blacklist:jti_uuid', 604800, 'true'); // 7 days

// Rate Limiting
await redis.incr('ratelimit:api:192.168.1.1');
await redis.expire('ratelimit:api:192.168.1.1', 60);

// Geolocation Cache
await redis.setex('geo:192.168.1.1', 86400, JSON.stringify({
  country: 'Egypt',
  city: 'Alexandria',
  latitude: 31.2001,
  longitude: 29.9187
}));
```

---

## Error Handling Examples

```typescript
// Invalid Credentials (401)
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_uuid_here"
}

// Account Locked (423)
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is locked due to too many failed attempts",
    "unlockTime": "2024-01-15T10:45:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_uuid_here"
}

// OTP Expired (400)
{
  "success": false,
  "error": {
    "code": "OTP_EXPIRED",
    "message": "OTP has expired. Please request a new one."
  },
  "timestamp": "2024-01-15T10:35:00.000Z",
  "requestId": "req_uuid_here"
}

// Invalid OTP (400)
{
  "success": false,
  "error": {
    "code": "INVALID_OTP",
    "message": "Invalid OTP code",
    "attemptsRemaining": 2
  },
  "timestamp": "2024-01-15T10:31:00.000Z",
  "requestId": "req_uuid_here"
}

// Rate Limit Exceeded (429)
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "retryAfter": 300
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_uuid_here"
}
```

---

## Database Schema

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions JSONB DEFAULT '[]',
  password_changed_at TIMESTAMP DEFAULT NOW(),
  password_history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity Log
CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  country VARCHAR(100),
  city VARCHAR(100),
  risk_score INTEGER DEFAULT 0,
  timestamp TIMESTAMP DEFAULT NOW(),
  request_id VARCHAR(50)
);

-- OTP Audit Log
CREATE TABLE otp_audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  request_id VARCHAR(50)
);

-- Notifications
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Devices
CREATE TABLE user_devices (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_fingerprint VARCHAR(255),
  fcm_token TEXT,
  is_trusted BOOLEAN DEFAULT FALSE,
  last_used_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Performance Requirements

| Operation | Target | Notes |
|-----------|--------|-------|
| Password validation | < 1 second | bcrypt verification |
| OTP generation response | < 200ms | Return sessionId immediately |
| OTP delivery | < 3 seconds | Background job |
| Token generation response | < 500ms | Return JWT immediately |
| Total login flow | < 2 seconds | Synchronous operations only |
| Background jobs | < 10 seconds | Geo enrichment, anomaly detection |
| Redis operations | < 5ms | All cache operations |

---

## Deployment Configuration

```yaml
# docker-compose.yml
version: '3.8'
services:
  auth-service:
    image: auth-service:latest
    replicas: 3
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  auth-worker:
    image: auth-service:latest
    command: npm run worker
    replicas: 3
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - TWILIO_SID=${TWILIO_SID}
      - SENDGRID_KEY=${SENDGRID_KEY}
    depends_on:
      - redis

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=auth_db
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
```