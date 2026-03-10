import * as net from 'net';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { createSnapshot } from '../utils/dumper';

export async function shieldCommand(options: { port?: string }): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
    return;
  }

  const proxyPort = parseInt(options.port || '5433', 10);
  const targetPort = config.db.port || (config.db.type === 'postgres' ? 5432 : 3306);
  const targetHost = config.db.host || 'localhost';

  console.log(chalk.bold('\n  OopsDB Shield ' + chalk.green('ACTIVE')));
  console.log(chalk.gray(`  Listening on port ${proxyPort} -> Forwarding to ${config.db.type} on ${targetPort}\n`));

  const DESTRUCTIVE_REGEX = /(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)/i;

  const server = net.createServer((clientSocket: net.Socket) => {
    const targetSocket = net.createConnection({
      host: targetHost,
      port: targetPort
    });

    targetSocket.on('error', (err: any) => {
      console.log(chalk.red(`\n  Database connection error: ${err.message}`));
      clientSocket.destroy(err);
    });

    clientSocket.on('error', (err: any) => {
      targetSocket.destroy(err);
    });

    // Handle traffic from DB back to Client
    targetSocket.pipe(clientSocket);

    // Handle traffic from Client to DB (with interception)
    clientSocket.on('data', async (chunk: Buffer) => {
      const dataString = chunk.toString();
      
      if (DESTRUCTIVE_REGEX.test(dataString)) {
        // Destructive command detected!
        clientSocket.pause();
        targetSocket.pause();

        console.log(chalk.bgRed.white.bold('\n  WARNING  ') + chalk.red(' Destructive command intercepted!'));
        console.log(chalk.gray(`  Command snippet: ${dataString.substring(0, 100).replace(/\n/g, ' ')}\n`));
        
        const spinner = ora('Taking safety snapshot...').start();
        try {
          await createSnapshot(config.db);
          spinner.succeed('Safety snapshot secured.');
        } catch (err: any) {
          spinner.fail(`Failed to take safety snapshot: ${err.message}`);
        }

        console.log(chalk.yellow('  Releasing command to database...\n'));
        targetSocket.write(chunk);
        targetSocket.resume();
        clientSocket.resume();
      } else {
        // Normal query, pass it through
        targetSocket.write(chunk);
      }
    });

    targetSocket.on('close', () => {
      clientSocket.end();
    });

    clientSocket.on('close', () => {
      targetSocket.end();
    });
  });

  server.listen(proxyPort, () => {
    // The server is now listening
  });

  server.on('error', (err: any) => {
    console.log(chalk.red(`\n  Proxy server error: ${err.message}\n`));
    process.exit(1);
  });
}
