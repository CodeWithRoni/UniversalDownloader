fn main() {
    // `native_engine`: the pure-Rust YouTube engine is compiled in.
    // Always on for Android/iOS, optional on desktop (feature "native-engine").
    println!("cargo::rustc-check-cfg=cfg(native_engine)");
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if os == "android" || os == "ios" || std::env::var("CARGO_FEATURE_NATIVE_ENGINE").is_ok() {
        println!("cargo:rustc-cfg=native_engine");
    }
    tauri_build::build()
}
