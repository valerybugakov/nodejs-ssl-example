'use strict';

var https = require('https');
var fs = require('fs');
var path = require('path');
var certsPath = path.join(__dirname, 'certs', 'server');
var caCertsPath = path.join(__dirname, 'certs', 'ca');
// var mmdbreader = require('maxmind-db-reader');
// var countries = new mmdbreader('./GeoLite2-Country.mmdb');

var options = {
  key: fs.readFileSync(path.join(certsPath, 'my-server.key.pem')),
  // This certificate should be a bundle containing your server certificate and any intermediates
  // cat certs/cert.pem certs/chain.pem > certs/server-bundle.pem
  cert: fs.readFileSync(path.join(certsPath, 'my-server.crt.pem')),
  // ca only needs to be specified for peer-certificates
  ca: [ fs.readFileSync(path.join(caCertsPath, 'my-root-ca.crt.pem')) ],
  secureProtocol: 'TLSv1_method',
  requestCert: true,
  ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
  honorCipherOrder: true,
  rejectUnauthorized: true,
};

process.on('SIGINT', function() { console.log('quitting'); process.exit(); });
process.on('SIGTERM', function() { console.log('terminating'); process.exit(); });

function handleDownload(req, res, clientCert) {
  var fingerprint = clientCert.fingerprint;
  req.resume();

  console.log(fingerprint);
  res.setTimeout(2000, function() { console.log('timed out'); });

  res.writeHead(304, {'content-type': 'text/plain'});
  res.end('Up to date\n');
  console.log(304);
}

var server = https.createServer(options, function (req, res) {
  var timestamp = new Date().toISOString();
  var clientCert = req.connection.getPeerCertificate();
  var deviceId = req.headers['device-id'];
  var remoteVersionString = req.headers['application-version'];
  var installedPackages = req.headers['installed-packages'];
  var ipAddress = req.connection.remoteAddress;

  // var countryRec = countries.getGeoData(ipAddress);
  // var country = countryRec ? countryRec.country.names.en : null;
  // var countryCode = countryRec ? countryRec.country.iso_code : null;
  // var subject = clientCert.subject;
  // if (subject) console.log(subject.O);
  // console.log('%s | %s | %s | %s | %s | %s', timestamp, remoteVersionString, deviceId, countryCode, country, ipAddress);

  // if (installedPackages) console.log(installedPackages);
  // if (req.url === '/') {
  //   handleDownload(req, res, clientCert);
  // } else {
  //   console.log('unknown path: %s', req.url);
  // }
})

server.listen(8000, function() {
  var port = server.address().port;
  console.log('Listening on https://127.0.0.1:' + port);
});

server.on('request', function(req, res) {
  console.log(req.headers['device-id'])
  var filename = path.join(__dirname, 'downloads', 'test.sh')
  fs.readFile(filename, "binary", function(err, file) {
    if(err) {
      res.writeHead(500, {"Content-Type": "text/plain"});
      res.write(err + "\n");
      res.end();
      return;
    }

    res.writeHead(200);
    res.end(file, 'binary');
  });
})

server.on('error', console.log);
server.on('clientError', function(err) { console.log('client error: %s', err.message); });
server.on('close', function() { console.log('close'); });

var WebSocketServer = require('ws').Server
var wss = new WebSocketServer({ server: server });

wss.on('connection', function connection(ws) {
  console.log('WSS: client connected')

  ws.on('message', function incoming(message) {
    console.log('WSS: received: %s', message);
  });

  // ws.send('message from server');
});

// io = require('socket.io');
// io = io.listen(s);
//
// io.sockets.on('connection', function(socket) {
//   console.log('Client connected.');
//
//   // Disconnect listener
//   socket.on('disconnect', function() {
//     console.log('Client disconnected.');
//   });
// });
