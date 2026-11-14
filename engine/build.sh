#!/bin/sh
# Build engine/build/skript-ts.jar from the Java sources in this folder.
#
# Uses the Temurin JDK 21 in ~/workspace/tools (the VM ships no Java).
# Compile classpath: the jars in engine/libs/ (run fetch-libs.sh once
# to download and checksum-verify them). Those jars are compile-time
# only — at runtime Paper provides the same APIs.
set -eu
cd "$(dirname "$0")"

JDK="${SKRIPT_TS_JDK:-$HOME/workspace/tools/jdk-21.0.13+9}"
if [ ! -x "$JDK/bin/javac" ]; then
    echo "javac not found under $JDK (set SKRIPT_TS_JDK)" >&2
    exit 1
fi

# The compile classpath is exactly the set of jars fetch-libs.sh
# verified: the names come from the committed .sha512 files, and any
# other jar in libs/ aborts the build instead of being included
# silently (an unverified jar on the classpath is a code-execution
# surface, not just a compile input).
CP=""
for sum in libs/*.sha512; do
    [ -f "$sum" ] || continue
    jar="${sum%.sha512}"
    if [ ! -f "$jar" ]; then
        echo "missing $jar — run engine/fetch-libs.sh first" >&2
        exit 1
    fi
    CP="${CP:+$CP:}$jar"
done
if [ -z "$CP" ]; then
    echo "no libraries in engine/libs — run engine/fetch-libs.sh first" >&2
    exit 1
fi
for jar in libs/*.jar; do
    [ -f "$jar" ] || continue
    if [ ! -f "$jar.sha512" ]; then
        echo "unverified jar in engine/libs: $jar (no committed .sha512) — refusing to build" >&2
        exit 1
    fi
done

rm -rf build/classes
mkdir -p build/classes
find src/main/java -name '*.java' | sort > build/sources.txt
# -proc:none: never run annotation processors found on the classpath.
"$JDK/bin/javac" -proc:none -encoding UTF-8 -cp "$CP" -d build/classes @build/sources.txt
cp src/main/resources/plugin.yml build/classes/plugin.yml
# Stamp the packaged plugin.yml with the release version from
# package.json plus the short commit hash, so a deployed jar
# always names the exact source it was built from (feedback
# A4). The committed plugin.yml keeps the plain version and
# is bumped together with package.json at release time.
pkg_version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' ../package.json | head -n 1)
short_hash=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo unknown)
sed -i "s/^version: .*/version: ${pkg_version}+${short_hash}/" build/classes/plugin.yml
"$JDK/bin/jar" --create --file build/skript-ts.jar -C build/classes .
echo "built engine/build/skript-ts.jar"
