import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Global Mocks ────────────────────────────────────────────────────────────
vi.mock('../dist/utils/psql', () => ({
    runPsqlCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
}));

vi.mock('../dist/utils/dumper', () => ({
    createSnapshot: vi.fn().mockResolvedValue('fake.sql.enc')
}));

// Import after mocks
import * as psql from '../dist/utils/psql';
import * as dumper from '../dist/utils/dumper';
import { saveConfig } from '../dist/utils/config';
import { lockCommand } from '../dist/commands/lock';
import { unlockCommand } from '../dist/commands/unlock';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let workDir: string;
let origCwd: string;

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'oopsdb-antigravity-'));
}

describe('Antigravity Lock/Unlock', () => {
    beforeEach(() => {
        origCwd = process.cwd();
        workDir = makeTempDir();
        process.chdir(workDir);
    });

    afterEach(() => {
        process.chdir(origCwd);
        fs.rmSync(workDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('lockCommand constructs correct SQL for Postgres event triggers', async () => {
        saveConfig({
            db: { type: 'postgres' as const, database: 'testdb', host: 'localhost', port: 5432, user: 'postgres' },
            createdAt: new Date().toISOString(),
            masterKey: crypto.randomBytes(32).toString('hex')
        });

        await lockCommand();

        expect(psql.runPsqlCommand).toHaveBeenCalled();
        const generatedSql = vi.mocked(psql.runPsqlCommand).mock.calls[0][0];

        expect(generatedSql).toContain('CREATE OR REPLACE FUNCTION oopsdb_block_ddl()');
        expect(generatedSql).toContain('RAISE EXCEPTION');
        expect(generatedSql).toContain('CREATE EVENT TRIGGER oopsdb_protect_schema');
        expect(generatedSql).toContain('ON ddl_command_start');
    });

    it('unlockCommand takes snapshot and drops trigger', async () => {
        saveConfig({
            db: { type: 'postgres' as const, database: 'testdb', host: 'localhost', port: 5432, user: 'postgres' },
            createdAt: new Date().toISOString(),
            masterKey: crypto.randomBytes(32).toString('hex')
        });

        const exitMock = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        vi.useFakeTimers();

        const unlockPromise = unlockCommand();

        vi.runAllTimers();
        await unlockPromise;
        vi.useRealTimers();

        expect(dumper.createSnapshot).toHaveBeenCalledTimes(1);
        expect(psql.runPsqlCommand).toHaveBeenCalledTimes(2);

        const unlockSql = vi.mocked(psql.runPsqlCommand).mock.calls[0][0];
        expect(unlockSql).toContain('DROP EVENT TRIGGER IF EXISTS oopsdb_protect_schema');

        const relockSql = vi.mocked(psql.runPsqlCommand).mock.calls[1][0];
        expect(relockSql).toContain('CREATE EVENT TRIGGER oopsdb_protect_schema');

        expect(exitMock).toHaveBeenCalledWith(0);
    });
});
