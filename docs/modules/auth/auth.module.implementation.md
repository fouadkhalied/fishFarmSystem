# Two-Factor Authentication System 🔐

A production-ready 2FA system implementing Domain-Driven Design with Clean Architecture principles, featuring OTP delivery via Email/SMS with real-time notifications.

## 📋 Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Domain Layer](#domain-layer)
- [Application Layer](#application-layer)
- [Infrastructure Layer](#infrastructure-layer)
- [API Standards & Implementation](#api-standards--implementation)
- [Database Schema](#database-schema)
- [Authentication Flows](#authentication-flows)
- [Error Handling](#error-handling)
- [Security Implementation](#security-implementation)
- [Testing Strategy](#testing-strategy)
- [Monitoring](#monitoring)
- [Performance Targets](#performance-targets)

## 🎯 Overview

**Goal**: Secure two-factor authentication with OTP delivery via Email/SMS

**Key Features**:
- Sequential operations (no chaining) for clarity and debuggability
- Domain-Driven Design with rich domain entities
- Clean Architecture with clear separation of concerns
- Real-time WebSocket notifications
- Robust retry logic with circuit breakers
- Transaction management with Unit of Work pattern
- Async queue processing for external API calls
- RESTful API following industry standards
- Comprehensive request/response validation
- Request tracking with unique IDs
- Rate limiting and security headers
- OpenAPI/Swagger documentation

## 🛠 Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL
- **ORM**: MikroORM
- **Message Queue**: BullMQ (Redis-backed)
- **Cache**: Redis
- **WebSocket**: Socket.io

### External Services
- **Email**: SendGrid API
- **SMS**: Twilio API

### API Standards & Security
- **Validation**: class-validator, class-transformer
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, Rate Limiting (@nestjs/throttler)
- **Compression**: compression middleware
- **Sanitization**: sanitize-html

### Monitoring & Observability
- **Logging**: Winston/Pino (structured logging)
- **Metrics**: Prometheus client
- **Health Checks**: @nestjs/terminus
- **Request Tracking**: UUID-based request IDs
- **Alerts**: Operations team notifications

## 🏗 Architecture

The system follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│ PRESENTATION LAYER (Controllers)                │
│ - HTTP endpoints                                │
│ - Request/Response DTOs                         │
│ - Validation                                    │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│ APPLICATION LAYER (Services)                    │
│ - AuthenticationApplicationService              │
│ - Orchestrates workflows                        │
│ - Manages transactions (Unit of Work)           │
│ - Publishes domain events                       │
│ - Coordinates repositories & entities           │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│ DOMAIN LAYER (Entities, Value Objects, Events) │
│ - UserAccount (Aggregate Root)                  │
│ - OTPCode (Value Object)                        │
│ - Email, Password (Value Objects)               │
│ - Business logic ONLY                           │
│ - No infrastructure dependencies                │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│ INFRASTRUCTURE LAYER (Repositories, Services)   │
│ - UserRepository (PostgreSQL via MikroORM)      │
│ - OTPRepository (PostgreSQL via MikroORM)       │
│ - Unit of Work (Transaction management)         │
│ - Event Bus (Domain event dispatcher)           │
│ - External API clients (SendGrid, Twilio)       │
└─────────────────────────────────────────────────┘
```

## 🎨 Domain Layer

### UserAccount Entity (Aggregate Root)

The core business entity that enforces all authentication rules.

**Responsibilities**:
- Enforce business rules
- Maintain data consistency
- Publish domain events

**Key Methods**:
- `validatePassword(password)` - Check password match
- `isLocked()` - Check if account is locked
- `recordFailedLogin()` - Increment failed attempts, lock if needed
- `recordSuccessfulLogin()` - Reset counters
- `requestOTP(deliveryMethod)` - Generate OTP, publish event

**Business Rules**:
- 3 failed login attempts → lock account for 15 minutes
- Password must match stored hash
- Account must not be locked to proceed
- Rate limit: max 3 OTP requests per hour

### Value Objects

**Email**
- Validates email format
- Immutable
- Provides value getter

**Password**
- Stores hash (never plain text)
- `matches(submittedPassword)` method
- `fromString()` - hash new password
- `fromHash()` - load existing hash

**OTPCode**
- Generates 6-digit code
- Stores expiration (5 minutes)
- `hash()` for secure storage
- `matches(submitted)` for validation
- Immutable

**Role**
- Valid roles: Admin, FarmManager, Technician, Accountant
- Type-safe enumeration
- Provides permissions

### Domain Events

- `UserAuthenticatedEvent` - User successfully logged in
- `AccountLockedEvent` - Account locked due to failed attempts
- `OTPRequestedEvent` - OTP generation requested
- `LoginFailedEvent` - Login attempt failed

## 💼 Application Layer

### AuthenticationApplicationService

The main orchestrator that coordinates all authentication workflows.

**Dependencies**:
- `IUserRepository` - User data access
- `IOTPRepository` - OTP data access
- `IUnitOfWork` - Transaction management
- `IEventBus` - Event publishing
- `Queue` - Async job queue

#### Login Flow

**Endpoint**: `POST /api/v1/auth/login`

**Request Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional, auto-generated if missing)
X-Idempotency-Key: uuid-v4 (required for idempotency)
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "deliveryMethod": "EMAIL"
}
```

**Request Validation**:
```typescript
export class LoginRequestDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod; // EMAIL | SMS
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "message": "OTP sent to your email",
    "expiresIn": 300,
    "deliveryMethod": "EMAIL"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**Error Responses**:

**400 Bad Request** - Validation Error:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email format is invalid",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**401 Unauthorized** - Invalid Credentials:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**403 Forbidden** - Account Locked:
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked due to multiple failed attempts",
    "details": {
      "lockedUntil": "2024-01-15T10:45:00.000Z",
      "remainingMinutes": 15
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**429 Too Many Requests** - Rate Limit:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Maximum OTP requests exceeded. Try again later.",
    "details": {
      "limit": 3,
      "windowMinutes": 60,
      "retryAfter": 3400
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**Sequential Steps** (~160ms total):

1. `unitOfWork.begin()` - Start transaction
2. `userRepository.findByEmail()` - Load user (10ms)
3. Check if user exists
4. `user.isLocked()` - Business logic check
5. `user.validatePassword()` - Validate password (100ms bcrypt)
6. `user.requestOTP()` - Generate OTP code
7. `otpRepository.countRecentRequests()` - Check rate limit (10ms)
8. Verify rate limit < 3
9. `otpRepository.save()` - Save OTP (20ms)
10. `userRepository.save()` - Save user (20ms)
11. `unitOfWork.commit()` - Commit transaction (10ms)
12. `eventBus.publish(events)` - Publish domain events
13. `emailQueue.add()` - Queue async email (2ms, fire-and-forget)
14. Return response ✓

**Failure Handling**:
If password is invalid:
1. `user.recordFailedLogin()` - Increment counter
2. `userRepository.save()`
3. `unitOfWork.commit()`
4. `eventBus.publish(AccountLockedEvent)` if locked
5. Throw `InvalidCredentialsException`

#### Verify OTP Flow

**Endpoint**: `POST /api/v1/auth/verify-otp`

**Request Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional)
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Request Validation**:
```typescript
export class VerifyOTPRequestDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code: string;
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "FarmManager"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_8g9h0i3b"
}
```

**Error Responses**:

**401 Unauthorized** - Invalid OTP:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_OTP",
    "message": "Invalid or expired OTP code",
    "details": {
      "attemptsRemaining": 2
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_8g9h0i3b"
}
```

**410 Gone** - OTP Expired:
```json
{
  "success": false,
  "error": {
    "code": "OTP_EXPIRED",
    "message": "OTP code has expired. Request a new one.",
    "details": {
      "expiredAt": "2024-01-15T10:25:00.000Z"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_8g9h0i3b"
}
```

**Sequential Steps** (~100ms total):

1. `unitOfWork.begin()` - Start transaction
2. `userRepository.findByEmail()` - Load user (10ms)
3. Check if user exists
4. `otpRepository.findByUserId()` - Load OTP (10ms)
5. Check if OTP exists
6. `submittedOTP.matches(storedOTP)` - Validate code
7. `storedOTP.isExpired()` - Check expiration
8. `user.recordSuccessfulLogin()` - Business logic
9. `otpRepository.delete()` - Remove used OTP (10ms)
10. `jwtService.generate()` - Create JWT (20ms)
11. `sessionRepository.save()` - Track session (20ms)
12. `userRepository.save()` - Save user (20ms)
13. `unitOfWork.commit()` - Commit (10ms)
14. `eventBus.publish(events)` - Publish events
15. Return JWT ✓

#### Refresh Token Flow

**Endpoint**: `POST /api/v1/auth/refresh`

**Request Headers**:
```
Content-Type: application/json
X-Request-ID: uuid-v4 (optional)
```

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_9j0k1l4c"
}
```

## 🔧 Infrastructure Layer

### Repositories

**IUserRepository Interface**:
```typescript
interface IUserRepository {
  findById(id: string): Promise<UserAccount | null>;
  findByEmail(email: string): Promise<UserAccount | null>;
  findByPhone(phone: string): Promise<UserAccount | null>;
  save(user: UserAccount): Promise<void>;
  delete(userId: string): Promise<void>;
  exists(email: string): Promise<boolean>;
}
```

**MikroORMUserRepository Implementation**:
- Implements `IUserRepository`
- Uses MikroORM EntityManager
- Uses Unit of Work for transactions
- Maps between database entities and domain entities

**IOTPRepository Interface**:
```typescript
interface IOTPRepository {
  findByUserId(userId: string): Promise<OTPCode | null>;
  save(otp: OTPCode): Promise<void>;
  delete(otpId: string): Promise<void>;
  countRecentRequests(userId: string, minutes: number): Promise<number>;
}
```

### Unit of Work (Transaction Management)

**IUnitOfWork Interface**:
```typescript
interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
  getEntityManager(): EntityManager;
}
```

**Key Features**:
- Wraps MikroORM EntityManager
- Uses `em.fork()` for request-scoped context
- Ensures atomicity (all-or-nothing)
- Scoped per HTTP request

## 🌐 API Standards & Implementation

### 1. Global Configuration

#### CORS Setup
```typescript
// Production CORS configuration
app.enableCors({
  origin: [
    'https://yourdomain.com',
    'https://app.yourdomain.com',
    'https://admin.yourdomain.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Idempotency-Key'
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
});

// Development CORS
if (process.env.NODE_ENV === 'development') {
  app.enableCors({ origin: true });
}
```

#### Security Headers
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

#### Compression
```typescript
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6
}));
```

### 2. Request/Response Standards

#### Standard Response Format

**Success Response**:
```typescript
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

**Error Response**:
```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [] // Optional validation details
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

#### Global Response Interceptor
```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'];

    return next.handle().pipe(
      map(data => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
        requestId
      }))
    );
  }
}
```

### 3. Idempotency Implementation

```typescript
@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: Redis) {}

  async checkIdempotency(
    key: string,
    ttl: number = 86400 // 24 hours
  ): Promise<{ exists: boolean; response?: any }> {
    const cached = await this.redis.get(`idempotency:${key}`);
    
    if (cached) {
      return { exists: true, response: JSON.parse(cached) };
    }
    
    return { exists: false };
  }

  async saveResponse(
    key: string,
    response: any,
    ttl: number = 86400
  ): Promise<void> {
    await this.redis.setex(
      `idempotency:${key}`,
      ttl,
      JSON.stringify(response)
    );
  }
}

// Usage in controller
@Post('orders')
async createOrder(
  @Headers('x-idempotency-key') idempotencyKey: string,
  @Body() createOrderDto: CreateOrderDto
) {
  if (!idempotencyKey) {
    throw new BadRequestException('X-Idempotency-Key header is required');
  }

  const { exists, response } = await this.idempotencyService.checkIdempotency(
    idempotencyKey
  );

  if (exists) {
    return response;
  }

  const result = await this.orderService.createOrder(createOrderDto);
  
  await this.idempotencyService.saveResponse(idempotencyKey, result);
  
  return result;
}
```

### 4. Validation Standards

#### DTOs with Comprehensive Validation
```typescript
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number and special character'
  })
  @ApiProperty({ example: 'SecurePass123!' })
  password: string;

  @IsEnum(UserRole)
  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @IsOptional()
  @IsPhoneNumber()
  @ApiProperty({ required: false, example: '+201234567890' })
  phone?: string;

  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  @ApiProperty({ type: AddressDto, required: false })
  address?: AddressDto;
}
```

#### Input Sanitization
```typescript
import * as sanitizeHtml from 'sanitize-html';

export class CreatePostDto {
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  @Transform(({ value }) => sanitizeHtml(value, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    allowedAttributes: {
      'a': ['href', 'target']
    }
  }))
  @ApiProperty()
  content: string;
}
```

### 5. Rate Limiting Standards

```typescript
// Global rate limiting
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests
    }])
  ]
})
export class AppModule {}

// Endpoint-specific rate limiting
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 requests/minute
  @Post('login')
  async login(@Body() loginDto: LoginRequestDto) {
    return this.authService.login(loginDto);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } }) // 3 requests/minute
  @Post('verify-otp')
  async verifyOTP(@Body() verifyDto: VerifyOTPRequestDto) {
    return this.authService.verifyOTP(verifyDto);
  }
}
```

**Rate Limit Response**:
```typescript
// HTTP 429 Too Many Requests
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "limit": 5,
      "windowSeconds": 60,
      "retryAfter": 45
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a"
}
```

### 6. Pagination Standards

```typescript
export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ default: 1, minimum: 1 })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ default: 20, minimum: 1, maximum: 100 })
  limit?: number = 20;
}

// Pagination response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Example usage
@Get('users')
async getUsers(@Query() query: PaginationQueryDto): Promise<PaginatedResponse<User>> {
  const { page, limit } = query;
  const [data, total] = await this.userRepository.findAndCount({
    offset: (page - 1) * limit,
    limit
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
}
```

### 7. Sorting & Filtering Standards

```typescript
export class SortQueryDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ 
    example: 'createdAt:desc,name:asc',
    description: 'Format: field:order separated by comma'
  })
  sort?: string;
}

export class FilterQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  @ApiProperty({ enum: UserStatus, required: false })
  status?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  @ApiProperty({ enum: UserRole, required: false })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'john' })
  search?: string; // Search across multiple fields
}

// Example: GET /api/v1/users?page=1&limit=20&sort=createdAt:desc&status=active&search=john
```

### 8. Field Selection Standards

```typescript
export class FieldsQueryDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ 
    example: 'id,name,email,createdAt',
    description: 'Comma-separated list of fields to include'
  })
  fields?: string;
}

// Implementation
@Get('users/:id')
async getUser(
  @Param('id') id: string,
  @Query() query: FieldsQueryDto
) {
  const user = await this.userRepository.findOne({ id });
  
  if (query.fields) {
    const selectedFields = query.fields.split(',');
    return this.selectFields(user, selectedFields);
  }
  
  return user;
}

private selectFields<T>(obj: T, fields: string[]): Partial<T> {
  return fields.reduce((result, field) => {
    if (field in obj) {
      result[field] = obj[field];
    }
    return result;
  }, {} as Partial<T>);
}
```

### 9. API Versioning

```typescript
// URL-based versioning (recommended)
@Controller('v1/auth')
export class AuthControllerV1 {
  // Version 1 implementation
}

@Controller('v2/auth')
export class AuthControllerV2 {
  // Version 2 implementation with breaking changes
}

// Header-based versioning (alternative)
@Controller('auth')
export class AuthController {
  @Get('login')
  @Version('1')
  loginV1() {
    // V1 implementation
  }

  @Get('login')
  @Version('2')
  loginV2() {
    // V2 implementation
  }
}
```

### 10. HTTP Status Codes

| Status | Usage |
|--------|-------|
| 200 | GET, PUT, PATCH success |
| 201 | POST success (resource created) |
| 204 | DELETE success (no content) |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (authentication required) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate, state conflict) |
| 410 | Gone (resource expired/deleted) |
| 422 | Unprocessable Entity (business logic errors) |
| 429 | Too Many Requests (rate limiting) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### 11. Request ID Middleware

```typescript
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.headers['x-request-id'] = requestId as string;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}

// Apply globally
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
```

### 12. OpenAPI/Swagger Documentation

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('2FA Authentication API')
  .setDescription('Two-Factor Authentication System API Documentation')
  .setVersion('1.0')
  .addBearerAuth()
  .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' })
  .addTag('auth', 'Authentication endpoints')
  .addTag('users', 'User management endpoints')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);

// Controller documentation
@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  
  @Post('login')
  @ApiOperation({ 
    summary: 'Request OTP for login',
    description: 'Validates credentials and sends OTP to user via email or SMS'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'OTP sent successfully',
    type: LoginResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded'
  })
  async login(@Body() loginDto: LoginRequestDto) {
    return this.authService.login(loginDto);
  }
}
```

### 13. DateTime Standards

All timestamps use **ISO 8601 UTC format**:
```typescript
{
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:45:00.000Z",
  "expiresAt": "2024-01-15T10:35:00.000Z"
}
```

### 14. Timeout Configuration

```typescript
@Controller('data')
export class DataController {
  
  @Get('report')
  @Timeout(30000) // 30 second timeout
  async generateReport() {
    return this.dataService.generateReport();
  }
}
```

### 15. Cache Control Headers

```typescript
@Controller('products')
export class ProductsController {
  
  @Get()
  @Header('Cache-Control', 'public, max-age=300') // 5 minutes
  @Header('ETag', 'version-hash')
  async getProducts() {
    return this.productService.getAll();
  }

  @Get(':id')
  @Header('Cache-Control', 'private, max-age=60') // 1 minute
  async getProduct(@Param('id') id: string) {
    return this.productService.findById(id);
  }

  @Post()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  async createProduct(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }
}
```

### 16. Content Negotiation

```typescript
// JSON only for APIs
@Controller('api/v1/users')
@Header('Content-Type', 'application/json')
export class UsersController {
  // All endpoints return JSON
}
```

### 17. Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        message = exceptionResponse['message'] || message;
        code = exceptionResponse['error'] || code;
        details = exceptionResponse['details'];
      }
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details && { details })
      },
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id']
    };

    this.logger.error(
      `${request.method} ${request.url}`,
      JSON.stringify(errorResponse),
      'GlobalExceptionFilter'
    );

    response.status(status).json(errorResponse);
  }
}
```

### 18. Authentication & Authorization

```typescript
// JWT Authentication
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}

// Role-based Authorization
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some(role => user.roles?.includes(role));
  }
}

// Usage
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  
  @Get('users')
  @Roles('admin', 'moderator')
  async getAllUsers() {
    return this.userService.findAll();
  }
}
```

### Unit of Work (Transaction Management)

### Message Queue (BullMQ)

**Email Queue Configuration**:
- Name: `email-queue`
- Backend: Redis
- Max attempts: 4 (1 initial + 3 retries)
- Backoff: Exponential (2s, 4s, 8s)
- Concurrency: 10 workers
- Rate limit: 100 jobs/second

**Job Data Structure**:
```json
{
  "userId": "string",
  "otpCode": "string",
  "recipient": "string (email or phone)",
  "deliveryMethod": "EMAIL | SMS",
  "requestId": "string",
  "maxAttempts": "number",
  "idempotencyKey": "string"
}
```

### Email/SMS Workers

**Error Handling Strategy**:

**Transient Errors (Retry)**:
- 500 Internal Server Error
- 503 Service Unavailable
- 429 Rate Limited
- Network timeouts (ETIMEDOUT)
- Connection refused (ECONNREFUSED)

**Permanent Errors (Don't Retry)**:
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 422 Unprocessable Entity

**Special Handling**:
- 429: Respect `Retry-After` header
- 500: Max 3 retries with exponential backoff
- Circuit breaker after 5 consecutive failures

### WebSocket Gateway (Real-Time Updates)

**Connection**:
```typescript
// Client connects with JWT
socket.on('authenticate', { token: 'jwt_token' });

// Server subscribes client to personal channel
socket.join(`user:${userId}`);
```

**Notifications Sent**:

**OTP_PROCESSING**:
```json
{
  "event": "OTP_PROCESSING",
  "data": {
    "message": "Sending OTP...",
    "requestId": "req_123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**OTP_SENT_SUCCESS**:
```json
{
  "event": "OTP_SENT_SUCCESS",
  "data": {
    "message": "✅ OTP sent to your email",
    "deliveryMethod": "EMAIL",
    "expiresIn": 300,
    "requestId": "req_123",
    "timestamp": "2024-01-15T10:30:05.000Z"
  }
}
```

**OTP_RETRY**:
```json
{
  "event": "OTP_RETRY",
  "data": {
    "message": "⚠️ Retrying in 4s (Attempt 2 of 4)",
    "attemptNumber": 2,
    "maxAttempts": 4,
    "retryDelay": 4000,
    "requestId": "req_123",
    "timestamp": "2024-01-15T10:30:08.000Z"
  }
}
```

**OTP_SEND_FAILED**:
```json
{
  "event": "OTP_SEND_FAILED",
  "data": {
    "message": "❌ Failed to send OTP after 4 attempts",
    "reason": "Service unavailable",
    "suggestions": ["Try SMS instead", "Contact support"],
    "requestId": "req_123",
    "timestamp": "2024-01-15T10:30:20.000Z"
  }
}
```

**SUGGEST_ALTERNATIVE**:
```json
{
  "event": "SUGGEST_ALTERNATIVE",
  "data": {
    "message": "Having trouble? Try SMS delivery",
    "alternativeMethods": ["SMS"],
    "requestId": "req_123",
    "timestamp": "2024-01-15T10:30:15.000Z"
  }
}
```

## 🗄 Database Schema

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  phone VARCHAR UNIQUE,
  password_hash VARCHAR NOT NULL,
  role VARCHAR CHECK (role IN ('admin', 'farm_manager', 'technician', 'accountant')),
  failed_login_attempts INTEGER DEFAULT 0,
  account_locked BOOLEAN DEFAULT FALSE,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
```

### otp_codes table
```sql
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR NOT NULL,
  delivery_method VARCHAR CHECK (delivery_method IN ('EMAIL', 'SMS')),
  expires_at TIMESTAMP NOT NULL,
  failed_attempts INTEGER DEFAULT 0,
  invalidated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_user_created ON otp_codes(user_id, created_at);
```

### otp_requests table (Rate Limiting)
```sql
CREATE TABLE otp_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_requests_user_time ON otp_requests(user_id, requested_at);
```

### sessions table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id UUID UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX idx_sessions_token ON sessions(token_id);
```

### activity_log table
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user_time ON activity_log(user_id, timestamp);
CREATE INDEX idx_activity_action_time ON activity_log(action, timestamp);
```

### notifications table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR CHECK (severity IN ('info', 'warning', 'error')),
  read BOOLEAN DEFAULT FALSE,
  actions JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, read, created_at);
```

## 🔄 Authentication Flows

### Process 1: Request OTP

**User Action**: `POST /auth/login` with email + password

**Synchronous Operations** (User waits ~160ms):
1. Validate input format
2. Query DB: Find user by email (10ms)
3. Check user exists
4. Check if account is locked
5. Validate password with bcrypt (100ms)
6. Generate OTP code
7. Check rate limit (10ms)
8. Save OTP to database (20ms)
9. Save user updates (20ms)
10. Commit transaction (10ms)
11. Publish domain events
12. Return success response ✓

**Asynchronous Operations** (User doesn't wait):
- Queue OTP email/SMS job (2ms)
- Send WebSocket notification "OTP_PROCESSING" (1ms)
- Queue activity log job (2ms)

**Worker Process** (2-5 seconds later):
- Worker consumes job from queue
- Call SendGrid/Twilio API (2-3 seconds)
- Send WebSocket "OTP_SENT_SUCCESS" on success
- Handle retries on transient failures
- Send failure notifications if all retries exhausted

### Process 2: Verify OTP

**User Action**: `POST /auth/verify-otp` with email + OTP code

**Synchronous Operations** (User waits ~100ms):
1. Validate input format
2. Query DB: Find user (10ms)
3. Query DB: Get stored OTP (10ms)
4. Validate OTP code matches
5. Check OTP not expired
6. Record successful login
7. Delete used OTP (10ms)
8. Generate JWT token (20ms)
9. Save session (20ms)
10. Save user updates (20ms)
11. Commit transaction (10ms)
12. Publish events
13. Return JWT ✓

**Asynchronous Operations** (User doesn't wait):
- Queue security notification email (2ms)
- Queue activity log (2ms)
- Send WebSocket "LOGIN_SUCCESS" (1ms)

### Process 3: Failure Handling & Retry

**Transient Error Detected**:
1. Worker identifies retryable error (500/503)
2. Calculate exponential backoff delay
3. Update job state to "delayed"
4. Send WebSocket "⚠️ Retrying in Xs"
5. After delay, worker retries

**Permanent Error Detected**:
1. Worker identifies non-retryable error (400/404)
2. Mark job as failed
3. Move to dead letter queue
4. Send WebSocket "❌ Failed to send OTP"
5. Create persistent notification
6. Alert operations team

**Circuit Breaker Opens** (5 consecutive failures):
1. Stop sending requests to external API
2. Fail jobs immediately
3. Send WebSocket "Service unavailable"
4. Alert operations team
5. After 60s: Try one request (half-open state)
6. If succeeds: Close circuit, resume
7. If fails: Stay open another 60s

## 🚨 Error Handling

### Synchronous vs Asynchronous Decisions

**MUST Be Synchronous** ✅:
- User record queries
- Password validation
- Account lock checks
- OTP generation
- OTP storage
- Rate limit enforcement
- Failed attempt counter
- OTP validation
- OTP deletion (prevent reuse)
- JWT generation
- Session storage
- Transaction commits

**CAN Be Asynchronous** 🔥:
- Send OTP email/SMS (external API, slow)
- Activity logging
- Security notification emails
- Last login timestamp update
- Cache invalidation
- Analytics tracking
- WebSocket notifications (fire-and-forget)

## 🔒 Security Implementation

### 1. Password Security

**Password Hashing**:
```typescript
import * as bcrypt from 'bcrypt';

export class Password {
  private readonly SALT_ROUNDS = 12;
  
  private constructor(private readonly hash: string) {}

  static async fromString(plainPassword: string): Promise<Password> {
    const hash = await bcrypt.hash(plainPassword, this.SALT_ROUNDS);
    return new Password(hash);
  }

  static fromHash(hash: string): Password {
    return new Password(hash);
  }

  async matches(plainPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, this.hash);
  }

  getHash(): string {
    return this.hash;
  }
}
```

**Password Validation Requirements**:
```typescript
export class PasswordValidator {
  private static readonly MIN_LENGTH = 8;
  private static readonly MAX_LENGTH = 100;
  
  static validate(password: string): ValidationResult {
    const errors: string[] = [];

    if (password.length < this.MIN_LENGTH) {
      errors.push(`Password must be at least ${this.MIN_LENGTH} characters`);
    }

    if (password.length > this.MAX_LENGTH) {
      errors.push(`Password must not exceed ${this.MAX_LENGTH} characters`);
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

### 2. OTP Security

**OTP Generation & Hashing**:
```typescript
import * as crypto from 'crypto';

export class OTPCode {
  private readonly CODE_LENGTH = 6;
  private readonly EXPIRY_MINUTES = 5;
  
  private constructor(
    private readonly code: string,
    private readonly hash: string,
    private readonly expiresAt: Date
  ) {}

  static generate(): OTPCode {
    const code = crypto.randomInt(100000, 999999).toString();
    const hash = crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.EXPIRY_MINUTES);

    return new OTPCode(code, hash, expiresAt);
  }

  // Constant-time comparison to prevent timing attacks
  matches(submittedCode: string): boolean {
    const submittedHash = crypto
      .createHash('sha256')
      .update(submittedCode)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(this.hash),
      Buffer.from(submittedHash)
    );
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  getCode(): string {
    return this.code; // Only for sending, never store
  }

  getHash(): string {
    return this.hash;
  }

  getExpiresAt(): Date {
    return this.expiresAt;
  }
}
```

### 3. JWT Security

**JWT Configuration**:
```typescript
export interface JWTConfig {
  accessTokenSecret: string;
  accessTokenExpiry: string; // '15m'
  refreshTokenSecret: string;
  refreshTokenExpiry: string; // '7d'
  issuer: string;
  audience: string;
}

export class JWTService {
  constructor(private readonly config: JWTConfig) {}

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        type: 'access'
      },
      this.config.accessTokenSecret,
      {
        expiresIn: this.config.accessTokenExpiry,
        issuer: this.config.issuer,
        audience: this.config.audience,
        subject: payload.userId
      }
    );
  }

  generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(
      {
        userId: payload.userId,
        type: 'refresh',
        tokenId: uuidv4() // For revocation
      },
      this.config.refreshTokenSecret,
      {
        expiresIn: this.config.refreshTokenExpiry,
        issuer: this.config.issuer,
        audience: this.config.audience,
        subject: payload.userId
      }
    );
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience
      });

      if (decoded.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      return decoded as TokenPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.config.refreshTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience
      });

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(
        decoded.tokenId
      );

      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return decoded as TokenPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
```

**Token Expiration**:
- Access Token: 15 minutes
- Refresh Token: 7 days
- Rotate refresh token on use
- Blacklist tokens on logout

### 4. Session Management

```typescript
export interface Session {
  id: string;
  userId: string;
  tokenId: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
}

export class SessionService {
  async createSession(
    userId: string,
    tokenId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      userId,
      tokenId,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date()
    };

    await this.sessionRepository.save(session);
    return session;
  }

  async revokeSession(tokenId: string): Promise<void> {
    await this.sessionRepository.deleteByTokenId(tokenId);
    await this.tokenBlacklistService.addToBlacklist(tokenId);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.sessionRepository.findByUserId(userId);
    
    for (const session of sessions) {
      await this.tokenBlacklistService.addToBlacklist(session.tokenId);
    }

    await this.sessionRepository.deleteByUserId(userId);
  }
}
```

### 5. Rate Limiting Implementation

**Multi-tier Rate Limiting**:
```typescript
export class RateLimitService {
  constructor(private readonly redis: Redis) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / (windowSeconds * 1000))}`;

    const count = await this.redis.incr(windowKey);
    
    if (count === 1) {
      await this.redis.expire(windowKey, windowSeconds);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date((Math.floor(now / (windowSeconds * 1000)) + 1) * windowSeconds * 1000);

    return { allowed, remaining, resetAt };
  }
}

// Rate limit tiers
export enum RateLimitTier {
  LOGIN = 'login',           // 5 attempts per 15 minutes per IP
  OTP_REQUEST = 'otp',       // 3 requests per hour per user
  OTP_VERIFY = 'verify',     // 5 attempts per 15 minutes per user
  GLOBAL_IP = 'global_ip'    // 100 requests per minute per IP
}
```

### 6. Account Lockout Policy

```typescript
export class AccountLockoutService {
  private readonly MAX_FAILED_ATTEMPTS = 3;
  private readonly LOCKOUT_DURATION_MINUTES = 15;

  async recordFailedAttempt(userId: string): Promise<AccountStatus> {
    const user = await this.userRepository.findById(userId);
    
    user.incrementFailedAttempts();

    if (user.failedLoginAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES);
      
      user.lock(lockedUntil);
      
      await this.eventBus.publish(new AccountLockedEvent({
        userId: user.id,
        lockedUntil,
        reason: 'Multiple failed login attempts',
        timestamp: new Date()
      }));

      // Send security notification
      await this.notificationService.sendAccountLockedEmail(user.email);
    }

    await this.userRepository.save(user);

    return {
      isLocked: user.isLocked(),
      failedAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil
    };
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    user.resetFailedAttempts();
    user.unlock();
    await this.userRepository.save(user);
  }
}
```

### 7. IP-based Anomaly Detection

```typescript
export class AnomalyDetectionService {
  async checkSuspiciousActivity(
    userId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ isSuspicious: boolean; reason?: string }> {
    // Check for new device
    const isKnownDevice = await this.sessionRepository.hasDeviceHistory(
      userId,
      userAgent
    );

    // Check for new location (simplified - in production use IP geolocation)
    const isKnownLocation = await this.sessionRepository.hasLocationHistory(
      userId,
      ipAddress
    );

    // Check for rapid location changes
    const recentSession = await this.sessionRepository.findMostRecent(userId);
    if (recentSession) {
      const timeDiff = Date.now() - recentSession.createdAt.getTime();
      const locationsDifferent = recentSession.ipAddress !== ipAddress;

      if (locationsDifferent && timeDiff < 60 * 60 * 1000) { // 1 hour
        return {
          isSuspicious: true,
          reason: 'Impossible travel detected'
        };
      }
    }

    if (!isKnownDevice || !isKnownLocation) {
      // Send notification but allow login
      await this.notificationService.sendNewDeviceAlert(userId, {
        ipAddress,
        userAgent,
        timestamp: new Date()
      });
    }

    return { isSuspicious: false };
  }
}
```

### 8. HTTPS & Security Headers

**Production Deployment Requirements**:
```typescript
// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.hostname}${req.url}`);
    }
    next();
  });
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
}));
```

### 9. CSRF Protection

```typescript
// For session-based authentication (if using cookies)
import * as csurf from 'csurf';

app.use(csurf({ 
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

// CSRF token endpoint
@Get('csrf-token')
getCsrfToken(@Req() req: Request) {
  return { csrfToken: req.csrfToken() };
}
```

### 10. Environment Variables Security

```typescript
// .env.example
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

SENDGRID_API_KEY=your-sendgrid-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token

BCRYPT_SALT_ROUNDS=12
OTP_EXPIRY_MINUTES=5
MAX_FAILED_ATTEMPTS=3
LOCKOUT_DURATION_MINUTES=15

NODE_ENV=development
PORT=3000

// Never commit .env file to version control
// Use secrets manager in production (AWS Secrets Manager, Azure Key Vault, etc.)
```

### 11. Audit Logging

```typescript
export class AuditLogService {
  async log(event: AuditEvent): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      userId: event.userId,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
      timestamp: new Date()
    };

    await this.auditLogRepository.save(log);
  }
}

// Usage
await this.auditLogService.log({
  userId: user.id,
  action: 'LOGIN_SUCCESS',
  resource: 'authentication',
  resourceId: user.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: {
    deliveryMethod: 'EMAIL'
  }
});
```

## 🚨 Error Handling

### Synchronous vs Asynchronous Decisions

**MUST Be Synchronous** ✅:
- User record queries
- Password validation
- Account lock checks
- OTP generation
- OTP storage
- Rate limit enforcement
- Failed attempt counter
- OTP validation
- OTP deletion (prevent reuse)
- JWT generation
- Session storage
- Transaction commits

**CAN Be Asynchronous** 🔥:
- Send OTP email/SMS (external API, slow)
- Activity logging
- Security notification emails
- Last login timestamp update
- Cache invalidation
- Analytics tracking
- WebSocket notifications (fire-and-forget)

## 🧪 Testing Strategy

### Unit Tests (Fast, No I/O)

**UserAccount Entity**:
- Test `validatePassword()`
- Test `isLocked()`
- Test `recordFailedLogin()`
- Test OTP generation
- Test domain event publishing

**Value Objects**:
- Test Email validation
- Test Password hashing
- Test OTP expiration

*No mocks needed - pure business logic*

### Integration Tests (With Test DB)

**Repositories**:
- Test `findByEmail()`
- Test `save()`
- Test entity mapping

**Application Service**:
- Test full login flow
- Test OTP verification flow
- Test failure scenarios

*Use test database, real repositories*

### E2E Tests

**Full User Flow**:
1. Request OTP
2. Receive email (mock SendGrid)
3. Submit OTP
4. Receive JWT
5. Make authenticated request

## 📊 Monitoring & Observability

### Request Tracking

**Every request includes**:
```typescript
// Auto-generated or client-provided
X-Request-ID: req_7f8d9e2a-4b5c-6d7e-8f9g-0h1i2j3k4l5m

// Logged in structured format
{
  "level": "info",
  "message": "HTTP Request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a",
  "method": "POST",
  "url": "/api/v1/auth/login",
  "statusCode": 200,
  "responseTime": 156,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1",
  "userId": "user_123"
}
```

### Metrics Tracked

**Prometheus Metrics**:
```typescript
// HTTP request duration histogram
http_request_duration_seconds{
  method="POST",
  route="/api/v1/auth/login",
  status_code="200"
} 0.156

// Request counter
http_requests_total{
  method="POST",
  route="/api/v1/auth/login",
  status_code="200"
} 1543

// Queue depth gauge
bullmq_queue_waiting{queue="email-queue"} 42
bullmq_queue_active{queue="email-queue"} 10
bullmq_queue_delayed{queue="email-queue"} 5

// OTP metrics
otp_requests_total{delivery_method="EMAIL"} 8921
otp_verifications_total{result="success"} 8456
otp_verifications_total{result="invalid"} 345
otp_verifications_total{result="expired"} 120

// Authentication metrics
login_attempts_total{result="success"} 12453
login_attempts_total{result="invalid_credentials"} 234
login_attempts_total{result="account_locked"} 45
login_attempts_total{result="rate_limited"} 23

// Circuit breaker state
circuit_breaker_state{service="sendgrid"} 0  // 0=closed, 1=open, 2=half-open
circuit_breaker_failures{service="sendgrid"} 3

// WebSocket connections
websocket_connections_active{} 1250
```

### Health Checks

**Endpoint**: `GET /api/v1/health`

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 345600,
  "version": "1.0.0",
  "services": {
    "database": {
      "status": "ok",
      "responseTime": 45,
      "details": {
        "connections": {
          "active": 12,
          "idle": 8,
          "total": 20
        }
      }
    },
    "redis": {
      "status": "ok",
      "responseTime": 12,
      "details": {
        "memory": "256MB",
        "connectedClients": 15
      }
    },
    "emailQueue": {
      "status": "ok",
      "details": {
        "waiting": 42,
        "active": 10,
        "delayed": 5,
        "failed": 2
      }
    },
    "sendgrid": {
      "status": "ok",
      "responseTime": 234,
      "circuitBreaker": "closed"
    },
    "twilio": {
      "status": "degraded",
      "responseTime": 1245,
      "circuitBreaker": "open",
      "error": "Service experiencing delays"
    }
  }
}
```

**Liveness Probe**: `GET /api/v1/health/live`
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Readiness Probe**: `GET /api/v1/health/ready`
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "ready": true
}
```

### Alerts

**Critical (PagerDuty)**:
- Queue depth > 1000
- Failure rate > 10% over 5 minutes
- Circuit breaker opens
- Database connection pool exhausted
- API response time p99 > 2 seconds

**Warning (Slack)**:
- Auth failures (401/403 from SendGrid)
- Database slow queries > 100ms
- Queue processing lag > 30 seconds
- Memory usage > 80%
- CPU usage > 80%

**Info (Logs Only)**:
- OTP delivery success
- User authentication events
- Rate limit triggers
- Cache hits/misses

### Structured Logging

**Log Format**:
```json
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_7f8d9e2a",
  "userId": "user_123",
  "service": "authentication",
  "operation": "verifyOTP",
  "duration": 98,
  "result": "success",
  "metadata": {
    "deliveryMethod": "EMAIL",
    "attemptsRemaining": 3
  }
}
```

**Log Levels**:
- `error` - Application errors, failures
- `warn` - Rate limits, degraded services
- `info` - Business events, auth success
- `debug` - Detailed operation info
- `trace` - Very verbose, disabled in prod

## 🎯 Performance Targets

| Operation | Target | Achieved |
|-----------|--------|----------|
| OTP request response | < 200ms | ✅ 160ms |
| OTP verification response | < 150ms | ✅ 100ms |
| Permission check | < 100ms | ✅ |
| OTP delivery (async) | < 5 seconds | ✅ 2-5s |
| Email delivery (worker) | 2-5 seconds | ✅ |

## 🏆 Key Design Principles

### Domain-Driven Design
- Entities enforce business rules
- Repositories abstract data access
- Domain events for loose coupling
- Ubiquitous language

### Clean Architecture
- Domain layer has zero infrastructure dependencies
- Infrastructure depends on domain (not reverse)
- Application layer orchestrates
- Clear separation of concerns

### SOLID Principles
- **Single Responsibility**: Each class has one job
- **Open/Closed**: Strategy pattern for delivery methods
- **Liskov Substitution**: Repository implementations swappable
- **Interface Segregation**: Small, focused interfaces
- **Dependency Inversion**: Depend on abstractions

### Design Patterns
- **Repository Pattern**: Data access abstraction
- **Unit of Work**: Transaction management
- **Strategy Pattern**: SMS vs Email delivery
- **Observer Pattern**: Event bus for domain events
- **Value Objects**: Email, Password, OTPCode

### Sequential Operations
- Clear, readable code
- Easy to debug
- Explicit error handling
- Step-by-step logging
- No clever chaining

## 📝 License

This documentation describes a proprietary system architecture.

## 🤝 Contributing

Internal development team only. Contact the architecture team for questions.

---

**Built with ❤️ using Domain-Driven Design & Clean Architecture**