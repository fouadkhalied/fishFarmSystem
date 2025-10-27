# 🚀 API Design Standards

## 1. Pagination Standards

```typescript
// ✅ STANDARD: Page-based pagination
GET /users?page=1&limit=20

// Response format
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}

// ❌ FORBIDDEN: Non-standard pagination
GET /users?offset=20&count=10  // Avoid
```

## 2. CORS Configuration Standards

```typescript
// ✅ STANDARD: Production CORS
app.enableCors({
  origin: ['https://yourdomain.com', 'https://app.yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400 // 24 hours
});

// Development
app.enableCors({
  origin: true, // Allow all in dev
});
```

## 3. Idempotency Standards

```typescript
// ✅ STANDARD: Idempotency for POST/PATCH
POST /orders
Headers:
  X-Idempotency-Key: uuid-v4-string

// Implementation
@Post('orders')
async createOrder(
  @Headers('x-idempotency-key') idempotencyKey: string,
  @Body() createOrderDto: CreateOrderDto
) {
  return this.orderService.createOrder(createOrderDto, idempotencyKey);
}
```

## 4. Response Format Standards

### Success Response

```typescript
// ✅ STANDARD: Consistent success format
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_123456789"
}
```

### Error Response

```typescript
// ✅ STANDARD: Consistent error format
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
  "requestId": "req_123456789"
}
```

## 5. HTTP Status Code Standards

```typescript
// ✅ STANDARD: Proper status codes
200 - OK (GET, PUT, PATCH success)
201 - Created (POST success)
204 - No Content (DELETE success)
400 - Bad Request (validation errors)
401 - Unauthorized (authentication required)
403 - Forbidden (no permission)
404 - Not Found
409 - Conflict (duplicate, state conflict)
422 - Unprocessable Entity (business logic errors)
429 - Too Many Requests (rate limiting)
500 - Internal Server Error
```

## 6. Request ID & Logging Standards

```typescript
// ✅ STANDARD: Request tracking
// Auto-add request ID to all responses
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || generateUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}
```

## 7. Validation Standards

```typescript
// ✅ STANDARD: Comprehensive DTO validation
export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
```

## 8. Rate Limiting Standards

```typescript
// ✅ STANDARD: Tiered rate limiting
@Throttle(
  { default: { ttl: 60000, limit: 100 } }, // 100 requests/minute
  { premium: { ttl: 60000, limit: 1000 } } // 1000 requests/minute
)
@Get('data')
getData() {
  return this.dataService.getData();
}
```

## 9. API Versioning Standards

```typescript
// ✅ STANDARD: URL versioning
@Controller('v1/users')
export class UsersControllerV1 {}

@Controller('v2/users')
export class UsersControllerV2 {}

// Headers for versioning
Accept: application/vnd.api.v1+json
Accept: application/vnd.api.v2+json
```

## 10. Security Headers Standards

```typescript
// ✅ STANDARD: Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## 11. Error Handling Standards

```typescript
// ✅ STANDARD: Global exception filter
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.formatError(exception, request);
    
    response
      .status(errorResponse.statusCode)
      .json(errorResponse);
  }
}
```

## 12. Content Negotiation Standards

```typescript
// ✅ STANDARD: JSON only for APIs
@Get('users')
@Header('Content-Type', 'application/json')
getUsers() {
  return this.userService.getUsers();
}

// Support compression
app.use(compression());
```

## 13. DateTime Standards

```typescript
// ✅ STANDARD: ISO 8601 UTC
{
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:45:00.000Z"
}

// ❌ FORBIDDEN: Local time formats
{
  "createdAt": "2024-01-15 10:30:00" // Avoid
}
```

## 14. Field Naming Standards

```typescript
// ✅ STANDARD: camelCase for JSON
{
  "userId": 123,
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2024-01-15T10:30:00.000Z"
}

// ❌ FORBIDDEN: Mixed naming
{
  "user_id": 123,      // Avoid
  "firstName": "John", // Inconsistent
}
```

## 15. Authentication & Authorization Standards

```typescript
// ✅ STANDARD: JWT Bearer tokens
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// ✅ API Key authentication
X-API-Key: your-api-key-here

// Role-based access control
@Roles('admin', 'moderator')
@UseGuards(RolesGuard)
@Delete('users/:id')
deleteUser() { }
```

## 16. Sorting & Filtering Standards

```typescript
// ✅ STANDARD: Consistent sorting
GET /users?sort=createdAt:desc&sort=name:asc

// ✅ Filtering standards
GET /users?filter[status]=active&filter[role]=admin
GET /users?email[contains]=gmail&age[gt]=18&age[lt]=65

// ✅ Field selection
GET /users?fields=id,name,email&fields=createdAt
```

## 17. Search Standards

```typescript
// ✅ STANDARD: Unified search endpoint
GET /users?q=john+doe&searchFields=name,email,phone

// Advanced search
GET /users?search={
  "operator": "and",
  "conditions": [
    {"field": "age", "operator": "gt", "value": 18},
    {"field": "status", "operator": "eq", "value": "active"}
  ]
}
```

## 18. File Upload Standards

```typescript
// ✅ STANDARD: File validation
@Post('upload')
@UseInterceptors(FileInterceptor('file', {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  }
}))
uploadFile(@UploadedFile() file: Express.Multer.File) { }
```

## 19. Data Validation Standards

```typescript
// ✅ STANDARD: Comprehensive validation
export class CreateProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(0)
  @Max(10000)
  price: number;

  @IsArray()
  @ArrayMinSize(1)
  categories: string[];

  @IsObject()
  metadata: Record<string, any>;

  @ValidateNested()
  @Type(() => InventoryDto)
  inventory: InventoryDto;
}
```

## 20. Cache Control Standards

```typescript
// ✅ STANDARD: HTTP caching headers
@Get('products')
@Header('Cache-Control', 'public, max-age=300') // 5 minutes
@Header('ETag', 'version-hash')
getProducts() { }

// For dynamic data
@Header('Cache-Control', 'no-cache, no-store, must-revalidate')
```

## 21. API Documentation Standards

```typescript
// ✅ STANDARD: OpenAPI/Swagger documentation
@ApiOperation({ summary: 'Create a new user' })
@ApiResponse({ 
  status: 201, 
  description: 'User successfully created',
  type: UserResponseDto
})
@ApiResponse({
  status: 400,
  description: 'Validation error'
})
@Post()
createUser(@Body() createUserDto: CreateUserDto) { }
```

## 22. Health Check Standards

```typescript
// ✅ STANDARD: Comprehensive health checks
GET /health

{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": {
      "status": "ok",
      "responseTime": 45
    },
    "redis": {
      "status": "ok", 
      "responseTime": 12
    },
    "externalApi": {
      "status": "error",
      "responseTime": 0,
      "error": "Connection timeout"
    }
  }
}
```

## 23. Metrics & Monitoring Standards

```typescript
// ✅ STANDARD: Prometheus metrics
import * as prometheus from 'prom-client';

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
```

## 24. Request/Response Logging Standards

```typescript
// ✅ STANDARD: Structured logging
{
  "level": "info",
  "message": "HTTP Request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_123456",
  "method": "POST",
  "url": "/users",
  "statusCode": 201,
  "responseTime": 156,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1",
  "userId": "user_123"
}
```

## 25. Deprecation Standards

```typescript
// ✅ STANDARD: API version deprecation
@Get('old-endpoint')
@Header('Deprecation', 'true')
@Header('Sunset', 'Wed, 01 Jan 2025 00:00:00 GMT')
@Header('Link', '<https://api.example.com/v2/new-endpoint>; rel="successor-version"')
getOldEndpoint() { }
```

## 26. Content Validation Standards

```typescript
// ✅ STANDARD: Input sanitization
import * as sanitizeHtml from 'sanitize-html';

export class CreatePostDto {
  @Transform(({ value }) => sanitizeHtml(value, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a'],
    allowedAttributes: {
      'a': ['href']
    }
  }))
  content: string;
}
```

## 27. Batch Operations Standards

```typescript
// ✅ STANDARD: Batch requests
POST /batch
{
  "operations": [
    {
      "method": "GET",
      "url": "/users/1"
    },
    {
      "method": "POST", 
      "url": "/orders",
      "body": { "productId": 123, "quantity": 2 }
    }
  ]
}
```

## 28. Internationalization Standards

```typescript
// ✅ STANDARD: Accept-Language header
GET /products
Accept-Language: en-US,en;q=0.9,es;q=0.8

// Response with localized content
{
  "id": 1,
  "name": {
    "en": "Smartphone",
    "es": "Teléfono inteligente",
    "fr": "Smartphone"
  }
}
```

## 29. Webhook Standards

```typescript
// ✅ STANDARD: Webhook signatures
X-Webhook-Signature: sha256=...
X-Webhook-Timestamp: 1642239000

// Webhook payload format
{
  "event": "user.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "userId": "user_123",
    "email": "user@example.com"
  }
}
```

## 30. Performance Standards

```typescript
// ✅ STANDARD: Response time targets
- GET requests: < 200ms
- POST/PUT requests: < 500ms  
- Complex queries: < 1000ms
- File uploads: < 5000ms

// Timeout configuration
@Get('data')
@Timeout(10000) // 10 second timeout
async getData() { }
```