import type pg from "pg";

export interface User {
    id: number;
    username: string;
    email: string;
}

export interface Account extends User {
    password_hash: string;
}

export interface UserRepository {
    create(username: string, email: string, passwordHash: string): Promise<User>;
    findByEmail(email: string): Promise<Account | undefined>;
    findById(id: number): Promise<User | undefined>;
}

export function createUserRepository(pool: pg.Pool): UserRepository {
    return {
        async create(username, email, passwordHash) {
            const result = await pool.query<User>(
                `INSERT INTO users (username, email, password_hash)
                 VALUES ($1, $2, $3) RETURNING id, username, email`,
                [username, email, passwordHash],
            );
            return result.rows[0]!;
        },
        async findByEmail(email) {
            const result = await pool.query<Account>(
                "SELECT id, username, email, password_hash FROM users WHERE email = $1",
                [email],
            );
            return result.rows[0];
        },
        async findById(id) {
            const result = await pool.query<User>("SELECT id, username, email FROM users WHERE id = $1", [id]);
            return result.rows[0];
        },
    };
}
