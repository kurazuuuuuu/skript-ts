package net.krz.skriptts;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Json {
    private Json() {
    }

    public static final class JsonException extends RuntimeException {
        public JsonException(String message) {
            super(message);
        }
    }

    public static Object parse(String text) {
        if (text == null) {
            throw new JsonException("Unexpected null input at offset 0");
        }
        Parser parser = new Parser(text);
        Object value = parser.parseValue();
        parser.skipWhitespace();
        if (parser.pos < parser.text.length()) {
            throw new JsonException("Trailing content at offset " + parser.pos);
        }
        return value;
    }

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        writeValue(sb, value);
        return sb.toString();
    }

    private static void writeValue(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof Boolean) {
            sb.append(((Boolean) value).booleanValue());
        } else if (value instanceof String) {
            appendString(sb, (String) value);
        } else if (value instanceof Number) {
            appendNumber(sb, (Number) value);
        } else if (value instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) value;
            sb.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                Object key = entry.getKey();
                if (!(key instanceof String)) {
                    throw new IllegalArgumentException("JSON object key must be a String");
                }
                if (!first) {
                    sb.append(',');
                }
                first = false;
                appendString(sb, (String) key);
                sb.append(':');
                writeValue(sb, entry.getValue());
            }
            sb.append('}');
        } else if (value instanceof List) {
            List<?> list = (List<?>) value;
            sb.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeValue(sb, item);
            }
            sb.append(']');
        } else {
            throw new IllegalArgumentException("Unsupported JSON value type: " + value.getClass().getName());
        }
    }

    private static void appendString(StringBuilder sb, String text) {
        sb.append('"');
        for (int i = 0; i < text.length();) {
            char c = text.charAt(i);
            int cp;
            if (Character.isHighSurrogate(c) && i + 1 < text.length()
                    && Character.isLowSurrogate(text.charAt(i + 1))) {
                cp = Character.toCodePoint(c, text.charAt(i + 1));
                i += 2;
            } else {
                cp = c;
                i++;
            }
            switch (cp) {
                case '"' -> {
                    sb.append('\\');
                    sb.append('"');
                }
                case '\\' -> {
                    sb.append('\\');
                    sb.append('\\');
                }
                case '\b' -> sb.append("\\b");
                case '\t' -> sb.append("\\t");
                case '\n' -> sb.append("\\n");
                case '\f' -> sb.append("\\f");
                case '\r' -> sb.append("\\r");
                default -> {
                    if (cp < 0x20) {
                        sb.append(String.format(Locale.ROOT, "\\u%04x", cp));
                    } else if (cp > 0xFFFF) {
                        sb.appendCodePoint(cp);
                    } else {
                        sb.append((char) cp);
                    }
                }
            }
        }
        sb.append('"');
    }

    private static void ensureFinite(Number number) {
        if (number instanceof Double) {
            double d = number.doubleValue();
            if (!Double.isFinite(d)) {
                throw new IllegalArgumentException("Non-finite number");
            }
        } else if (number instanceof Float) {
            float f = number.floatValue();
            if (!Float.isFinite(f)) {
                throw new IllegalArgumentException("Non-finite number");
            }
        } else {
            String className = number.getClass().getName();
            if (!className.equals("java.math.BigInteger")
                    && !className.equals("java.math.BigDecimal")) {
                double d = number.doubleValue();
                if (!Double.isFinite(d)) {
                    throw new IllegalArgumentException("Non-finite number");
                }
            }
        }
    }

    private static boolean isIntegral(Number number) {
        if (number instanceof Double) {
            double d = number.doubleValue();
            return Double.isFinite(d) && d == Math.rint(d);
        }
        if (number instanceof Float) {
            float f = number.floatValue();
            return Float.isFinite(f) && f == Math.rint(f);
        }
        String className = number.getClass().getName();
        if (className.equals("java.math.BigInteger")) {
            return true;
        }
        if (className.equals("java.math.BigDecimal")) {
            double d = number.doubleValue();
            return Double.isFinite(d) && d == Math.rint(d);
        }
        if (number instanceof Integer || number instanceof Long || number instanceof Short
                || number instanceof Byte
                || number instanceof java.util.concurrent.atomic.AtomicInteger
                || number instanceof java.util.concurrent.atomic.AtomicLong) {
            return true;
        }
        double d = number.doubleValue();
        if (!Double.isFinite(d)) {
            return false;
        }
        return d == Math.rint(d);
    }

    private static void appendNumber(StringBuilder sb, Number number) {
        ensureFinite(number);
        if (isIntegral(number)) {
            if (number instanceof Double || number instanceof Float) {
                double d = number.doubleValue();
                if (d == 0.0) {
                    sb.append(Double.doubleToRawLongBits(d) < 0 ? "-0" : "0");
                } else {
                    sb.append(String.format(Locale.ROOT, "%.0f", d));
                }
            } else {
                String s = number.toString();
                int exponentIndex = indexOfExponent(s);
                if (exponentIndex < 0) {
                    int dotIndex = s.indexOf('.');
                    if (dotIndex >= 0) {
                        boolean allZero = true;
                        for (int i = dotIndex + 1; i < s.length(); i++) {
                            if (s.charAt(i) != '0') {
                                allZero = false;
                                break;
                            }
                        }
                        if (allZero) {
                            sb.append(s.substring(0, dotIndex));
                        } else {
                            sb.append(s);
                        }
                    } else {
                        sb.append(s);
                    }
                } else {
                    String mantissa = s.substring(0, exponentIndex);
                    String suffix = s.substring(exponentIndex);
                    int dotIndex = mantissa.indexOf('.');
                    if (dotIndex >= 0) {
                        boolean allZero = true;
                        for (int i = dotIndex + 1; i < mantissa.length(); i++) {
                            if (mantissa.charAt(i) != '0') {
                                allZero = false;
                                break;
                            }
                        }
                        if (allZero) {
                            sb.append(mantissa.substring(0, dotIndex));
                            sb.append(suffix);
                        } else {
                            sb.append(s);
                        }
                    } else {
                        sb.append(s);
                    }
                }
            }
        } else {
            sb.append(Double.toString(number.doubleValue()));
        }
    }

    private static int indexOfExponent(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == 'e' || c == 'E') {
                return i;
            }
        }
        return -1;
    }

    private static final class Parser {
        final String text;
        int pos;

        Parser(String text) {
            this.text = text;
            this.pos = 0;
        }

        void skipWhitespace() {
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                    pos++;
                } else {
                    break;
                }
            }
        }

        Object parseValue() {
            skipWhitespace();
            if (pos >= text.length()) {
                fail(pos, "Expected value");
            }
            char c = text.charAt(pos);
            switch (c) {
                case '{':
                    return parseObject();
                case '[':
                    return parseArray();
                case '"':
                    return parseString();
                case 't':
                    return parseLiteral("true", Boolean.TRUE);
                case 'f':
                    return parseLiteral("false", Boolean.FALSE);
                case 'n':
                    return parseLiteral("null", null);
                default:
                    if (c == '-' || isDigit(c)) {
                        return parseNumber();
                    }
                    fail(pos, "Unexpected character");
                    return null;
            }
        }

        private Object parseObject() {
            pos++; // consume '{'
            skipWhitespace();
            LinkedHashMap<String, Object> map = new LinkedHashMap<>();
            if (pos < text.length() && text.charAt(pos) == '}') {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                if (pos >= text.length() || text.charAt(pos) != '"') {
                    fail(pos, "Expected string key");
                }
                String key = parseString();
                skipWhitespace();
                if (pos >= text.length() || text.charAt(pos) != ':') {
                    fail(pos, "Expected ':'");
                }
                pos++;
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                if (pos >= text.length()) {
                    fail(pos, "Expected ',' or '}'");
                }
                char c = text.charAt(pos);
                if (c == ',') {
                    pos++;
                    continue;
                }
                if (c == '}') {
                    pos++;
                    break;
                }
                fail(pos, "Expected ',' or '}'");
            }
            return map;
        }

        private Object parseArray() {
            pos++; // consume '['
            skipWhitespace();
            ArrayList<Object> list = new ArrayList<>();
            if (pos < text.length() && text.charAt(pos) == ']') {
                pos++;
                return list;
            }
            while (true) {
                Object value = parseValue();
                list.add(value);
                skipWhitespace();
                if (pos >= text.length()) {
                    fail(pos, "Expected ',' or ']'");
                }
                char c = text.charAt(pos);
                if (c == ',') {
                    pos++;
                    continue;
                }
                if (c == ']') {
                    pos++;
                    break;
                }
                fail(pos, "Expected ',' or ']'");
            }
            return list;
        }

        private String parseString() {
            if (pos >= text.length() || text.charAt(pos) != '"') {
                fail(pos, "Expected string");
            }
            pos++; // consume opening quote
            StringBuilder sb = new StringBuilder();
            while (pos < text.length()) {
                char c = text.charAt(pos);
                if (c == '"') {
                    pos++;
                    return sb.toString();
                }
                if (c == '\\') {
                    pos++; // consume backslash
                    if (pos >= text.length()) {
                        fail(pos, "Unterminated escape sequence");
                    }
                    char e = text.charAt(pos);
                    switch (e) {
                        case '"' -> {
                            sb.append('"');
                            pos++;
                        }
                        case '\\' -> {
                            sb.append('\\');
                            pos++;
                        }
                        case '/' -> {
                            sb.append('/');
                            pos++;
                        }
                        case 'b' -> {
                            sb.append('\b');
                            pos++;
                        }
                        case 'f' -> {
                            sb.append('\f');
                            pos++;
                        }
                        case 'n' -> {
                            sb.append('\n');
                            pos++;
                        }
                        case 'r' -> {
                            sb.append('\r');
                            pos++;
                        }
                        case 't' -> {
                            sb.append('\t');
                            pos++;
                        }
                        case 'u' -> {
                            pos++; // consume 'u'
                            if (pos + 4 > text.length()) {
                                fail(pos, "Invalid unicode escape");
                            }
                            int cp = readHex4(pos);
                            pos += 4;
                            if (Character.isHighSurrogate((char) cp)
                                    && pos + 6 <= text.length()
                                    && text.charAt(pos) == '\\'
                                    && text.charAt(pos + 1) == 'u') {
                                pos += 2; // consume the escape introducer
                                if (pos + 4 > text.length()) {
                                    fail(pos, "Invalid unicode escape");
                                }
                                int low = readHex4(pos);
                                pos += 4;
                                if (Character.isLowSurrogate((char) low)) {
                                    sb.appendCodePoint(Character.toCodePoint((char) cp, (char) low));
                                } else {
                                    fail(pos - 4, "Invalid surrogate pair");
                                }
                            } else {
                                sb.append((char) cp);
                            }
                        }
                        default -> fail(pos, "Invalid escape character");
                    }
                    continue;
                }
                if (c < 0x20) {
                    fail(pos, "Unescaped control character in string");
                }
                sb.append(c);
                pos++;
            }
            fail(pos, "Unterminated string");
            return null;
        }

        private int readHex4(int offset) {
            int value = 0;
            for (int i = 0; i < 4; i++) {
                char h = text.charAt(offset + i);
                int d;
                if (h >= '0' && h <= '9') {
                    d = h - '0';
                } else if (h >= 'a' && h <= 'f') {
                    d = h - 'a' + 10;
                } else if (h >= 'A' && h <= 'F') {
                    d = h - 'A' + 10;
                } else {
                    fail(offset + i, "Invalid hex digit in unicode escape");
                    d = 0;
                }
                value = (value << 4) | d;
            }
            return value;
        }

        private Object parseNumber() {
            int start = pos;
            if (pos < text.length() && text.charAt(pos) == '-') {
                pos++;
            }
            if (pos >= text.length() || !isDigit(text.charAt(pos))) {
                fail(pos, "Invalid number");
            }
            if (text.charAt(pos) == '0') {
                pos++;
                if (pos < text.length() && isDigit(text.charAt(pos))) {
                    fail(pos, "Leading zero in number");
                }
            } else {
                while (pos < text.length() && isDigit(text.charAt(pos))) {
                    pos++;
                }
            }
            if (pos < text.length() && text.charAt(pos) == '.') {
                pos++;
                if (pos >= text.length() || !isDigit(text.charAt(pos))) {
                    fail(pos, "Invalid number fraction");
                }
                while (pos < text.length() && isDigit(text.charAt(pos))) {
                    pos++;
                }
            }
            if (pos < text.length()
                    && (text.charAt(pos) == 'e' || text.charAt(pos) == 'E')) {
                pos++;
                if (pos < text.length()
                        && (text.charAt(pos) == '+' || text.charAt(pos) == '-')) {
                    pos++;
                }
                if (pos >= text.length() || !isDigit(text.charAt(pos))) {
                    fail(pos, "Invalid number exponent");
                }
                while (pos < text.length() && isDigit(text.charAt(pos))) {
                    pos++;
                }
            }
            String numberText = text.substring(start, pos);
            try {
                return Double.valueOf(numberText);
            } catch (NumberFormatException e) {
                fail(start, "Invalid number");
                return null;
            }
        }

        private Object parseLiteral(String literal, Object value) {
            if (pos + literal.length() > text.length()) {
                fail(pos, "Invalid literal");
            }
            for (int i = 0; i < literal.length(); i++) {
                if (text.charAt(pos + i) != literal.charAt(i)) {
                    fail(pos + i, "Invalid literal");
                }
            }
            pos += literal.length();
            return value;
        }

        private void fail(int offset, String message) {
            throw new JsonException(message + " at offset " + offset);
        }
    }

    private static boolean isDigit(char c) {
        return c >= '0' && c <= '9';
    }
}