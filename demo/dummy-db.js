const net = require('net');
const { exec } = require('child_process');

// OopsDB Shield defaults to forwarding to port 3306 if no port is specified for non-Postgres DBs.
const targetPort = 3306;

const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const query = data.toString().trim();
    
    // Execute the actual command against the SQLite file!
    exec(`sqlite3 test.db "${query}"`, (err, stdout, stderr) => {
      if (err) {
        socket.write(`Error: ${stderr}`);
      } else {
        socket.write(stdout || "Query OK");
      }
    });
  });
});

server.listen(targetPort, () => {
  // Silent execution so it doesn't clutter the demo screen
});
