/// Seeded xorshift64 PRNG — same algorithm as other crates
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
        x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        self.0 = x; x
    }
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.f64() * (hi - lo)
    }
}
