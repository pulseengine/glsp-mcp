// Copyright (c) 2024 GLSP-Rust Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Selection state management for diagram elements
///
/// Tracks which elements are currently selected, hovered, or focused in the diagram.
/// Supports multiple selection modes and maintains selection history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionState {
    pub selected_elements: HashSet<String>,
    pub hovered_element: Option<String>,
    pub last_selected: Option<String>,
    pub selection_mode: SelectionMode,
}

/// Selection behavior modes for user interaction
///
/// Determines how element selection behaves when users interact with the diagram.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SelectionMode {
    Single,
    Multiple,
    Range,
}

impl Default for SelectionState {
    fn default() -> Self {
        Self {
            selected_elements: HashSet::new(),
            hovered_element: None,
            last_selected: None,
            selection_mode: SelectionMode::Single,
        }
    }
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn select_element(&mut self, element_id: String, mode: SelectionMode) {
        match mode {
            SelectionMode::Single => {
                self.selected_elements.clear();
                self.selected_elements.insert(element_id.clone());
                self.last_selected = Some(element_id);
            }
            SelectionMode::Multiple => {
                if self.selected_elements.contains(&element_id) {
                    self.selected_elements.remove(&element_id);
                    if self.last_selected.as_ref() == Some(&element_id) {
                        self.last_selected = self.selected_elements.iter().next().cloned();
                    }
                } else {
                    self.selected_elements.insert(element_id.clone());
                    self.last_selected = Some(element_id);
                }
            }
            SelectionMode::Range => {
                // Range selection would require element ordering logic
                self.selected_elements.insert(element_id.clone());
                self.last_selected = Some(element_id);
            }
        }
        self.selection_mode = mode;
    }

    pub fn select_multiple(&mut self, element_ids: Vec<String>, append: bool) {
        if !append {
            self.selected_elements.clear();
        }

        for id in element_ids {
            self.selected_elements.insert(id.clone());
            self.last_selected = Some(id);
        }

        self.selection_mode = SelectionMode::Multiple;
    }

    pub fn select_all(&mut self, all_element_ids: Vec<String>) {
        self.selected_elements.clear();
        for id in all_element_ids {
            self.selected_elements.insert(id);
        }
        self.last_selected = self.selected_elements.iter().next().cloned();
        self.selection_mode = SelectionMode::Multiple;
    }

    pub fn clear_selection(&mut self) {
        self.selected_elements.clear();
        self.last_selected = None;
        self.hovered_element = None;
    }

    pub fn set_hover(&mut self, element_id: Option<String>) {
        self.hovered_element = element_id;
    }

    pub fn is_selected(&self, element_id: &str) -> bool {
        self.selected_elements.contains(element_id)
    }

    pub fn get_selected_count(&self) -> usize {
        self.selected_elements.len()
    }

    pub fn get_selected_ids(&self) -> Vec<String> {
        self.selected_elements.iter().cloned().collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementAtPositionQuery {
    pub x: f64,
    pub y: f64,
    pub include_edges: bool,
    pub tolerance: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionChange {
    pub diagram_id: String,
    pub selected_elements: Vec<String>,
    pub deselected_elements: Vec<String>,
    pub selection_mode: SelectionMode,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_selection() {
        let mut state = SelectionState::new();

        state.select_element("node1".to_string(), SelectionMode::Single);
        assert_eq!(state.get_selected_count(), 1);
        assert!(state.is_selected("node1"));

        state.select_element("node2".to_string(), SelectionMode::Single);
        assert_eq!(state.get_selected_count(), 1);
        assert!(!state.is_selected("node1"));
        assert!(state.is_selected("node2"));
    }

    #[test]
    fn test_multiple_selection() {
        let mut state = SelectionState::new();

        state.select_element("node1".to_string(), SelectionMode::Multiple);
        state.select_element("node2".to_string(), SelectionMode::Multiple);
        assert_eq!(state.get_selected_count(), 2);

        // Toggle selection
        state.select_element("node1".to_string(), SelectionMode::Multiple);
        assert_eq!(state.get_selected_count(), 1);
        assert!(!state.is_selected("node1"));
        assert!(state.is_selected("node2"));
    }

    #[test]
    fn test_select_all() {
        let mut state = SelectionState::new();
        let all_ids = vec![
            "node1".to_string(),
            "node2".to_string(),
            "node3".to_string(),
        ];

        state.select_all(all_ids);
        assert_eq!(state.get_selected_count(), 3);
        assert!(state.is_selected("node1"));
        assert!(state.is_selected("node2"));
        assert!(state.is_selected("node3"));
    }
}
