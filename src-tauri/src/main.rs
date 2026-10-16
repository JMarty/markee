// Release buildben ne nyíljon konzolablak.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markee_lib::run()
}
