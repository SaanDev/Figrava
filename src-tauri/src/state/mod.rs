use project_engine::Project;
use scientific_core::{ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const MAX_UNDO_STEPS: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    pub project: Project,
    pub project_path: Option<String>,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
}

pub struct AppState {
    project: Mutex<Project>,
    project_path: Mutex<Option<String>>,
    dirty: Mutex<bool>,
    undo_stack: Mutex<Vec<Project>>,
    redo_stack: Mutex<Vec<Project>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let initial = Project::create_empty_project();
        Self {
            project: Mutex::new(initial),
            project_path: Mutex::new(None),
            dirty: Mutex::new(false),
            undo_stack: Mutex::new(Vec::new()),
            redo_stack: Mutex::new(Vec::new()),
        }
    }

    pub fn snapshot(&self) -> ScientificResult<WorkspaceSnapshot> {
        let project = self
            .project
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .clone();
        let project_path = self
            .project_path
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .clone();
        let dirty = *self
            .dirty
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?;
        let can_undo = !self
            .undo_stack
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .is_empty();
        let can_redo = !self
            .redo_stack
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .is_empty();

        Ok(WorkspaceSnapshot {
            project,
            project_path,
            dirty,
            can_undo,
            can_redo,
        })
    }

    /// Executes a mutating operation on the active `Project`, recording an undo snapshot
    /// prior to mutation and marking the workspace dirty if the mutation succeeds.
    pub fn mutate_project<F>(&self, f: F) -> ScientificResult<WorkspaceSnapshot>
    where
        F: FnOnce(&mut Project) -> ScientificResult<()>,
    {
        {
            let mut proj_guard = self
                .project
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))?;
            let previous = proj_guard.clone();

            f(&mut proj_guard)?;

            let mut undo = self
                .undo_stack
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))?;
            if undo.len() >= MAX_UNDO_STEPS {
                undo.remove(0);
            }
            undo.push(previous);

            self.redo_stack
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))?
                .clear();
            *self
                .dirty
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))? = true;
        }
        self.snapshot()
    }

    pub fn replace_project(
        &self,
        new_project: Project,
        path: Option<String>,
    ) -> ScientificResult<WorkspaceSnapshot> {
        *self
            .project
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))? = new_project;
        *self
            .project_path
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))? = path;
        *self
            .dirty
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))? = false;
        self.undo_stack
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .clear();
        self.redo_stack
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?
            .clear();
        self.snapshot()
    }

    pub fn mark_saved(&self, path: Option<String>) -> ScientificResult<WorkspaceSnapshot> {
        if let Some(p) = path {
            *self
                .project_path
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))? = Some(p);
        }
        *self
            .dirty
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))? = false;
        self.snapshot()
    }

    pub fn undo(&self) -> ScientificResult<WorkspaceSnapshot> {
        {
            let mut undo = self
                .undo_stack
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))?;
            if let Some(prev) = undo.pop() {
                let mut proj_guard = self
                    .project
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))?;
                let current = proj_guard.clone();
                *proj_guard = prev;

                self.redo_stack
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))?
                    .push(current);
                *self
                    .dirty
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))? = true;
            }
        }
        self.snapshot()
    }

    pub fn redo(&self) -> ScientificResult<WorkspaceSnapshot> {
        {
            let mut redo = self
                .redo_stack
                .lock()
                .map_err(|e| ScientificError::IoError(e.to_string()))?;
            if let Some(next) = redo.pop() {
                let mut proj_guard = self
                    .project
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))?;
                let current = proj_guard.clone();
                *proj_guard = next;

                self.undo_stack
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))?
                    .push(current);
                *self
                    .dirty
                    .lock()
                    .map_err(|e| ScientificError::IoError(e.to_string()))? = true;
            }
        }
        self.snapshot()
    }

    pub fn with_project<F, R>(&self, f: F) -> ScientificResult<R>
    where
        F: FnOnce(&Project) -> ScientificResult<R>,
    {
        let proj = self
            .project
            .lock()
            .map_err(|e| ScientificError::IoError(e.to_string()))?;
        f(&proj)
    }
}
