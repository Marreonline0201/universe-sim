/// Seeded xorshift64 PRNG — deterministic, no_std compatible, WASM-safe.
/// Produces identical outputs for the same seed across all platforms.

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        // Never allow a zero state — would freeze the generator
        Self(if seed == 0 { 0x9e37_79b9_7f4a_7c15 } else { seed })
    }

    /// Fork a child RNG mixed with an extra discriminator (for parallel streams)
    pub fn fork(&mut self, extra: u64) -> Self {
        Rng::new(self.next_u64() ^ extra.wrapping_mul(0x9e37_79b9_7f4a_7c15))
    }

    /// Next raw 64-bit value
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// Uniform f64 in [0, 1)
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform f64 in [lo, hi)
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.f64() * (hi - lo)
    }

    /// Gaussian (Box–Muller), clamped ≥ 0
    pub fn normal_pos(&mut self, mean: f64, std: f64) -> f64 {
        let u1 = self.f64().max(1e-10);
        let u2 = self.f64();
        let z = (-2.0 * u1.ln()).sqrt() * (core::f64::consts::TAU * u2).cos();
        (mean + std * z).max(0.0)
    }

    /// Power-law random variable in [lo, hi] with exponent α (Salpeter IMF uses α=2.35)
    /// Uses inverse-CDF sampling.
    pub fn power_law(&mut self, lo: f64, hi: f64, alpha: f64) -> f64 {
        let u = self.f64();
        let a1 = 1.0 - alpha;
        (lo.powf(a1) + u * (hi.powf(a1) - lo.powf(a1))).powf(1.0 / a1)
    }
}
