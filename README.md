HTTPS 2048-bit RSA TLS/SSL Cert Example
====

This is targeted towards people who are using io.js / node.js,
but as far as generating and testing certs, these are the exact
same **openssl** commands you'd use with any language.

Usage
========

1. Server machine
------------

Generate CA, key and certificate. Load them to updater machine.

```
git clone https://github.com/valerybugakov/nodejs-ssl-example.git
npm install

./gen.sh YOUR_CNAME_HERE
scp -r certs root@YOUR_CNAME_HERE:/root/nodejs-ssl-example/certs

node showrequests.js
```

2. Updater machine
------------

```
git clone https://github.com/valerybugakov/nodejs-ssl-example.git
npm install

node updater.js
```

Add CNAME to software_config.json `{ brain: updater: host: CNAME }`
Add CNAME to hosts file if necessary.

