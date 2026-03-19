import {
  BufferGeometry,
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  CylinderGeometry,
  SphereGeometry,
  BoxGeometry,
  Color,
} from 'three'
import type { Phenotype } from '../../biology/GenomeEncoder'

/**
 * Generates a 3D body mesh from a genome phenotype.
 *
 * Body plan is driven by:
 *   - bodySymmetry: 0=asymmetric, 1=bilateral, 2=radial, 3=spherical
 *   - segmentCount: 1-16 body segments
 *   - limbCount: 0-15 limbs
 *   - appendageType: 0=none,1=flagella,2=cilia,3=pseudopods,4=fins,5=legs,6=wings,7=tentacles
 *   - sizeClass: 0-15 (nanoscale → large)
 *
 * Material colours are derived from defence and metabolic traits.
 */
export class ProceduralCreature {
  /**
   * Generate a full creature Group from a Phenotype.
   * Returns a Three.js Group ready to be added to the scene.
   */
  static generate(phenotype: Phenotype): Group {
    const group = new Group()

    // Size: sizeClass 0-15 maps to 0.05 m (micro) → 8 m (large)
    const bodyScale = 0.05 * Math.pow(2, phenotype.sizeClass / 2)

    // Body material colour derived from traits
    const mat = this.createBodyMaterial(phenotype)

    // Core body segments
    const segCount = Math.max(1, Math.min(phenotype.segmentCount + 1, 8))
    const segSpacing = bodyScale * 1.2

    for (let seg = 0; seg < segCount; seg++) {
      const segGeom = this.segmentGeometry(phenotype, seg, bodyScale, segCount)
      const segMesh = new Mesh(segGeom, mat.clone())

      // Place segments along the anterior-posterior axis (X axis for bilateral)
      if (phenotype.bodySymmetry === 1) {
        // Bilateral: chain along Z
        segMesh.position.set(0, 0, (seg - segCount / 2) * segSpacing)
      } else if (phenotype.bodySymmetry === 2) {
        // Radial: first segment is central body, rest are radial arms
        if (seg === 0) {
          segMesh.position.set(0, 0, 0)
        } else {
          const angle = ((seg - 1) / (segCount - 1)) * Math.PI * 2
          segMesh.position.set(
            Math.cos(angle) * bodyScale * 2,
            0,
            Math.sin(angle) * bodyScale * 2
          )
        }
      } else {
        // Spherical / asymmetric: cluster around origin with small offsets
        segMesh.position.set(
          (Math.random() - 0.5) * bodyScale * 0.5,
          seg * segSpacing * 0.3,
          0
        )
      }

      group.add(segMesh)
    }

    // Limbs
    const limbCount = Math.min(phenotype.limbCount, 8)
    for (let l = 0; l < limbCount; l++) {
      const limb = this.buildLimb(phenotype, l, limbCount, bodyScale)
      group.add(limb)
    }

    // Appendages (fins, wings, tentacles, etc.)
    if (phenotype.appendageType > 0) {
      const appendages = this.buildAppendages(phenotype, bodyScale, segCount, segSpacing)
      for (const a of appendages) group.add(a)
    }

    // Head / sensory cluster on anterior end (bilateral only)
    if (phenotype.bodySymmetry === 1 && phenotype.neuralLevel >= 1) {
      const head = this.buildHead(phenotype, bodyScale, segCount, segSpacing)
      group.add(head)
    }

    return group
  }

  // ── Geometry builders ──────────────────────────────────────────────────────

  /**
   * One body segment — shape depends on body plan and position in chain.
   * Anterior segments are usually larger (head) for bilateral creatures.
   */
  private static segmentGeometry(
    phenotype: Phenotype,
    segIndex: number,
    bodyScale: number,
    totalSegs: number
  ): BufferGeometry {
    switch (phenotype.bodySymmetry) {
      case 3: {
        // Spherical: round blobs
        const r = bodyScale * (1 - segIndex * 0.05)
        return new SphereGeometry(Math.max(0.01, r), 8, 6)
      }
      case 2: {
        // Radial: central disk + arm cylinders
        if (segIndex === 0) return new CylinderGeometry(bodyScale, bodyScale * 0.8, bodyScale * 0.4, 8)
        return new CylinderGeometry(bodyScale * 0.2, bodyScale * 0.3, bodyScale * 1.5, 6)
      }
      case 1: {
        // Bilateral: elongated capsule per segment; head segment slightly larger
        const isHead = segIndex === 0
        const rx = isHead ? bodyScale * 0.9 : bodyScale * (0.8 - segIndex * 0.04)
        const ry = isHead ? bodyScale * 0.8 : bodyScale * (0.7 - segIndex * 0.04)
        const rz = bodyScale * 1.0
        return this.ellipsoidGeometry(
          Math.max(0.01, rx),
          Math.max(0.01, ry),
          Math.max(0.01, rz),
          8, 6
        )
      }
      default: {
        // Asymmetric: box-like
        const s = bodyScale * (1 - segIndex * 0.1)
        return new BoxGeometry(Math.max(0.01, s), Math.max(0.01, s * 0.8), Math.max(0.01, s * 0.9))
      }
    }
  }

  /** Build a single limb Mesh positioned around the body */
  private static buildLimb(
    phenotype: Phenotype,
    limbIndex: number,
    totalLimbs: number,
    bodyScale: number
  ): Mesh {
    const mat = new MeshStandardMaterial({ color: this.limbColor(phenotype) })
    const limbLength = bodyScale * (1.5 + phenotype.walkSpeed * 0.1)
    const limbWidth  = bodyScale * 0.15

    const geom = new CylinderGeometry(limbWidth * 0.6, limbWidth, limbLength, 5)
    const mesh = new Mesh(geom, mat)

    // Distribute limbs symmetrically
    if (phenotype.bodySymmetry === 1) {
      // Bilateral: pairs on left and right
      const pairIndex = Math.floor(limbIndex / 2)
      const side = (limbIndex % 2 === 0) ? 1 : -1
      const zOffset = (pairIndex - Math.floor(totalLimbs / 4)) * bodyScale * 1.2
      mesh.position.set(side * bodyScale * 1.1, -bodyScale * 0.5, zOffset)
      mesh.rotation.z = side * 0.4
    } else {
      // Radial: evenly around circumference
      const angle = (limbIndex / totalLimbs) * Math.PI * 2
      mesh.position.set(
        Math.cos(angle) * bodyScale * 1.0,
        -bodyScale * 0.3,
        Math.sin(angle) * bodyScale * 1.0
      )
      mesh.rotation.z = angle + Math.PI / 2
    }

    return mesh
  }

  /** Build appendages based on appendageType */
  private static buildAppendages(
    phenotype: Phenotype,
    bodyScale: number,
    segCount: number,
    segSpacing: number
  ): Mesh[] {
    const results: Mesh[] = []
    const type = phenotype.appendageType
    const mat = new MeshStandardMaterial({
      color: new Color().setHSL(0.55, 0.7, 0.5),
      transparent: type === 6,  // wings are translucent
      opacity: type === 6 ? 0.4 : 1.0,
    })

    const pairCount = type === 4 ? 2 : type === 6 ? 2 : 1  // fins: 2 pairs, wings: 2 pairs

    for (let p = 0; p < pairCount; p++) {
      for (const side of [-1, 1]) {
        let geom: BufferGeometry
        if (type === 4) {
          // Fins: flat triangular plane
          geom = this.finGeometry(bodyScale)
        } else if (type === 6) {
          // Wings: large flat plane
          geom = this.wingGeometry(bodyScale)
        } else if (type === 7) {
          // Tentacles: long thin cylinder
          geom = new CylinderGeometry(bodyScale * 0.05, bodyScale * 0.1, bodyScale * 3, 5)
        } else {
          // Default: small spike
          geom = new CylinderGeometry(0.001, bodyScale * 0.1, bodyScale * 0.5, 4)
        }

        const mesh = new Mesh(geom, mat.clone())
        const zPos = (p - pairCount / 2) * segSpacing * segCount * 0.4
        mesh.position.set(side * bodyScale * 1.3, bodyScale * 0.1, zPos)
        if (type === 6) mesh.rotation.z = side * 0.3  // wing dihedral
        results.push(mesh)
      }
    }

    return results
  }

  /** Head with eyes and sensory organs */
  private static buildHead(
    phenotype: Phenotype,
    bodyScale: number,
    segCount: number,
    segSpacing: number
  ): Group {
    const head = new Group()
    const headZ = -(segCount / 2) * segSpacing - bodyScale * 0.8

    // Head sphere
    const headGeom = new SphereGeometry(bodyScale * 0.85, 10, 8)
    const headMat = new MeshStandardMaterial({ color: this.headColor(phenotype) })
    const headMesh = new Mesh(headGeom, headMat)
    headMesh.position.set(0, 0, headZ)
    head.add(headMesh)

    // Eyes (if vision > 0)
    if (phenotype.visionType > 0) {
      const eyeSize = bodyScale * (0.15 + phenotype.visionType * 0.04)
      const eyeGeom = new SphereGeometry(eyeSize, 6, 4)
      const eyeMat = new MeshStandardMaterial({ color: 0x111111 })

      if (phenotype.visionType === 5) {
        // Compound eyes: many small facets wrapping the head
        for (let e = 0; e < 6; e++) {
          const angle = (e / 6) * Math.PI  // front hemisphere
          const em = new Mesh(eyeGeom, eyeMat)
          em.position.set(
            Math.cos(angle) * bodyScale * 0.7,
            Math.sin(angle * 0.5) * bodyScale * 0.3,
            headZ - bodyScale * 0.2
          )
          head.add(em)
        }
      } else {
        // Bilateral eyes: left and right
        for (const side of [-1, 1]) {
          const em = new Mesh(eyeGeom, eyeMat)
          em.position.set(side * bodyScale * 0.5, bodyScale * 0.2, headZ - bodyScale * 0.5)
          head.add(em)
        }
      }
    }

    return head
  }

  // ── Geometry helpers ───────────────────────────────────────────────────────

  /** Build an ellipsoid by scaling a unit sphere's vertices */
  private static ellipsoidGeometry(rx: number, ry: number, rz: number, widthSegs: number, heightSegs: number): BufferGeometry {
    const sphere = new SphereGeometry(1, widthSegs, heightSegs)
    const pos = sphere.attributes.position
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * rx, pos.getY(i) * ry, pos.getZ(i) * rz)
    }
    pos.needsUpdate = true
    sphere.computeVertexNormals()
    return sphere
  }

  /** Simple triangular fin geometry */
  private static finGeometry(scale: number): BufferGeometry {
    const geom = new BufferGeometry()
    const s = scale
    const vertices = new Float32Array([
      0, 0, 0,
      s * 1.5, 0, s * 0.5,
      s * 1.5, s * 0.8, -s * 0.5,
    ])
    geom.setAttribute('position', new BufferAttribute(vertices, 3))
    geom.setIndex([0, 1, 2])
    geom.computeVertexNormals()
    return geom
  }

  /** Flat wing geometry */
  private static wingGeometry(scale: number): BufferGeometry {
    const geom = new BufferGeometry()
    const s = scale
    const vertices = new Float32Array([
      0,      0,  s * 0.3,
      s * 3,  0,  0,
      s * 2.5, 0, -s * 1.5,
      s * 0.5, 0, -s * 1.2,
    ])
    geom.setAttribute('position', new BufferAttribute(vertices, 3))
    geom.setIndex([0, 1, 2,  0, 2, 3])
    geom.computeVertexNormals()
    return geom
  }

  // ── Material helpers ───────────────────────────────────────────────────────

  private static createBodyMaterial(phenotype: Phenotype): MeshStandardMaterial {
    // Base hue: dietary type
    const hueByDiet = [0.33, 0.08, 0.55, 0.15]  // autotroph=green, heterotroph=brown, etc.
    const hue = hueByDiet[phenotype.dietaryType] ?? 0.33

    // Armour → darker, rougher
    const lightness = phenotype.hasArmor ? 0.25 : 0.45
    const roughness = phenotype.hasArmor ? 0.9 : 0.6
    const metalness = phenotype.hasArmor && phenotype.armorThickness > 8 ? 0.3 : 0.0

    // Bioluminescence → emissive
    const emissive = phenotype.isBioluminescent
      ? new Color().setHSL(0.6, 1.0, 0.4)
      : new Color(0x000000)

    const color = new Color().setHSL(hue, 0.7, lightness)

    return new MeshStandardMaterial({ color, roughness, metalness, emissive })
  }

  private static limbColor(phenotype: Phenotype): Color {
    // Limbs slightly darker than body
    const hueByDiet = [0.33, 0.08, 0.55, 0.15]
    const hue = hueByDiet[phenotype.dietaryType] ?? 0.33
    return new Color().setHSL(hue, 0.6, 0.3)
  }

  private static headColor(phenotype: Phenotype): Color {
    const hueByDiet = [0.33, 0.08, 0.55, 0.15]
    const hue = hueByDiet[phenotype.dietaryType] ?? 0.33
    return new Color().setHSL(hue, 0.5, 0.55)
  }
}
