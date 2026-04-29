export enum ErrorName {
  InternalError = "InternalError",
  BadRequestError = "BadRequestError",
  UnauthorizedError = "UnauthorizedError",
  NotFoundError = "NotFoundError",
  ConflictError = "ConflictError",
  ForbiddenError = "ForbiddenError",
}

export class InternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.InternalError;
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.BadRequestError;
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.UnauthorizedError;
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.NotFoundError;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.ConflictError;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.ForbiddenError;
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}
