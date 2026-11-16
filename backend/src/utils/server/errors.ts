// utils/server/errors.ts
// Thrown on purpose with a message that is safe to show the user
export class UserFacingError extends Error {
    status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}
