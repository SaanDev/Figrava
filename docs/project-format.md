# Project Container Format Specification (`.spsproj` v1)

## 1. Container Structure

A `.spsproj` file is a Deflate-compressed ZIP archive containing five structured JSON documents:

```text
archive.spsproj (ZIP)
├── manifest.json       # format_version (1), ProjectId, timestamps, active_tab_id, DependencyGraph
├── datasets.json       # Embedded Dataset definitions and column cell arrays
├── worksheets.json     # Worksheet views and filter states
├── plots.json          # Renderer-independent PlotDocument specifications
└── analyses.json       # AnalysisResult models, FitConfigurations, parameters, and curves
```

## 2. Atomic Persistence & Version Safety

- `Project::save_atomic` writes the archive to a sibling `.tmp` file, flushes via `sync_all()`, and atomically renames over the target path so interrupted writes never corrupt the previous valid project.
- `Project::from_spsproj_bytes` validates `manifest.format_version <= CURRENT_PROJECT_VERSION` and returns `ScientificError::UnsupportedVersion` if opened by an older client.
