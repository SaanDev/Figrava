use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident, $prefix:literal) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new() -> Self {
                Self(format!("{}-{}", $prefix, Uuid::new_v4()))
            }

            pub fn from_raw(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_string())
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }
    };
}

define_id!(ProjectId, "proj");
define_id!(DatasetId, "ds");
define_id!(ColumnId, "col");
define_id!(WorksheetId, "ws");
define_id!(PlotId, "plot");
define_id!(PanelId, "panel");
define_id!(LayerId, "layer");
define_id!(AnnotationId, "ann");
define_id!(AnalysisId, "ana");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_unique_prefixed_ids() {
        let id1 = DatasetId::new();
        let id2 = DatasetId::new();
        assert_ne!(id1, id2);
        assert!(id1.as_str().starts_with("ds-"));
    }

    #[test]
    fn serializes_transparently_as_string() {
        let id = ColumnId::from_raw("col-temperature");
        let json = serde_json::to_string(&id).expect("serialize");
        assert_eq!(json, "\"col-temperature\"");
        let parsed: ColumnId = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed, id);
    }
}
