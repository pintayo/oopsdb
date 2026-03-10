import { spawn } from 'child_process';
import { DbConfig } from './config';

export function runPsqlCommand(dbConfig: DbConfig, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        if (dbConfig.password) env.PGPASSWORD = dbConfig.password;
        if (dbConfig.sslmode) env.PGSSLMODE = dbConfig.sslmode;

        const args = [
            '-h', dbConfig.host || 'localhost',
            '-p', String(dbConfig.port || 5432),
            '-U', dbConfig.user || 'postgres',
            '-c', sql,
            dbConfig.database
        ];

        const child = spawn('psql', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `psql exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
}
