# Pass canical name (CNAME) to server certificate creator
./bin/create-server-certs.sh "$1"
./bin/create-root-ca.sh
./bin/sign-csr.sh

# CNAME NOTES:
# GET IT RIGHT. If you put the wrong domain you'll have to contact customer support and stuff to get it cancelled and fixed
# WWW. vs BARE DOMAIN name.com requires a subdomain, but using www will also validates your cert for the bare domain.
# (P.S. don't let anyone tell you different, www. looks retarded. If you have cookie issues, get a second domain for your CDN, usercontent, or whatever)
