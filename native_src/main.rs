extern crate byteorder;
use byteorder::{NativeEndian, ReadBytesExt, WriteBytesExt};

extern crate directories;
use directories::{ProjectDirs, UserDirs};

extern crate serde;
extern crate serde_json;
#[macro_use]
extern crate serde_derive;

#[cfg(target_os = "windows")]
extern crate winreg;
#[cfg(target_os = "windows")]
use winreg::RegKey;
#[cfg(target_os = "windows")]
use winreg::enums::*;

use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::path;
use std::process::{Command, Stdio};
use std::thread;

#[derive(Serialize, Deserialize)]
struct Message {
    #[serde(rename = "type")]
    json_type: String,
    data: Vec<u8>,
}

static NATIVE_MANIFEST_BEGINNING: &str = "{
  \"name\": \"firenvim\",
  \"description\": \"Turn Firefox into a Neovim client.\",
  \"path\": \"";
static NATIVE_MANIFEST_END: &str = "\",
  \"type\": \"stdio\",
  \"allowed_extensions\": [ \"firenvim@lacamb.re\" ]
}
";

fn forward_inputs(ff: &mut Read, nvim: &mut Write) {
    let mut buf = vec![];
    let mut msg: Message;
    while let Ok(message_size) = ff.read_u32::<NativeEndian>() {
        if message_size > 0 {
            buf.clear();
            ff.take(u64::from(message_size))
                .read_to_end(&mut buf)
                .unwrap();
            msg = serde_json::from_slice(&buf).unwrap();
            nvim.write_all(&msg.data).unwrap();
            nvim.flush().unwrap();
        }
    }
}

fn forward_outputs(ff: &mut Write, nvim: &mut Read) {
    let mut buf = [0; 1_000_000]; // Max size for native messaging is 1MB
    while let Ok(message_size) = nvim.read(&mut buf) {
        if message_size == 0 {
            // Process died
            return;
        }
        let msg = serde_json::to_string(&Message {
            json_type: "Buffer".to_owned(),
            data: buf[0..message_size].to_owned(),
        })
        .unwrap();
        ff.write_u32::<NativeEndian>(msg.len() as u32).unwrap();
        ff.write_all(msg.as_bytes()).unwrap();
        ff.flush().unwrap();
    }
}

fn run_neovim() {
    let mut ff_in = io::stdin();
    let mut ff_out = io::stdout();

    // Easy debug :)
    // let nvim = Command::new("tee")
    //     .args(&["/tmp/firenvim_log"])
    let nvim = Command::new("nvim")
        .args(&["--embed"])
        .stdout(Stdio::piped())
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("Failed to start nvim process");
    let mut nvim_in = nvim.stdin.expect("Failed to grab nvim's stdin");
    let mut nvim_out = nvim.stdout.expect("Failed to grab nvim's stdout");

    let inthread = thread::spawn(move || {
        forward_inputs(ff_in.by_ref(), nvim_in.by_ref());
    });
    let outthread = thread::spawn(move || {
        forward_outputs(ff_out.by_ref(), nvim_out.by_ref());
    });

    inthread.join().unwrap();
    outthread.join().unwrap();
}

fn install_native_messenger() -> std::result::Result<(), ()> {
    if let (Some(proj_dirs), Some(user_dirs)) = (
        ProjectDirs::from("", "Firenvim", "Firenvim"),
        UserDirs::new(),
    ) {
        let home_dir_path = user_dirs.home_dir();
        let home_dir_str = home_dir_path.to_str().unwrap();
        let data_dir_path = proj_dirs.data_dir();
        let data_dir_str = data_dir_path.to_str().unwrap();
        if !data_dir_path.exists() && fs::create_dir_all(data_dir_path).is_err() {
            eprintln!("Error: failed to create {}", data_dir_str);
        }

        #[cfg(target_os = "linux")]
        let binary_name = "firenvim";
        #[cfg(target_os = "macos")]
        let binary_name = "firenvim";
        #[cfg(target_os = "windows")]
        let binary_name = "firenvim.exe";

        let mut binary_path = format!("{}{}{}", data_dir_str, path::MAIN_SEPARATOR, binary_name);
        let current_binary = env::args().nth(0).unwrap();
        if current_binary != binary_path
            && fs::copy(current_binary.clone(), binary_path.clone()).is_err()
        {
            eprintln!("Error copying {} to {}", current_binary, binary_path);
            return Err(());
        }

        let manifest_path;

        #[cfg(target_os = "macos")]
        {
          manifest_path = format!(
              "{}{}",
              home_dir_str, "/Library/Application Support/Mozilla/NativeMessagingHosts/firenvim.json"
          );
        }
        #[cfg(target_os = "linux")]
        {
          manifest_path = format!(
            "{}{}",
            home_dir_str, "/.mozilla/native-messaging-hosts/firenvim.json"
          );
        }
        #[cfg(target_os = "windows")]
        {
          manifest_path = format!("{}{}", data_dir_str, "\\firenvim.json");
          binary_path = binary_path.replace("\\", "\\\\");
        }

        if fs::write(
            manifest_path.clone(),
            format!(
                "{}{}{}",
                NATIVE_MANIFEST_BEGINNING, binary_path, NATIVE_MANIFEST_END
            ),
        )
        .is_err()
        {
            eprintln!("Failed to write native manifest to {}.", manifest_path);
            return Err(());
        }

        #[cfg(target_os = "windows")]
        {
          // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests#Windows
          println!("Writing firenvim registry key.");
          let hkcu = RegKey::predef(HKEY_CURRENT_USER);
          let path = path::Path::new("SOFTWARE")
            .join("Mozilla")
            .join("NativeMessagingHosts")
            .join("firenvim");
          let (key, disp) = hkcu.create_subkey(&path).unwrap();

          key.set_value("", &manifest_path).unwrap();
          println!("Registry key successfully written.");
        }
    } else {
        eprintln!("Error: failed to detect install directories.");
        return Err(());
    }
    Ok(())
}

fn main() {
    if env::args().nth(1).is_some() {
        run_neovim();
    } else if install_native_messenger().is_ok() {
        println!("Native messenger successfully installed.");
    } else {
        println!("Please manually install the native messenger manifest according to the steps available here:
https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests
The manifest must be named 'firenvim.json' and its content must be the following json, with the 'path' attribute replaced with the absolute path to the firenvim binary you just ran.

{}{}", NATIVE_MANIFEST_BEGINNING, NATIVE_MANIFEST_END);
    }
}
