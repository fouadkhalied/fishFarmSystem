import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';


@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const httpHost = host.switchToHttp();
    const exceptionResponse = exception.getResponse();
    const responseMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse['message'] || exception.message;
      const response = httpHost.getResponse();
      const status = exception.getStatus();
      const request = httpHost.getRequest();
      response.code(status).send({
        statusCode: status,
        message: responseMessage,
        timestamp: new Date().toISOString(),
        path: request?.url || 'unknown',
      });
  }
}
