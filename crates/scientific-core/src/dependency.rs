use crate::error::{ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencyNodeKind {
    Dataset,
    Worksheet,
    Transformation,
    Analysis,
    PlotDocument,
    PlotLayer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DependencyGraph {
    nodes: BTreeMap<String, DependencyNodeKind>,
    /// Forward edges: source_id -> set of dependent_ids
    dependents: BTreeMap<String, BTreeSet<String>>,
    /// Reverse edges: dependent_id -> set of source_ids
    dependencies: BTreeMap<String, BTreeSet<String>>,
    /// Set of currently invalidated (dirty) node IDs
    dirty_nodes: BTreeSet<String>,
}

impl DependencyGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_node(&mut self, id: impl Into<String>, kind: DependencyNodeKind) {
        let id = id.into();
        self.nodes.insert(id.clone(), kind);
        self.dependents.entry(id.clone()).or_default();
        self.dependencies.entry(id).or_default();
    }

    pub fn remove_node(&mut self, id: &str) {
        self.nodes.remove(id);
        self.dirty_nodes.remove(id);
        if let Some(deps) = self.dependents.remove(id) {
            for dep in deps {
                if let Some(rev) = self.dependencies.get_mut(&dep) {
                    rev.remove(id);
                }
            }
        }
        if let Some(sources) = self.dependencies.remove(id) {
            for src in sources {
                if let Some(fwd) = self.dependents.get_mut(&src) {
                    fwd.remove(id);
                }
            }
        }
    }

    /// Adds a directed dependency where `dependent_id` depends on `source_id`
    /// (`source_id -> dependent_id`). Rejects self-loops and circular dependencies.
    pub fn add_dependency(
        &mut self,
        source_id: impl Into<String>,
        dependent_id: impl Into<String>,
    ) -> ScientificResult<()> {
        let source_id = source_id.into();
        let dependent_id = dependent_id.into();

        if source_id == dependent_id {
            return Err(ScientificError::CyclicDependency {
                from: source_id,
                to: dependent_id,
            });
        }

        // Check if `source_id` is already reachable from `dependent_id`
        if self.is_reachable(&dependent_id, &source_id) {
            return Err(ScientificError::CyclicDependency {
                from: source_id,
                to: dependent_id,
            });
        }

        self.dependents
            .entry(source_id.clone())
            .or_default()
            .insert(dependent_id.clone());
        self.dependencies
            .entry(dependent_id)
            .or_default()
            .insert(source_id);

        Ok(())
    }

    pub fn clear_dependencies_for(&mut self, dependent_id: &str) {
        if let Some(sources) = self.dependencies.get_mut(dependent_id) {
            let old_sources: Vec<String> = sources.iter().cloned().collect();
            sources.clear();
            for src in old_sources {
                if let Some(fwd) = self.dependents.get_mut(&src) {
                    fwd.remove(dependent_id);
                }
            }
        }
    }

    /// Invalidates all downstream dependents of `source_id` in breadth-first topological order
    /// and marks them dirty.
    pub fn invalidate(&mut self, source_id: &str) -> Vec<String> {
        let mut invalidated = Vec::new();
        let mut visited = BTreeSet::new();
        let mut queue = VecDeque::new();

        if let Some(direct) = self.dependents.get(source_id) {
            for dep in direct {
                queue.push_back(dep.clone());
            }
        }

        while let Some(curr) = queue.pop_front() {
            if visited.insert(curr.clone()) {
                self.dirty_nodes.insert(curr.clone());
                invalidated.push(curr.clone());
                if let Some(next_deps) = self.dependents.get(&curr) {
                    for next in next_deps {
                        if !visited.contains(next) {
                            queue.push_back(next.clone());
                        }
                    }
                }
            }
        }

        invalidated
    }

    pub fn mark_clean(&mut self, node_id: &str) {
        self.dirty_nodes.remove(node_id);
    }

    pub fn is_dirty(&self, node_id: &str) -> bool {
        self.dirty_nodes.contains(node_id)
    }

    pub fn dirty_nodes(&self) -> Vec<String> {
        self.dirty_nodes.iter().cloned().collect()
    }

    pub fn dependents_of(&self, source_id: &str) -> Vec<String> {
        self.dependents
            .get(source_id)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn dependencies_of(&self, dependent_id: &str) -> Vec<String> {
        self.dependencies
            .get(dependent_id)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn is_reachable(&self, start: &str, target: &str) -> bool {
        let mut visited = BTreeSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(start.to_string());

        while let Some(curr) = queue.pop_front() {
            if curr == target {
                return true;
            }
            if visited.insert(curr.clone()) {
                if let Some(nexts) = self.dependents.get(&curr) {
                    for next in nexts {
                        if !visited.contains(next) {
                            queue.push_back(next.clone());
                        }
                    }
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_chain_and_invalidates_downstream() {
        let mut graph = DependencyGraph::new();
        graph.register_node("ds-1", DependencyNodeKind::Dataset);
        graph.register_node("ana-1", DependencyNodeKind::Analysis);
        graph.register_node("plot-1", DependencyNodeKind::PlotDocument);

        graph.add_dependency("ds-1", "ana-1").expect("edge 1");
        graph.add_dependency("ana-1", "plot-1").expect("edge 2");

        let affected = graph.invalidate("ds-1");
        assert_eq!(affected, vec!["ana-1".to_string(), "plot-1".to_string()]);
        assert!(graph.is_dirty("ana-1"));
        assert!(graph.is_dirty("plot-1"));

        graph.mark_clean("ana-1");
        assert!(!graph.is_dirty("ana-1"));
        assert!(graph.is_dirty("plot-1"));
    }

    #[test]
    fn rejects_circular_dependencies() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("a", "b").expect("a->b");
        graph.add_dependency("b", "c").expect("b->c");
        let err = graph.add_dependency("c", "a").expect_err("cycle");
        assert!(matches!(err, ScientificError::CyclicDependency { .. }));
    }
}
