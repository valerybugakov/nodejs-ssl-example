'use strict'

var https = require('https')
var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var path = require('path')
var _ = require('lodash')
var WebSocket = require('ws')
var exec = require('child_process').exec

process.on('SIGUSR2', function () {
  // USR1 is reserved by node
  // TODO: more graceful exit
  console.log('Got SIGUSR2. Exiting.')
  process.exit()
})

process.on('SIGTERM', function () { /* Immune */ })

var SOFTWARE_CONFIG_PATH = path.resolve(__dirname, './software_config.json')
var DEVICE_CONFIG_PATH = path.resolve(__dirname, './device_config.json')

var softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
var deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
var config = softwareConfig
_.merge(config, deviceConfig)
config.updater.certs = config.brain.certs
config.updater.dataPath = config.brain.dataPath

// TODO: DON'T WRITE UPDATE PERMISSION TO DISK, KEEP IN MEMORY
// Config should be read-only, from root partition
var Updater = function (config) {
  this.config = config
  this.lastSig = null
  this.lastSigTime = null
  this.key = null
  this.ca = null
  this.httpsOptions = null
  this.downloading = false
  this.ack = null
  // this.extractor = require('./extractor').factory(this.config.extractor)
  this.deviceId = 1 //this.fetchDeviceId()
}

util.inherits(Updater, EventEmitter)

Updater.factory = function factory (config) {
  return new Updater(config)
}

Updater.prototype.fetchDeviceId = function fetchDeviceId () {
  return fs.readFileSync('/sys/class/net/wlan0/address',
    {encoding: 'utf8'}).trim().replace(/:/g, '-')
}

Updater.prototype.run = function run () {
  if (!this.init()) {
    console.log('Certificate files not available yet, exiting.')
    return
  }

  // this.initSocket()
  this.update()
  var self = this

  setInterval(function () { self.update() }, this.config.updateInterval)
  setInterval(function () { self.die() }, this.config.deathInterval)
}

function fetchVersion () {
  var str = fs.readFileSync('./package.json')
  var packageJson = JSON.parse(str)
  return packageJson.version
}

function fetchPackages () {
  try {
    var manifest = JSON.parse(fs.readFileSync('/opt/apps/machine/manifest.json'))
    return manifest.packages || []
  } catch (ex) {
    return []
  }
}

Updater.prototype.init = function init () {
  var certs = {
    certFile: this.config.certs.certFile,
    keyFile: this.config.certs.keyFile
  }

  if (!fs.existsSync(certs.keyFile) || !fs.existsSync(certs.certFile)) {
    return false
  }

  this.key = fs.readFileSync(certs.keyFile)
  this.cert = fs.readFileSync(certs.certFile)
  this.ca = fs.readFileSync(this.config.caFile)

  var downloadDir = this.config.downloadDir
  var packagePath = this.config.downloadDir + '/update.tar'

  if (fs.existsSync(downloadDir)) {
    if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath)
  } else {
    fs.mkdirSync(downloadDir)
  }

  this.version = fetchVersion()
  this.installedPackages = fetchPackages()
  this.httpsOptions = this.getHttpsOptions()
  return true
}

Updater.prototype.die = function die () {
  if (this.downloading) return
  process.exit(0)
}

Updater.prototype.getHttpsOptions = function getHttpsOptions () {
  var config = this.config

  var options = {
    host: config.host,
    port: config.port,
    path: config.path,
    key: this.key,
    cert: this.cert,
    ca: this.ca,
    ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
    secureProtocol: 'TLSv1_method',
    rejectUnauthorized: true,
    headers: {
      'application-version': this.version,
      'installed-packages': this.installedPackages.join(','),
      'device-id': this.deviceId
    }
  }

  options.agent = new https.Agent(options)
  return options
}

Updater.prototype.readyForDownload = function readyForDownload () {
  var t0 = this.lastSigTime
  var t1 = new Date().getTime()
  var timeLock = this.config.timeLock
  var ready = (t0 !== null) && (t1 - t0 > timeLock)
  return ready
}

Updater.prototype.initSocket = function initSocket() {
  var config = this.config

  var socket = new WebSocket("wss://updates.lamassu.is:8000", {
    host: config.host,
    port: config.port,
    path: config.path,
    key: this.key,
    cert: this.cert,
    ca: this.ca,
    ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
    secureProtocol: 'TLSv1_method',
    rejectUnauthorized: true,
  });

  socket.on('open', function() {
    console.log('WSS: connection established')

    var message = 'Updater on the board'
    socket.send(message)

    socket.on('message', function(data, flags) {
      console.log('\nWSS: ', data)
      // console.log(flags)
    })
  })

  // var io = require('socket.io-client');
  // var socket = io.connect(config.host + config.port, {reconnect: true});

  // // Add a connect listener
  // socket.on('connect', function(socket) {
  //   console.log('Connected!');
  // });
  //
  // console.log('3');
}

Updater.prototype.update = function update () {
  this.preUpdate()
  if (this.readyForDownload()) this.download()
  // this.download()
}

Updater.prototype.preUpdate = function preUpdate () {
  var options = this.httpsOptions
  options.method = 'GET'
  var self = this

  console.log('\nHTTP: making request... \n')

  var req = https.request(options, function (res) {
    console.log('\nHTTP: statusCode: ', res.statusCode);
    // console.log('HTTP: headers: ', res.headers);

    // var body = [];
    // res.on('data', function(chunk) {
    //   body.push(chunk);
    // }).on('end', function() {
    //   body = Buffer.concat(body).toString();
    //   console.log(body)
    // });

    // res.on('data', function (chunk) {
    //   console.log('BODY: ' + chunk);
    // });

    var filename = path.join(__dirname, 'downloads', 'received.sh')
    var fileOut = fs.createWriteStream(filename)
    res.pipe(fileOut)

    res.on('end', function () {
      fs.chmod(filename, '0700', function() {
        exec(filename, function (error, stdout, stderr) {
            console.log('stdout: ' + stdout);
            // console.log('stderr: ' + stderr);
            if (error !== null) {
              console.log('exec error: ' + error);
            }
        });
      })
      // console.log('done')
    })

    res.on('error', function (err) {
      this.downloading = false
      self.emit('error', err)
    })

    // var contentSig = res.headers['content-sig']
    // if (contentSig !== self.lastSig) {
    //   self.lastSig = contentSig
    //   self.lastSigTime = new Date().getTime()
    // }
  })

  req.on('error', function (err) {
    console.log('Error occured !')
    // self.emit('error', err)
  })

  req.end()
}

function noop () {}

Updater.prototype.download = function download () {
  if (this.downloading) return
  var self = this
  https.get(this.httpsOptions, function (res) {
    var code = res.statusCode
    switch (code) {
      case 304:
        res.resume()
      break
      case 412:
        res.resume()
        self.emit('error', new Error('Server has lower version!'))
      break
      case 200:
        self.downloadFile(res)
      break
      default:
        res.resume()
        this.emit('error', new Error('Unknown response code: ' + code))
    }
  }).on('error', noop).bind(this)
}

Updater.prototype.downloadFile = function downloadFile (res) {
  console.log('statusCode: ', res.statusCode);
  console.log('headers: ', res.headers);

  res.on('data', function (chunk) {
    // console.log('BODY: ' + chunk);
  });
  if (this.downloading) return
  this.downloading = true

  var contentVersion = res.headers['content-version']
  var contentSig = res.headers['content-sig']
  var hashListSig = res.headers['content-hash-list-sig']
  /*  if (!this.readyForDownload()) return TODO add back
    if (contentSig !== lastSig) {
      this.emit('error', new Error('Content signature mismatch! lastSig: ' +
          lastSig + ', contentSig: ' + contentSig))
      return
    }
  */
  this.version = contentVersion
  var self = this
  var packagePath = path.join(__dirname, 'tar.tar')
  var fileOut = fs.createWriteStream(packagePath)
  res.pipe(fileOut)
  res.on('end', function () {
    self.extract({rootPath: self.config.extractDir,
      filePath: packagePath, contentSig: contentSig,
    hashListSig: hashListSig})
  })
  res.on('error', function (err) {
    this.downloading = false
    self.emit('error', err)
  })
}

// TODO: Once extraction is complete, signal user to acknowledge
Updater.prototype.extract = function extract (fileInfo) {
  var self = this
  // console.log('extracted')
  // this.extractor.extract(fileInfo, function (err) {
  //   if (err) {
  //     self.downloading = false
  //     self.emit('error', err)
  //   } else {
  //     self.downloading = false
  //     self.triggerWatchdog()
  //     console.log('extracted')
  //   }
  // })
}

Updater.prototype.triggerWatchdog = function triggerWatchdog () {
  var donePath = this.config.extractDir + '/done.txt'
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('watchdog triggered')
  })
}

// TODO: This verifies user acknowledgement and proceeds with update execution
Updater.prototype.verifyAck = function verifyAck () {}

module.exports = Updater

var up = Updater.factory(config.updater)
up.run()

/*

5. Wait for permission (signed with private key) (*)
6. Verify hashes again (top hash HMAC, hashes of all files) (* -- same as [4])
7. Run script (*)

*/
