use tauri::{api::process::{Command, CommandEvent}, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let window = app.get_window("main").unwrap();
      tauri::async_runtime::spawn(async move {
          let (mut rx, _child) = Command::new_sidecar("node")
              .expect("failed to create `node` binary command")
              .args(&["server.cjs"])
              .spawn()
              .expect("Failed to spawn sidecar");

          while let Some(event) = rx.recv().await {
              if let CommandEvent::Stdout(line) = event {
                  window
                      .emit("message", Some(format!("'{}'", line)))
                      .expect("failed to emit event");
              }
          }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
