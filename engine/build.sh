#!/bin/sh
# Build engine/build/skript-ts.jar from the Java sources in this folder.
#
# JDK resolution order: $SKRIPT_TS_JDK (when set it is authoritative —
# a set-but-invalid value is an error, not a silent fallback), then
# $JAVA_HOME, then javac on PATH. Any JDK 21 or newer can build:
# javac is invoked with --release 21, so the emitted class files are
# always version 21 regardless of the build JDK.
# Compile classpath: the jars in engine/libs/ (run fetch-libs.sh once
# to download and checksum-verify them). Those jars are compile-time
# only — at runtime Paper provides the same APIs.
set -eu
cd "$(dirname "$0")"

# A failed build must never leave a stale jar behind that a later
# step could mistake for a fresh, successful build. Remove the old
# jar up front, build the new one under a temporary name, and only
# move it into place once every step has succeeded. The trap cleans
# up the temporary jar and any sed backup if a step fails midway.
mkdir -p build
rm -f build/skript-ts.jar build/skript-ts.jar.tmp
trap 'rm -f build/skript-ts.jar.tmp build/classes/plugin.yml.bak' 0

if [ -n "${SKRIPT_TS_JDK:-}" ]; then
    JDK="$SKRIPT_TS_JDK"
    if [ ! -x "$JDK/bin/javac" ]; then
        echo "javac not found under $JDK (set SKRIPT_TS_JDK)" >&2
        exit 1
    fi
    JAVAC="$JDK/bin/javac"
    JAR_CMD="$JDK/bin/jar"
elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
    JAVAC="$JAVA_HOME/bin/javac"
    JAR_CMD="$JAVA_HOME/bin/jar"
else
    if [ -n "${JAVA_HOME:-}" ]; then
        echo "warning: JAVA_HOME=$JAVA_HOME has no bin/javac — falling back to javac on PATH" >&2
    fi
    JAVAC="$(command -v javac || true)"
    if [ -z "$JAVAC" ]; then
        echo "javac not found (set SKRIPT_TS_JDK or JAVA_HOME, or put javac on PATH)" >&2
        exit 1
    fi
    javac_dir="$(dirname "$JAVAC")"
    if [ -x "$javac_dir/jar" ]; then
        JAR_CMD="$javac_dir/jar"
    else
        JAR_CMD="$(command -v jar || true)"
    fi
    if [ -z "$JAR_CMD" ]; then
        echo "jar not found next to $JAVAC or on PATH" >&2
        exit 1
    fi
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
# --release 21: pin the class-file version to 21 even when the build
# JDK is newer (for example JDK 25), so the jar always runs on the
# JDK 21 the sandbox server uses.
"$JAVAC" -proc:none --release 21 -encoding UTF-8 -cp "$CP" -d build/classes @build/sources.txt
cp src/main/resources/plugin.yml build/classes/plugin.yml
# Stamp the packaged plugin.yml with the release version from
# package.json plus the short commit hash, so a deployed jar
# always names the exact source it was built from (feedback
# A4). The committed plugin.yml keeps the plain version and
# is bumped together with package.json at release time.
pkg_version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' ../package.json | head -n 1)
if [ -z "$pkg_version" ]; then
    echo "could not read version from ../package.json" >&2
    exit 1
fi
short_hash=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo unknown)
# sed -i.bak + rm is the GNU/BSD portable form of in-place editing
# (plain sed -i means different things on GNU and BSD sed).
sed -i.bak "s/^version: .*/version: ${pkg_version}+${short_hash}/" build/classes/plugin.yml
rm -f build/classes/plugin.yml.bak
if ! grep -Fxq "version: ${pkg_version}+${short_hash}" build/classes/plugin.yml; then
    echo "failed to stamp version into plugin.yml" >&2
    exit 1
fi
"$JAR_CMD" --create --file build/skript-ts.jar.tmp -C build/classes .
mv build/skript-ts.jar.tmp build/skript-ts.jar
echo "built engine/build/skript-ts.jar"
