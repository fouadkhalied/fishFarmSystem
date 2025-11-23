// src/libs/exceptions/exception.filter.ts
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
  } from '@nestjs/common';
  import { FastifyReply } from 'fastify';
  import { v4 as uuidv4 } from 'uuid';
  
  interface ErrorDetail {
    field?: string;
    message: string;
  }
  
  interface StandardErrorResponse {
    success: false;
    error: {
      code: string;
      message: string;
      details?: ErrorDetail[];
    };
    timestamp: string;
    requestId: string;
    path?: string;
  }
  
  @Catch()
  export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<FastifyReply>();
      const request = ctx.getRequest();
  
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
  
      const requestId = request.id || uuidv4();
  
      const errorResponse: StandardErrorResponse = {
        success: false,
        error: this.formatError(exception, status),
        timestamp: new Date().toISOString(),
        requestId,
        path: request.url,
      };
  
      response.status(status).send(errorResponse);
    }
  
    private formatError(exception: unknown, status: number) {
      if (exception instanceof HttpException) {
        const response = exception.getResponse();
        
        // Handle validation errors from class-validator
        if (typeof response === 'object' && 'message' in response) {
          const messages = Array.isArray(response.message) 
            ? response.message 
            : [response.message];
          
          return {
            code: this.getErrorCode(status),
            message: exception.message,
            details: messages.map(msg => ({
              message: typeof msg === 'string' ? msg : JSON.stringify(msg),
            })),
          };
        }
  
        return {
          code: this.getErrorCode(status),
          message: exception.message,
        };
      }
  
      // Unknown errors
      return {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      };
    }
  
    private getErrorCode(status: number): string {
      const codeMap: Record<number, string> = {
        400: 'VALIDATION_ERROR',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'UNPROCESSABLE_ENTITY',
        429: 'RATE_LIMIT_EXCEEDED',
        500: 'INTERNAL_SERVER_ERROR',
      };
  
      return codeMap[status] || 'UNKNOWN_ERROR';
    }
  }