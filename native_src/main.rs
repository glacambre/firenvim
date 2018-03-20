extern crate byteorder;

use std::process::{Command, Stdio};
use std::thread;
use std::io::{self, Read, Write};
use byteorder::{NativeEndian, WriteBytesExt, ReadBytesExt};

fn forward_inputs (ff: &mut Read, nvim: &mut Write) {
    let mut buf = vec![];
    while let Ok(message_size) = ff.read_u32::<NativeEndian>() {
        if message_size > 0 {
            buf.clear();
            ff.take((message_size) as u64).read_to_end(&mut buf).unwrap();
            nvim.write(&buf[1..((message_size - 1) as usize)]).unwrap();
            nvim.flush().unwrap();
        }
    }
}

fn forward_outputs (ff: &mut Write, nvim: &mut Read) {
    let mut buf = [0; 4096];
    while let Ok(message_size) = nvim.read(&mut buf) {
        if message_size <= 0 {
            // Process died
            return
        }
        ff.write_u32::<NativeEndian>((message_size + 2) as u32).unwrap();
        // Inefficient, use .format() instead
        ff.write("\"".as_bytes()).unwrap();
        ff.write(&buf[0 .. message_size]).unwrap();
        ff.write("\"".as_bytes()).unwrap();
    }
}

fn main() {
    let mut ff_in = io::stdin();
    let mut ff_out = io::stdout();

    let nvim = Command::new("nvim")
        .args(&["-u", "NORC", "--embed"])
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
