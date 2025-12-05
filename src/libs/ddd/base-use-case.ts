import { UseCase } from './use-case.interface';

export abstract class BaseUseCase<I, O> implements UseCase<I, O> {
  abstract execute(input: I): Promise<O>;

  protected createSuccessResponse(): boolean {
    return true;
  }
}
