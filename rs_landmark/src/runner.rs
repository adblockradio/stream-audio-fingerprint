const SAMPLING_RATE: usize = 22050;
const BPS: usize = 2;
const MNLM: usize = 5;
const MPPP: usize = 3;
const NFFT: usize = 512;
const STEP: f64 = NFFT as f64 / 2_f64;
const DT: f64 = 1 as f64 / (SAMPLING_RATE as f64 / STEP as f64);

//FFT not constant (nightly only)
fn init_fft() -> Arc<(dyn FFT<f64>)> {
    use rustfft::FFTplanner;
    FFTplanner::new(false).plan_fft(SAMPLING_RATE)
}

//HWIN not constant (nightly only)
fn init_hwin() -> [f64; NFFT] {
    use std::f64::consts::PI;
    let values = (0..NFFT)
        .map(|i| 0.5 * (1_f64 - (2_f64 * PI * (i as f64) / ((NFFT - 1) as f64)).cos()))
        .collect::<Vec<f64>>();

    //println!("{:?}", &values[..]);
    let mut hwin: [f64; NFFT] = [0.0; NFFT];
    hwin.copy_from_slice(&values[..]);
    hwin
}

//MASK_DECAY_LOG not constant (nightly only)
fn init_mask_decay_log() -> f64 {
    0.995_f64.ln()
}

const IF_MIN: u8 = 0;
const IF_MAX: usize = NFFT / 2;
const WINDOW_DF: u8 = 60;
const WINDOW_DT: u8 = 96;
const PRUNING_DT: u8 = 24;
const MASK_DF: usize = 3;

//EWW not constant (nightly only)

const VERBOSE: bool = false;
const DO_PLOT: bool = false;

pub struct Runner {
    step_index: usize,
    marks: Vec<u8>,
    threshold: [i32; NFFT / 2],
    dt: f64,
    sampling_rate: usize,
    bps: usize,
}

fn init_eww() -> [[f64; NFFT / 2]; NFFT / 2] {
    let mut eww = [[0.0; NFFT / 2]; NFFT / 2];
    for i in 0..(NFFT / 2) {
        for j in 0..(NFFT / 2) {
            let ji = j as f64 - i as f64;
            let sqrti3 = ((i + 3) as f64).sqrt();
            eww[i][j] = -0.5_f64 * (ji / MASK_DF as f64 / sqrti3).powi(2);
        }
    }
    eww
}

use log::{info, trace, warn};
use rustfft::FFT;
use simple_logger;
use std::sync::Arc;

impl Runner {
    pub fn new() -> Runner {
        let _fft = init_fft();
        let _mask_decay_log: f64 = init_mask_decay_log();
        //println!("{:?}", _mask_decay_log);
        let _hwin = init_hwin();
        //println!("{:?}", _hwin.iter().map(|x| (*x)).collect::<Vec<f64>>());
        //println!("{:?}", _hwin[511]);
        let _eww = init_eww();
        // println!(
        //     "{:?}",
        //     _eww.iter()
        //         .map(|x| (*x).iter().map(|y| *y).collect())
        //         .collect::<Vec<Vec<f64>>>()
        // );
        //println!("{:?}", _eww[255][254]);
        let runner = Runner {
            step_index: 0,
            marks: Vec::new(),
            threshold: [-3; NFFT / 2],
            dt: DT,
            sampling_rate: SAMPLING_RATE,
            bps: BPS,
        };
        runner
    }

    pub fn write(self) -> () {
        simple_logger::init().unwrap();
        info!("TEST!")
    }
}
