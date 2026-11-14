#!/bin/sh
# Run the engine's plain main-based unit checks (engine/tests/).
#
# Same JDK and compile-classpath rules as build.sh: the jars in
# engine/libs/ verified by their committed .sha512 pins. The
# checks are compiled together with the engine sources into a
# scratch directory (never into build/, so the shipped jar is
# unaffected) and run with a bare JVM.
set -eu
cd "$(dirname "$0")"

JDK="${SKRIPT_TS_JDK:-$HOME/workspace/tools/jdk-21.0.13+9}"
if [ ! -x "$JDK/bin/javac" ]; then
    echo "javac not found under $JDK (set SKRIPT_TS_JDK)" >&2
    exit 1
fi

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

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
find src/main/java tests -name '*.java' | sort > "$OUT/sources.txt"
"$JDK/bin/javac" -proc:none -encoding UTF-8 -cp "$CP" -d "$OUT/classes" @"$OUT/sources.txt"
"$JDK/bin/java" -cp "$OUT/classes:$CP" net.krz.skriptts.VariablesMigrationTest
