extern crate byteorder;
use byteorder::{NativeEndian, WriteBytesExt, ReadBytesExt};

extern crate serde;
extern crate serde_json;
#[macro_use]
extern crate serde_derive;

use std::process::{Command, Stdio};
use std::thread;
use std::io::{self, Read, Write};

#[derive(Serialize, Deserialize)]
struct Message {
    #[serde(rename="type")]
    json_type: String,
    data: Vec<u8>,
}

fn forward_inputs (ff: &mut Read, nvim: &mut Write) {
    let mut buf = vec![];
    let mut msg: Message;
    while let Ok(message_size) = ff.read_u32::<NativeEndian>() {
        if message_size > 0 {
            buf.clear();
            ff.take((message_size) as u64).read_to_end(&mut buf).unwrap();
            msg = serde_json::from_slice(&mut buf).unwrap();
            nvim.write(&msg.data).unwrap();
            nvim.flush().unwrap();
        }
    }
}

fn forward_outputs (ff: &mut Write, nvim: &mut Read) {
    let mut buf = [0; 1000000]; // Max size for native messaging is 1MB
    while let Ok(message_size) = nvim.read(&mut buf) {
        if message_size <= 0 {
            // Process died
            return
        }
        let msg = serde_json::to_string(&Message {
            json_type: "Buffer".to_owned(),
            data: buf[0..message_size].to_owned(),
        }).unwrap();
        ff.write_u32::<NativeEndian>((msg.len() + 0) as u32).unwrap();
        ff.write(msg.as_bytes()).unwrap();
        ff.flush().unwrap();
    }
}

fn main() {
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

    let inthread = thread::spawn(move || {forward_inputs(ff_in.by_ref(), nvim_in.by_ref());});
    let outthread = thread::spawn(move || {forward_outputs(ff_out.by_ref(), nvim_out.by_ref());});

    inthread.join().unwrap();
    outthread.join().unwrap();
}
