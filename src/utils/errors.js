export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function validationError(zodError) {
  const message = zodError.issues
    .map((issue) => issue.message)
    .filter(Boolean)
    .join(' ');
  return new HttpError(400, 'VALIDATION_ERROR', message || 'The request is not valid.');
}
