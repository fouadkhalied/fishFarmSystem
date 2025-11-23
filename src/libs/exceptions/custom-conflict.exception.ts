import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomConflictException extends HttpException {
  constructor(resource: string, details?: string) {
    super(
      {
        message: `Resource already exists: ${resource}`,
        details: details ? [{ message: details }] : undefined,
      },
      HttpStatus.CONFLICT,
    );
  }
}
