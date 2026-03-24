/// Seeded xorshift64 PRNG — identical implementation to physics crate (no shared dep needed)
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0x9e37_79b9_7f4a_7c15 } else { seed })
    }
    pub fn fork(&mut self, extra: u64) -> Self {
        Rng::new(self.next_u64() ^ extra.wrapping_mul(0x9e37_79b9_7f4a_7c15))
    }
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.f64() * (hi - lo)
    }
    pub fn f32(&mut self) -> f32 {
        self.f64() as f32
    }
    pub fn range_f32(&mut self, lo: f32, hi: f32) -> f32 {
        lo + self.f32() * (hi - lo)
    }
    pub fn range_i32(&mut self, lo: i32, hi: i32) -> i32 {
        (lo as f64 + self.f64() * (hi - lo) as f64) as i32
    }
}
