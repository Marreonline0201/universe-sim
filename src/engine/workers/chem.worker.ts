import type { GridTransferDescriptor } from '../Grid'

let data: Float32Array
let sizeX: number, sizeY: number, sizeZ: number

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'init') {
    const desc = msg.descriptor as GridTransferDescriptor
    data = new Float32Array(desc.buffer)
    sizeX = desc.sizeX
    sizeY = desc.sizeY
    sizeZ = desc.sizeZ
    self.postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'tick') {
    // Phase 1: chemical reactions will be implemented in ReactionEngine
    // For now: placeholder (reactions handled by ReactionEngine loaded in main thread)
  }
}
