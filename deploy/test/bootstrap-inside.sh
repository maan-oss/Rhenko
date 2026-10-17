#!/bin/sh
# Runs deploy/bootstrap.sh inside an Ubuntu 24.04 container, checking the script's own logic. It works on a copy of the
# repository in /work, so the .env the script writes never lands in the source. Stand-ins go first on PATH for the commands
# that would change the machine or need the network: docker, ufw, systemctl, the swap commands and sleep. apt-get, openssl
# and the shell tools are real. Each check prints PASS or FAIL, and the script exits 1 if any check failed.
#
# Run it through deploy/test/bootstrap-test.sh, which starts the container.
set -u

SRC=/src
WORK=/work
export WORK
PASS_COUNT=0
FAIL_COUNT=0

# check NAME COMMAND: passes when COMMAND, run by sh in the current directory, exits 0.
check() {
  if sh -c "$2" >/dev/null 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "PASS  $1"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "FAIL  $1"
  fi
}

echo "installing openssl (the script uses it for the generated secrets)"
apt-get update -qq >/tmp/apt-update.log 2>&1 || { echo "FAIL  apt-get update"; exit 1; }
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssl >/tmp/apt-openssl.log 2>&1 || { echo "FAIL  install openssl"; exit 1; }

# Stand-ins. docker answers the calls the script makes and logs them. The health answer comes from /work/health, if set.
mkdir -p /stubs "$WORK"
cat > /stubs/docker <<'EOF'
#!/bin/sh
echo "docker $*" >> /work/calls.log
case "$1" in
  inspect) cat /work/health 2>/dev/null || echo healthy ;;
  compose) case "$2" in ps) echo stub-app-id ;; esac ;;
esac
exit 0
EOF
for tool in ufw systemctl mkswap swapon sleep; do
  printf '#!/bin/sh\necho "%s $*" >> /work/calls.log\nexit 0\n' "$tool" > "/stubs/$tool"
done
# fallocate creates the file named by its last argument, as the real command does, so the script's chmod finds it.
cat > /stubs/fallocate <<'EOF'
#!/bin/sh
echo "fallocate $*" >> /work/calls.log
for last in "$@"; do :; done
: > "$last"
EOF
chmod +x /stubs/*
PATH=/stubs:$PATH
export PATH

# A fresh copy of the files the script needs, with no .env, no log and no health answer.
fresh_repo() {
  rm -rf "$WORK/repo" && mkdir -p "$WORK/repo/deploy"
  cp "$SRC/docker-compose.yml" "$SRC/.env.example" "$WORK/repo/"
  cp "$SRC/deploy/bootstrap.sh" "$SRC/deploy/Caddyfile" "$WORK/repo/deploy/"
  rm -f "$WORK/calls.log" "$WORK/health"
}

# The answers the script reads, in order: domain, R2 endpoint, bucket (empty for the default), key ID, secret.
GOOD_ANSWERS="rhenko.test.example
https://acct.r2.cloudflarestorage.com

AKIATESTKEYID
R2SECRETVALUE-xyz"

# 1. Refuses to run without root.
fresh_repo
cd "$WORK/repo" || exit 1
setpriv --reuid=1000 --regid=1000 --clear-groups sh deploy/bootstrap.sh </dev/null >"$WORK/out-nonroot.txt" 2>&1
code=$?
check "refuses to run without root" "[ $code -ne 0 ] && grep -q 'run it as root' $WORK/out-nonroot.txt"

# 2. Refuses to run outside the repository.
cd /tmp || exit 1
sh "$WORK/repo/deploy/bootstrap.sh" </dev/null >"$WORK/out-outside.txt" 2>&1
code=$?
check "refuses to run outside the repository" "[ $code -ne 0 ] && grep -q 'root of the Rhenko repository' $WORK/out-outside.txt"

# 3. Refuses a system that is not Ubuntu.
rm -rf "$WORK/debian" && mkdir -p "$WORK/debian/deploy"
cp "$WORK/repo/docker-compose.yml" "$WORK/repo/.env.example" "$WORK/debian/"
cp "$WORK/repo/deploy/Caddyfile" "$WORK/debian/deploy/"
printf 'ID=debian\nVERSION_CODENAME=bookworm\n' > "$WORK/fake-os-release"
sed "s|/etc/os-release|$WORK/fake-os-release|" "$WORK/repo/deploy/bootstrap.sh" > "$WORK/debian/deploy/bootstrap.sh"
cd "$WORK/debian" && sh deploy/bootstrap.sh </dev/null >"$WORK/out-debian.txt" 2>&1
code=$?
check "refuses a system that is not Ubuntu" "[ $code -ne 0 ] && grep -q 'written for Ubuntu' $WORK/out-debian.txt"

# 4. A full first run with good answers.
fresh_repo
cd "$WORK/repo" || exit 1
printf '%s\n' "$GOOD_ANSWERS" | sh deploy/bootstrap.sh >"$WORK/out-first.txt" 2>&1
code=$?
check "first run with good answers exits 0" "[ $code -eq 0 ]"
[ "$code" -eq 0 ] || { echo "----- output of the first run:"; tail -30 "$WORK/out-first.txt"; echo "-----"; }
check "first run reports Rhenko is running" "grep -q 'Rhenko is running' $WORK/out-first.txt"
# shellcheck disable=SC2016 # the command is meant to expand in the child shell, not here
check ".env is written with mode 600" 'test "$(stat -c %a .env)" = 600'
check ".env has the domain and the public URL" 'grep -qx "RHENKO_DOMAIN=rhenko.test.example" .env && grep -qx "RHENKO_PUBLIC_URL=https://rhenko.test.example" .env'
check "the bucket defaults to rhenko-media" 'grep -qx "RHENKO_R2_BUCKET=rhenko-media" .env'
check "the R2 values are written" 'grep -qx "RHENKO_R2_ENDPOINT=https://acct.r2.cloudflarestorage.com" .env && grep -qx "RHENKO_R2_ACCESS_KEY_ID=AKIATESTKEYID" .env && grep -qx "RHENKO_R2_SECRET_ACCESS_KEY=R2SECRETVALUE-xyz" .env'
check "the database password is 48 hex characters" 'grep -Eq "^POSTGRES_PASSWORD=[0-9a-f]{48}$" .env'
check "the server key is 48 hex characters" 'grep -Eq "^RHENKO_SECRET=[0-9a-f]{48}$" .env'
gen_pw=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
gen_key=$(sed -n 's/^RHENKO_SECRET=//p' .env)
check "the R2 secret is not printed" "! grep -q 'R2SECRETVALUE-xyz' $WORK/out-first.txt"
check "the generated passwords are not printed" "! grep -q '$gen_pw' $WORK/out-first.txt && ! grep -q '$gen_key' $WORK/out-first.txt"
check "the stack is started with docker compose up" "grep -q 'docker compose up' $WORK/calls.log"

# 5. A second run keeps the .env it wrote.
before=$(sha256sum .env | cut -d' ' -f1)
sh deploy/bootstrap.sh </dev/null >"$WORK/out-second.txt" 2>&1
code=$?
after=$(sha256sum .env | cut -d' ' -f1)
check "a second run exits 0" "[ $code -eq 0 ]"
check "a second run keeps .env unchanged" "[ $before = $after ]"
check "a second run says .env is kept" "grep -q 'already exists' $WORK/out-second.txt"

# 6. A bad domain is refused, and a refused answer leaves no half-written .env behind.
fresh_repo
cd "$WORK/repo" || exit 1
printf 'bad domain\n' | sh deploy/bootstrap.sh >"$WORK/out-baddomain.txt" 2>&1
code=$?
check "a domain with a space is refused" "[ $code -ne 0 ] && grep -q 'has a space in it' $WORK/out-baddomain.txt"
check "a refused answer leaves no .env" "[ ! -e .env ]"

# 7. After a refused answer, the next run asks again rather than failing on a leftover file.
printf '%s\n' "$GOOD_ANSWERS" | sh deploy/bootstrap.sh >"$WORK/out-retry.txt" 2>&1
code=$?
check "a run after a refused answer succeeds" "[ $code -eq 0 ]"

# 8. A non-https R2 endpoint is refused.
fresh_repo
cd "$WORK/repo" || exit 1
printf 'rhenko.test.example\nhttp://insecure.example\n' | sh deploy/bootstrap.sh >"$WORK/out-endpoint.txt" 2>&1
code=$?
check "an R2 endpoint without https is refused" "[ $code -ne 0 ] && grep -q 'must start with https' $WORK/out-endpoint.txt"

# 9. An app that never becomes healthy fails after the wait, with the log command in the message.
fresh_repo
cd "$WORK/repo" || exit 1
echo starting > "$WORK/health"
printf '%s\n' "$GOOD_ANSWERS" | sh deploy/bootstrap.sh >"$WORK/out-unhealthy.txt" 2>&1
code=$?
check "an app that never becomes healthy fails" "[ $code -ne 0 ] && grep -q 'did not become healthy' $WORK/out-unhealthy.txt"

echo
echo "$PASS_COUNT passed, $FAIL_COUNT failed"
[ "$FAIL_COUNT" -eq 0 ]
