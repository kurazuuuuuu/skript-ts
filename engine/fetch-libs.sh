#!/bin/sh
# Download the compile-time libraries for the engine into engine/libs/
# and verify each against the SHA-512 recorded next to it.
#
# Why curl and not a Java build tool: this VM's HTTP proxy breaks
# Java's HTTPS tunneling (the Paper downloader hit the same wall), so
# jars are fetched with curl, which handles the proxy correctly.
# The downloaded jars are gitignored; the .sha512 files are committed
# so a fresh checkout can reproduce and verify the exact same bits.
set -eu
cd "$(dirname "$0")"
mkdir -p libs

PAPER_API_VERSION="1.21.11-R0.1-20260511.115010-91"
PAPER_API="paper-api-${PAPER_API_VERSION}.jar"
PAPER_URL="https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api/1.21.11-R0.1-SNAPSHOT/${PAPER_API}"
ADVENTURE_VERSION="4.26.1"

fetch() {
    file="$1"
    url="$2"
    if [ ! -f "libs/$file" ]; then
        echo "downloading $file"
        curl -fSL --max-time 600 -o "libs/$file" "$url"
    fi
    expected="$(cat "libs/$file.sha512")"
    actual="$(sha512sum "libs/$file" | cut -d' ' -f1)"
    if [ "$expected" != "$actual" ]; then
        echo "SHA-512 mismatch for $file" >&2
        echo "  expected: $expected" >&2
        echo "  actual:   $actual" >&2
        exit 1
    fi
    echo "verified $file"
}

fetch "$PAPER_API" "$PAPER_URL"
for artifact in adventure-api adventure-key adventure-text-serializer-plain; do
    fetch "$artifact-${ADVENTURE_VERSION}.jar" \
        "https://repo1.maven.org/maven2/net/kyori/$artifact/${ADVENTURE_VERSION}/$artifact-${ADVENTURE_VERSION}.jar"
done
# Transitive API surface the compiler needs (versions per the
# paper-api / adventure-api POMs): examination for adventure's
# Examinable, bungeecord-chat for Paper's chat component types.
EXAMINATION_VERSION="1.3.0"
for artifact in examination-api examination-string; do
    fetch "$artifact-${EXAMINATION_VERSION}.jar" \
        "https://repo1.maven.org/maven2/net/kyori/$artifact/${EXAMINATION_VERSION}/$artifact-${EXAMINATION_VERSION}.jar"
done
BUNGEE_VERSION="1.21-R0.2-deprecated+build.21"
fetch "bungeecord-chat-${BUNGEE_VERSION}.jar" \
    "https://repo.papermc.io/repository/maven-public/net/md-5/bungeecord-chat/${BUNGEE_VERSION}/bungeecord-chat-1.21-R0.2-deprecated%2Bbuild.21.jar"
echo "all engine libraries present and verified"
