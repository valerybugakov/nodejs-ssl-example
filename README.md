HTTPS 2048-bit RSA TLS/SSL Cert Example
====

This is targeted towards people who are using io.js / node.js,
but as far as generating and testing certs, these are the exact
same **openssl** commands you'd use with any language.

Usage
========

Add updates.lamassu.is to hosts

```
git clone https://github.com/valerybugakov/nodejs-ssl-example.git

npm install

./bin/create-server-certs.sh
./bin/create-root-ca.sh
./bin/sign-csr.sh

node showrequests.js
node updater.js
```

