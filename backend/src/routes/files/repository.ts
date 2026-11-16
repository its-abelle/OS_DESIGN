import type pg from "pg";

export interface NewFile {
    key: string;
    originalFilename: string;
    mimeType: "application/pdf";
    sizeBytes: number;
    uploadedBy: number;
}

export interface FileRecord extends NewFile {
    id: number;
    createdAt: Date;
}

export interface FileRepository {
    create(file: NewFile): Promise<FileRecord>;
    isOwnedBy(key: string, userId: number): Promise<boolean>;
    listOwnedBy(userId: number, limit: number, beforeId?: number): Promise<{ files: FileRecord[]; nextCursor: number | null }>;
}

export function createFileRepository(pool: pg.Pool): FileRepository {
    return {
        async create(file) {
            const result = await pool.query<{ id: number; created_at: Date }>(
                `INSERT INTO files (original_filename, s3_key, mime_type, size_bytes, uploaded_by)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
                [file.originalFilename, file.key, file.mimeType, file.sizeBytes, file.uploadedBy],
            );
            const row = result.rows[0]!;
            return { ...file, id: row.id, createdAt: row.created_at };
        },
        async isOwnedBy(key, userId) {
            const result = await pool.query(
                "SELECT 1 FROM files WHERE s3_key = $1 AND uploaded_by = $2",
                [key, userId],
            );
            return result.rows.length > 0;
        },
        async listOwnedBy(userId, limit, beforeId) {
            const result = await pool.query<FileRecord>(
                `SELECT id, original_filename AS "originalFilename", s3_key AS key,
                        mime_type AS "mimeType", size_bytes::float8 AS "sizeBytes",
                        uploaded_by AS "uploadedBy", created_at AS "createdAt"
                 FROM files WHERE uploaded_by = $1 AND ($2::integer IS NULL OR id < $2)
                 ORDER BY id DESC LIMIT $3`,
                [userId, beforeId ?? null, limit + 1],
            );
            const files = result.rows.slice(0, limit);
            return { files, nextCursor: result.rows.length > limit ? files.at(-1)!.id : null };
        },
    };
}
