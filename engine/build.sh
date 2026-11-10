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

CP="$(ls libs/*.jar | tr '\n' ':' | sed 's/:$//')"
if [ -z "$CP" ]; then
    echo "no libraries in engine/libs — run engine/fetch-libs.sh first" >&2
    exit 1
fi

rm -rf build/classes
mkdir -p build/classes
find src/main/java -name '*.java' | sort > build/sources.txt
"$JDK/bin/javac" -encoding UTF-8 -cp "$CP" -d build/classes @build/sources.txt
cp src/main/resources/plugin.yml build/classes/plugin.yml
"$JDK/bin/jar" --create --file build/skript-ts.jar -C build/classes .
echo "built engine/build/skript-ts.jar"
