/**
 * Lightweight, zero-dependency safe arithmetic equation evaluator.
 *
 * Supports +, -, *, /, parentheses, decimal dots and commas (12,5 + 7,5 -> 20),
 * unary minus (-5 + 10 -> 5), and leading '=' (e.g. "= 1200 + 450").
 * Fails safely to null without throwing or using unsafe eval().
 */

export function evaluateEquation(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let expr = String(input).trim();
  if (!expr) return null;

  // Strip leading '=' if entered spreadsheet-style
  if (expr.startsWith("=")) {
    expr = expr.slice(1).trim();
  }

  // Normalize European thousand separators: e.g. "1 500" or "1 250 000"
  expr = expr.replace(/(\d)\s+(\d{3})(?!\d)/g, "$1$2");
  expr = expr.replace(/,/g, ".");

  // Reject if invalid characters exist
  if (!/^[-+*/.()0-9\s]+$/.test(expr)) {
    return null;
  }

  // Tokenize
  const tokens: (string | number)[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push(ch);
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let numStr = "";
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === ".") {
          dotCount++;
          if (dotCount > 1) return null; // invalid double dot
        }
        numStr += expr[i];
        i++;
      }
      const parsedNum = parseFloat(numStr);
      if (!Number.isFinite(parsedNum)) return null;
      tokens.push(parsedNum);
    } else {
      return null;
    }
  }

  if (tokens.length === 0) return null;

  // Recursive descent parser
  let pos = 0;

  function peek(): string | number | undefined {
    return tokens[pos];
  }

  function consume(): string | number {
    return tokens[pos++];
  }

  function parseFactor(): number | null {
    const token = peek();
    if (token === undefined) return null;

    // Unary minus
    if (token === "-") {
      consume();
      const val = parseFactor();
      return val === null ? null : -val;
    }

    // Unary plus
    if (token === "+") {
      consume();
      return parseFactor();
    }

    // Parentheses
    if (token === "(") {
      consume();
      const val = parseExpression();
      if (val === null) return null;
      if (peek() !== ")") return null; // unclosed parenthesis
      consume(); // consume ')'
      return val;
    }

    // Number
    if (typeof token === "number") {
      consume();
      return token;
    }

    return null;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;

    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      if (right === null) return null;

      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) return null; // division by zero
        left = left / right;
      }
    }

    return left;
  }

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      if (right === null) return null;

      if (op === "+") {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  const result = parseExpression();

  // If there are leftover unparsed tokens, equation was malformed (e.g. "10 + 20 30" or "10 )")
  if (pos < tokens.length) {
    return null;
  }

  if (result === null || !Number.isFinite(result)) {
    return null;
  }

  // Round small floating point inaccuracies (e.g. 0.1 + 0.2 -> 0.3)
  return Math.round(result * 10000) / 10000;
}
