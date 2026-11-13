/**
 * Paper's console colorizes its output when the surrounding terminal
 * advertises color support. When the CLI runs under a color-capable
 * terminal (e.g. a tmux pane, where TERM=tmux-256color), the server
 * child inherits that environment and the log lines it emits carry
 * ANSI escape sequences — including in the middle of phrases the
 * harness pattern-matches ("Successfully reloaded the config..."),
 * which made the load check time out even though the reload had in
 * fact completed. Every consumer therefore strips escape sequences
 * from console lines before judging them, so matching never depends
 * on the ambient terminal.
 *
 * Minecraft § formatting codes are content, not terminal escapes,
 * and are deliberately left untouched.
 */

// ECMA-48 sequences: CSI (ESC [ params intermediates final), OSC
// (ESC ] ... BEL or ST), character-set switches (ESC ( X), and the
// remaining two-byte forms (ESC @ .. ESC _).
const ANSI_PATTERN =
  /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}
