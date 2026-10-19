//! Safe recursive-descent mathematical expression evaluator for custom nonlinear curve fitting.
//! Supports `x`, user-defined parameter identifiers, constants (`pi`, `e`),
//! arithmetic operators (`+`, `-`, `*`, `/`, `^`), parentheses, and elementary functions
//! (`exp`, `ln`, `log10`, `sin`, `cos`, `tan`, `sqrt`, `abs`).

use std::f64::consts::{E, PI};

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Ident(String),
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    LParen,
    RParen,
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '+' => {
                tokens.push(Token::Plus);
                i += 1;
            }
            '-' => {
                tokens.push(Token::Minus);
                i += 1;
            }
            '*' => {
                tokens.push(Token::Star);
                i += 1;
            }
            '/' => {
                tokens.push(Token::Slash);
                i += 1;
            }
            '^' => {
                tokens.push(Token::Caret);
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            d if d.is_ascii_digit() || d == '.' => {
                let start = i;
                while i < chars.len()
                    && (chars[i].is_ascii_digit()
                        || chars[i] == '.'
                        || chars[i] == 'e'
                        || chars[i] == 'E'
                        || ((chars[i] == '+' || chars[i] == '-')
                            && i > start
                            && (chars[i - 1] == 'e' || chars[i - 1] == 'E')))
                {
                    i += 1;
                }
                let raw: String = chars[start..i].iter().collect();
                let val = raw
                    .parse::<f64>()
                    .map_err(|_| format!("Invalid number literal '{raw}'"))?;
                tokens.push(Token::Number(val));
            }
            a if a.is_ascii_alphabetic() || a == '_' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let ident: String = chars[start..i].iter().collect();
                tokens.push(Token::Ident(ident));
            }
            other => {
                return Err(format!("Unexpected character '{other}' in expression"));
            }
        }
    }

    Ok(tokens)
}

struct Parser<'a> {
    tokens: &'a [Token],
    pos: usize,
    x: f64,
    param_names: &'a [String],
    param_values: &'a [f64],
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&'a Token> {
        self.tokens.get(self.pos)
    }

    fn next(&mut self) -> Option<&'a Token> {
        let tok = self.tokens.get(self.pos);
        if tok.is_some() {
            self.pos += 1;
        }
        tok
    }

    fn parse_expr(&mut self) -> Result<f64, String> {
        let mut val = self.parse_term()?;
        while let Some(tok) = self.peek() {
            match tok {
                Token::Plus => {
                    self.next();
                    val += self.parse_term()?;
                }
                Token::Minus => {
                    self.next();
                    val -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Ok(val)
    }

    fn parse_term(&mut self) -> Result<f64, String> {
        let mut val = self.parse_power()?;
        while let Some(tok) = self.peek() {
            match tok {
                Token::Star => {
                    self.next();
                    val *= self.parse_power()?;
                }
                Token::Slash => {
                    self.next();
                    let denom = self.parse_power()?;
                    val = if denom.abs() > 1e-30 {
                        val / denom
                    } else {
                        val / 1e-30_f64.copysign(denom)
                    };
                }
                _ => break,
            }
        }
        Ok(val)
    }

    fn parse_power(&mut self) -> Result<f64, String> {
        let base = self.parse_unary()?;
        if matches!(self.peek(), Some(Token::Caret)) {
            self.next();
            let exp = self.parse_power()?;
            Ok(base.powf(exp))
        } else {
            Ok(base)
        }
    }

    fn parse_unary(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some(Token::Plus) => {
                self.next();
                self.parse_unary()
            }
            Some(Token::Minus) => {
                self.next();
                Ok(-self.parse_unary()?)
            }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Result<f64, String> {
        match self.next() {
            Some(Token::Number(v)) => Ok(*v),
            Some(Token::LParen) => {
                let v = self.parse_expr()?;
                match self.next() {
                    Some(Token::RParen) => Ok(v),
                    _ => Err("Expected closing parenthesis ')'".to_string()),
                }
            }
            Some(Token::Ident(name)) => {
                if matches!(self.peek(), Some(Token::LParen)) {
                    self.next(); // consume '('
                    let arg = self.parse_expr()?;
                    match self.next() {
                        Some(Token::RParen) => {}
                        _ => {
                            return Err(format!("Expected ')' after function '{name}' argument"));
                        }
                    }
                    match name.to_lowercase().as_str() {
                        "exp" => Ok(arg.clamp(-500.0, 500.0).exp()),
                        "ln" | "log" => Ok(arg.max(1e-30).ln()),
                        "log10" => Ok(arg.max(1e-30).log10()),
                        "sin" => Ok(arg.sin()),
                        "cos" => Ok(arg.cos()),
                        "tan" => Ok(arg.tan()),
                        "sqrt" => Ok(arg.max(0.0).sqrt()),
                        "abs" => Ok(arg.abs()),
                        other => Err(format!("Unsupported function '{other}'")),
                    }
                } else if name.eq_ignore_ascii_case("x") {
                    Ok(self.x)
                } else if name.eq_ignore_ascii_case("pi") {
                    Ok(PI)
                } else if name.eq_ignore_ascii_case("e") {
                    Ok(E)
                } else if let Some(idx) = self.param_names.iter().position(|p| p == name) {
                    Ok(self.param_values.get(idx).copied().unwrap_or(1.0))
                } else {
                    Err(format!("Unknown parameter or variable '{name}'"))
                }
            }
            other => Err(format!(
                "Unexpected token {other:?} in mathematical expression"
            )),
        }
    }
}

/// Evaluates a user-defined mathematical expression `expr` at `x` with parameter bindings.
pub fn eval_custom_expression(
    expr: &str,
    x: f64,
    param_names: &[String],
    param_values: &[f64],
) -> Result<f64, String> {
    let cleaned = expr
        .trim()
        .trim_start_matches("y=")
        .trim_start_matches("y =");
    let tokens = tokenize(cleaned)?;
    if tokens.is_empty() {
        return Err("Expression cannot be empty".to_string());
    }
    let mut parser = Parser {
        tokens: &tokens,
        pos: 0,
        x,
        param_names,
        param_values,
    };
    let val = parser.parse_expr()?;
    if parser.pos < tokens.len() {
        return Err("Unexpected trailing tokens in expression".to_string());
    }
    Ok(val)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_custom_scientific_formula() {
        let params = vec!["A".to_string(), "k".to_string(), "C".to_string()];
        let vals = vec![100.0, 0.5, 10.0];
        let y = eval_custom_expression("A * exp(-k * x) + C", 2.0, &params, &vals).expect("eval");
        let expected = 100.0 * (-1.0_f64).exp() + 10.0;
        assert!((y - expected).abs() < 1e-12);
    }
}
