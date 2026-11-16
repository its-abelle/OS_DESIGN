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
    };
}
