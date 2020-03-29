// const SAMPLING_RATE: usize = 22050;
const BPS: usize = 2;
const MNLM: usize = 5;
const MPPP: usize = 3;
const NFFT: usize = 512;
const STEP: usize = NFFT / 2;
// const DT: f64 = 1 as f64 / (SAMPLING_RATE as f64 / STEP as f64);

//FFT not constant (nightly only)
fn init_fft() -> Arc<(dyn FFT<f64>)> {
    use rustfft::FFTplanner;
    FFTplanner::new(false).plan_fft(NFFT)
}

//HWIN not constant (nightly only)
fn init_hwin() -> [f64; NFFT] {
    use std::f64::consts::PI;
    let values = (0..NFFT)
        .map(|i| 0.5 * (1_f64 - (2_f64 * PI * (i as f64) / ((NFFT - 1) as f64)).cos()))
        .collect::<Vec<f64>>();

    trace!("{:?}", &values[..]);
    let mut hwin: [f64; NFFT] = [0.0; NFFT];
    hwin.copy_from_slice(&values[..]);
    hwin
}

//MASK_DECAY_LOG not constant (nightly only)
fn init_mask_decay_log() -> f64 {
    0.995_f64.ln()
}

const IF_MIN: usize = 0;
const IF_MAX: usize = (NFFT / 2);
const WINDOW_DF: u8 = 60;
const WINDOW_DT: u8 = 96;
const PRUNING_DT: usize = 24;
const MASK_DF: usize = 3;

//EWW not constant (nightly only)

const VERBOSE: bool = false;
const DO_PLOT: bool = false;

#[derive(Debug)]
struct Mark {
    t: f64,
    i: Vec<f64>,
    v: Vec<f64>,
}

#[derive(Debug)]
pub struct Fingerprint {
    pub tcodes: Vec<f64>,
    pub hcodes: Vec<f64>,
}

pub struct Runner {
    buffer: Vec<u8>,
    buffer_delta: usize,
    step_index: usize,
    marks: Vec<Mark>,
    threshold: [f64; NFFT / 2],
    fft: Arc<(dyn FFT<f64>)>,
    hwin: [f64; NFFT],
    eww: Box<[[f64; NFFT / 2]; NFFT / 2]>, //it won't fit in the stack, so we put it on heap
    mask_decay_log: f64,
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

use byteorder::{LittleEndian, ReadBytesExt};
use log::{debug, trace};
use num_traits::cast::ToPrimitive; // Complex to_f64
use rustfft::num_complex::Complex;
use rustfft::num_traits::Zero;
use rustfft::FFT;
use std::f64;
use std::io::Cursor;
use std::sync::Arc;

impl Runner {
    pub fn new() -> Runner {
        let fft = init_fft();
        let mask_decay_log: f64 = init_mask_decay_log();
        trace!("{:?}", mask_decay_log);
        let hwin = init_hwin();
        trace!("{:?}", hwin.iter().map(|x| (*x)).collect::<Vec<f64>>());
        trace!("{:?}", hwin[511]);
        let eww = init_eww();
        trace!(
            "{:?}",
            eww.iter()
                .map(|x| (*x).iter().map(|y| *y).collect())
                .collect::<Vec<Vec<f64>>>()
        );
        trace!("{:?}", eww[255][254]);
        let runner = Runner {
            buffer: Vec::new(),
            buffer_delta: 0,
            step_index: 0,
            marks: Vec::new(),
            threshold: [-3.0; NFFT / 2],
            fft: fft,
            hwin: hwin,
            eww: Box::new(eww),
            mask_decay_log: mask_decay_log,
        };
        runner
    }

    pub fn write(&mut self, chunk: &[u8]) -> Option<Fingerprint> {
        if VERBOSE {
            trace!(
                "t={} received {} bytes",
                (self.step_index as f64 / STEP as f64).round(),
                chunk.len()
            );
        }

        let mut tcodes = Vec::<f64>::new();
        let mut hcodes = Vec::<f64>::new();

        self.buffer.extend(chunk);

        while (self.step_index + NFFT) * BPS < self.buffer.len() + self.buffer_delta {
            let mut data = vec![Complex::zero(); NFFT]; // window data

            // fill the data, windowed (HWIN) and scaled
            for i in 0..NFFT {
                trace!("{} {} {}", self.step_index + i, BPS, self.buffer_delta);
                let index_le =
                    (((self.step_index + i) * BPS) as i64 - self.buffer_delta as i64) as usize;
                trace!("{}", index_le);
                let buffer_with_offset = &self.buffer[index_le..];
                let mut rdr = Cursor::new(buffer_with_offset);
                let right_op = 2_f64.powi((8 * BPS - 1) as i32);
                let le_value = rdr.read_i16::<LittleEndian>().unwrap() as f64;
                data[i] = (self.hwin[i] * le_value / right_op).into(); // into converts f64 to Complex
                                                                       // println!("Data[{}] {}", i, data[i]);
                                                                       // println!("{} {}", index_le, le_value);
            }
            self.step_index += STEP;
            //console.debug!(("params stepIndex=" + this.stepIndex + " bufD=" + this.bufferDelta);

            let mut output = vec![Complex::zero(); NFFT];
            self.fft.process(&mut data, &mut output); //TODO: check here because spectrum[0] is always 0
                                                      // let mut spectrum = output;
            let mut spectrum = output
                .iter()
                // well, figured out this division by comparing values
                // would be good to figure out why, yolo!
                .map(|value| value.norm().to_f64().unwrap() / (NFFT as f64 / 2_f64))
                .collect::<Vec<f64>>();
            // println!("first spectrum {:?}", spectrum[0]);

            // log-normal surface
            for i in IF_MIN..IF_MAX {
                let i_16_sqrt = ((i + 16) as f64).sqrt();
                let at_i = spectrum.get(i);
                let value = at_i.map(|x| x * i_16_sqrt).unwrap();
                // the lower part of the spectrum is damped, the higher part is boosted, leading to a better peaks detection.
                spectrum[i] = value;
                // println!("spectrum[{}] {}", i, value);
            }

            // 	if (DO_PLOT) this.fftData.push(FFT.spectrum.slice());

            // positive values of the difference between log spectrum and threshold
            let mut diff = [0.0; NFFT / 2];
            for i in IF_MIN..IF_MAX {
                let m = f64::max(1e-6, spectrum[i]);
                diff[i] = f64::max(m.ln() - self.threshold[i], 0 as f64);
                // println!("{}", diff[i]);
            }

            // find at most MNLM local maxima in the spectrum at this timestamp.
            let mut i_loc_max = vec![0.0; MNLM];
            let mut v_loc_max = vec![0.0; MNLM];
            for i in 0..MNLM {
                i_loc_max[i] = f64::NAN;
                v_loc_max[i] = f64::NEG_INFINITY;
            }
            for i in IF_MIN + 1..IF_MAX - 1 {
                //console.debug!(("checking local maximum at i=" + i + " data[i]=" + data[i] + " vLoc[last]=" + vLocMax[MNLM-1] );
                if diff[i] > diff[i - 1]
                    && diff[i] > diff[i + 1]
                    && spectrum[i] > v_loc_max[MNLM - 1]
                {
                    // if local maximum big enough
                    // insert the newly found local maximum in the ordered list of maxima
                    //for (let j=MNLM-1; j>=0; j--)
                    for j in (0..=MNLM - 1).rev() {
                        // println!("j={}", j);
                        // navigate the table of previously saved maxima
                        if j >= 1 && spectrum[i] > v_loc_max[j - 1] {
                            continue;
                        }
                        //for (let k=MNLM-1; k>=j+1; k--)
                        {
                            let mut k = MNLM - 1;
                            while k >= j + 1 {
                                i_loc_max[k] = i_loc_max[k - 1]; // offset the bottom values
                                v_loc_max[k] = v_loc_max[k - 1];
                                k -= 1;
                            }
                        }
                        i_loc_max[j] = i as f64;
                        v_loc_max[j] = spectrum[i];
                        break;
                    }
                }
            }
            // println!("{:?} {:?}", i_loc_max, v_loc_max);

            // now that we have the MNLM highest local maxima of the spectrum,
            // update the local maximum threshold so that only major peaks are taken into account.
            // for (let i=0; i<MNLM; i++) {
            for i in 0..MNLM {
                if v_loc_max[i] > f64::NEG_INFINITY {
                    //for (let j=IF_MIN; j<IF_MAX; j++) {
                    for j in IF_MIN..IF_MAX {
                        let loc_max_i = i_loc_max[i] as usize;
                        self.threshold[j] = f64::max(
                            self.threshold[j],
                            spectrum[loc_max_i].ln() + self.eww[loc_max_i][j],
                        );
                    }
                } else {
                    //v_loc_max.splice(i,MNLM-i); // remove the last elements.
                    v_loc_max.drain(i..MNLM);
                    //i_loc_max.splice(i,MNLM-i);
                    i_loc_max.drain(i..MNLM);
                    break;
                }
            }
            // if i_loc_max.len() > 0 && v_loc_max.len() > 0 {
            //     println!("{:#?} {:#?}", i_loc_max, v_loc_max);
            // }
            // println!(
            //     "{:?} {:?} {:?} {:?}",
            //     i_loc_max,
            //     v_loc_max,
            //     self.threshold[0],
            //     self.threshold[NFFT / 2 - 1]
            // );

            if false && VERBOSE && i_loc_max.len() > 0 {
                debug!(
                    "t={} f={:?} peak={:?}",
                    (self.step_index as f64 / STEP as f64).round(),
                    i_loc_max,
                    v_loc_max
                );
            }

            // array that stores local maxima for each time step
            self.marks.push(Mark {
                t: (self.step_index as f64 / STEP as f64).round(),
                i: i_loc_max,
                v: v_loc_max,
            });

            // remove previous (in time) maxima that would be too close and/or too low.
            let nm = self.marks.len();
            let t0 = (nm as i64 - PRUNING_DT as i64 - 1) as i64;
            // for (let i=nm-1; i>=Math.max(t0+1,0); i--) {
            {
                let mut i = (nm - 1) as i64;
                // for (let i=nm-1; i>=Math.max(t0+1,0); i--) {
                while i >= i64::max(t0 + 1_i64, 0_i64) {
                    //console.debug!(("pruning ntests=" + this.marks[i].v.length);
                    // for (let j=0; j<this.marks[i].v.length; j++) {
                    for j in 0..self.marks[i as usize].v.len() {
                        let i = i as usize;
                        //console.debug!(("pruning " + this.marks[i].v[j] + " <? " + this.threshold[this.marks[i].i[j]] + " * " + Math.pow(this.mask_decay, lenMarks-1-i));
                        if self.marks[i].i[j] != 0_f64
                            && (self.marks[i].v[j]).ln()
                                < self
                                    .threshold
                                    .get(self.marks[i].i[j] as usize)
                                    .unwrap_or(&f64::NAN)
                                    + self.mask_decay_log * (nm as i64 - 1_i64 - i as i64) as f64
                        {
                            if false && VERBOSE {
                                println!(
                                    "t={} pruning {} t={} locmax={}",
                                    (self.step_index as f64 / STEP as f64).round(),
                                    i,
                                    self.marks[i].t,
                                    j
                                );
                            }
                            self.marks[i].v[j] = f64::NEG_INFINITY;
                            self.marks[i].i[j] = f64::NEG_INFINITY;
                        }
                    }
                    i -= 1;
                }
            }
            // println!("{:#?}", self.marks);
            // let _ = self.marks.iter().map(|m| { 
            //     if m.i.len() > 0 && m.v.len() > 0 {
            //         println!("{:?} {:?}", m.i, m.v);
            //     }
            //     m
            // }).collect::<Vec<_>>();
            // println!("{:#?}", self.marks.iter().map(|m| m.i).collect::<Vec<_>>());
            // println!("{:#?}", self.marks.len());

            // 	// generate hashes for peaks that can no longer be pruned. stepIndex:{f1:f2:deltaindex}
            let mut n_fingers_total = 0;
            // println!("{} {}", self.marks.len(), t0);
            // println!("{}", self.marks.len());
            if t0 >= 0 {
                let m = &self.marks[t0 as usize];
                // println!("{:?}", m);

                'loopCurrentPeaks: for i in 0..m.i.len() {
                    // for (let i=0; i < m.i.length; i++) {
                    let mut n_fingers = 0;
                    {
                        let mut j = t0;
                        /*'loopPastTime: */
                        while j >= i64::max(0_i64, t0 - WINDOW_DT as i64) {
                            // for (let j=t0; j>=Math.max(0,t0-WINDOW_DT); j--) {
                            let m2 = &self.marks[j as usize];

                            /*'loopPastPeaks: */
                            for k in 0..m2.i.len() {
                                // for (let k=0; k<m2.i.length; k++) {
                                if m2.i[k] != m.i[i] && (m2.i[k] - m.i[i]).abs() < WINDOW_DF as f64
                                {
                                    // println!("push t0 {} i {} j {}", t0, i, j);
                                    tcodes.push(m.t); //Math.round(this.stepIndex/STEP));
                                                      // in the hash: dt=(t0-j) has values between 0 and WINDOW_DT, so for <65 6 bits each
                                                      //				f1=m2.i[k] , f2=m.i[i] between 0 and NFFT/2-1, so for <255 8 bits each.
                                    hcodes.push(
                                        m2.i[k]
                                            + (NFFT / 2) as f64
                                                * (m.i[i] + (NFFT / 2) as f64 * (t0 - j) as f64),
                                    );
                                    n_fingers += 1;
                                    n_fingers_total += 1;
                                    //if (DO_PLOT) this.peakData.push([m.t, j, m.i[i], m2.i[k]]); // t1, t2, f1, f2
                                    if n_fingers >= MPPP {
                                        continue 'loopCurrentPeaks;
                                    }
                                }
                            }
                            j -= 1;
                        }
                    }
                }
            }
            // println!("{} {:?} {:?}", n_fingers_total, tcodes, hcodes);

            if n_fingers_total > 0 && VERBOSE {
                println!(
                    "t={} generated {} fingerprints",
                    (self.step_index as f64 / STEP as f64).round(),
                    n_fingers_total
                );
            }
            if !DO_PLOT {
                // println!(
                //     "{} {} {}",
                //     t0,
                //     WINDOW_DT,
                //     (t0 + 1_i64 - (WINDOW_DT as i64)) as i64
                // );
                let len_cut = (t0 + 1_i64 - (WINDOW_DT as i64)) as i64;
                if len_cut > 0 {
                    self.marks.drain(0..len_cut as usize);
                } else {
                    let cut = (self.marks.len() as i64 - len_cut as i64) as usize;
                    self.marks.truncate(cut);
                }
            }

            // decrease the threshold for the next iteration
            //for (let j=0; j<this.threshold.length; j++) {
            for j in 0..self.threshold.len() {
                self.threshold[j] += self.mask_decay_log;
            }
        }

        if self.buffer.len() > 1000000 {
            let delta = self.buffer.len() - 20000;
            trace!("buffer drop {} bytes", delta);
            self.buffer_delta += delta;
            self.buffer.drain(..delta);
        }

        // if (VERBOSE) {
        // 	debug!(("fp processed " + (this.practicalDecodedBytes - this.decodedBytesSinceCallback) + " while threshold is " + (0.99*this.thresholdBytes));
        // }

        // if (this.stepIndex/STEP > 500 && DO_PLOT) { // approx 12 s of audio data
        // 	this.plot()
        // 	DO_PLOT = false;
        // 	setTimeout(function() {
        // 		process.exit(0);
        // 	}, 3000);
        // }

        if tcodes.len() > 0 {
            Some(Fingerprint {
                tcodes: tcodes,
                hcodes: hcodes,
            })
        // this will eventually trigger data events on the read interface
        } else {
            None
        }
    }
}
