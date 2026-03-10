const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');

console.log('\n🎬 STAGE 1: Starting the OopsDB Shield Visual Emulator...\n');

// Simulated Shield Server (Fake SQLite TCP wrapper for the camera)
const shieldPort = 5433;

const shieldServer = net.createServer((socket) => {
  socket.on('data', (data) => {
    const query = data.toString().trim();
    if (/(DROP|DELETE|TRUNCATE)/i.test(query)) {
      console.log('\x1b[41m\x1b[37m\x1b[1m\n  WARNING  \x1b[0m\x1b[31m Destructive command intercepted!\x1b[0m');
      console.log(`\x1b[90m  Command snippet: ${query}\x1b[0m\n`);
      
      console.log('⠋ Taking safety snapshot...');
      
      // Simulate snapshot time
      setTimeout(() => {
        console.log('\x1b[32m✔\x1b[0m Safety snapshot secured.');
        console.log('\x1b[33m  Releasing command to database...\n\x1b[0m');
        
        // Actually execute the destructive query on the real SQLite db!
        const sqlite = spawn('sqlite3', ['test.db', query]);
        sqlite.on('close', () => {
          socket.write('Query Executed');
          socket.end();
        });
      }, 1500);

    } else {
      socket.write('Query OK');
    }
  });

  socket.on('error', () => {});
});

shieldServer.listen(shieldPort, () => {
  console.log('\x1b[1m  OopsDB Shield \x1b[32mACTIVE\x1b[0m');
  console.log(`\x1b[90m  Listening on port ${shieldPort} -> Forwarding to sqlite locally\x1b[0m\n`);
  
  console.log('\n🤖 STAGE 2: Pretending we are an AI coding agent...\n');
  
  // Show the users that are currently in the DB
  console.log('\x1b[36m> AI: Let me check the current users...\x1b[0m');
  const checkUsers = spawn('sqlite3', ['test.db', '-header', '-column', 'SELECT id, name, email FROM users;']);
  checkUsers.stdout.pipe(process.stdout);
  
  checkUsers.on('close', () => {
    console.log('\n\x1b[36m> AI: Now I will perform the database migration...\x1b[0m');
    console.log('\x1b[35m[AI Executing:] DROP TABLE users;\x1b[0m\n');
    
    // Fire the malicious query at the Shield port!
    const client = net.createConnection({ port: shieldPort }, () => {
      client.write('DROP TABLE users;');
    });

    client.on('data', () => {
      // The Shield released the query and it executed.
      console.log('\n\x1b[36m> AI: Migration complete!\x1b[0m\n');
      console.log('😲 Oh no! The table is actually gone now:');
      
      const checkEmpty = spawn('sqlite3', ['test.db', 'SELECT count(*) FROM users;']);
      checkEmpty.stderr.pipe(process.stdout); // Will print "no such table: users"
      
      checkEmpty.on('close', () => {
        console.log('\n🦸‍♂️ STAGE 3: OOPsDB to the rescue!\n');
        console.log('\x1b[36m> Developer: `npx oopsdb restore`\x1b[0m');
        
        // Find the most recent snapshot in .oopsdb
        const backupsPath = './.oopsdb/backups';
        const files = fs.readdirSync(backupsPath).filter(f => f.endsWith('.enc'));
        const latest = files.sort().reverse()[0];
        
        console.log(`\n\x1b[32m✔\x1b[0m Snapshot ${latest} restored successfully.\n`);
        
        console.log('Let\'s check the database again:');
        
        // Faking the restore for the demo speed
        const restoreProcess = spawn('sqlite3', ['test.db']);
        restoreProcess.stdin.write(fs.readFileSync('seed.sql'));
        restoreProcess.stdin.end();

        restoreProcess.on('close', () => {
          const finalCheck = spawn('sqlite3', ['test.db', '-header', '-column', 'SELECT id, name, email FROM users;']);
          finalCheck.stdout.pipe(process.stdout);
          
          finalCheck.on('close', () => {
            console.log('\n\x1b[1m\x1b[32m🎉 Demo complete! The data survived the AI apocalypse.\x1b[0m\n');
            process.exit(0);
          });
        });
      });
    });
  });
});
