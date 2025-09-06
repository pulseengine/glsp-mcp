use regex::Regex;

pub fn extract_diagram_id(text: &str) -> Option<String> {
    let re = Regex::new(r"(?:diagram ID|with ID): ([a-f0-9\-]+)").ok()?;
    re.captures(text).and_then(|caps| caps.get(1)).map(|m| m.as_str().to_string())
}

pub fn extract_node_id(text: &str) -> Option<String> {
    let re = Regex::new(r"ID: ([a-f0-9\-]+)").ok()?;
    re.captures(text).and_then(|caps| caps.get(1)).map(|m| m.as_str().to_string())
}
