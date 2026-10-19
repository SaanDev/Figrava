use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=../dist");

    let dist_assets = Path::new("../dist/assets");
    if !dist_assets.exists() {
        let npm_cmd = if cfg!(windows) { "npm.cmd" } else { "npm" };
        let status = Command::new(npm_cmd)
            .args(["run", "build"])
            .current_dir("..")
            .status()
            .expect("failed to start npm to build the frontend");
        assert!(status.success(), "frontend build failed");
    }

    tauri_build::build()
}
