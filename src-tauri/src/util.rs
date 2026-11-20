//! Small helpers shared by both engines.

/// "90" -> 90, "1:30" -> 90, "1:02:03" -> 3723. Invalid -> None.
pub fn parse_time(v: &str) -> Option<u64> {
    let s = v.trim();
    if s.is_empty() {
        return None;
    }
    if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok();
    }
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let mut total = 0u64;
    for p in parts {
        if p.is_empty() || p.len() > 2 || !p.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        total = total * 60 + p.parse::<u64>().ok()?;
    }
    Some(total)
}

/// Remove ANSI colour codes from a line of tool output.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Make a string safe to use as a file name on every platform.
#[allow(dead_code)]
pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    let mut out: String = trimmed.chars().take(150).collect();
    if out.is_empty() {
        out = "download".into();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times() {
        assert_eq!(parse_time("90"), Some(90));
        assert_eq!(parse_time("1:30"), Some(90));
        assert_eq!(parse_time("1:02:03"), Some(3723));
        assert_eq!(parse_time("x"), None);
        assert_eq!(parse_time(""), None);
    }

    #[test]
    fn ansi() {
        assert_eq!(strip_ansi("\u{1b}[0;94m 42.0%\u{1b}[0m"), " 42.0%");
    }

    #[test]
    fn names() {
        assert_eq!(sanitize_filename("a/b:c?"), "a_b_c_");
        assert_eq!(sanitize_filename("  ..."), "download");
    }
}
