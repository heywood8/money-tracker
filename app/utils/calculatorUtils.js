import Decimal from 'decimal.js';

export function hasOperation(expr) {
  if (!expr || typeof expr !== 'string') return false;
  return /[+\-×÷]/.test(expr);
}

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === ' ') { i++; continue; }
    if (/[\d.]/.test(expr[i])) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'number', value: num });
    } else if (['+', '-', '*', '/', '(', ')'].includes(expr[i])) {
      tokens.push({ type: 'op', value: expr[i++] });
    } else {
      throw new Error('Invalid character: ' + expr[i]);
    }
  }
  return tokens;
}

class ExprParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  parse() {
    if (this.tokens.length === 0) throw new Error('Empty expression');
    const result = this.addSub();
    if (this.pos < this.tokens.length) throw new Error('Unexpected token');
    return result;
  }

  addSub() {
    let left = this.mulDiv();
    while (this.peek()?.value === '+' || this.peek()?.value === '-') {
      const op = this.consume().value;
      const right = this.mulDiv();
      left = op === '+' ? left.plus(right) : left.minus(right);
    }
    return left;
  }

  mulDiv() {
    let left = this.unary();
    while (this.peek()?.value === '*' || this.peek()?.value === '/') {
      const op = this.consume().value;
      const right = this.unary();
      if (op === '/' && right.isZero()) throw new Error('Division by zero');
      left = op === '*' ? left.times(right) : left.dividedBy(right);
    }
    return left;
  }

  unary() {
    if (this.peek()?.value === '-') {
      this.consume();
      return this.primary().negated();
    }
    if (this.peek()?.value === '+') {
      this.consume();
    }
    return this.primary();
  }

  primary() {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of expression');
    if (token.type === 'number') {
      this.consume();
      return new Decimal(token.value);
    }
    if (token.value === '(') {
      this.consume();
      const result = this.addSub();
      if (this.peek()?.value !== ')') throw new Error('Missing closing parenthesis');
      this.consume();
      return result;
    }
    throw new Error('Unexpected token: ' + token.value);
  }
}

function stripTrailingZeros(str) {
  if (!str.includes('.')) return str;
  return str.replace(/\.?0+$/, '');
}

export function evaluateExpression(expr, decimalDigits = 2) {
  if (!expr || expr.trim() === '') return null;
  try {
    const sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/');
    const tokens = tokenize(sanitized);
    const result = new ExprParser(tokens).parse();
    if (!result.isFinite()) return null;
    return stripTrailingZeros(result.toDecimalPlaces(decimalDigits).toFixed(decimalDigits));
  } catch {
    return null;
  }
}
